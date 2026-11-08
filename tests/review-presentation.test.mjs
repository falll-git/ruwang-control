import test from 'node:test';import assert from 'node:assert/strict';
import {reviewDecisionBadge} from '../src/domain/review-presentation.ts';
test('stored decision is independent of application and never claims public visibility',()=>{
  for(const [decision,label] of [['approve','Disetujui'],['request_revision','Perlu diperbaiki'],['reject','Ditolak']]){
    for(const commandState of ['PENDING','DISPATCHING','APPLIED','REJECTED','UNKNOWN']){
      const r=reviewDecisionBadge({state:'IN_REVIEW',commandState,commandDecision:decision});
      assert.equal(r.label,label);assert.doesNotMatch(r.label,/tayang|Menunggu|diterapkan/i);
    }
  }
});
test('undecided snapshot and supersession remain explicit',()=>{
  assert.equal(reviewDecisionBadge({state:'IN_REVIEW',commandDecision:null}).label,'Menunggu pemeriksaan');
  assert.equal(reviewDecisionBadge({state:'SUPERSEDED',commandDecision:'approve'}).label,'Sudah digantikan');
  assert.equal(reviewDecisionBadge({state:'APPROVED',commandDecision:null}).label,'Disetujui');
});
