import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {canonicalJson,payloadDigest,sha256Hex,createTransportSigningMessage,signTransport,verifyTransport,transportHeaderNames as H,reviewCommandSchema,reviewAcknowledgmentSchema} from '../../src/domain/control-review-contract.ts';
import {reviewSnapshotEnvelopeSchema} from '../../src/domain/review-snapshot.ts';
import {recoveryResponseSchema} from '../../src/domain/delivery-recovery.ts';

export function keys(){const pair=generateKeyPairSync('ed25519');return{privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:pair.publicKey.export({type:'spki',format:'pem'})};}
export function fixtures(instanceId){
  const media={source_media_id:randomUUID(),central_media_id:randomUUID(),state:'READY',detected_mime:'image/png',width:1,height:1,is_cover:true,position:1,alt_text:'Foto fixture terisolasi'};
  const profile={kind:'profile',public_name:'BPRS Uji Terisolasi',public_slug:'bprs-uji-'+instanceId,short_description:'Data khusus pengujian Control',city_regency:'Bandung',province:'Jawa Barat',website_url:null,logo:media};
  const contact={kind:'contact',label:'Kontak uji',phone_e164:'+6280000000000',message_template_version:1};
  const publication=(category,index)=>({kind:'publication',reference_code:`SJ-TEST000${index}`,category,subcategory:'FIXTURE',title:`Aset uji ${category}`,description:'Fixture kontrak, bukan data runtime',city_regency:'Bandung',province:'Jawa Barat',availability:'AVAILABLE',attributes:{nilai_nol:0},media:[media],contact:{label:contact.label,phone_e164:contact.phone_e164},profile:{public_name:profile.public_name,public_slug:profile.public_slug}});
  const actions=[['UNPUBLISH_PUBLICATION','PUBLICATION'],['ARCHIVE_PUBLICATION','PUBLICATION'],['HIDE_PROFILE','PROFILE'],['REVOKE_CONTACT','CONTACT'],['REVOKE_MEDIA','MEDIA'],['RECONFIRM_PUBLICATION','PUBLICATION']];
  const details=[profile,contact,...['LAND','BUILDING','MACHINE_EQUIPMENT','VEHICLE'].map(publication),...actions.map(([action,target_kind])=>({kind:'change_request',action,target_kind,target_id:randomUUID(),target_label:`Permintaan ${action}`,current_state:target_kind==='PUBLICATION'?'PUBLISHED':'VERIFIED',reason:'Pengujian lifecycle terisolasi',expected_public_visibility:['CONTACT','MEDIA'].includes(target_kind)?'not_applicable':action==='RECONFIRM_PUBLICATION'?'visible':'not_visible',blockers:[],affected_publications:0,affected_media:0,central_synced:true,reference_code:target_kind==='PUBLICATION'?'SJ-TEST0000':null,public_slug:profile.public_slug,media:[]}))];
  return details.map(detail=>makeSnapshot(instanceId,detail));
}
export function makeSnapshot(instanceId,detail){return reviewSnapshotEnvelopeSchema.parse({contract_version:1,snapshot_id:randomUUID(),instance_id:instanceId,resource:{kind:detail.kind,id:randomUUID()},source_version:1,payload_checksum:payloadDigest(detail),state:'IN_REVIEW',contributor_subjects:[`ruwang-bank:${randomUUID()}`],submitted_at:new Date().toISOString(),detail});}

export function signedSnapshot(snapshot,bankKey,origin){
  const path='/api/internal/sj-review/snapshots', timestamp=new Date().toISOString(),nonce=randomUUID(),digest=payloadDigest(snapshot);
  return new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',[H.instanceId]:snapshot.instance_id,[H.acknowledgmentKeyId]:'test-bank',[H.acknowledgmentTimestamp]:timestamp,[H.acknowledgmentNonce]:nonce,[H.acknowledgmentContentSha256]:digest,[H.acknowledgmentSignature]:signTransport(createTransportSigningMessage({method:'POST',path,timestamp,nonce,contentSha256:digest}),bankKey)},body:canonicalJson(snapshot)});
}

