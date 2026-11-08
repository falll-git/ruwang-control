import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {makeSnapshot} from './control-fixtures.mjs';
import {payloadDigest} from '../../src/domain/control-review-contract.ts';
import {reviewPageSchema,reviewDetailReadSchema,snapshotComparisonSchema} from '../../src/domain/review-read-contract.ts';

export async function runReadContractChecks(c){
  const {check,instanceId,otherInstanceId,reviewer,auth,config,double,items,password,enqueue,ingest,getReviewDetail}=c;
  const list=await import('../../app/api/reviews/route.ts'),login=await import('../../app/api/auth/login/route.ts');
  const detailRoute=await import('../../app/api/instances/[instanceId]/reviews/[reviewId]/route.ts');
  const compare=await import('../../app/api/instances/[instanceId]/reviews/[reviewId]/comparison/route.ts');
  const {dispatchReviewCommand}=await import('../../src/server/review-adapter.ts');
  const origin=config.CONTROL_PUBLIC_ORIGIN;
  const req=(path,cookie,body)=>new NextRequest(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const cookies={};for(const username of ['reviewer','observer']){
    const response=await login.POST(req('/api/auth/login',null,{username,password}));assert.equal(response.status,200);cookies[username]=response.headers.get('set-cookie').split(';')[0];
  }
  const page=async(query='',actor='reviewer')=>{const response=await list.GET(req('/api/reviews?'+query,cookies[actor]));return {status:response.status,...await response.json()};};
  const detail=async(s,actor='reviewer',target=instanceId)=>{const response=await detailRoute.GET(req(`/api/instances/${target}/reviews/${s.snapshot_id}`,cookies[actor]),{params:Promise.resolve({instanceId:target,reviewId:s.snapshot_id})});return{status:response.status,...await response.json()};};
  const comparison=async(s,against,actor='reviewer')=>{const response=await compare.GET(req(`/api/instances/${instanceId}/reviews/${s.snapshot_id}/comparison?against=${against}`,cookies[actor]),{params:Promise.resolve({instanceId,reviewId:s.snapshot_id})});return{status:response.status,...await response.json()};};
  const testItems=[];const time=new Date(Date.now()-1000).toISOString().replace(/\.\d{3}Z$/,'.123456Z');
  await check('read fixture setup uses signed service ingress without SQL business writes',async()=>{
    for(let i=0;i<8;i++){
      const s=makeSnapshot(instanceId,{...items[1].detail,label:`READ-CONTRACT ${i} ${'Nama panjang '.repeat(5)}`});s.submitted_at=time;await ingest(s);testItems.push(s);
    }
  });
  await check('read API allowlist scope exact filtered count and no per-row network fetch',async()=>{
    const before=double.stats().requests,result=await page('q=READ-CONTRACT&limit=3');assert.equal(result.status,200);
    assert.equal(result.data.count.value,8);assert.equal(result.data.count.scope,'FILTERED_AUTHORIZED_SNAPSHOTS');assert.equal(result.data.count.includesCursor,false);
    assert.equal(result.data.items.length,3);reviewPageSchema.parse(result.data);assert.equal(double.stats().requests,before);
    const text=JSON.stringify(result.data);for(const field of ['envelope_json','envelope_digest','contributor_subjects','request_payload','bank_ack_public_key','configured_key_id','adapter_base_url','command_note'])assert.ok(!text.includes(field));
    assert.equal((await page('instanceId='+otherInstanceId)).status,200);assert.equal((await page('instanceId='+otherInstanceId)).data.count.value,0);assert.equal((await page('instanceId='+randomUUID())).status,403);assert.equal((await page('','anonymous')).status,401);
    const observer=await page('q=READ-CONTRACT','observer');assert.equal(observer.status,200);assert.ok(observer.data.items.every(r=>r.actions.length>0));
  });
  await check('keyset pagination covers timestamp ties both directions without duplicate or offset drift',async()=>{
    for(const sort of ['submitted_asc','submitted_desc']){
      let cursor=null;const got=[];let turns=0;
      do{const result=await page('q=READ-CONTRACT&limit=3&sort='+sort+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(result.status,200);
        got.push(...result.data.items.map(r=>r.id));cursor=result.data.page.nextCursor;assert.equal(result.data.page.hasMore,Boolean(cursor));assert.ok(++turns<10);
      }while(cursor);
      const expected=testItems.map(s=>s.snapshot_id).sort();if(sort==='submitted_desc')expected.reverse();assert.deepEqual(got,expected);
    }
  });
  await check('numbered pagination has exact authorized count stable sorting bounded pages and navigation',async()=>{
    for(const sort of ['submitted_asc','submitted_desc']){
      const got=[];
      for(let p=1;p<=3;p++){
        const result=await page('q=READ-CONTRACT&limit=3&sort='+sort+'&page='+p);
        assert.equal(result.status,200);assert.equal(result.data.page.number,p);assert.equal(result.data.page.lastPage,3);
        assert.equal(result.data.page.nextCursor,null);assert.equal(result.data.consistency,'LIVE_NUMBERED');assert.equal(result.data.count.value,8);
        got.push(...result.data.items.map(r=>r.id));
      }
      const expected=testItems.map(s=>s.snapshot_id).sort();if(sort==='submitted_desc')expected.reverse();assert.deepEqual(got,expected);
    }
    const last=await page('q=READ-CONTRACT&limit=3&page=999');assert.equal(last.data.page.number,3);assert.equal(last.data.items.length,2);
    const empty=await page('q=EMPTY-NUMBERED&page=1');assert.equal(empty.data.page.number,1);assert.equal(empty.data.page.lastPage,1);assert.equal(empty.data.count.value,0);
    for(const q of ['page=0','page=-1','page=01','page=1.5','page=1000000','page=','page=1&page=2','page=1&cursor=bad'])assert.equal((await page(q)).status,400,q);
  });
  await check('cursor tampering filter or principal mismatch and invalid inputs are rejected',async()=>{
    const first=(await page('q=READ-CONTRACT&limit=3')).data.page.nextCursor;
    for(const q of ['limit=0','limit=999','limit=','state=bad','sort=bad','group=lifecycle&kind=contact','q=%00','__proto__=x','state=all&state=all','cursor=bad'])assert.equal((await page(q)).status,400,q);
    assert.equal((await page('q=READ-CONTRACT&limit=3&cursor='+encodeURIComponent(first+'x'))).status,400);
    assert.equal((await page('q=OTHER&limit=3&cursor='+encodeURIComponent(first))).status,400);
    assert.equal((await page('q=READ-CONTRACT&limit=3&cursor='+encodeURIComponent(first),'observer')).status,400);
  });
  await check('live keyset does not repeat rows when an earlier submission arrives between pages',async()=>{
    const originals=[];
    for(let i=0;i<4;i++){const s=makeSnapshot(instanceId,{...items[1].detail,label:`NAV-CONTRACT ${i}`});s.submitted_at=time;await ingest(s);originals.push(s);}
    const first=await page('q=NAV-CONTRACT&limit=2');assert.equal(first.status,200);
    const earlier=makeSnapshot(instanceId,{...items[1].detail,label:'NAV-CONTRACT arriving earlier'});earlier.submitted_at=new Date(Date.parse(time)-60000).toISOString();await ingest(earlier);
    const second=await page('q=NAV-CONTRACT&limit=2&cursor='+encodeURIComponent(first.data.page.nextCursor));assert.equal(second.status,200);
    assert.equal(second.data.count.value,5);assert.equal(second.data.consistency,'LIVE_KEYSET');
    assert.deepEqual([...first.data.items,...second.data.items].map(r=>r.id),originals.map(s=>s.snapshot_id).sort());
    assert.equal(second.data.page.hasMore,false);
  });
  await check('read endpoints honor revoked sessions and old cursors cannot restore authentication',async()=>{
    const cursor=(await page('q=READ-CONTRACT&limit=3','observer')).data.page.nextCursor;
    const token=cookies.observer.split('=')[1],session=await auth.loadOperatorSession(token,config,{requestId:randomUUID(),touch:false});
    await auth.logoutOperator(session,randomUUID());
    for(const response of [await page('instanceId='+instanceId,'observer'),await detail(testItems[0],'observer'),await comparison(testItems[0],testItems[0].snapshot_id,'observer'),await page('q=READ-CONTRACT&limit=3&cursor='+encodeURIComponent(cursor),'observer')])assert.equal(response.status,401);
    const renewed=await login.POST(req('/api/auth/login',null,{username:'observer',password}));
    assert.equal(renewed.status,200);cookies.observer=renewed.headers.get('set-cookie').split(';')[0];
  });
  await check('content lifecycle and command filters use actual server rows including empty count zero',async()=>{
    const content=await page('state=all&group=content&kind=publication');assert.equal(content.status,200);assert.ok(content.data.items.length);assert.ok(content.data.items.every(r=>r.kind==='publication'));
    const lifecycle=await page('state=all&group=lifecycle&action=ARCHIVE_PUBLICATION');assert.equal(lifecycle.status,200);assert.ok(lifecycle.data.items.length);assert.ok(lifecycle.data.items.every(r=>r.action==='ARCHIVE_PUBLICATION'));
    const pending=await page('q=READ-CONTRACT&commandState=none');assert.equal(pending.data.count.value,8);
    const empty=await page('q=DOES-NOT-EXIST');assert.equal(empty.data.count.value,0);assert.deepEqual(empty.data.items,[]);assert.equal(empty.data.page.nextCursor,null);
    const uncertain=await page('state=all&commandState=UNKNOWN');assert.ok(uncertain.data.items.length);assert.ok(uncertain.data.items.every(r=>r.commandState==='UNKNOWN'));
  });
  await check('list public fields retired and no per-row network fetch',async()=>{
    const before=double.stats().requests,result=await page('state=all&kind=publication');assert.equal(result.status,200);assert.equal(double.stats().requests,before);
    assert.ok(result.data.items.every(r=>!('publicEvidence' in r)&&!('publicEvidenceMode' in r)));
  });
  await check('detail supplies immutable version current Control version reasons and no internal envelope',async()=>{
    const first=testItems[0],v2={...first,snapshot_id:randomUUID(),source_version:2,detail:{...first.detail,label:'READ-CONTRACT revised'}};v2.payload_checksum=payloadDigest(v2.detail);await ingest(v2);
    const old=await detail(first),current=await detail(v2);assert.equal(old.status,200);assert.equal(current.status,200);
    const versions=await page('state=all&kind=contact&sourceId='+first.resource.id);
    assert.equal(versions.status,200);assert.equal(versions.data.count.value,2);
    assert.deepEqual(versions.data.items.map(r=>r.sourceVersion).sort(),[1,2]);
    assert.equal(old.data.detail.label,first.detail.label);assert.equal(old.data.versions.latestReceived.version,2);assert.equal(old.data.versions.bankCurrent,null);
    assert.ok(old.data.actions.every(a=>!a.allowed&&a.reasonCode==='SNAPSHOT_SUPERSEDED'));
    assert.ok(current.data.actions.every(a=>a.allowed));assert.ok((await detail(v2,'observer')).data.actions.every(a=>a.allowed));
    const id=await enqueue(v2,'request_revision');await dispatchReviewCommand(id);const decided=await detail(v2);
    reviewDetailReadSchema.parse(decided.data);
    assert.equal(reviewDetailReadSchema.safeParse({...decided.data,request_payload:{secret:'canary'}}).success,false);
    assert.equal(decided.data.decision.note,'Catatan keputusan pengujian');assert.equal(decided.data.decision.action,'request_revision');assert.equal(decided.data.decision.applicationState,'APPLIED');
    assert.ok(decided.data.actions.every(a=>!a.allowed&&a.reasonCode==='DECISION_ALREADY_RECORDED'));
    for(const key of ['envelope_json','contributor_subjects','bank_ack_public_key','actor_subject','request_payload','configured_key_id'])assert.ok(!(key in decided.data));
    const delta=await comparison(v2,first.snapshot_id);assert.equal(delta.status,200);assert.equal(delta.data.basis,'SUBMITTED_SNAPSHOTS');assert.deepEqual(delta.data.changes.map(d=>d.path),['/label']);
    snapshotComparisonSchema.parse(delta.data);
    assert.equal((await comparison(v2,testItems[1].snapshot_id)).status,400);
    assert.equal((await comparison(v2,randomUUID())).status,400);assert.equal((await comparison(v2,first.snapshot_id,'anonymous')).status,401);
    assert.deepEqual((await comparison(v2,v2.snapshot_id)).data.changes,[]);
  });
  await check('detail target mismatch and invalid ID do not fetch or record public evidence',async()=>{
    const before=double.stats().requests;
    assert.equal((await detail(items[0],'reviewer',otherInstanceId)).status,400);
    assert.equal((await detail({...items[0],snapshot_id:'not-id'})).status,400);
    assert.equal(double.stats().requests,before);
  });
  await check('partial lifecycle and zero-valued snapshot fields survive list/detail/comparison',async()=>{
    const s=makeSnapshot(instanceId,{...items[6].detail,affected_publications:0,affected_media:0,media:[],reference_code:null,public_slug:null});await ingest(s);
    const value=await detail(s);assert.equal(value.status,200);assert.equal(value.data.detail.affected_media,0);assert.deepEqual(value.data.detail.media,[]);
    assert.ok(!('publicObservation' in value.data));
    const p=makeSnapshot(instanceId,{...items[2].detail,title:'Zero example',attributes:{area:0,flag:false,note:null}});await ingest(p);
    assert.equal((await getReviewDetail(reviewer.principal,p.snapshot_id)).detail.attributes.area,0);
  });
  await check('database read failure is an error not an empty successful page',async()=>{
    const pool=globalThis.__ruwangControlPool,original=pool.query;pool.query=()=>Promise.reject(Error('READ_FAILURE_TEST_ONLY'));
    try{const result=await page();assert.equal(result.status,503);assert.ok(result.error);assert.ok(!result.data);}finally{pool.query=original;}
  });
}
