import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {makeSnapshot} from './control-fixtures.mjs';
import {connectOwned,guardDatabaseTarget,publicProof} from './control-disposable.mjs';

export async function runDispatchChecks(c){
  const {check,run,env,infrastructureEnv,instanceId,double,items,client,enqueue,ingest}=c;
  const {dispatchReviewCommand:dispatch,getReviewCommand:get,recoverExpiredReviewCommands:recover,runReviewDispatchCycle:cycle}=await import('../../src/server/review-adapter.ts');
  const fresh=async()=>{const s=makeSnapshot(instanceId,items[1].detail);await ingest(s);return {s,id:await enqueue(s)};};
  const future=()=>new Date(Date.now()+60000); // explicit test clock for lease expiry, not SQL status mutation
  function child(mode,id){
    guardDatabaseTarget(run,env.CONTROL_DATABASE_URL);
    return new Promise((resolve,reject)=>{
      const p=fork(fileURLToPath(new URL('./control-dispatch-child.mjs',import.meta.url)),[],{env:infrastructureEnv,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
      const timer=setTimeout(()=>{p.kill();reject(Error('TEST_CHILD_TIMEOUT'));},15000);
      p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);resolve(code);});
      p.send({proof:publicProof(run),env,commandId:id,instanceId,mode,origin:double.origin});
    });
  }
  await check('two process dispatchers claim one attempt and one bank effect',async()=>{
    const {id}=await fresh(),before=double.stats().effects;
    assert.deepEqual(await Promise.all([child('dispatch',id),child('dispatch',id)]),[0,0]);
    assert.equal((await get(instanceId,id)).state,'APPLIED');assert.equal(double.stats().effects-before,1);
    assert.equal((await client.query('SELECT count(*)::int n FROM control.review_dispatch_attempts WHERE command_id=$1',[id])).rows[0].n,1);
  });
  await check('crash after claim before send is fenced UNKNOWN on restart without retry',async()=>{
    const {id}=await fresh(),before=double.stats().effects;
    assert.equal(await child('crash-before-send',id),91);assert.equal((await get(instanceId,id)).state,'DISPATCHING');
    assert.equal(await recover(instanceId),0);assert.equal(await recover(instanceId,future()),1);
    await child('cycle',id);assert.equal((await get(instanceId,id)).state,'UNKNOWN');assert.equal(double.stats().effects,before);
  });
  await check('crash after bank effect before completion retains UNKNOWN without second effect',async()=>{
    const {id}=await fresh(),before=double.stats().effects;
    assert.equal(await child('crash-after-response',id),92);assert.equal(double.stats().effects-before,1);
    await recover(instanceId,future());assert.equal((await get(instanceId,id)).state,'UNKNOWN');
    await child('cycle',id);await dispatch(id);assert.equal(double.stats().effects-before,1);
  });
  await check('late result after recovery cannot overwrite fenced ownership or snapshot',async()=>{
    const {id,s}=await fresh();double.fault('hold-ack');const pending=dispatch(id);
    const deadline=Date.now()+250;while(!double.stats().held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(double.stats().held,1);
    await recover(instanceId,future());double.fault('normal');double.release();
    assert.equal((await pending).state,'UNKNOWN');assert.equal((await get(instanceId,id)).result_code,'DISPATCH_LEASE_EXPIRED');
    assert.equal((await client.query('SELECT state FROM control.review_snapshots WHERE id=$1',[s.snapshot_id])).rows[0].state,'IN_REVIEW');
  });
  await check('never-sent pending command resumes through bounded cycle after restart',async()=>{
    const {id}=await fresh();assert.equal(await child('cli',id),0);assert.equal((await get(instanceId,id)).state,'APPLIED');
  });
  await check('target registry change blocks dispatch instead of retargeting queued intent',async()=>{
    const {id}=await fresh(),before=double.stats().requests,owner=await connectOwned(run,'migration');
    try{
      // Explicit test-only registry fault; no business state or success is injected.
      await owner.query("UPDATE control.instances SET adapter_base_url='http://127.0.0.1:1' WHERE id=$1",[instanceId]);
      assert.equal((await dispatch(id)).result_code,'COMMAND_TARGET_CHANGED');assert.equal(double.stats().requests,before);
    }finally{await owner.query('UPDATE control.instances SET adapter_base_url=$2 WHERE id=$1',[instanceId,double.origin]);await owner.end();}
    assert.equal((await dispatch(id)).state,'UNKNOWN');
  });
  await check('database loss at completion after remote response never invents success',async()=>{
    const {id}=await fresh(),pool=globalThis.__ruwangControlPool,originalConnect=pool.connect.bind(pool),originalFetch=globalThis.fetch;
    globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);pool.connect=async()=>{throw Error('TEST_DB_UNAVAILABLE');};return response;};
    try{await assert.rejects(dispatch(id));}finally{pool.connect=originalConnect;globalThis.fetch=originalFetch;}
    assert.equal((await get(instanceId,id)).state,'DISPATCHING');await recover(instanceId,future());assert.equal((await get(instanceId,id)).state,'UNKNOWN');
  });
  await check('database failure before claim sends nothing and pending can be resumed',async()=>{
    const {id}=await fresh(),pool=globalThis.__ruwangControlPool,connect=pool.connect.bind(pool),requests=double.stats().requests;
    pool.connect=async()=>{throw Error('TEST_DB_UNAVAILABLE');};
    try{await assert.rejects(dispatch(id));}finally{pool.connect=connect;}
    assert.equal(double.stats().requests,requests);assert.equal((await get(instanceId,id)).state,'PENDING');
    assert.equal(await child('cli',id),0);assert.equal((await get(instanceId,id)).state,'APPLIED');
  });
  await check('oversize invalid identity and non-200 ACK are held without retry',async()=>{
    for(const mode of ['oversize','wrong-identity','http-error']){
      const {id}=await fresh();double.fault(mode);try{await assert.rejects(dispatch(id));}finally{double.fault('normal');}
      assert.equal((await get(instanceId,id)).state,'UNKNOWN');const requests=double.stats().requests;await dispatch(id);assert.equal(double.stats().requests,requests);
    }
  });
  await check('bank route has no command ledger GET and bounded cycle reports no hidden failure',async()=>{
    const bank=await readFile('D:/backend-production/src/modules/seputar-jaminan/controlReview.route.js','utf8');
    assert.match(bank,/router\.post\("\/commands"/);assert.doesNotMatch(bank,/router\.get\("\/commands/);
    assert.equal((await cycle(instanceId)).failed,0);
  });
}
