import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {waitForOwnedHarness, OWNED_RUN_TIMEOUT_MS, OWNED_CLEANUP_GRACE_MS,
  OWNED_TEST_TIMEOUT_MS} from './support/owned-sj-integration.mjs';

// Importing the guarded runner does not call main, Docker or database clients.
const {attachOwnedCancellation} = createRequire(import.meta.url)('../../backend-production/scripts/run-sj-isolated-tests.js');
const owned = {runId:'a'.repeat(32), tokenHash:'b'.repeat(64), root:'owned-test-evidence'};

class Signal extends EventEmitter {
  aborted = false;
  addEventListener(name, listener) { this.on(name, listener); }
  removeEventListener(name, listener) { this.off(name, listener); }
  abort() { this.aborted = true; this.emit('abort'); }
}

class Child extends EventEmitter {
  pid = 4242;
  connected = true;
  exitCode = null;
  signalCode = null;
  stdout = new EventEmitter();
  stderr = {resume() {}};
  sends = [];
  kills = 0;
  send(value, done) { this.sends.push(value); done?.(null); }
  kill() { this.kills += 1; this.close(null, 'SIGTERM'); return true; }
  start() { this.stdout.emit('data', JSON.stringify({status:'starting', runId:owned.runId, evidence:owned.root}) + '\n'); }
  cleanup(value = owned) { this.emit('message', {type:'owned-run-cleanup-started', ...value}); }
  close(code, signal = null) {
    this.exitCode = code; this.signalCode = signal; this.connected = false;
    this.emit('close', code);
  }
}

function fixture(options = {}) {
  const child = new Child(), signal = new Signal(), timers = new Map();
  let sequence = 0, proofReads = 0, recoveries = 0;
  const setTimer = (callback, ms) => { const id = ++sequence; timers.set(id, {callback, ms}); return id; };
  const clearTimer = id => timers.delete(id);
  const fire = ms => {
    const entry = [...timers].find(([, timer]) => timer.ms === ms);
    assert.ok(entry, 'Expected timer ' + ms); timers.delete(entry[0]); entry[1].callback();
  };
  const promise = waitForOwnedHarness({spawnChild:() => child, signal,
    readProof:() => { proofReads += 1; return {...owned}; },
    recoverStopped:async ({child:stopped}) => {
      assert.ok(stopped.exitCode !== null || stopped.signalCode !== null);
      recoveries += 1;
    }, setTimer, clearTimer, timeoutMs:30, cleanupGraceMs:5, ...options});
  const assertDisposed = () => {
    assert.equal(timers.size, 0); assert.equal(signal.listenerCount('abort'), 0);
    assert.equal(child.listenerCount('message'), 0); assert.equal(child.listenerCount('error'), 0);
    assert.equal(child.listenerCount('close'), 0); assert.equal(child.stdout.listenerCount('data'), 0);
  };
  return {child, signal, timers, fire, promise, assertDisposed,
    get proofReads() { return proofReads; }, get recoveries() { return recoveries; }};
}

test('launcher deadline includes setup and leaves a cleanup budget inside the test timeout', () => {
  assert.equal(OWNED_RUN_TIMEOUT_MS, 1_800_000);
  assert.equal(OWNED_CLEANUP_GRACE_MS, 300_000);
  assert.ok(OWNED_RUN_TIMEOUT_MS + OWNED_CLEANUP_GRACE_MS < OWNED_TEST_TIMEOUT_MS);
});

test('already-aborted launcher never spawns a child or creates a timer', async () => {
  const signal = new Signal(); signal.abort(); let calls = 0;
  await assert.rejects(waitForOwnedHarness({signal, spawnChild:() => { calls += 1; },
    setTimer:() => { calls += 1; }}), /ABORTED_BEFORE_START/);
  assert.equal(calls, 0);
});

test('normal close resolves once and clears every timer/listener without killing', async () => {
  const f = fixture(); f.child.start(); f.child.close(0); f.child.close(1);
  const result = await f.promise;
  assert.equal(result.code, 0); assert.equal(result.cancellation, undefined);
  assert.equal(f.proofReads, 1); assert.equal(f.child.kills, 0); assert.equal(f.recoveries, 0);
  f.assertDisposed();
});

test('abort before proof waits for ownership then sends exactly one matching cancel', async () => {
  const f = fixture(); f.signal.abort(); assert.equal(f.child.sends.length, 0);
  f.child.start(); f.child.start(); f.signal.abort();
  assert.deepEqual(f.child.sends, [{type:'cancel-owned-run', runId:owned.runId, tokenHash:owned.tokenHash, reason:'aborted'}]);
  f.child.cleanup(); f.child.close(1);
  const result = await f.promise;
  assert.equal(result.cancellation, 'aborted'); assert.equal(result.forced, false);
  assert.equal(f.proofReads, 1); assert.equal(f.child.kills, 0); f.assertDisposed();
});

test('deadline before proof queues cancellation rather than killing an unverified child', async () => {
  const f = fixture(); f.fire(30); assert.equal(f.child.sends.length, 0); assert.equal(f.child.kills, 0);
  f.child.start(); assert.equal(f.child.sends[0].reason, 'timeout');
  f.child.cleanup(); f.child.close(1);
  assert.equal((await f.promise).cancellation, 'timeout'); f.assertDisposed();
});

test('abort after proof uses cooperative IPC and waits until close', async () => {
  const f = fixture(); f.child.start(); f.signal.abort(); let completed = false;
  f.promise.then(() => { completed = true; }); await Promise.resolve(); assert.equal(completed, false);
  f.child.cleanup(); f.child.close(1); await f.promise;
  assert.equal(f.child.kills, 0); f.assertDisposed();
});

