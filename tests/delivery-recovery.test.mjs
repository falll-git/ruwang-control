import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {recoveryInputSchema,recoveryResponseSchema,recoveryViewSchema,deliveryLabels,deliverySubject,recoveryBlockLabel,processingJobSchema,sjRecoveryBindingSchema} from '../src/domain/delivery-recovery.ts';
const time=()=>new Date().toISOString(),hash='a'.repeat(64);
const job=()=>({id:id(),event_id:id(),aggregate_type:'PUBLICATION',aggregate_id:id(),aggregate_version:0,event_type:'UPSERT_PUBLICATION',
  state:'FAILED',attempt_count:0,available_at:time(),created_at:time(),acknowledged_at:null,revision:hash,retry:{allowed:true,reason:null}});
const response=value=>({contract_version:1,instance_id:id(),operator_id:id(),request_nonce:id(),request_digest:hash,checked_at:time(),value});
test('recovery input allows only explicit scoped actions, not operator/audience overrides',()=>{
  const inputs=[{action:'list',cursor:null,state:null},{action:'detail',jobId:id()},
    {action:'retry',jobId:id(),requestId:id(),expectedRevision:hash,reason:'Koneksi sudah diperiksa'},
    {action:'check_result',requestId:id()},{action:'repeat_request',requestId:id()}];
  for(const input of inputs){assert.equal(recoveryInputSchema.safeParse(input).success,true);assert.equal(recoveryInputSchema.safeParse({...input,operator_id:id()}).success,false);}
  assert.equal(recoveryInputSchema.safeParse({...inputs[2],reason:' '}).success,false);
  assert.equal(recoveryInputSchema.safeParse({...inputs[2],expectedRevision:'old'}).success,false);
});
test('allowlisted job metadata preserves zero without global totals or private payload',()=>{
  const value=response({kind:'list',items:[job()],next_cursor:null,scope:'BOUND_INSTALLATION',total:null});
  const parsed=recoveryResponseSchema.parse(value);assert.equal(parsed.value.items[0].aggregate_version,0);assert.equal(parsed.value.items[0].attempt_count,0);
  assert.equal(recoveryResponseSchema.safeParse({...value,value:{...value.value,total:10}}).success,false);
  assert.equal(recoveryResponseSchema.safeParse({...value,value:{...value.value,items:[{...value.value.items[0],payload_json:{}}]}}).success,false);
  assert.equal(recoveryResponseSchema.safeParse({...value,value:{...value.value,items:[{...job(),retry:{allowed:true,reason:'BLOCKED'}}]}}).success,false);
});
test('receipt absence stays unknown and scheduling is never reported as completion',()=>{
  assert.equal(recoveryResponseSchema.safeParse(response({kind:'receipt',state:'NOT_RECORDED',result:null})).success,true);
  assert.equal(recoveryResponseSchema.safeParse(response({kind:'receipt',state:'RECORDED',result:null})).success,false);
  const result={request_id:id(),request_digest:hash,job_id:id(),state:'SCHEDULED',scheduled_at:time(),previous_revision:hash};
  assert.equal(recoveryResponseSchema.safeParse(response({kind:'receipt',state:'RECORDED',result})).success,true);
  assert.equal(recoveryResponseSchema.safeParse(response({kind:'receipt',state:'RECORDED',result:{...result,state:'SUCCESS'}})).success,false);
});

test('UI metadata does not turn received delivery or zero version into public success',()=>{
  assert.equal(deliverySubject({aggregate_type:'PUBLICATION',aggregate_version:0}),'Publikasi · versi 0');
  assert.equal(deliverySubject({aggregate_type:'BPRS_PROFILE',aggregate_version:1}),'Profil BPRS · versi 1');
  assert.equal(deliveryLabels.ACKNOWLEDGED,'Diterima tujuan');
  assert.notEqual(deliveryLabels.FAILED,deliveryLabels.QUARANTINED);
  assert.match(recoveryBlockLabel('OUTBOX_TARGET_CHANGED'),/Jangan kirim ulang/);
  assert.match(recoveryBlockLabel('UNRECOGNIZED'),/belum memenuhi syarat/);
  assert.equal(recoveryBlockLabel(null),null);
});

test('SJ processing metadata has no fabricated aggregate version, delivery ACK or public status',()=>{
  const item={id:id(),job_type:'PROCESS_MEDIA',state:'DEAD_LETTER',attempt_count:0,available_at:time(),created_at:time(),revision:hash,retry:{allowed:true,reason:null}};
  assert.equal(processingJobSchema.safeParse(item).success,true);assert.equal(deliverySubject(item),'Pemrosesan media');
  assert.equal(processingJobSchema.safeParse({...item,state:'ACKNOWLEDGED'}).success,false);
  assert.equal(processingJobSchema.safeParse({...item,aggregate_version:1}).success,false);
  assert.equal(recoveryResponseSchema.safeParse({...response({kind:'detail',item}),institution_id:id(),installation_id:id()}).success,true);
  assert.equal(deliveryLabels.COMPLETED,'Pemrosesan selesai');
});
test('SJ recovery binding needs explicit institution and installation, not monitoring fallback',()=>{
  const b={url:'https://sj.example.invalid',audience:'sj-recovery',institutionId:id(),installationId:id(),keyId:'sj-jobs',publicKey:'public key'};
  assert.equal(sjRecoveryBindingSchema.safeParse(b).success,true);
  for(const name of Object.keys(b))assert.equal(sjRecoveryBindingSchema.safeParse({...b,[name]:undefined}).success,false);
  assert.equal(sjRecoveryBindingSchema.safeParse({...b,admin:true}).success,false);
});
test('Control recovery view rejects partial data and leaking request payloads',()=>{
  const value={value:{kind:'detail',item:job()},checkedAt:time(),requests:[]};
  assert.equal(recoveryViewSchema.safeParse(value).success,true);
  assert.equal(recoveryViewSchema.safeParse({...value,checkedAt:null}).success,false);
  assert.equal(recoveryViewSchema.safeParse({...value,requests:[{id:id(),job_id:id(),state:'UNKNOWN',created_at:time(),result_json:null,request_payload:{}}]}).success,false);
  assert.equal(recoveryViewSchema.safeParse({...value,value:{kind:'detail',item:{}}}).success,false);
});
