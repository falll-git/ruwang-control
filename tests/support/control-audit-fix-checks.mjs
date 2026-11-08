import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {makeSnapshot} from './control-fixtures.mjs';
import {reviewCommandSchema} from '../../src/domain/control-review-contract.ts';

export async function runAuditFixChecks({check,instanceId,items,ingest,reviewer,client,config,password,double}) {
  const login=await import('../../app/api/auth/login/route.ts');
  const csrf=await import('../../app/api/auth/csrf/route.ts');
  const decisions=await import('../../app/api/instances/[instanceId]/reviews/[reviewId]/decisions/route.ts');
  const commands=await import('../../app/api/instances/[instanceId]/review-commands/[commandId]/route.ts');
  const {enqueueReviewDecision,dispatchReviewCommand,getReviewCommand}=await import('../../src/server/review-adapter.ts');
  const {getReviewDetail}=await import('../../src/server/reviews.ts');
  const {listReviewPage}=await import('../../src/server/review-read.ts');
  const {getDashboardSnapshot}=await import('../../src/server/dashboard.ts');
  const origin=config.CONTROL_PUBLIC_ORIGIN;
  const request=(path,body,headers={})=>new NextRequest(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  const logged=await login.POST(request('/api/auth/login',{username:'reviewer',password}));assert.equal(logged.status,200);
  const cookie=logged.headers.get('set-cookie').split(';')[0];
  const {loadOperatorSession}=await import('../../src/server/auth/service.ts');
  reviewer=await loadOperatorSession(cookie.split('=')[1],config,{requestId:randomUUID(),touch:false});
  assert.ok(reviewer);
  const token=(await (await csrf.GET(request('/api/auth/csrf',null,{cookie}))).json()).data.token;
  const lookup=async(id,headers={cookie},target=instanceId)=>commands.GET(request(`/api/instances/${target}/review-commands/${id}`,null,headers),{params:Promise.resolve({instanceId:target,commandId:id})});
  const s=makeSnapshot(instanceId,{...items[1].detail,label:'AUDIT-FIX approval note'});await ingest(s);
  const id=randomUUID(),note='Catatan persetujuan disimpan di Control.';
  const input={commandId:id,instanceId,reviewId:s.snapshot_id,expectedVersion:s.source_version,expectedChecksum:s.payload_checksum,decision:'approve',reason:note,actor:reviewer,requestId:randomUUID()};
  await check('audit F1 scoped command absence is explicit and anonymous or unknown institution remains denied',async()=>{
    const response=await lookup(id);assert.equal(response.status,404);assert.equal((await response.json()).error.code,'COMMAND_NOT_FOUND');
    assert.equal((await lookup(id,{})).status,401);assert.equal((await lookup(id,{cookie},randomUUID())).status,403);
    assert.equal((await client.query('SELECT count(*)::int n FROM control.review_commands WHERE id=$1',[id])).rows[0].n,0);
  });
  await check('audit F1 F2 delayed first intent and same-ID retry record one command and preserve approval note without forbidden wire reason',async()=>{
    const ids=await Promise.all([enqueueReviewDecision(input),enqueueReviewDecision({...input,requestId:randomUUID()})]);assert.deepEqual(ids,[id,id]);
    const command=await getReviewCommand(instanceId,id);assert.equal(command.decision_note,note);assert.equal(Object.hasOwn(command.request_payload,'reason'),false);reviewCommandSchema.parse(command.request_payload);
    assert.equal((await getReviewDetail(reviewer.principal,s.snapshot_id)).decision.note,note);
    assert.equal(await enqueueReviewDecision({...input,commandId:randomUUID()}),id);
    await assert.rejects(enqueueReviewDecision({...input,reason:'Changed intent'}),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
    await assert.rejects(enqueueReviewDecision({...input,commandId:randomUUID(),reason:'Changed intent'}),e=>e.code==='DECISION_ALREADY_RECORDED');
    assert.equal((await client.query('SELECT count(*)::int n FROM control.review_commands WHERE snapshot_id=$1',[s.snapshot_id])).rows[0].n,1);
  });
  const page=q=>listReviewPage(reviewer.principal,new URLSearchParams(q));
  await check('audit F3 pending and UNKNOWN application do not inflate waiting filters dashboard or notification counts',async()=>{
    for(const state of ['PENDING','UNKNOWN']){
      if(state==='UNKNOWN'){double.fault('timeout');try{await assert.rejects(dispatchReviewCommand(id));}finally{double.fault('normal');}}
      const row=(await page('state=APPROVED&q=AUDIT-FIX')).items[0];assert.equal(row.id,s.snapshot_id);assert.equal(row.state,'IN_REVIEW');assert.equal(row.commandDecision,'approve');assert.equal(row.commandState,state);
      assert.equal((await page('state=IN_REVIEW&q=AUDIT-FIX')).count.value,0);
      const dashboard=await getDashboardSnapshot(reviewer.principal);
      const content=await page('state=IN_REVIEW&group=content'),lifecycle=await page('state=IN_REVIEW&group=lifecycle');
      assert.equal(dashboard.counts.pendingContent,content.count.value);assert.equal(dashboard.counts.pendingLifecycle,lifecycle.count.value);
      assert.equal(dashboard.counts.pendingReviews,content.count.value+lifecycle.count.value);
    }
  });
  await check('audit F2 decision API same actor two tabs retains note and returns original command without double effect',async()=>{
    const fresh=makeSnapshot(instanceId,items[1].detail);await ingest(fresh);
    const decide=key=>decisions.POST(request(`/api/instances/${instanceId}/reviews/${fresh.snapshot_id}/decisions`,{decision:'approve',reason:note,expectedVersion:fresh.source_version,expectedChecksum:fresh.payload_checksum},{cookie,'x-csrf-token':token,'idempotency-key':key}),{params:Promise.resolve({instanceId,reviewId:fresh.snapshot_id})});
    const before=double.stats().effects,responses=await Promise.all([decide(randomUUID()),decide(randomUUID())]);
    for(const response of responses)assert.ok([200,202].includes(response.status));
    const results=await Promise.all(responses.map(r=>r.json()));assert.equal(results[0].data.commandId,results[1].data.commandId);
    assert.equal(double.stats().effects-before,1);
    const lookupResult=await lookup(results[0].data.commandId);assert.equal((await lookupResult.json()).data.decision_note,note);
  });
}