test('foreign cleanup proof never permits force-stop or recovery', async () => {
  const f = fixture(); f.child.start(); f.fire(30);
  f.child.cleanup({...owned, runId:'c'.repeat(32)});
  f.child.cleanup({...owned, tokenHash:'d'.repeat(64)});
  f.fire(5); await assert.rejects(f.promise, /CLEANUP_TIMEOUT/);
  assert.equal(f.child.kills, 0); assert.equal(f.recoveries, 0); f.assertDisposed();
});

test('exceptional fallback rechecks unchanged proof, stops only spawned child and recovers only after close', async () => {
  const f = fixture(); f.child.start(); f.fire(30); f.child.cleanup(); f.fire(5);
  const result = await f.promise;
  assert.equal(result.cancellation, 'timeout'); assert.equal(result.forced, true);
  assert.equal(f.proofReads, 2); assert.equal(f.child.kills, 1); assert.equal(f.recoveries, 1);
  f.assertDisposed();
});

test('repeated close while recovery awaits cannot recover twice or leave timers', async () => {
  let release, recoveries = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture({recoverStopped:async () => { recoveries += 1; await waiting; }});
  f.child.start(); f.fire(30); f.child.cleanup(); f.fire(5);
  f.child.close(null, 'SIGTERM'); f.signal.abort();
  assert.equal(recoveries, 1); f.assertDisposed(); release(); await f.promise;
  assert.equal(recoveries, 1);
});

test('IPC send failure does not abandon child before its observed cleanup close', async () => {
  const f = fixture(); f.child.send = (_value, done) => done(Error('closed IPC'));
  f.child.start(); f.signal.abort(); let completed = false;
  f.promise.then(() => { completed = true; }); await Promise.resolve(); assert.equal(completed, false);
  f.child.close(1); assert.equal((await f.promise).cancellation, 'aborted'); f.assertDisposed();
});

test('changed proof during cleanup refuses force-stop and resource recovery', async () => {
  let reads = 0;
  const f = fixture({readProof:() => ({...owned, tokenHash:++reads === 1 ? owned.tokenHash : 'e'.repeat(64)})});
  f.child.start(); f.fire(30); f.child.cleanup(); f.fire(5);
  await assert.rejects(f.promise, /FORCE_STOP_PROOF_REJECTED/);
  assert.equal(f.child.kills, 0); assert.equal(f.recoveries, 0); f.assertDisposed();
});

test('spawn failure disposes deadline and cancellation listeners', async () => {
  const f = fixture(); f.child.emit('error', Error('synthetic spawn fault'));
  await assert.rejects(f.promise, /SPAWN_FAILED/); f.assertDisposed();
});

test('invalid ownership is rejected without sending cancellation or touching resources', async () => {
  const f = fixture({readProof:() => { throw Error('owner mismatch'); }}); f.child.start();
  await assert.rejects(f.promise, /PROOF_REJECTED/);
  assert.equal(f.child.sends.length, 0); assert.equal(f.child.kills, 0); f.assertDisposed();
});

test('runner cancellation rejects mismatched run, token and unsupported reason', () => {
  const channel = new Child(); let stopped = 0;
  const cancellation = attachOwnedCancellation(channel, owned, () => { stopped += 1; });
  for (const patch of [{runId:'c'.repeat(32)}, {tokenHash:'d'.repeat(64)}, {reason:'delete'}]) {
    channel.emit('message', {type:'cancel-owned-run', ...owned, reason:'aborted', ...patch});
  }
  cancellation.check(); assert.equal(stopped, 0); assert.equal(channel.sends.length, 0);
  channel.emit('message', {type:'cancel-owned-run', ...owned, reason:'aborted'});
  channel.emit('message', {type:'cancel-owned-run', ...owned, reason:'timeout'});
  assert.equal(stopped, 1); assert.throws(() => cancellation.check(), /OWNED_RUN_CANCELLED/);
  cancellation.beginCleanup();
  assert.deepEqual(channel.sends.map(item => item.type), ['owned-run-cancellation-accepted', 'owned-run-cleanup-started']);
  for (const message of channel.sends) {
    assert.equal(message.runId, owned.runId); assert.equal(message.tokenHash, owned.tokenHash);
  }
  cancellation.dispose(); assert.equal(channel.listenerCount('message'), 0); assert.equal(channel.listenerCount('disconnect'), 0);
});

test('parent IPC disconnect cancels once and permits cleanup without a response channel', () => {
  const channel = new Child(); let stopped = 0;
  const cancellation = attachOwnedCancellation(channel, owned, () => { stopped += 1; });
  channel.connected = false; channel.emit('disconnect'); channel.emit('disconnect');
  assert.equal(stopped, 1); assert.equal(channel.sends.length, 0);
  assert.throws(() => cancellation.check(), /OWNED_RUN_CANCELLED/);
  cancellation.beginCleanup(); cancellation.dispose();
  assert.equal(channel.listenerCount('disconnect'), 0);
});

test('scanner-wait cancellation checkpoint prevents later resource stages', async () => {
  const channel = new Child(); let laterStages = 0;
  const cancellation = attachOwnedCancellation(channel, owned, () => {});
  const wait = async () => {
    cancellation.check(); await Promise.resolve(); cancellation.check();
  };
  const waiting = wait().then(() => { laterStages += 1; });
  channel.emit('message', {type:'cancel-owned-run', ...owned, reason:'aborted'});
  await assert.rejects(waiting, /OWNED_RUN_CANCELLED/); assert.equal(laterStages, 0);
  cancellation.dispose();
});
