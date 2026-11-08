import assert from 'node:assert/strict';
import {connectOwned} from './control-disposable.mjs';
export async function runMonitorOwnershipChecks({check,run,instanceId,reviewer,double,bankKey,client}){
  const {pollMonitoring,getMonitoringView}=await import('../../src/server/monitoring.ts');
  const owner=await connectOwned(run,'migration');
  try{await owner.query(`INSERT INTO control.monitor_sources(instance_id,source_kind,base_url,audience,control_key_id,response_key_id,response_public_key,enabled,poll_interval_seconds)
    VALUES($1::uuid,'ruwang',$2,$1::text,'test-control','test-bank',$3,true,15)`,[instanceId,double.origin,bankKey.publicKey]);}finally{await owner.end();}
  // Explicit scheduler-clock fault ONLY. No business status or successful result injected.
  const due=()=>client.query("UPDATE control.monitor_poll_state SET next_poll_at=now()-interval '1 second' WHERE instance_id=$1",[instanceId]);
  const poll=()=>pollMonitoring(reviewer.principal);
  const view=async()=>(await getMonitoringView(reviewer.principal)).sources.find(s=>s.instanceId===instanceId);
  await check('monitoring concurrent reservations issue one signed read request',async()=>{
    const before=double.stats().requests;await Promise.all([poll(),poll()]);assert.equal(double.stats().requests-before,1);assert.equal((await view()).status,'healthy');
  });
  await check('monitoring late result cannot overwrite newer owner result',async()=>{
    await due();double.fault('monitor-hold');const pending=poll();
    const deadline=Date.now()+250;while(!double.stats().held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(double.stats().held,1);
    await due();double.fault('monitor-degraded');await poll();double.release();await pending;double.fault('normal');
    assert.equal((await view()).status,'degraded');
  });
  await check('monitoring out of order response fails honestly and preserves newer components',async()=>{
    await due();double.fault('monitor-old');await poll();double.fault('normal');
    const current=await view();assert.equal(current.status,'unknown');assert.equal(current.services[0].status,'degraded');
    assert.equal((await client.query('SELECT last_result_code FROM control.monitor_poll_state WHERE instance_id=$1',[instanceId])).rows[0].last_result_code,'MONITOR_RESPONSE_OUT_OF_ORDER');
  });
  await check('monitoring timeout malformed signature and empty response back off without false success',async()=>{
    const lastSuccess=(await view()).lastSuccessfulCheck;
    assert.ok(lastSuccess);
    for(const mode of ['timeout','bad-signature','empty']){
      await due();double.fault(mode);await poll();double.fault('normal');
      const current=await view();assert.ok(['offline','unknown'].includes(current.status));
      assert.deepEqual(current.lastSuccessfulCheck,lastSuccess);assert.ok(current.lastFailure.at);assert.ok(current.lastAttempt.startedAt);
      const state=(await client.query('SELECT poll_token,next_poll_at>now() AS delayed,consecutive_failures FROM control.monitor_poll_state WHERE instance_id=$1',[instanceId])).rows[0];
      assert.equal(state.poll_token,null);assert.equal(state.delayed,true);assert.ok(state.consecutive_failures>0);
    }
    await due();await poll();assert.equal((await view()).status,'healthy');
    assert.ok((await view()).lastFailure); // A later success does not erase failure evidence.
  });
  await check('monitoring identity change hides old evidence and first failed check stays honest',async()=>{
    const provision=await connectOwned(run,'migration');
    try{
      // Explicit registry/key mismatch fault; no business state or success injected.
      await provision.query("UPDATE control.monitor_sources SET response_key_id='test-other-key' WHERE instance_id=$1",[instanceId]);
      const changed=await view();assert.equal(changed.status,'unknown');assert.equal(changed.observedAt,null);
      assert.equal(changed.lastSuccessfulCheck,null);assert.equal(changed.lastFailure,null);assert.equal(changed.lastAttempt,null);assert.deepEqual(changed.services,[]);
      await due();await poll();const failed=await view();assert.equal(failed.status,'unknown');assert.ok(failed.lastFailure);assert.equal(failed.lastSuccessfulCheck,null);
    }finally{
      await provision.query("UPDATE control.monitor_sources SET response_key_id='test-bank' WHERE instance_id=$1",[instanceId]);await provision.end();
    }
    await due();await poll();assert.equal((await view()).status,'healthy');
  });
}
