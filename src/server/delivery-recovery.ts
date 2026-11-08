import {readFile} from 'node:fs/promises';
import type {QueryResultRow} from 'pg';
import {recoveryInputSchema,recoveryPath,processingPath,deliveryStates,processingStates,sjRecoveryBindingSchema,recoveryResponseSchema,type RecoveryInput,type RecoveryResponse,type RecoveryProvider} from '@/src/domain/delivery-recovery';
import {canonicalJson,payloadDigest,createTransportSigningMessage,signTransport,verifyTransport,transportHeaderNames as H} from '@/src/domain/control-review-contract';
import {getRuntimeConfig} from '@/src/lib/env';
import {withTransaction,type DatabaseClient} from '@/src/server/database';
import {currentActionPrincipal} from '@/src/server/review-guards';
import type {OperatorSession} from '@/src/server/auth/service';
import {ConflictError,IntegrationUnavailableError,RequestValidationError} from '@/src/server/errors';

type Instance=QueryResultRow&{id:string;adapter_base_url:string;adapter_audience:string;control_signing_key_id:string;bank_ack_key_id:string;bank_ack_public_key:string;sj_recovery_binding:unknown;provider:RecoveryProvider;institutionId?:string;installationId?:string};
type Saved=QueryResultRow&{id:string;instance_id:string;operator_id:string;provider:RecoveryProvider;job_id:string;target_digest:string;request_digest:string;request_payload:Record<string,unknown>;state:'UNKNOWN'|'RECORDED';result_json:unknown};
const target=(i:Instance)=>payloadDigest({id:i.id,url:i.adapter_base_url,audience:i.adapter_audience,key:i.control_signing_key_id,ackKey:i.bank_ack_key_id,publicKey:i.bank_ack_public_key,
  ...(i.provider==='SJ'?{provider:i.provider,institution:i.institutionId,installation:i.installationId}:{})});
