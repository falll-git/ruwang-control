import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {monitoringViewSchema,applicationNext,sourceFailure,sourceLabels,componentReason,sourceTimeDetails} from '../src/domain/monitoring-read.ts';
import {safeReviewReturn,reviewApiQuery,reviewDate} from '../src/domain/review-ui.ts';
test('service timestamps deduplicate display text without hiding failed or unresolved attempts',()=>{
  const source={lastSuccessfulCheck:{checkedAt:'2026-10-05T10:00:20Z',sourceObservedAt:'2026-10-05T17:00:10+07:00'},lastAttempt:{startedAt:'2026-10-05T10:00:05Z',code:'OBSERVED'}};
  assert.deepEqual(sourceTimeDetails(source,reviewDate),[{label:'Pemeriksaan berhasil terakhir',value:reviewDate(source.lastSuccessfulCheck.checkedAt)}]);
  for(const code of [null,'SOURCE_OFFLINE','SOURCE_TIMEOUT']){
    const details=sourceTimeDetails({...source,lastAttempt:{...source.lastAttempt,code}},reviewDate);
    assert.equal(details.length,2);assert.equal(details[1].label,'Percobaan terbaru');assert.ok(details[1].result);
  }
  assert.equal(sourceTimeDetails({...source,lastSuccessfulCheck:null},reviewDate)[1].result,'Hasil diterima');
});
test('different service dates and source observation times stay distinct without freshness assumptions',()=>{
  const source={lastSuccessfulCheck:{checkedAt:'2026-10-05T17:00:00Z',sourceObservedAt:'2026-10-05T16:59:00Z'},lastAttempt:{startedAt:'2026-10-05T16:59:59Z',code:'OBSERVED'}};
  assert.deepEqual(sourceTimeDetails(source,reviewDate).map(x=>x.label),['Pemeriksaan berhasil terakhir','Percobaan terbaru','Waktu data sumber']);
  assert.deepEqual(sourceTimeDetails({lastSuccessfulCheck:null,lastAttempt:null},reviewDate),[{label:'Pemeriksaan berhasil terakhir',value:'Belum tersedia'}]);
});
test('monitoring response rejects malformed success and internal fields, preserves zero',()=>{
  const at='2026-09-29T00:00:00Z';
  const source={instanceId:randomUUID(),instanceKey:'test',displayName:'Test',sourceKind:'ruwang',status:'unknown',observedAt:null,nextPollAt:null,lastSuccessfulCheck:null,lastAttempt:null,lastFailure:null,evidenceScope:'SIGNED_PIPELINE_SNAPSHOT',services:[],queues:[{key:'outbox',status:'unknown',observedAt:at,detailCode:null,depth:0}]};
  const data={observedAt:at,enabled:true,sources:[source]};
  assert.equal(monitoringViewSchema.parse(data).sources[0].queues[0].depth,0);
  for(const value of [{},{...data,secret:'no'},{...data,sources:[{...source,status:'ok'}]}])assert.equal(monitoringViewSchema.safeParse(value).success,false);
});
test('application and source labels do not invent success or retry',()=>{
  assert.match(applicationNext('UNKNOWN','COMMAND_TARGET_CHANGED'),/ditahan/);
  assert.match(applicationNext('UNKNOWN',null),/belum tersedia/);
  assert.match(applicationNext('PENDING',null),/menunggu/);
  assert.equal(applicationNext('APPLIED',null),'');
  assert.match(sourceFailure('SOURCE_TIMEOUT'),/batas waktu/);
  assert.match(sourceFailure('SOURCE_OFFLINE'),/belum dapat/);
  assert.match(sourceLabels.stale,/baru/);assert.doesNotMatch(sourceLabels.healthy,/Sehat/);
  assert.match(componentReason('OUTBOX_FAILED_ITEMS'),/gagal atau ditahan/);
  assert.equal(componentReason('DEAD_LETTER_PRESENT'),'Ada pekerjaan yang gagal diproses.');
  assert.match(componentReason('NOT_IN_CONTRACT'),/belum dapat dijelaskan/);
});
test('pipeline failure copy states the fault without inventing recovery eligibility',()=>{
  assert.equal(componentReason('OUTBOX_FAILED_ITEMS'),'Ada pengiriman gagal atau ditahan.');
  for(const code of ['OUTBOX_FAILED_ITEMS','DEAD_LETTER_PRESENT']) {
    assert.doesNotMatch(componentReason(code),/belum tersedia|berhasil|silakan kirim ulang/i);
  }
});
test('monitoring return stays local and UI tab parameter never reaches API',()=>{
  assert.equal(safeReviewReturn('/monitoring?state=all'),'/monitoring?state=all');
  for(const input of ['/monitoring/evil','//monitoring','/monitoring#evil','/monitoring?x=\\evil'])assert.equal(safeReviewReturn(input),'/reviews');
  const query=reviewApiQuery('view=services&commandState=UNKNOWN&state=all');assert.equal(query.has('view'),false);assert.equal(query.get('commandState'),'UNKNOWN');
});

test('recovery navigation groups permission-gated links with wrapping and spacing',()=>{
  const component=readFileSync(new URL('../components/monitoring-client.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../app/monitoring/monitoring.css',import.meta.url),'utf8');
  assert.match(component,/canRecover\?<div className="sj-recovery-links" role="navigation" aria-label="Penanganan kendala"/);
  assert.match(component,/canProcess\?<Link className="sj-back" href="\/monitoring\/pemrosesan"/);
  assert.match(css,/\.sj-recovery-links\{[^}]*display:flex;[^}]*flex-wrap:wrap;[^}]*gap:8px 24px/);
});
