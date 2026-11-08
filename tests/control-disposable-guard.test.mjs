import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanInfrastructureEnvironment,validateContainerProof,guardDatabaseTarget,cleanupDisposable,createDisposable,localDockerEndpoint,pinnedDockerArguments} from './support/control-disposable.mjs';
import {readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';

test('reject operational targets and injection before any infrastructure mutation',()=>{
  for(const key of ['CONTROL_DATABASE_URL','CONTROL_MIGRATION_DATABASE_URL','DATABASE_URL','PGHOST','PGPASSWORD','REDIS_URL','QUEUE_URL','UPLOAD_DIR','SJ_CENTRAL_BASE_URL','CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE','NODE_OPTIONS','DOCKER_HOST','DOCKER_CONTEXT','HTTPS_PROXY']){
    assert.throws(()=>cleanInfrastructureEnvironment({[key]:'operational-sentinel'}),/EXTERNAL_TEST_TARGET_REJECTED/);
  }
  assert.deepEqual(cleanInfrastructureEnvironment({PATH:'tools',SECRET:'discard',NODE_ENV:'test'}),{PATH:'tools'});
});
test('provisioner rejects an operational URL before even creating run storage',async()=>{
  const list=()=>readdirSync(tmpdir()).filter(f=>f.startsWith('rc-sj-owned-')).sort();
  const before=list();
  await assert.rejects(createDisposable({CONTROL_DATABASE_URL:'postgresql://operational:sentinel@127.0.0.1:55432/ruwang_control',NODE_ENV:'test'}),/EXTERNAL_TEST_TARGET_REJECTED/);
  assert.deepEqual(list(),before);
});
const expected={id:'a'.repeat(64),runId:'run-a',tokenHash:'hash-a',image:'sha256:image'};
const observed={Id:expected.id,Image:expected.image,Config:{Labels:{'rc.test.run':'run-a','rc.test.capability':'hash-a'}},HostConfig:{Tmpfs:{'/var/lib/postgresql/data':'rw'},Binds:[]},Mounts:[],State:{Running:true},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'12345'}]}}};
test('name or NODE_ENV is insufficient; verify exact ID + labels + image + tmpfs + loopback',()=>{
  assert.equal(validateContainerProof(expected,observed),true);
  for(const mutate of [v=>v.Id='b'.repeat(64),v=>v.Config.Labels['rc.test.run']='run-b',v=>v.Config.Labels['rc.test.capability']='forged',v=>v.Image='other',v=>v.HostConfig.Binds=['D:/data:/var/lib/postgresql/data'],v=>v.HostConfig.Tmpfs={},v=>v.Mounts=[{Type:'volume'}],v=>v.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0']){
    const v=structuredClone(observed);mutate(v);assert.throws(()=>validateContainerProof(expected,v),/REJECTED/);
  }
});
test('forged capabilities cannot connect or clean resources even with test-named DB',async()=>{
  assert.throws(()=>guardDatabaseTarget({runId:'run-a'},'postgresql://test:test@127.0.0.1:5432/ruwang_control_test'),/RUN_CAPABILITY_REQUIRED/);
  await assert.rejects(cleanupDisposable({runId:'run-a'}),/RUN_CAPABILITY_REQUIRED/);
});

test('Docker endpoint accepts only canonical local named pipes and absolute Unix sockets',()=>{
  for(const endpoint of ['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock','unix:///run/user/1000/docker.sock'])assert.equal(localDockerEndpoint(endpoint),endpoint);
  for(const endpoint of [undefined,null,'','npipe://remote/pipe/docker_engine','npipe:////remote/pipe/docker_engine','npipe:////./pipe/','npipe:////./pipe/docker_engine?target=remote','npipe:////./pipe/docker_engine#fragment','npipe:////./pipe/../other','unix://remote/var/run/docker.sock','unix://var/run/docker.sock','unix:////var/run/docker.sock','unix:///var/../run/docker.sock','unix:///var/./run/docker.sock','unix:///var//run/docker.sock','unix:///var/run/docker.sock?target=remote','unix:///var/run/docker.sock#fragment','unix:///var/run/docker%2esock','unix:///var/run/docker.sock\n',' tcp://127.0.0.1:2375','tcp://127.0.0.1:2375','ssh://localhost','https://localhost','C:\\docker.sock'])assert.throws(()=>localDockerEndpoint(endpoint),/REMOTE_DOCKER_REJECTED/);
});

test('every post-selection Docker command is explicitly pinned and cannot supply a new target',()=>{
  const endpoint='npipe:////./pipe/dockerDesktopLinuxEngine';
  for(const args of [['inspect','a'.repeat(64)],['image','inspect','postgres:16-alpine'],['create','--label','owned=true'],['start','a'.repeat(64)],['rm','--force','a'.repeat(64)],['ps','-a']])assert.deepEqual(pinnedDockerArguments(endpoint,args),['--host',endpoint,...args]);
  for(const args of [['--host','tcp://remote:2375','ps'],['--host=tcp://remote:2375','ps'],['-H','tcp://remote:2375','ps'],['-Htcp://remote:2375','ps'],['--context','remote','ps'],['--context=remote','ps'],['-cremote','ps'],[],null])assert.throws(()=>pinnedDockerArguments(endpoint,args),/DOCKER_ENDPOINT_OVERRIDE_REJECTED/);
  assert.throws(()=>pinnedDockerArguments('npipe://remote/pipe/docker_engine',['ps']),/REMOTE_DOCKER_REJECTED/);
});

test('nonlocal Docker endpoint is refused by the production provisioner before run storage is created',async()=>{
  const list=()=>readdirSync(tmpdir()).filter(f=>f.startsWith('rc-sj-owned-')).sort();
  const before=list();let reads=0;
  await assert.rejects(createDisposable({}, {readDockerEndpoint:()=>{reads++;return 'npipe://remote/pipe/docker_engine';}}),/REMOTE_DOCKER_REJECTED/);
  assert.equal(reads,1);assert.deepEqual(list(),before);
});