async function instance(client:DatabaseClient,actor:OperatorSession,id:string,write:boolean,provider:RecoveryProvider) {
  await currentActionPrincipal(client,actor,id,write?'delivery.retry':'delivery.read');
  const {rows}=await client.query<Instance>(`SELECT id::text,adapter_base_url,adapter_audience,control_signing_key_id,bank_ack_key_id,bank_ack_public_key,sj_recovery_binding
    FROM control.instances WHERE id=$1 AND enabled=true AND review_authority='central'`,[id]);
  const row=rows[0];
  if(row&&provider==='SJ'){
    const binding=sjRecoveryBindingSchema.safeParse(row.sj_recovery_binding);
    if(!getRuntimeConfig().CONTROL_ENABLE_SJ_RECOVERY||!binding.success)throw new IntegrationUnavailableError('RECOVERY_NOT_CONFIGURED');
    const b=binding.data;Object.assign(row,{adapter_base_url:b.url,adapter_audience:b.audience,bank_ack_key_id:b.keyId,bank_ack_public_key:b.publicKey,institutionId:b.institutionId,installationId:b.installationId});
  }
  if(!row||!row.adapter_base_url||!row.adapter_audience||!row.control_signing_key_id||!row.bank_ack_key_id||!row.bank_ack_public_key)throw new IntegrationUnavailableError('RECOVERY_NOT_CONFIGURED');
  return {...row,provider};
}
async function remote(i:Instance,body:Record<string,unknown>):Promise<{result:RecoveryResponse;nonce:string}> {
  const config=getRuntimeConfig();
  const path=i.provider==='SJ'?processingPath:recoveryPath;
  if(!(i.provider==='SJ'?config.CONTROL_ENABLE_SJ_RECOVERY:config.CONTROL_ENABLE_BANK_INTEGRATION)||!config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE||config.CONTROL_BANK_SIGNING_KEY_ID!==i.control_signing_key_id)throw new IntegrationUnavailableError('RECOVERY_NOT_CONFIGURED');
  const url=new URL(i.adapter_base_url);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
    !(url.protocol==='https:'||(config.CONTROL_APP_ENV!=='production'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new IntegrationUnavailableError('RECOVERY_TARGET_INVALID');
  const key=await readFile(config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE,'utf8');
  const nonce=crypto.randomUUID(),timestamp=new Date().toISOString(),digest=payloadDigest(body);
  let response:Response;
  try {response=await fetch(new URL(path,url),{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(config.CONTROL_BANK_REQUEST_TIMEOUT_MS),
    headers:{'content-type':'application/json',accept:'application/json',[H.instanceId]:i.id,[H.keyId]:i.control_signing_key_id,
      [H.timestamp]:timestamp,[H.nonce]:nonce,[H.contentSha256]:digest,
      [H.signature]:signTransport(createTransportSigningMessage({method:'POST',path,timestamp,nonce,contentSha256:digest}),key)},body:canonicalJson(body)});
  }catch{throw new IntegrationUnavailableError('RECOVERY_RESULT_UNKNOWN');}
  if(response.status!==200||response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json') {
    await response.body?.cancel();throw new IntegrationUnavailableError('RECOVERY_RESULT_UNKNOWN');
  }
  let result:RecoveryResponse;
  const reader=response.body?.getReader();
  try {
    if(!reader)throw Error();let size=0;const chunks:Uint8Array[]=[];
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536)throw Error();chunks.push(chunk.value);}
    result=recoveryResponseSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
  }catch{throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');}
  finally{await reader?.cancel().catch(()=>{});}
  const h=(name:string)=>response.headers.get(name)??'',ackNonce=h(H.acknowledgmentNonce),ackTime=h(H.acknowledgmentTimestamp),sum=payloadDigest(result);
  if(h(H.acknowledgmentKeyId)!==i.bank_ack_key_id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ackNonce)||
    h(H.acknowledgmentContentSha256)!==sum||!Number.isFinite(Date.parse(ackTime))||Math.abs(Date.now()-Date.parse(ackTime))>300000||
    Math.abs(Date.now()-Date.parse(result.checked_at))>300000||result.instance_id!==i.id||result.operator_id!==body.operator_id||result.request_nonce!==nonce||result.request_digest!==digest||
    !verifyTransport(createTransportSigningMessage({method:'POST',path,timestamp:ackTime,nonce:ackNonce,contentSha256:sum}),h(H.acknowledgmentSignature),i.bank_ack_public_key))throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
  if(i.provider==='SJ'&&(!('institution_id' in result)||result.institution_id!==i.institutionId||result.installation_id!==i.installationId))throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
  if(i.provider==='BANK'&&'institution_id' in result)throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
  const jobs=result.value.kind==='list'?result.value.items:result.value.kind==='detail'?[result.value.item]:[];
  if(jobs.some(j=>('job_type' in j)!==(i.provider==='SJ')))throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
  const expectedKind=body.operation==='list'?'list':body.operation==='detail'?'detail':'receipt';
  if(result.value.kind!==expectedKind||result.value.kind==='detail'&&result.value.item.id!==body.job_id)throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
  if(result.value.kind==='receipt'&&result.value.result){
    const r=result.value.result;
    if(r.request_id!==body.request_id||r.request_digest!==(body.operation==='retry'?digest:body.request_digest)||
      body.operation==='retry'&&(r.job_id!==body.job_id||r.previous_revision!==body.expected_revision))throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
  }
  return {result,nonce:ackNonce};
}
async function saveNonce(client:DatabaseClient,i:Instance,nonce:string) {
  await client.query('DELETE FROM control.bank_ack_nonces WHERE expires_at<=now()');
  await client.query("INSERT INTO control.bank_ack_nonces(instance_id,key_id,nonce,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[i.id,i.bank_ack_key_id,nonce]);
}
// A failed HTTP request leaves a durable UNKNOWN record. Never fabricate FAILED,
// SCHEDULED or public success from HTTP status, queue length or a local timeout.
export async function deliveryRecovery(actor:OperatorSession,instanceId:string,input:RecoveryInput,provider:RecoveryProvider='BANK') {
  const parsed=recoveryInputSchema.safeParse(input);if(!parsed.success)throw new RequestValidationError('RECOVERY_INPUT_INVALID');input=parsed.data;
  if(input.action==='list'&&input.state&&!(provider==='SJ'?[...processingStates]:[...deliveryStates]).some(s=>s===input.state))throw new RequestValidationError('RECOVERY_INPUT_INVALID');
  const write=['retry','check_result','repeat_request'].includes(input.action);
  const loaded=await withTransaction(async client=>{
    const i=await instance(client,actor,instanceId,write,provider);
    const common={contract_version:1,instance_id:instanceId,audience:i.adapter_audience,operator_id:actor.operator.id};
    if(input.action==='list')return {i,body:{...common,operation:'list',cursor:input.cursor,state:input.state},saved:null};
    if(input.action==='detail')return {i,body:{...common,operation:'detail',job_id:input.jobId},saved:null};
    if(input.action==='check_result'||input.action==='repeat_request') {
      const {rows}=await client.query<Saved>('SELECT * FROM control.delivery_recovery_requests WHERE id=$1 AND instance_id=$2 AND operator_id=$3 AND provider=$4',[input.requestId,instanceId,actor.operator.id,provider]);
      if(!rows[0])throw new ConflictError('RECOVERY_REQUEST_NOT_RECORDED');
      return {i,body:{...common,operation:'receipt',request_id:rows[0].id,request_digest:rows[0].request_digest},saved:rows[0]};
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`control:delivery:${provider}:${instanceId}:${input.jobId}`]);
    const body={...common,operation:'retry',job_id:input.jobId,request_id:input.requestId,expected_revision:input.expectedRevision,reason:input.reason};
    const existing=await client.query<Saved>('SELECT * FROM control.delivery_recovery_requests WHERE id=$1',[input.requestId]);
    if(existing.rows[0]) {
      const old=existing.rows[0];
      if(old.provider!==provider||old.instance_id!==instanceId||old.operator_id!==actor.operator.id||old.request_digest!==payloadDigest(body))throw new ConflictError('RECOVERY_ID_CONFLICT');
      // A repeated click first reads the receipt; this branch never resends.
      return {i,body:{...common,operation:'receipt',request_id:old.id,request_digest:old.request_digest},saved:old};
    }
    const pending=await client.query("SELECT id FROM control.delivery_recovery_requests WHERE instance_id=$1 AND job_id=$2 AND provider=$3 AND state='UNKNOWN' LIMIT 1",[instanceId,input.jobId,provider]);
    if(pending.rowCount)throw new ConflictError('RECOVERY_RESULT_PENDING');
    const eligibility=await remote(i,{...common,operation:'detail',job_id:input.jobId});
    await saveNonce(client,i,eligibility.nonce);
    if(eligibility.result.value.kind!=='detail'||!eligibility.result.value.item.retry.allowed||eligibility.result.value.item.revision!==input.expectedRevision) {
      throw new ConflictError('RECOVERY_JOB_CHANGED');
    }
    const inserted=await client.query<Saved>(`INSERT INTO control.delivery_recovery_requests(id,instance_id,operator_id,job_id,target_digest,request_digest,request_payload,provider)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,[input.requestId,instanceId,actor.operator.id,input.jobId,target(i),payloadDigest(body),JSON.stringify(body),provider]);
    return {i,body,saved:inserted.rows[0]!};
  });
  // Hold the current grant/session and registry authority through dispatch. A
  // grant revoked before dispatch is rejected; no browser capability is trusted.
  return withTransaction(async client=>{
    const current=await instance(client,actor,instanceId,write,provider);
    if(target(current)!==target(loaded.i)||loaded.saved&&loaded.saved.target_digest!==target(current))throw new ConflictError('RECOVERY_TARGET_CHANGED');
    if(loaded.saved&&payloadDigest(loaded.saved.request_payload)!==loaded.saved.request_digest)throw new ConflictError('RECOVERY_STORED_INVALID');
    let {result,nonce}=await remote(current,loaded.body);await saveNonce(client,current,nonce);
    if(input.action==='repeat_request'&&loaded.saved&&result.value.kind==='receipt'&&result.value.state==='NOT_RECORDED') {
      // Explicit recovery after a valid ledger read: replay EXACTLY the stored
      // idempotent request, never invent a new ID/version after a timeout.
      ({result,nonce}=await remote(current,loaded.saved.request_payload));await saveNonce(client,current,nonce);
    }
    if(loaded.saved&&result.value.kind==='receipt'&&result.value.result) {
      const r=result.value.result;
      if(r.job_id!==loaded.saved.job_id||r.previous_revision!==loaded.saved.request_payload.expected_revision)throw new IntegrationUnavailableError('RECOVERY_RESPONSE_INVALID');
      await client.query("UPDATE control.delivery_recovery_requests SET state='RECORDED',result_json=$2::jsonb,updated_at=now() WHERE id=$1",[loaded.saved.id,JSON.stringify(r)]);
    }
    const ids=result.value.kind==='list'?result.value.items.map(j=>j.id):result.value.kind==='detail'?[result.value.item.id]:[];
    const requests=ids.length?(await client.query(`SELECT id::text,job_id::text,state,created_at,result_json FROM control.delivery_recovery_requests
      WHERE instance_id=$1 AND operator_id=$2 AND job_id=ANY($3::uuid[]) AND provider=$4 ORDER BY (state='UNKNOWN') DESC,created_at DESC,id DESC LIMIT 25`,[instanceId,actor.operator.id,ids,provider])).rows:[];
    return {value:result.value,checkedAt:result.checked_at,requests};
  });
}
