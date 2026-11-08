// Real Next route handlers, Request/Response, sessions/CSRF and disposable DB.
// No Next HTTP server/browser: bank/SJ transport remains a test double.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {makeSnapshot,signedSnapshot} from './control-fixtures.mjs';
import {payloadDigest} from '../../src/domain/control-review-contract.ts';

export async function runReviewApiChecks(c){
  const {check,instanceId,otherInstanceId,reviewer,bootstrap,auth,config,bankKey,double,items,client,password,enqueue}=c;
  const loginRoute=await import('../../app/api/auth/login/route.ts');
  const csrfRoute=await import('../../app/api/auth/csrf/route.ts');
  const ingress=await import('../../app/api/internal/sj-review/snapshots/route.ts');
  const decisions=await import('../../app/api/instances/[instanceId]/reviews/[reviewId]/decisions/route.ts');
  const lists=await import('../../app/api/instances/[instanceId]/reviews/route.ts');
  const details=await import('../../app/api/instances/[instanceId]/reviews/[reviewId]/route.ts');
  const media=await import('../../app/api/instances/[instanceId]/reviews/[reviewId]/media/[mediaId]/route.ts');
  const commands=await import('../../app/api/instances/[instanceId]/review-commands/[commandId]/route.ts');
  const {dispatchReviewCommand,enqueueReviewDecision}=await import('../../src/server/review-adapter.ts');
  const origin=config.CONTROL_PUBLIC_ORIGIN;
  const params=p=>({params:Promise.resolve(p)});
  function request(path,{method='GET',body,cookie,csrf,key,headers={}}={}){
    return new NextRequest(origin+path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...(key?{'idempotency-key':key}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  }
  async function login(username){
    const response=await loginRoute.POST(request('/api/auth/login',{method:'POST',body:{username,password}}));
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const csrf=await csrfRoute.GET(request('/api/auth/csrf',{cookie}));assert.equal(csrf.status,200);
    return{cookie,csrf:(await csrf.json()).data.token};
  }
  const decisionPath=s=>`/api/instances/${s.instance_id}/reviews/${s.snapshot_id}/decisions`;
  async function decide(s,actor,{key=randomUUID(),decision='approve',reason=s.detail.kind==='change_request'?'Catatan pemeriksaan tes':'',body={},headers={}}={}){
    const response=await decisions.POST(request(decisionPath(s),{method:'POST',...actor,key,headers,body:{decision,reason,expectedVersion:s.source_version,expectedChecksum:s.payload_checksum,...body}}),params({instanceId:s.instance_id,reviewId:s.snapshot_id}));
    return{status:response.status,...await response.json()};
  }
  async function submit(s,expected=202){
    double.add(s);const response=await ingress.POST(new NextRequest(signedSnapshot(s,bankKey.privateKey,double.origin)));
    assert.equal(response.status,expected);
    return response;
  }
  const fresh=(detail=items[1].detail)=>makeSnapshot(instanceId,detail);
  const stored=async s=>(await client.query('SELECT state FROM control.review_snapshots WHERE id=$1',[s.snapshot_id])).rows[0]?.state;
  const count=async s=>(await client.query('SELECT count(*)::int n FROM control.review_commands WHERE snapshot_id=$1',[s.snapshot_id])).rows[0].n;
  let a,b,o;
  await check('API real login cookies CSRF and equal internal accounts',async()=>{
    await auth.createOperator({actor:bootstrap,username:'second-reviewer',displayName:'Pemeriksa kedua',password,requestId:randomUUID()});
    a=await login('reviewer');b=await login('second-reviewer');o=await login('observer');
  });
  await check('API positive profile contact four categories and lifecycle decisions',async()=>{
    for(const item of items){const s=fresh(item.detail);await submit(s);const result=await decide(s,a);assert.equal(result.status,200);assert.equal(result.data.state,'APPLIED');assert.equal(await stored(s),'APPROVED');
      if(s.detail.kind==='publication'){
        const ack=(await client.query('SELECT acknowledgment_payload FROM control.review_commands WHERE id=$1',[result.data.commandId])).rows[0].acknowledgment_payload;
        assert.notEqual(ack.observed_checksum,s.payload_checksum); // published payload is rebuilt by bank
      }
    }
  });
  await check('private thumbnail API preserves session resource scope and validates the variant',async()=>{
    const s=fresh(items[0].detail);await submit(s);
    const scope=params({instanceId,reviewId:s.snapshot_id,mediaId:s.detail.logo.source_media_id});
    const path=`/api/instances/${instanceId}/reviews/${s.snapshot_id}/media/${s.detail.logo.source_media_id}`;
    assert.equal((await media.GET(request(path+'?variant=thumbnail'),scope)).status,401);
    assert.equal((await media.GET(request(path+'?variant=large',a),scope)).status,400);
    assert.equal((await media.GET(request(path+'?variant=thumbnail&variant=thumbnail',a),scope)).status,400);
    const thumb=await media.GET(request(path+'?variant=thumbnail',a),scope);assert.equal(thumb.status,200);
    assert.equal(thumb.headers.get('content-type'),'image/webp');assert.match(thumb.headers.get('cache-control'),/private, no-store/);
    const original=await media.GET(request(path,a),scope);assert.equal(original.status,200);assert.equal(original.headers.get('content-type'),'image/png');
    const mismatch=params({instanceId:otherInstanceId,reviewId:s.snapshot_id,mediaId:s.detail.logo.source_media_id});
    assert.equal((await media.GET(request(path.replace(instanceId,otherInstanceId)+'?variant=thumbnail',a),mismatch)).status,400);
  });
  await check('API signature binding nonce duplicate version checksum and stale ingress',async()=>{
    const s=fresh();const req=signedSnapshot(s,bankKey.privateKey,double.origin);
    double.add(s);assert.equal((await ingress.POST(new NextRequest(req.clone()))).status,202);
    assert.equal((await ingress.POST(new NextRequest(req.clone()))).status,409);
    await submit(s); // same immutable envelope, fresh transport nonce
    await submit({...s,detail:{...s.detail,label:'Diubah tanpa snapshot baru'}},409);
    await submit({...s,snapshot_id:randomUUID()},409);
    const v2={...s,snapshot_id:randomUUID(),source_version:2};await submit(v2);
    assert.equal(await stored(s),'SUPERSEDED');assert.equal(await stored(v2),'IN_REVIEW');
    await submit({...s,snapshot_id:randomUUID()},409);
    const invalid=signedSnapshot(fresh(),bankKey.privateKey,double.origin);invalid.headers.set('x-invalid-test','1');
    // Change signed body without recomputing transport digest.
    const body=await invalid.text();const tampered=new NextRequest(invalid.url,{method:'POST',headers:invalid.headers,body:body.replace('Kontak uji','Kontak lain')});
    assert.equal((await ingress.POST(tampered)).status,503);
    const wrong=signedSnapshot({...fresh(),instance_id:otherInstanceId},bankKey.privateKey,double.origin);
    assert.equal((await ingress.POST(new NextRequest(wrong))).status,503);
    assert.equal((await decide(s,a)).status,409);
  });
  await check('API denies anonymous bad CSRF wrong version checksum and editing payload',async()=>{
    const s=fresh();await submit(s);
    assert.equal((await decide(s,{})).status,401);
    assert.equal((await decide(s,{...a,csrf:'invalid'})).status,403);
    assert.equal((await decide(s,a,{headers:{origin:'https://wrong.invalid'}})).status,403);
    assert.equal((await decide(s,a,{body:{expectedVersion:99}})).status,409);
    assert.equal((await decide(s,a,{body:{expectedChecksum:'f'.repeat(64)}})).status,409);
    assert.equal((await decide(s,a,{body:{detail:{label:'Operator cannot edit'}}})).status,400);
    assert.equal((await decide(s,a,{decision:'request_revision',reason:' '})).status,400);
    assert.equal((await decide(s,a,{decision:'reject',reason:'Tidak sah'})).status,400);
    assert.equal(await count(s),0);
    const self={...fresh(),contributor_subjects:[`ruwang-control:${reviewer.operator.id}`]};await submit(self);assert.equal((await decide(self,a)).status,400);
    const lifecycle=fresh(items[6].detail);await submit(lifecycle);assert.equal((await decide(lifecycle,a,{reason:''})).status,400);
  });
  await check('API simultaneous duplicate ingress retains one immutable snapshot',async()=>{
    const s=fresh();await Promise.all([submit(s),submit(s)]);
    assert.equal((await client.query('SELECT count(*)::int n FROM control.review_snapshots WHERE id=$1',[s.snapshot_id])).rows[0].n,1);
  });
  await check('API all review endpoints retain exact resource-instance binding',async()=>{
    const s=fresh(items[0].detail);await submit(s);
    const decision=await decide(s,a),commandId=decision.data.commandId;
    const scope={instanceId:otherInstanceId,reviewId:s.snapshot_id,mediaId:s.detail.logo.source_media_id,commandId};
    assert.equal((await lists.GET(request('/api/instances/'+otherInstanceId+'/reviews',a),params(scope))).status,200);
    for(const [handler,path] of [[details.GET,'/reviews/'+s.snapshot_id],[media.GET,'/reviews/'+s.snapshot_id+'/media/'+scope.mediaId],[commands.GET,'/review-commands/'+commandId]]){
      const response=await handler(request('/api/instances/'+otherInstanceId+path,a),params(scope));
      assert.equal(response.status,handler===commands.GET?404:400);
      if(handler===commands.GET)assert.equal((await response.json()).error.code,'COMMAND_NOT_FOUND');
    }
    assert.equal((await decide({...s,instance_id:otherInstanceId},a)).status,503);
    const unknown=randomUUID();
    assert.equal((await lists.GET(request('/api/instances/'+unknown+'/reviews',a),params({instanceId:unknown}))).status,403);
    const equal=fresh();await submit(equal);assert.equal((await decide(equal,o)).status,200);
    assert.equal((await lists.GET(request('/api/instances/'+instanceId+'/reviews',o),params({instanceId}))).status,200);
    assert.equal((await commands.GET(request('/api/instances/'+instanceId+'/review-commands/'+commandId,o),params({instanceId,commandId}))).status,200);
  });
  await check('API two concurrent reviewers cannot create competing decisions',async()=>{
    const s=fresh();await submit(s);
    const results=await Promise.all([decide(s,a),decide(s,b,{decision:'request_revision',reason:'Perbaiki nomor kontak'})]);
    assert.equal(results.filter(r=>[200,202].includes(r.status)).length,1);
    assert.equal(results.filter(r=>r.status===409).length,1);assert.equal(await count(s),1);
  });
  await check('API two tabs and lost HTTP response reuse original intent even with fresh key',async()=>{
    const s=fresh();await submit(s);const key=randomUUID();const before=double.stats().effects;
    const results=await Promise.all([decide(s,a,{key}),decide(s,a,{key}),decide(s,a)]);
    assert.ok(results.every(r=>[200,202].includes(r.status)));assert.equal(new Set(results.map(r=>r.data.commandId)).size,1);
    assert.equal(await count(s),1);assert.equal(double.stats().effects-before,1);
    const retry=await decide(s,a);assert.equal(retry.data.commandId,results[0].data.commandId);
    assert.equal((await decide(s,a,{key,decision:'request_revision',reason:'Different intent'})).status,409);
    assert.equal((await decide(s,b,{key})).status,409);
    assert.equal((await decide(s,o,{key})).status,409);
  });
  await check('API revision note persisted and resubmission targets new version only',async()=>{
    const s=fresh();await submit(s);const result=await decide(s,a,{decision:'request_revision',reason:'Perbaiki nomor kontak'});assert.equal(result.status,200);assert.equal(await stored(s),'REVISION_REQUIRED');
    const note=(await client.query('SELECT body FROM control.review_reasons WHERE snapshot_id=$1',[s.snapshot_id])).rows;assert.deepEqual(note,[{body:'Perbaiki nomor kontak'}]);
    const next={...s,snapshot_id:randomUUID(),source_version:2,detail:{...s.detail,label:'Kontak diperbaiki'}};next.payload_checksum=payloadDigest(next.detail);await submit(next);
    assert.equal((await decide(next,a)).status,200);assert.equal(await stored(s),'REVISION_REQUIRED');assert.equal(await stored(next),'APPROVED');
  });
  await check('API applied-but-response-lost remains UNKNOWN without duplicate effect or resend',async()=>{
    const s=fresh();await submit(s);const before=double.stats().effects;double.fault('apply-disconnect');
    const first=await decide(s,a);assert.equal(first.status,202);assert.equal(first.data.state,'UNKNOWN');
    double.fault('normal');const requests=double.stats().requests;const retry=await decide(s,a);
    assert.equal(retry.data.state,'UNKNOWN');assert.equal(retry.data.commandId,first.data.commandId);
    assert.equal(double.stats().requests,requests);assert.equal(double.stats().effects-before,1);assert.equal(await stored(s),'IN_REVIEW');
    assert.equal((await decide(s,b)).status,409);assert.equal(await count(s),1);
  });
  await check('API late ACK cannot overwrite superseded snapshot or newer version',async()=>{
    const s=fresh();await submit(s);double.fault('hold-ack');const pending=decide(s,a);
    const deadline=Date.now()+250;while(!double.stats().held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(double.stats().held,1);
    const next={...s,snapshot_id:randomUUID(),source_version:2};await submit(next);double.fault('normal');double.release();
    const response=await pending;assert.equal(response.data.state,'APPLIED');assert.equal(await stored(s),'SUPERSEDED');assert.equal(await stored(next),'IN_REVIEW');
    assert.equal((await decide(next,b)).status,200);assert.equal(await stored(next),'APPROVED');
  });
  await check('API timeout malformed or wrong-version ACK never reports applied',async()=>{
    for(const mode of ['empty','bad-signature','timeout','disconnect','wrong-version','wrong-checksum']){
      const s=fresh();await submit(s);double.fault(mode);const result=await decide(s,a);double.fault('normal');
      assert.equal(result.status,202);assert.equal(result.data.state,'UNKNOWN');assert.equal(await stored(s),'IN_REVIEW');
      const requests=double.stats().requests;assert.equal((await decide(s,a)).data.commandId,result.data.commandId);assert.equal(double.stats().requests,requests);
    }
  });
  await check('queued stale decision is rejected locally without calling bank',async()=>{
    const s=fresh();await submit(s);const id=await enqueue(s);const next={...s,snapshot_id:randomUUID(),source_version:2};await submit(next);
    const requests=double.stats().requests;const result=await dispatchReviewCommand(id);assert.equal(result.state,'REJECTED');assert.equal(result.result_code,'SNAPSHOT_SUPERSEDED');assert.equal(double.stats().requests,requests);
  });
  await check('expired queued decision is never sent and authority local rejects a permitted reviewer',async()=>{
    const s=fresh();await submit(s);
    const id=await enqueueReviewDecision({commandId:randomUUID(),instanceId,reviewId:s.snapshot_id,decision:'approve',reason:'',expectedVersion:s.source_version,expectedChecksum:s.payload_checksum,actor:reviewer,requestId:randomUUID()},new Date(Date.now()-3600000));
    const requests=double.stats().requests;assert.equal((await dispatchReviewCommand(id)).result_code,'COMMAND_EXPIRED_BEFORE_SEND');assert.equal(double.stats().requests,requests);
    assert.equal((await decide({...s,instance_id:otherInstanceId},a)).status,503);
  });
  await check('ledger recovery API rejects anonymous CSRF wrong-resource scope and malformed input before network',async()=>{
    const s=fresh();await submit(s);double.fault('apply-disconnect');const pending=await decide(s,a);double.fault('normal');
    assert.equal(pending.data.state,'UNKNOWN');const commandId=pending.data.commandId;
    const call=async(actor=a,overrides={},target=instanceId)=>commands.POST(request(`/api/instances/${target}/review-commands/${commandId}`,{
      method:'POST',...actor,body:{action:'check_result'},...overrides}),params({instanceId:target,commandId}));
    const before=double.stats().requests;
    assert.equal((await call({})).status,401);
    assert.equal((await call(a,{csrf:'wrong'})).status,403);assert.equal((await call(a,{body:{action:'retry'}})).status,400);
    assert.equal((await call(a,{},otherInstanceId)).status,400);assert.equal(double.stats().requests,before);
    const response=await call();assert.equal(response.status,200);assert.equal((await response.json()).data.state,'APPLIED');
    assert.equal(await stored(s),'APPROVED');assert.equal(await count(s),1);
    assert.equal((await call(o)).status,200);
  });
  await check('ledger read absent timeout and corrupt responses stay uncertain and preserve audit; superseded snapshot stays superseded',async()=>{
    const call=async(commandId)=>commands.POST(request(`/api/instances/${instanceId}/review-commands/${commandId}`,{
      method:'POST',...a,body:{action:'check_result'}}),params({instanceId,commandId}));
    const absent=fresh();await submit(absent);double.fault('disconnect');const missing=await decide(absent,a);double.fault('normal');
    const notFound=await call(missing.data.commandId);assert.equal(notFound.status,200);assert.equal((await notFound.json()).data.state,'UNKNOWN');assert.equal(await stored(absent),'IN_REVIEW');
    const s=fresh();await submit(s);double.fault('apply-disconnect');const lost=await decide(s,a);double.fault('normal');
    const effects=double.stats().effects;
    for(const mode of ['bad-signature','empty','http-error','timeout']){
      double.fault(mode);assert.ok((await call(lost.data.commandId)).status>=400);double.fault('normal');
      assert.equal((await client.query('SELECT state FROM control.review_commands WHERE id=$1',[lost.data.commandId])).rows[0].state,'UNKNOWN');
    }
    const newer={...s,snapshot_id:randomUUID(),source_version:2};await submit(newer);
    for(const r of await Promise.all([call(lost.data.commandId),call(lost.data.commandId)])){
      assert.equal(r.status,200);assert.equal((await r.json()).data.state,'APPLIED');
    }
    assert.equal(await stored(s),'SUPERSEDED');assert.equal(await stored(newer),'IN_REVIEW');assert.equal(double.stats().effects,effects);
    assert.equal((await client.query('SELECT state FROM control.review_dispatch_attempts WHERE command_id=$1',[lost.data.commandId])).rows[0].state,'UNKNOWN');
  });
  await check('API revoked session and stale service principal cannot replay an earlier command',async()=>{
    const s=fresh();await submit(s);const first=await decide(s,a);const key=first.data.commandId;
    await auth.revokeOperatorSessions({actor:bootstrap,instanceId,targetOperatorId:reviewer.operator.id,requestId:randomUUID()});
    assert.equal((await decide(s,a,{key})).status,401);
    await assert.rejects(enqueue(s),e=>e.code==='SESSION_EXPIRED');
  });
}
