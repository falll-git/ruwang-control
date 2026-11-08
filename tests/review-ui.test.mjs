import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewDate,displayValue,safeReviewReturn,reviewApiQuery,switchReviewGroup,cursorTrail,decisionReceiptSchema,commandLookupSchema,bankSnapshotStateLabel} from '../src/domain/review-ui.ts';

test('bank lifecycle snapshot labels do not claim current public visibility',()=>{
  assert.equal(bankSnapshotStateLabel('DRAFT'),'Draf');
  assert.equal(bankSnapshotStateLabel('PUBLISHED'),'Publikasi tercatat aktif di bank');
  assert.equal(bankSnapshotStateLabel('VERIFIED'),'Diverifikasi');
  assert.equal(bankSnapshotStateLabel('unknown'),'Status belum dikenali');
});

test('review labels preserve zero, partial data and time in effective Jakarta zone',()=>{
  assert.equal(displayValue(0),'0');assert.equal(displayValue(false),'Tidak');assert.equal(displayValue(null),'Belum tersedia');
  assert.equal(reviewDate('invalid'),'Belum tersedia');assert.equal(reviewDate(null),'Belum tersedia');
  assert.match(reviewDate('2026-09-25T17:00:00Z'),/26 Sep 2026, 00:00/);assert.doesNotMatch(reviewDate('2026-09-25T17:00:00Z'),/GMT/);
});
test('detail return URL is restricted to local review list',()=>{
  assert.equal(safeReviewReturn('/reviews?state=all&group=lifecycle'),'/reviews?state=all&group=lifecycle');
  for(const value of ['https://evil.test','//evil.test','/reviews/other','/reviews#bad','/reviews?x=\n','/reviews?x=\\evil',null])assert.equal(safeReviewReturn(value),'/reviews');
});
test('tab filters and cursors stay independent, same-tab click is a no-op',()=>{
  const first='group=content&kind=profile&state=all&cursor=opaque&trail=%5B%22%22%5D';
  assert.equal(switchReviewGroup(first,'content'),first);
  const second=new URLSearchParams(switchReviewGroup(first,'lifecycle'));assert.equal(second.has('cursor'),false);second.set('action','HIDE_PROFILE');
  const back=new URLSearchParams(switchReviewGroup(second.toString(),'content'));assert.equal(back.get('cursor'),'opaque');assert.equal(back.get('kind'),'profile');assert.equal(back.has('action'),false);
  const again=new URLSearchParams(switchReviewGroup(back.toString(),'lifecycle'));assert.equal(again.get('action'),'HIDE_PROFILE');
  const api=reviewApiQuery(back.toString());assert.equal(api.has('other'),false);assert.equal(api.has('trail'),false);assert.equal(api.get('cursor'),'opaque');
});
test('malformed pagination context is not trusted',()=>{
  assert.deepEqual(cursorTrail('{bad'),[]);assert.deepEqual(cursorTrail('[1]'),[]);assert.deepEqual(cursorTrail('["","opaque"]'),['','opaque']);
});
test('HTTP success is insufficient without a valid decision identity and state',()=>{
  for(const body of [{},{commandId:'other',state:'APPLIED'},{commandId:randomUUID(),state:'SUCCESS',resultCode:null}])assert.equal(decisionReceiptSchema.safeParse(body).success,false);
  assert.equal(decisionReceiptSchema.safeParse({commandId:randomUUID(),state:'UNKNOWN',resultCode:null}).success,true);
  assert.equal(commandLookupSchema.safeParse({id:randomUUID(),state:'APPLIED',result_code:null}).success,false);
});
