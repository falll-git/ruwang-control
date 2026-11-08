import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseReviewListQuery,reviewActionEligibility,compareSnapshotDetails} from '../src/domain/review-read.ts';
import {reviewSummarySchema} from '../src/domain/review-read-contract.ts';
const instanceId=randomUUID(),id=randomUUID();
const principal={id,issuer:'ruwang-control',active:true,sessionVerified:true,grants:[{instanceId,active:true,role:'internal_operator'}]};
const snapshot={id:randomUUID(),instanceId,kind:'contact',state:'IN_REVIEW',version:1,checksum:'a'.repeat(64),contributors:['ruwang-bank:'+randomUUID()]};
const context={authority:'central',enabled:true,newer:false,hasDecision:false,integrationEnabled:true,adapterConfigured:true,keyMatches:true};
test('read filters have bounded defaults and explicit groups',()=>{
  assert.deepEqual(parseReviewListQuery(new URLSearchParams()),{group:'content',state:'IN_REVIEW',q:'',sort:'submitted_asc',limit:25});
  assert.equal(parseReviewListQuery(new URLSearchParams('group=lifecycle&action=ARCHIVE_PUBLICATION&limit=100')).limit,100);
});
test('unknown duplicate malformed and incompatible filter input is rejected',()=>{
  for(const q of ['x=1','__proto__=1','state=FAKE','sort=title','limit=0','limit=101','limit=1.1','limit=1e2','limit=01','limit=','state=all&state=IN_REVIEW','instanceId=bad','group=content&kind=change_request','group=lifecycle&kind=profile','action=HIDE_PROFILE','q=%00','cursor='])assert.throws(()=>parseReviewListQuery(new URLSearchParams(q)),q);
});
test('legacy roles have no authority; internal content cannot reject but lifecycle can',()=>{
  assert.deepEqual(reviewActionEligibility({...principal,grants:[{instanceId,active:true,role:'observer'}]},snapshot,context),[]);
  assert.deepEqual(reviewActionEligibility(principal,snapshot,context).map(x=>[x.action,x.allowed,x.requiresReason]),[['approve',true,false],['request_revision',true,true]]);
  assert.deepEqual(reviewActionEligibility(principal,{...snapshot,kind:'change_request'},context).map(x=>x.action),['approve','request_revision','reject']);
});
test('server reasons preserve authority version existing decision and configuration barriers',()=>{
  for(const [override,code] of [[{newer:true},'SNAPSHOT_SUPERSEDED'],[{hasDecision:true},'DECISION_ALREADY_RECORDED'],[{authority:'local'},'CENTRAL_REVIEW_DISABLED'],[{enabled:false},'CENTRAL_REVIEW_DISABLED'],[{integrationEnabled:false},'BANK_INTEGRATION_DISABLED'],[{adapterConfigured:false},'BANK_ADAPTER_NOT_CONFIGURED'],[{keyMatches:false},'CONTROL_KEY_ID_MISMATCH']]){
    const actions=reviewActionEligibility(principal,snapshot,{...context,...override});assert.ok(actions.every(x=>!x.allowed&&x.reasonCode===code&&x.reason));
  }
  assert.equal(reviewActionEligibility(principal,{...snapshot,contributors:['ruwang-control:'+id]},context)[0].reasonCode,'SELF_REVIEW');
  assert.equal(reviewActionEligibility(principal,{...snapshot,state:'APPROVED'},context)[0].reasonCode,'NOT_IN_REVIEW');
});
test('comparison keeps zero false null long text and JSON pointer escaping',()=>{
  const delta=compareSnapshotDetails({a:1,b:true,c:'x','a/b~':1},{a:0,b:false,c:null,'a/b~':2});
  assert.deepEqual(delta.map(d=>d.after),[0,2,false,null]);assert.equal(delta[1].path,'/a~1b~0');
  assert.deepEqual(compareSnapshotDetails({a:0,b:false},{b:false,a:0}),[]);
});
test('summary closed schema rejects an internal field while preserving explicit absence',()=>{
  const row={id:randomUUID(),instanceId,sourceId:randomUUID(),instanceName:'Bank',kind:'contact',title:'Kontak',sourceVersion:1,state:'IN_REVIEW',submittedAt:new Date().toISOString(),authority:'central',commandState:null,commandResultCode:null,action:null,category:null,actions:[],latestReceivedVersion:1};
  row.commandDecision=null;
  assert.equal(reviewSummarySchema.parse(row).commandState,null);
  assert.equal(reviewSummarySchema.safeParse({...row,bank_ack_public_key:'private-canary'}).success,false);
});
