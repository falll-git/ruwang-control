// Test-only infrastructure. Never imported by app/runtime code.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, readFileSync, realpathSync, lstatSync, unlinkSync, mkdirSync, copyFileSync, readdirSync, existsSync} from 'node:fs';
import {tmpdir,hostname} from 'node:os';
import {join, resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from 'pg';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const capabilities = new WeakMap();
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };

export function cleanInfrastructureEnvironment(input) {
  for (const [key,value] of Object.entries(input)) {
    if (value && /^(CONTROL_|PG|DATABASE|REDIS|QUEUE|SJ_|UPLOAD|MEDIA_|AWS_|AZURE_|GOOGLE_|NODE_OPTIONS|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(key)) fail('EXTERNAL_TEST_TARGET_REJECTED');
  }
  const allowed = new Set(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','HOME']);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)));
}

// A scheme prefix alone does not establish that a Docker endpoint is local.
// Accept only canonical local named pipes or absolute, traversal-free sockets.
export function localDockerEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || /[\s?#%\\]/.test(endpoint)) fail('REMOTE_DOCKER_REJECTED');
  if (/^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(endpoint)) return endpoint;
  if (/^unix:\/\/\/[A-Za-z0-9_.\/-]+$/.test(endpoint)) {
    const components = endpoint.slice('unix:///'.length).split('/');
    if (components.every(part => part && part !== '.' && part !== '..')) return endpoint;
  }
  fail('REMOTE_DOCKER_REJECTED');
}

export function pinnedDockerArguments(endpoint, args) {
  const pinned = localDockerEndpoint(endpoint);
  if (!Array.isArray(args) || !args.length || args.some(arg => typeof arg !== 'string' || /^(?:-[Hc]|--(?:host|context)(?:=|$))/.test(arg))) fail('DOCKER_ENDPOINT_OVERRIDE_REJECTED');
  return ['--host', pinned, ...args];
}

function docker(env, args, endpoint) {
  const selected = endpoint === undefined ? args : pinnedDockerArguments(endpoint, args);
  try { return execFileSync('docker',selected,{env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:30_000}).trim(); }
  catch { fail('DISPOSABLE_DOCKER_OPERATION_FAILED'); }
}

// Pure pre-mutation predicate; no DB, Docker writes, files or network effects.
export function validateContainerProof(expected, observed) {
  if (!/^[a-f0-9]{64}$/.test(expected.id || '') || observed.Id !== expected.id ||
      observed.Config?.Labels?.['rc.test.run'] !== expected.runId ||
      observed.Config?.Labels?.['rc.test.capability'] !== expected.tokenHash ||
      observed.Image !== expected.image ||
      (observed.HostConfig?.Binds || []).length ||
      !observed.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] ||
      (observed.Mounts || []).some(m => m.Type !== 'tmpfs')) fail('OWNERSHIP_PROOF_REJECTED');
  const ports = observed.NetworkSettings?.Ports?.['5432/tcp'];
  if (observed.State?.Running && (!ports?.length || ports.some(p=>p.HostIp !== '127.0.0.1'))) fail('NON_LOOPBACK_PORT_REJECTED');
  return true;
}

function state(capability) {
  const value = capabilities.get(capability);
  if (!value || value.closed) fail('RUN_CAPABILITY_REQUIRED');
  const marker = JSON.parse(readFileSync(join(value.root,'owner.json'),'utf8'));
  if (realpathSync(value.root) !== value.root || lstatSync(value.root).isSymbolicLink() ||
      marker.runId !== value.runId || marker.tokenHash !== value.tokenHash) fail('STORAGE_OWNERSHIP_REJECTED');
  return value;
}

export function inspectOwned(capability, targetId) {
  const value = state(capability);
  if (targetId !== undefined && targetId !== value.id) fail('FOREIGN_RESOURCE_REJECTED');
  const observed = JSON.parse(docker(value.env,['inspect',value.id],value.endpoint))[0];
  validateContainerProof(value,observed);
  return observed;
}

export function guardDatabaseTarget(capability, connectionString) {
  const value = state(capability);
  const observed = inspectOwned(capability);
  const target = new URL(connectionString);
  const actualPort = observed.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== actualPort || target.search || target.hash ||
      !value.urls.includes(connectionString)) fail('DATABASE_TARGET_REJECTED');
  return true;
}

