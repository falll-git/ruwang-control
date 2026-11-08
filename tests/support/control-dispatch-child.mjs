// Test-only subprocess. No app import/mutation until Docker and DB ownership proof.
import './control-service-loader.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {validateContainerProof} from './control-disposable.mjs';
if (!process.send) throw Error('IPC_TEST_OWNER_REQUIRED');
process.once('message',async ({proof,env,commandId,instanceId,mode,origin})=>{
  try {
    const observed=JSON.parse(execFileSync('docker',['inspect',proof.containerId],{encoding:'utf8',windowsHide:true,stdio:'pipe'}))[0];
    validateContainerProof({...proof,id:proof.containerId},observed);
    const target=new URL(env.CONTROL_DATABASE_URL);
    assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,String(proof.port));
    assert.equal(target.pathname,'/'+proof.database);assert.equal(target.username,proof.runtimeRole);
    const db=new Client({connectionString:env.CONTROL_DATABASE_URL});await db.connect();
    try {
      assert.deepEqual((await db.query('SELECT run_id,token_hash FROM rc_test_owner.proof')).rows,[{run_id:proof.runId,token_hash:proof.tokenHash}]);
      const role=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
    }finally{await db.end();}
    Object.assign(process.env,env);
    const fetchActual=globalThis.fetch;
    globalThis.fetch=async(input,options)=>{
      assert.equal(new URL(input instanceof Request?input.url:input).origin,origin);
      if(mode==='crash-before-send')process.exit(91);
      const response=await fetchActual(input,options);
      if(mode==='crash-after-response')process.exit(92);
      return response;
    };
    const api=await import('../../src/server/review-adapter.ts');
    if(mode==='cli'){
      process.argv=[process.execPath,'review-dispatch-cycle.mjs','--instance',instanceId];
      await import('../../scripts/review-dispatch-cycle.mjs');process.disconnect();return;
    }
    const result=mode==='cycle'?await api.runReviewDispatchCycle(instanceId):await api.dispatchReviewCommand(commandId);
    await globalThis.__ruwangControlPool?.end();
    process.send({ok:true,state:result.state??null});process.disconnect();
  }catch{process.send({ok:false});process.exitCode=1;await globalThis.__ruwangControlPool?.end().catch(()=>{});process.disconnect();}
});
