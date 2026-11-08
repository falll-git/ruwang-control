// Only Control source is executed; bank/SJ are contract doubles, not cross-app E2E.
import '../tests/support/control-service-loader.mjs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createDisposable,inspectOwned,guardDatabaseTarget,connectOwned,migrateOwned,runtimeEnvironment,publicProof,writeOwnedSecret,cleanupDisposable,cleanInfrastructureEnvironment,recoverDisposable} from '../tests/support/control-disposable.mjs';
import {fixtures,keys,signedSnapshot,makeSnapshot,startContractDouble} from '../tests/support/control-fixtures.mjs';

const infrastructureEnv=cleanInfrastructureEnvironment(process.env); // Before ANY setup; no .env loading.
const apiChecks=process.argv.includes('--review-api');
const dispatchChecks=process.argv.includes('--dispatch');
const evidenceChecks=process.argv.includes('--evidence');
const readChecks=process.argv.includes('--read-contract');
const upgradeBaseline=process.argv.includes('--upgrade-baseline-7')?7:12;
const report={stage:readChecks?'RC-SJ-06':evidenceChecks?'RC-SJ-05':dispatchChecks?'RC-SJ-04':apiChecks?'RC-SJ-03':'RC-SJ-02',kind:'Control real services + disposable PostgreSQL + bank/SJ contract doubles',status:'running',checks:[],cleanup:[],proofs:[]};
let run,canary,double,client,config,env,originalFetch=globalThis.fetch;
function save(){if(run)writeFileSync(join(run.root,'report.json'),JSON.stringify(report,null,2));}
async function check(name,work){await work();report.checks.push({name,pass:true});save();console.log(JSON.stringify({check:name,pass:true}));}
try{
  run=await createDisposable();report.proofs.push(publicProof(run));save();
  console.log(JSON.stringify({runId:run.runId,evidence:run.root,status:'starting'}));
  canary=await createDisposable();report.proofs.push(publicProof(canary));save();
  await check('recovery rejects live owner and reclaims only an exited owned probe',async()=>{
    await assert.rejects(recoverDisposable(run.root,infrastructureEnv),/RUN_STILL_ACTIVE/);
    const probePath=fileURLToPath(new URL('../tests/support/control-interruption-probe.mjs',import.meta.url));
    const probe=JSON.parse(execFileSync(process.execPath,[probePath,'--owned-recovery-test'],{env:infrastructureEnv,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:90_000}));
    const recovered=await recoverDisposable(probe.root,infrastructureEnv);assert.equal(recovered.removed,true);assert.equal(recovered.secretsRemoved,1);report.cleanup.push({...recovered,kind:'interruption-probe'});
    inspectOwned(run);inspectOwned(canary);
  });
  await check('foreign run cleanup rejected before deletion',async()=>{
    await assert.rejects(cleanupDisposable(run,publicProof(canary).containerId),/FOREIGN_RESOURCE_REJECTED/);
    inspectOwned(canary);
  });
  await check('operational and other-run DB URLs rejected before connection/mutation',async()=>{
    for(const url of ['postgresql://local:sentinel@127.0.0.1:55432/ruwang_control',runtimeEnvironment(canary).CONTROL_DATABASE_URL])assert.throws(()=>guardDatabaseTarget(run,url),/DATABASE_TARGET_REJECTED/);
  });
  await check('fresh migrations with non-superuser migrator',async()=>{
    assert.equal((await migrateOwned(run)).length,16);
    execFileSync(process.execPath,[fileURLToPath(new URL('./verify-database.mjs',import.meta.url))],{cwd:run.root,env:runtimeEnvironment(run),windowsHide:true,stdio:'pipe',timeout:30_000});
  });
  await check(`upgrade baseline 0001-${String(upgradeBaseline).padStart(4,'0')} to 0016 preserves accounts credentials audit and registry while revoking old access`,async()=>{
    await migrateOwned(canary,upgradeBaseline);
    const operatorId=randomUUID(),instance=randomUUID(),sessionId=randomUUID(),auditId=randomUUID();
    const c=await connectOwned(canary,'migration');
    try{
      assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='control' AND table_name='instances' AND column_name='sj_recovery_binding'")).rows[0].n,upgradeBaseline>=13?1:0);
      // Legacy authentication fixtures only; never fabricate a positive business transition.
      await c.query("INSERT INTO control.instances(id,instance_key,display_name) VALUES($1,'upgrade-sentinel','Upgrade sentinel')",[instance]);
      await c.query("INSERT INTO control.operators(id,username_canonical,display_name) VALUES($1,'legacy-operator','Legacy operator')",[operatorId]);
      await c.query("INSERT INTO control.operator_password_credentials(operator_id,password_hash) VALUES($1,'opaque-upgrade-sentinel')",[operatorId]);
      await c.query("INSERT INTO control.operator_grants(operator_id,instance_id,role,created_by_operator_id) VALUES($1,$2,'observer',$1)",[operatorId,instance]);
      await c.query("INSERT INTO control.operator_sessions(id,operator_id,token_hash,authenticated_at,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,now(),now()+interval '30 minutes',now()+interval '1 hour')",[sessionId,operatorId,'a'.repeat(64)]);
      await c.query("INSERT INTO control.security_audit_events(id,request_id,target_operator_id,action,outcome,reason_code) VALUES($1,'legacy_upgrade',$2,'operator.create','succeeded','LEGACY_SENTINEL')",[auditId,operatorId]);
    }finally{await c.end();}
    await migrateOwned(canary,15);
    const historicalOwner=await connectOwned(canary,'migration');
    let historical;
    try{
      await historicalOwner.query("INSERT INTO control.verified_subject_bindings(instance_id,subject,human_id,version,state,verified_by,evidence_reference) VALUES($1,'test:retired-audit',$2,1,'VERIFIED',$3,'disposable/historical-audit')",[instance,randomUUID(),operatorId]);
      await historicalOwner.query("INSERT INTO control.public_observation_attempts(instance_id,context_digest) VALUES($1,$2)",[instance,'b'.repeat(64)]);
      historical={bindings:(await historicalOwner.query('SELECT * FROM control.verified_subject_bindings')).rows,versions:(await historicalOwner.query('SELECT * FROM control.subject_binding_versions')).rows,attempts:(await historicalOwner.query('SELECT * FROM control.public_observation_attempts')).rows};
    }finally{await historicalOwner.end();}
    await migrateOwned(canary);
    const archiveOwner=await connectOwned(canary,'migration');
    try{
      assert.deepEqual((await archiveOwner.query('SELECT * FROM control_audit_archive.verified_subject_bindings')).rows,historical.bindings);
      assert.deepEqual((await archiveOwner.query('SELECT * FROM control_audit_archive.subject_binding_versions')).rows,historical.versions);
      assert.deepEqual((await archiveOwner.query('SELECT * FROM control_audit_archive.public_observation_attempts')).rows,historical.attempts);
    }finally{await archiveOwner.end();}
    const upgraded=await connectOwned(canary),fresh=await connectOwned(run);
    try{
      assert.equal((await upgraded.query("SELECT count(*)::int AS n FROM control.instances WHERE instance_key='upgrade-sentinel'")).rows[0].n,1);
      assert.equal((await upgraded.query("SELECT access_role FROM control.operators WHERE id=$1",[operatorId])).rows[0].access_role,'internal_operator');
      assert.equal((await upgraded.query("SELECT password_hash FROM control.operator_password_credentials WHERE operator_id=$1",[operatorId])).rows[0].password_hash,'opaque-upgrade-sentinel');
      const legacy=(await upgraded.query("SELECT role,active,revoked_at FROM control.operator_grants WHERE operator_id=$1",[operatorId])).rows[0];
      assert.equal(legacy.role,'observer');assert.equal(legacy.active,false);assert.ok(legacy.revoked_at);
      assert.equal((await upgraded.query("SELECT revoked_reason FROM control.operator_sessions WHERE id=$1",[sessionId])).rows[0].revoked_reason,'SINGLE_ROLE_MIGRATION');
      assert.equal((await upgraded.query("SELECT count(*)::int n FROM control.security_audit_events WHERE id=$1",[auditId])).rows[0].n,1);
      assert.equal((await upgraded.query("SELECT count(*)::int n FROM control.security_audit_events WHERE target_operator_id=$1 AND action='operator.role_migration'",[operatorId])).rows[0].n,1);
      assert.equal((await upgraded.query("SELECT sj_recovery_binding FROM control.instances WHERE instance_key='upgrade-sentinel'")).rows[0].sj_recovery_binding,null);
      const query="SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='control' ORDER BY table_name,column_name";
      assert.deepEqual((await upgraded.query(query)).rows,(await fresh.query(query)).rows);
      assert.deepEqual((await upgraded.query('SELECT name,checksum FROM control.schema_migrations ORDER BY name')).rows,(await fresh.query('SELECT name,checksum FROM control.schema_migrations ORDER BY name')).rows);
      for(const db of [upgraded,fresh])assert.ok((await db.query("SELECT to_regprocedure('control.lock_review_authority(uuid,uuid)') AS lock")).rows[0].lock);
    }finally{await upgraded.end();await fresh.end();}
    const owner=await connectOwned(canary,'migration');
    try{
      await assert.rejects(owner.query("UPDATE control.operator_grants SET active=true,revoked_at=NULL WHERE operator_id=$1",[operatorId]),e=>e.code==='23514');
    }finally{await owner.end();}
  });
  await check('runtime role restricted and ownership marker immutable',async()=>{
    client=await connectOwned(run);
    await assert.rejects(client.query('CREATE TABLE public.denied(id int)'),e=>e.code==='42501');
    await assert.rejects(client.query("UPDATE rc_test_owner.proof SET run_id='forged'"),e=>e.code==='42501');
    await assert.rejects(client.query('DELETE FROM control.audit_events'),e=>e.code==='42501');
    await assert.rejects(client.query('UPDATE control.instances SET enabled = false'),e=>e.code==='42501');
    await assert.rejects(client.query("UPDATE control.operators SET status = 'disabled'"),e=>e.code==='42501');
  });
  const bankKey=keys(),controlKey=keys(),instanceId=randomUUID(),otherInstanceId=randomUUID();
  double=await startContractDouble({bankKey:bankKey.privateKey,controlPublicKey:controlKey.publicKey,instanceId});
  env={...runtimeEnvironment(run),CONTROL_ENABLE_BANK_INTEGRATION:'true',CONTROL_BANK_SIGNING_KEY_ID:'test-control',CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE:writeOwnedSecret(run,controlKey.privateKey),CONTROL_BANK_REQUEST_TIMEOUT_MS:'300'};
  if(dispatchChecks)Object.assign(env,{CONTROL_ENABLE_SJ_MONITORING:'true',CONTROL_MONITORING_SIGNING_KEY_ID:'test-control',CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE:env.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE,CONTROL_MONITORING_REQUEST_TIMEOUT_MS:'300'});
  // No inherited operational settings in the service process; no dotenv.
  for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
  globalThis.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(url.origin!==double.origin)throw Error('TEST_EGRESS_REJECTED');
    return originalFetch(input,options);
  };
  const {getRuntimeConfig}=await import('../src/lib/env.ts');config=getRuntimeConfig();
  const {bootstrapFirstOperator}=await import('../src/server/auth/bootstrap.ts');
  const auth=await import('../src/server/auth/service.ts');
  const {acceptReviewSnapshot}=await import('../src/server/review-snapshot-ingress.ts');
  const {enqueueReviewDecision,dispatchReviewCommand,getReviewCommand}=await import('../src/server/review-adapter.ts');
  const {listPendingReviews,getReviewDetail,getReviewMedia}=await import('../src/server/reviews.ts');
  const password='Test-'+randomBytes(24).toString('hex')+'!';
  const owner=await connectOwned(run,'migration');
  try{
    await bootstrapFirstOperator(owner,{username:'bootstrap',displayName:'Test bootstrap',password,instanceKeys:[],encryptionKey:config.CONTROL_AUTH_ENCRYPTION_KEY});
    await check('internal account creation works before registry setup without wildcard permission',async()=>{
      const initial=(await auth.loginOperator({username:'bootstrap',password},{requestId:randomUUID(),ipHash:null,userAgentHash:null},config)).session;
      assert.deepEqual(initial.principal.grants,[]);
      await auth.createOperator({actor:initial,username:'before-registry',displayName:'Before registry',password,requestId:randomUUID()});
      assert.equal((await auth.listManagedOperators(initial)).operators.length,2);
      await assert.rejects(auth.requireInstancePermission(initial,'review.approve',randomUUID(),randomUUID()));
    });
    // Registry/key provisioning only, not business status manipulation. No registry API exists.
    await owner.query(`INSERT INTO control.instances(id,instance_key,display_name,review_authority,enabled,adapter_base_url,adapter_audience,control_signing_key_id,bank_ack_key_id,bank_ack_public_key)
      VALUES($1::uuid,'owned-bank','Bank fixture','central',true,$2,$5,'test-control','test-bank',$3),($4::uuid,'other-bank','Other scope','local',true,NULL,NULL,NULL,NULL,NULL)`,[instanceId,double.origin,bankKey.publicKey,otherInstanceId,instanceId]);
    const {hashPassword}=await import('../src/server/auth/crypto.ts');
    const disabledId=randomUUID();
    await owner.query("INSERT INTO control.operators(id,username_canonical,display_name,status,disabled_at) VALUES($1,'disabled-fixture','Disabled fixture','disabled',now())",[disabledId]);
    await owner.query('INSERT INTO control.operator_password_credentials(operator_id,password_hash) VALUES($1,$2)',[disabledId,await hashPassword(password)]);
  }finally{await owner.end();}
  const context=()=>({requestId:randomUUID(),ipHash:null,userAgentHash:null});
  const login=async username=>(await auth.loginOperator({username,password},context(),config)).session;
  const bootstrap=await login('bootstrap');let reviewer,observer;
  await check('disabled wrong-password expired and logged-out accounts remain denied',async()=>{
    await assert.rejects(login('disabled-fixture'),e=>e.code==='AUTHENTICATION_FAILED');
    await assert.rejects(auth.loginOperator({username:'bootstrap',password:'wrong-password'},context(),config));
    const prior=await auth.loginOperator({username:'before-registry',password},{...context(),now:new Date(Date.now()-24*3600000)},config);
    assert.equal(await auth.loadOperatorSession(prior.token,config,{requestId:randomUUID(),touch:false}),null);
    const renewed=await auth.loginOperator({username:'before-registry',password},context(),config);
    await auth.logoutOperator(renewed.session,randomUUID());
    assert.equal(await auth.loadOperatorSession(renewed.token,config,{requestId:randomUUID(),touch:false}),null);
  });
  await check('real auth services provision equal internal operators across all registered institutions',async()=>{
    for(const role of ['reviewer','observer'])await auth.createOperator({actor:bootstrap,username:role,displayName:`Test ${role}`,password,requestId:randomUUID()});
    reviewer=await login('reviewer');observer=await login('observer');
    await auth.requireInstancePermission(reviewer,'review.approve',instanceId,randomUUID());
    await auth.requireInstancePermission(observer,'review.approve',instanceId,randomUUID());
    await auth.requireInstancePermission(reviewer,'review.read',otherInstanceId,randomUUID());
    await assert.rejects(auth.requireInstancePermission(reviewer,'review.read',randomUUID(),randomUUID()));
  });
  const items=fixtures(instanceId);
  async function ingest(snapshot){double.add(snapshot);return acceptReviewSnapshot(signedSnapshot(snapshot,bankKey.privateKey,double.origin));}
  await check('signed ingress: profile contact all four categories and six lifecycle fixtures',async()=>{
    assert.equal(items.length,12);for(const snapshot of items)await ingest(snapshot);
    assert.equal((await listPendingReviews(reviewer.principal)).length,12);
    assert.equal((await listPendingReviews(observer.principal)).length,12);
    await assert.rejects(acceptReviewSnapshot(new Request(double.origin+'/api/internal/sj-review/snapshots',{method:'POST',body:JSON.stringify(items[0])})));
    assert.equal((await listPendingReviews(reviewer.principal)).length,12);
    const bytes=await getReviewMedia(reviewer.principal,instanceId,items[0].snapshot_id,items[0].detail.logo.source_media_id);assert.equal(bytes.mime,'image/png');assert.ok(bytes.body.length>0);
  });
  const enqueue=(s,decision='approve',actor=reviewer)=>enqueueReviewDecision({commandId:randomUUID(),instanceId,reviewId:s.snapshot_id,expectedVersion:s.source_version,expectedChecksum:s.payload_checksum,decision,reason:s.detail.kind==='change_request'||decision==='request_revision'?'Catatan keputusan pengujian':'',actor,requestId:randomUUID()});
  const {runFoundationChecks}=await import('../tests/support/control-foundation-checks.mjs');
  await runFoundationChecks({check,auth,bootstrap,config,password,instanceId,otherInstanceId,reviewer,client});
  await check('unverified session and stale-version checks use official decision service',async()=>{
    await assert.rejects(enqueue(items[0],'approve',{...observer,sessionId:randomUUID()}));
    await assert.rejects(enqueue({...items[0],source_version:2}));
    assert.equal((await client.query('SELECT count(*)::int AS n FROM control.review_commands')).rows[0].n,0);
  });
  await check('positive decisions via service and signed contract double, no SQL state updates',async()=>{
    for(const s of items){const id=await enqueue(s);assert.equal((await dispatchReviewCommand(id)).state,'APPLIED');const before=double.stats().effects;assert.equal((await dispatchReviewCommand(id)).state,'APPLIED');assert.equal(double.stats().effects,before);}
    assert.equal((await listPendingReviews(reviewer.principal)).length,0);
    for(const s of items){const detail=await getReviewDetail(reviewer.principal,s.snapshot_id);assert.equal(detail.commandState,'APPLIED');assert.ok(!('publicObservation' in detail));}
  });
  await check('revision and lifecycle rejection through official service',async()=>{
    for(const [base,decision,expected] of [[items[1],'request_revision','REVISION_REQUIRED'],[items[6],'reject','REJECTED']]){
      const s=makeSnapshot(instanceId,base.detail);await ingest(s);await dispatchReviewCommand(await enqueue(s,decision));assert.equal((await getReviewDetail(reviewer.principal,s.snapshot_id)).state,expected);
    }
  });
  await check('test-only faults empty ACK invalid signature timeout disconnect and bank rejection',async()=>{
    for(const mode of ['empty','bad-signature','timeout','disconnect','reject']){
      const s=makeSnapshot(instanceId,items[1].detail);await ingest(s);const id=await enqueue(s);double.fault(mode);
      if(mode==='reject')assert.equal((await dispatchReviewCommand(id)).state,'REJECTED');
      else{await assert.rejects(dispatchReviewCommand(id));assert.equal((await getReviewCommand(instanceId,id)).state,'UNKNOWN');}
      double.fault('normal');
    }
  });
  await check('integration destinations fenced to owned double',async()=>{assert.throws(()=>globalThis.fetch('http://127.0.0.1:4410/'),/TEST_EGRESS_REJECTED/);});
  if(dispatchChecks){
    const {runDispatchChecks}=await import('../tests/support/control-dispatch-checks.mjs');
    await runDispatchChecks({check,run,env,infrastructureEnv,instanceId,double,items,client,enqueue,ingest});
    const {runMonitorOwnershipChecks}=await import('../tests/support/control-monitor-ownership-checks.mjs');
    await runMonitorOwnershipChecks({check,run,instanceId,reviewer,double,bankKey,client});
  }
  if(apiChecks){
    if(evidenceChecks){
      const {runRetirementChecks}=await import('../tests/support/control-retirement-checks.mjs');
      await runRetirementChecks({check,instanceId,reviewer,double,items,client,getReviewDetail});
    }
    if(readChecks){
      const {runReadContractChecks}=await import('../tests/support/control-read-checks.mjs');
      await runReadContractChecks({check,instanceId,otherInstanceId,reviewer,observer,bootstrap,auth,config,bankKey,double,items,client,password,enqueue,ingest,getReviewDetail});
    }
    const {runReviewApiChecks}=await import('../tests/support/control-review-api-checks.mjs');
    await runReviewApiChecks({check,instanceId,otherInstanceId,reviewer,observer,bootstrap,auth,config,bankKey,double,items,client,password,enqueue});
    const {runAuditFixChecks}=await import('../tests/support/control-audit-fix-checks.mjs');
    await runAuditFixChecks({check,instanceId,items,ingest,reviewer,client,config,password,double});
  }
  await client.end();client=null;
  await globalThis.__ruwangControlPool?.end();
  await double.close();double=null;globalThis.fetch=originalFetch;
  report.cleanup.push(await cleanupDisposable(run));save();
  await check('cleanup one run preserves another run database and sentinel',async()=>{
    const other=await connectOwned(canary);try{assert.equal((await other.query("SELECT count(*)::int AS n FROM control.instances WHERE instance_key='upgrade-sentinel'")).rows[0].n,1);}finally{await other.end();}
  });
  report.status='passed';
}catch(error){report.status='failed';report.error={name:error.name,code:/^[A-Z_]+$/.test(error.message)?error.message:'CHECK_FAILED',databaseCode:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:undefined,frames:String(error.stack||'').split('\n').slice(1,5)};process.exitCode=1;}
finally{
  globalThis.fetch=originalFetch;
  if(client)await client.end().catch(()=>{});
  if(globalThis.__ruwangControlPool&&!globalThis.__ruwangControlPool.ended)await globalThis.__ruwangControlPool.end().catch(()=>{});
  if(double)await double.close().catch(()=>{});
  for(const cap of [run,canary].filter(Boolean)){
    if(report.cleanup.some(c=>c.runId===cap.runId))continue;
    try{report.cleanup.push(await cleanupDisposable(cap));}catch{report.status='failed';process.exitCode=1;report.cleanup.push({runId:cap.runId,removed:false,reason:'OWNERSHIP_OR_CLEANUP_FAILED'});}
  }
  save();
  if(run)console.log(JSON.stringify({status:report.status,checks:report.checks.length,evidence:join(run.root,'report.json'),cleanup:report.cleanup}));
}