export async function connectOwned(capability, kind = 'runtime') {
  const value = state(capability);
  const url = value[`${kind}Url`];
  if (!url) fail('DATABASE_ROLE_REJECTED');
  guardDatabaseTarget(capability,url);
  const client = new Client({connectionString:url,connectionTimeoutMillis:3000,statement_timeout:5000});
  await client.connect();
  try {
    const {rows:[row]} = await client.query('SELECT current_database() AS db, current_user AS role, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user');
    assert.equal(row.db,value.database);
    assert.equal(row.role,kind === 'runtime' ? value.runtimeRole : value.migrationRole);
    assert.equal(row.rolsuper,false); assert.equal(row.rolbypassrls,false);
    assert.equal(row.rolcreatedb,false); assert.equal(row.rolcreaterole,false);
    const marker = (await client.query('SELECT run_id, token_hash FROM rc_test_owner.proof')).rows;
    assert.deepEqual(marker,[{run_id:value.runId,token_hash:value.tokenHash}]);
    return client;
  } catch { await client.end(); fail('DATABASE_OWNERSHIP_REJECTED'); }
}

export async function createDisposable(input = process.env, {readDockerEndpoint} = {}) {
  const env = cleanInfrastructureEnvironment(input); // MUST precede even temp-directory creation.
  if (readDockerEndpoint !== undefined && typeof readDockerEndpoint !== 'function') fail('INVALID_DOCKER_ENDPOINT_READER');
  const endpoint = localDockerEndpoint((readDockerEndpoint ?? (() => docker(env,['context','inspect','--format','{{.Endpoints.docker.Host}}'])))());
  const image = docker(env,['image','inspect','postgres:16-alpine','--format','{{.Id}}'],endpoint);
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) fail('LOCAL_IMAGE_REQUIRED');
  const runId = randomUUID(), tokenHash = hash(randomBytes(32));
  const root = realpathSync(mkdtempSync(join(tmpdir(),'rc-sj-owned-')));
  writeFileSync(join(root,'owner.json'),JSON.stringify({runId,tokenHash,root,pid:process.pid,host:hostname()}),{flag:'wx',mode:0o600});
  const capability = Object.freeze({runId,root});
  const value = {runId,root,tokenHash,image,env,endpoint,closed:false,id:null,files:[],urls:[]};
  capabilities.set(capability,value);
  const adminPassword = randomBytes(32).toString('hex');
  try {
    // No bind volumes. Container-local tmpfs DB disappears only with this exact owned container.
    value.id = docker({...env,POSTGRES_PASSWORD:adminPassword},['create','--label',`rc.test.run=${runId}`,'--label',`rc.test.capability=${tokenHash}`,
      '--tmpfs','/var/lib/postgresql/data:rw','-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD',image],endpoint);
    writeFileSync(join(root,'resource.json'),JSON.stringify({id:value.id,runId,tokenHash,image,files:[]}),{flag:'wx',mode:0o600});
    inspectOwned(capability);
    docker(env,['start',value.id],endpoint);
    const observed = inspectOwned(capability);
    const port = observed.NetworkSettings.Ports['5432/tcp'][0].HostPort;
    value.port = Number(port);
    let ready = false;
    for (let attempt=0;attempt<80;attempt++) {
      try { docker(env,['exec',value.id,'pg_isready','-U','postgres'],endpoint); ready=true; break; }
      catch { await new Promise(r=>setTimeout(r,250)); }
    }
    if (!ready) fail('DISPOSABLE_DATABASE_NOT_READY');
    const suffix = runId.replaceAll('-','');
    value.database = `ruwang_control_${suffix}`;
    value.runtimeRole = `ruwang_control_runtime_${suffix}`;
    value.migrationRole = `ruwang_control_migration_${suffix}`;
    const runtimePassword = randomBytes(32).toString('hex'), migrationPassword = randomBytes(32).toString('hex');
    value.runtimeUrl = `postgresql://${value.runtimeRole}:${runtimePassword}@127.0.0.1:${port}/${value.database}`;
    value.migrationUrl = `postgresql://${value.migrationRole}:${migrationPassword}@127.0.0.1:${port}/${value.database}`;
    value.urls = [value.runtimeUrl,value.migrationUrl];
    inspectOwned(capability); // Before first SQL mutation; admin only provisions roles/DB.
    const admin = new Client({host:'127.0.0.1',port:Number(port),user:'postgres',password:adminPassword,database:'postgres',connectionTimeoutMillis:3000});
    await admin.connect();
    try {
      await admin.query(`CREATE ROLE "${value.migrationRole}" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${migrationPassword}'`);
      await admin.query(`CREATE ROLE "${value.runtimeRole}" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${runtimePassword}'`);
      await admin.query(`CREATE DATABASE "${value.database}" OWNER "${value.migrationRole}"`);
      await admin.query(`REVOKE ALL ON DATABASE "${value.database}" FROM PUBLIC`);
      await admin.query(`GRANT CONNECT ON DATABASE "${value.database}" TO "${value.runtimeRole}"`);
    } finally { await admin.end(); }
    guardDatabaseTarget(capability,value.migrationUrl);
    const owner = new Client({connectionString:value.migrationUrl}); await owner.connect();
    try {
      await owner.query('CREATE SCHEMA rc_test_owner; CREATE TABLE rc_test_owner.proof(run_id text NOT NULL,token_hash text NOT NULL)');
      await owner.query('INSERT INTO rc_test_owner.proof VALUES($1,$2)',[runId,tokenHash]);
      await owner.query(`REVOKE ALL ON SCHEMA rc_test_owner FROM PUBLIC; GRANT USAGE ON SCHEMA rc_test_owner TO "${value.runtimeRole}"; GRANT SELECT ON rc_test_owner.proof TO "${value.runtimeRole}"`);
    } finally { await owner.end(); }
    return capability;
  } catch (error) {
    if (value.id) await cleanupDisposable(capability);
    throw error;
  }
}