// Explicit test double: validates transport/schema and models an idempotent ACK ledger.
// It does NOT execute bank domain rules, scanners, queues or the real SJ projection.
export async function startContractDouble({bankKey,controlPublicKey,instanceId}){
  const snapshots=new Map(), ledger=new Map();
  const recoveryJobs=Array.from({length:28},(_,i)=>{const id=randomUUID(),state=['FAILED','QUARANTINED','QUEUED','SENDING','ACKNOWLEDGED','RETRYING'][i%6];return {id,event_id:randomUUID(),aggregate_type:i%3===0?'PUBLICATION':i%3===1?'PROFILE':'CONTACT',aggregate_id:randomUUID(),aggregate_version:i, event_type:'UPSERT_PUBLICATION',state,attempt_count:i%4,available_at:new Date().toISOString(),created_at:new Date().toISOString(),acknowledged_at:state==='ACKNOWLEDGED'?new Date().toISOString():null,revision:payloadDigest({id,state}),retry:{allowed:['FAILED','QUARANTINED','RETRYING'].includes(state),reason:['FAILED','QUARANTINED','RETRYING'].includes(state)?null:'JOB_NOT_RETRYABLE'}};}).sort((a,b)=>a.id.localeCompare(b.id));
  const recoveryReceipts=new Map();let recoveryEffects=0;
  const processingInstitutionId=randomUUID(),processingInstallationId=randomUUID();
  const processingJobs=Array.from({length:28},(_,i)=>{const id=randomUUID(),state=['DEAD_LETTER','PENDING','PROCESSING','RETRY_WAIT','COMPLETED'][i%5];return{id,job_type:['PROCESS_MEDIA','REBUILD_PUBLICATION_PROJECTION','RECONCILE_MANIFEST'][i%3],state,attempt_count:i%6,available_at:new Date().toISOString(),created_at:new Date().toISOString(),revision:payloadDigest({id,state}),retry:{allowed:state==='DEAD_LETTER',reason:state==='DEAD_LETTER'?null:'JOB_NOT_RETRYABLE'}};}).sort((a,b)=>a.id.localeCompare(b.id));
  let mode='normal',origin,requests=0,effects=0;
  const held=[];
  const allowedModes=new Set(['normal','empty','bad-signature','disconnect','timeout','reject','apply-disconnect','hold-ack','wrong-version','wrong-checksum','oversize','wrong-identity','http-error','monitor-hold','monitor-degraded','monitor-old','recovery-empty','recovery-target-changed','recovery-hold']);
  const png=await (await import('sharp')).default({create:{width:1,height:1,channels:4,background:'#CBD6BFFF'}}).png().toBuffer();
  function signed(res,body,path,mime='application/json'){
    const digest=sha256Hex(body),timestamp=new Date().toISOString(),nonce=randomUUID();
    const signature=signTransport(createTransportSigningMessage({method:path.includes('/media/')||path.includes('/sj-monitoring/')?'GET':'POST',path,timestamp,nonce,contentSha256:digest}),bankKey);
    res.writeHead(200,{'content-type':mime,[H.acknowledgmentKeyId]:'test-bank',[H.acknowledgmentTimestamp]:timestamp,[H.acknowledgmentNonce]:nonce,[H.acknowledgmentContentSha256]:digest,[H.acknowledgmentSignature]:mode==='bad-signature'?'invalid':signature});res.end(body);
  }
  const seenNonces=new Set();
  const server=createServer(async(req,res)=>{
    requests++;
    try{
      const path=new URL(req.url,origin).pathname;
      let body='';for await(const chunk of req){body+=chunk;if(body.length>65536)throw Error('LIMIT');}
      const nonce=req.headers[H.nonce],timestamp=req.headers[H.timestamp],digest=sha256Hex(body);
      assert.equal(req.headers[H.instanceId],instanceId);assert.equal(req.headers[H.keyId],'test-control');
      assert.equal(req.headers[H.contentSha256],digest);assert.ok(Math.abs(Date.now()-Date.parse(timestamp))<300000);
      assert.ok(!seenNonces.has(nonce));
      assert.ok(verifyTransport(createTransportSigningMessage({method:req.method,path,timestamp,nonce,contentSha256:digest}),req.headers[H.signature],controlPublicKey));seenNonces.add(nonce);
      if(path==='/api/v1/internal/ruwang-control/sj-monitoring/snapshot'){
        assert.equal(req.method,'GET');assert.equal(req.headers['x-rc-audience'],instanceId);
        if(mode==='timeout')return;
        if(mode==='empty'){res.writeHead(200,{'content-type':'application/json'});return res.end('{}');}
        const snapshot={contract_version:1,instance_id:instanceId,source_kind:'ruwang',observed_at:new Date(Date.now()-(mode==='monitor-old'?60000:0)).toISOString(),services:[{key:'api',status:mode==='monitor-degraded'?'degraded':'healthy'}],queues:[]};
        if(mode==='monitor-hold'){held.push(()=>signed(res,canonicalJson(snapshot),path));return;}
        return signed(res,canonicalJson(snapshot),path);
      }
      if(path.includes('/media/')) return signed(res,png,path,'image/png');
      if(path==='/api/v1/internal/ruwang-control/sj-review/recovery'||path==='/v1/internal/ruwang-control/sj-jobs/recovery'){
        const processing=path==='/v1/internal/ruwang-control/sj-jobs/recovery',sourceJobs=processing?processingJobs:recoveryJobs;
        assert.equal(req.method,'POST');const input=JSON.parse(body);assert.equal(input.instance_id,instanceId);assert.equal(input.audience,instanceId);
        if(mode==='timeout')return;
        if(mode==='http-error'){res.writeHead(503);return res.end('{}');}
        if(mode==='empty'){res.writeHead(200,{'content-type':'application/json'});return res.end('{}');}
        let value;
        if(input.operation==='list'){
          const jobs=mode==='recovery-empty'?[]:sourceJobs.filter(j=>(!input.cursor||j.id>input.cursor)&&(!input.state||j.state===input.state));
          value={kind:'list',items:jobs.slice(0,25),next_cursor:jobs.length>25?jobs[24].id:null,scope:'BOUND_INSTALLATION',total:null};
        }else if(input.operation==='detail'){
          const item=sourceJobs.find(j=>j.id===input.job_id);assert.ok(item);
          value={kind:'detail',item:mode==='recovery-target-changed'?{...item,retry:{allowed:false,reason:'OUTBOX_TARGET_CHANGED'}}:item};
        }else if(input.operation==='receipt'){
          const stored=recoveryReceipts.get(input.request_id);if(stored)assert.equal(stored.request_digest,input.request_digest);
          value={kind:'receipt',state:stored?'RECORDED':'NOT_RECORDED',result:stored??null};
        }else{
          assert.equal(input.operation,'retry');let stored=recoveryReceipts.get(input.request_id);
          if(stored)assert.equal(stored.request_digest,digest);
          else{
            const item=sourceJobs.find(j=>j.id===input.job_id);assert.ok(item?.retry.allowed);assert.equal(item.revision,input.expected_revision);
            if(mode==='disconnect'){req.socket.destroy();return;}
            stored={request_id:input.request_id,request_digest:digest,job_id:item.id,state:'SCHEDULED',scheduled_at:new Date().toISOString(),previous_revision:item.revision};
            recoveryReceipts.set(input.request_id,stored);recoveryEffects++;item.state=processing?'PENDING':'QUEUED';item.retry={allowed:false,reason:'JOB_NOT_RETRYABLE'};item.revision=payloadDigest({id:item.id,state:item.state});
          }
          if(mode==='apply-disconnect'){req.socket.destroy();return;}
          value={kind:'receipt',state:'RECORDED',result:stored};
        }
        const result=recoveryResponseSchema.parse({contract_version:1,instance_id:instanceId,...(processing?{institution_id:processingInstitutionId,installation_id:processingInstallationId}:{}),operator_id:input.operator_id,request_nonce:nonce,request_digest:digest,checked_at:new Date().toISOString(),value});
        if(mode==='recovery-hold'){held.push(()=>signed(res,canonicalJson(result),path));return;}
        return signed(res,canonicalJson(result),path);
      }
      if(path==='/api/v1/internal/ruwang-control/sj-review/command-results'){
        assert.equal(req.method,'POST');const lookup=JSON.parse(body);
        assert.equal(lookup.instance_id,instanceId);assert.equal(lookup.audience,instanceId);
        if(mode==='timeout')return;
        if(mode==='empty'){res.writeHead(200,{'content-type':'application/json'});return res.end('{}');}
        if(mode==='http-error'){res.writeHead(503);return res.end('{}');}
        const ack=ledger.get(lookup.command_id)??null;
        if(ack){assert.equal(ack.command_digest,lookup.command_digest);assert.deepEqual(ack.resource,lookup.resource);}
        return signed(res,canonicalJson({contract_version:1,instance_id:instanceId,command_id:lookup.command_id,
          command_digest:lookup.command_digest,resource:lookup.resource,request_nonce:nonce,checked_at:new Date().toISOString(),
          state:ack?'RECORDED':'NOT_RECORDED',acknowledgment:ack}),path);
      }
      assert.equal(path,'/api/v1/internal/ruwang-control/sj-review/commands');
      const command=reviewCommandSchema.parse(JSON.parse(body)), snapshot=snapshots.get(command.resource.id);
      assert.equal(command.instance_id,instanceId);assert.equal(command.audience,instanceId);assert.ok(snapshot);
      assert.ok(Date.parse(command.expires_at)>Date.now());
      if(mode==='empty'){res.writeHead(200,{'content-type':'application/json'});return res.end('{}');}
      if(mode==='oversize'){res.writeHead(200);return res.end('x'.repeat(70000));}
      if(mode==='http-error'){res.writeHead(503);return res.end('{}');}
      if(mode==='disconnect')return req.socket.destroy();
      if(mode==='timeout')return; // No timer; closed with owned server after client abort.
      let ack=ledger.get(command.command_id);
      if(ack)assert.equal(ack.command_digest,payloadDigest(command));
      else{
        const accepted=mode!=='reject'&&command.expected_version===snapshot.source_version&&command.expected_checksum===snapshot.payload_checksum;
        const observedChecksum=accepted&&command.resource.kind==='publication'&&command.decision==='approve'
          ? payloadDigest({submitted_checksum:snapshot.payload_checksum,published_at:new Date().toISOString()})
          : snapshot.payload_checksum;
        ack=reviewAcknowledgmentSchema.parse({contract_version:1,acknowledgment_id:randomUUID(),command_id:command.command_id,command_digest:payloadDigest(command),instance_id:instanceId,resource:command.resource,status:accepted?'APPLIED':'REJECTED',result_code:accepted?'DECISION_APPLIED':'VERSION_CONFLICT',observed_version:accepted&&command.resource.kind!=='change_request'?snapshot.source_version+1:snapshot.source_version,observed_checksum:observedChecksum,processed_at:new Date().toISOString()});
        ledger.set(command.command_id,ack);
        if(accepted)effects++;
      }
      if(mode==='apply-disconnect')return req.socket.destroy();
      if(mode==='wrong-version')return signed(res,canonicalJson({...ack,observed_version:0}),path);
      if(mode==='wrong-identity')return signed(res,canonicalJson({...ack,instance_id:randomUUID()}),path);
      if(mode==='wrong-checksum')return signed(res,canonicalJson({...ack,observed_checksum:'f'.repeat(64)}),path);
      if(mode==='hold-ack'){held.push(()=>signed(res,canonicalJson(ack),path));return;}
      signed(res,canonicalJson(ack),path);
    }catch{res.writeHead(400,{'content-type':'application/json'});res.end('{"code":"TEST_DOUBLE_REJECTED"}');}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
  return{origin,recoveryItems:recoveryJobs,processingItems:processingJobs,processingInstitutionId,processingInstallationId,add(snapshot){snapshots.set(snapshot.resource.id,snapshot);},fault(value){assert.ok(allowedModes.has(value));mode=value;},release(){for(const send of held.splice(0))send();},stats:()=>({requests,effects,ledger:ledger.size,held:held.length,recoveryEffects}),async close(){held.splice(0);server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}};
}