export function runtimeEnvironment(capability) {
  const v = state(capability); guardDatabaseTarget(capability,v.runtimeUrl);
  return {...v.env,CONTROL_APP_ENV:'test',CONTROL_RELEASE:'test',CONTROL_DATABASE_NAME:v.database,
    CONTROL_DATABASE_RUNTIME_ROLE:v.runtimeRole,CONTROL_DATABASE_MIGRATION_ROLE:v.migrationRole,
    CONTROL_DATABASE_URL:v.runtimeUrl,CONTROL_MIGRATION_DATABASE_URL:v.migrationUrl,CONTROL_DATABASE_SSL:'disable',
    CONTROL_AUTH_ENCRYPTION_KEY:randomBytes(32).toString('base64'),CONTROL_PUBLIC_ORIGIN:'http://127.0.0.1:4320',
    CONTROL_ENABLE_BANK_INTEGRATION:'false',CONTROL_ENABLE_SJ_MONITORING:'false',CONTROL_ENABLE_BANK_ACCOUNTS:'false',CONTROL_ENABLE_GENERAL_MONITORING:'false'};
}

export async function migrateOwned(capability, limit = Infinity) {
  const v = state(capability); const client = await connectOwned(capability,'migration'); await client.end();
  const cwd = mkdtempSync(join(v.root,'migration-')); mkdirSync(join(cwd,'migrations'));
  const files = readdirSync(join(repo,'migrations')).filter(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort().slice(0,limit);
  for (const file of files) copyFileSync(join(repo,'migrations',file),join(cwd,'migrations',file));
  try {
    execFileSync(process.execPath,[join(repo,'scripts/migrate.mjs')],{cwd,env:runtimeEnvironment(capability),windowsHide:true,stdio:'pipe',timeout:60_000});
  } catch { fail('OWNED_MIGRATION_FAILED'); }
  return files;
}

export function writeOwnedSecret(capability, content) {
  const v = state(capability); const path = join(v.root,`key-${randomUUID()}.pem`);
  v.files.push(path);
  writeFileSync(join(v.root,'resource.json'),JSON.stringify({id:v.id,runId:v.runId,tokenHash:v.tokenHash,image:v.image,files:v.files}),{mode:0o600});
  writeFileSync(path,content,{flag:'wx',mode:0o600}); return path;
}

export function publicProof(capability) {
  const v = state(capability); inspectOwned(capability);
  return {runId:v.runId,root:v.root,containerId:v.id,image:v.image,tokenHash:v.tokenHash,database:v.database,
    runtimeRole:v.runtimeRole,migrationRole:v.migrationRole,port:v.port,storage:'container tmpfs + owned temp directory',
    redis:'NOT APPLICABLE: Control uses PostgreSQL, no Redis client',queue:'Control tables in owned DB; no background worker started'};
}

export async function cleanupDisposable(capability, targetId) {
  const v = state(capability);
  inspectOwned(capability,targetId); // Mandatory immediately before destructive action; never adopt by name.
  for (const file of v.files) {
    if (resolve(file) !== file || !file.startsWith(v.root + (process.platform === 'win32' ? '\\' : '/')) || (existsSync(file)&&lstatSync(file).isSymbolicLink())) fail('SECRET_PATH_REJECTED');
    if(existsSync(file))unlinkSync(file); // Exact generated file, no recursive directory deletion.
  }
  docker(v.env,['rm','--force',v.id],v.endpoint);
  const remaining = docker(v.env,['ps','-a','--no-trunc','--filter',`id=${v.id}`,'--format','{{.ID}}'],v.endpoint);
  assert.equal(remaining,''); v.closed=true;
  return {runId:v.runId,containerId:v.id,removed:true,secretsRemoved:v.files.length,evidenceRoot:v.root};
}

// Explicit interrupted-run cleanup; never searches for containers by a broad name/glob.
export async function recoverDisposable(root,input=process.env) {
  const env=cleanInfrastructureEnvironment(input);
  const endpoint=localDockerEndpoint(docker(env,['context','inspect','--format','{{.Endpoints.docker.Host}}']));
  if(resolve(root)!==root || realpathSync(root)!==root || realpathSync(dirname(root))!==realpathSync(tmpdir()) || !/^rc-sj-owned-[a-zA-Z0-9]+$/.test(basename(root)))fail('RECOVERY_ROOT_REJECTED');
  const owner=JSON.parse(readFileSync(join(root,'owner.json'),'utf8'));
  if(owner.host!==hostname()||owner.root!==root||!Number.isSafeInteger(owner.pid))fail('RECOVERY_OWNER_REJECTED');
  try{process.kill(owner.pid,0);fail('RUN_STILL_ACTIVE');}catch(e){if(e.code!=='ESRCH')throw e;}
  const journal=JSON.parse(readFileSync(join(root,'resource.json'),'utf8'));
  if(journal.runId!==owner.runId||journal.tokenHash!==owner.tokenHash||!Array.isArray(journal.files))fail('RECOVERY_PROOF_REJECTED');
  const cap=Object.freeze({runId:owner.runId,root});capabilities.set(cap,{...journal,root,env,endpoint,closed:false});
  return cleanupDisposable(cap);
}
