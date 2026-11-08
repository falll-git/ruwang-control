import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync, existsSync, realpathSync} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const controlRoot = fileURLToPath(new URL('../../', import.meta.url));
const bankRoot = resolve(controlRoot, '../backend-production');
const runner = join(bankRoot, 'scripts/run-sj-isolated-tests.js');

// Never load .env or forward a database, queue, storage or integration target.
// The owned harness provisions random tmpfs containers and scoped roles itself.
export function isolatedEnvironment(env) {
  for (const key of Object.keys(env)) {
    if (/(DATABASE.*URL|REDIS.*URL|MIGRATION.*URL|CENTRAL.*URL|PUBLIC_WEB.*URL|MEDIA_FILESYSTEM_ROOT|UPLOAD_DIR|UPLOAD_TEMP_DIR)/i.test(key) && env[key]) {
      throw new Error('EXTERNAL_TEST_TARGET_REJECTED');
    }
  }
  const allowed = ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','DOCKER_HOST','DOCKER_CONTEXT'];
  return Object.fromEntries(Object.entries(env).filter(([key]) => allowed.includes(key)));
}

export const OWNED_RUN_TIMEOUT_MS = 1_800_000;
export const OWNED_CLEANUP_GRACE_MS = 300_000;
export const OWNED_TEST_TIMEOUT_MS = 2_160_000;

function readOwnership(evidence, child) {
  assert.ok(evidence?.evidence && /^[a-f0-9]{32}$/.test(evidence.runId));
  const root = realpathSync(evidence.evidence);
  const proof = JSON.parse(readFileSync(join(root, 'proof.json'), 'utf8'));
  const marker = JSON.parse(readFileSync(join(root, 'owner.json'), 'utf8'));
  assert.equal(proof.kind, 'RA-SJ-02-disposable-v1');
  assert.equal(proof.runId, evidence.runId);
  assert.equal(marker.runId, proof.runId);
  assert.equal(marker.tokenHash, proof.tokenHash);
  assert.match(proof.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(realpathSync(proof.root), root);
  assert.equal(proof.parentPid, child.pid);
  return {runId:proof.runId, tokenHash:proof.tokenHash, root};
}

// Dependency injection is only for pure launcher regressions. Production calls
// use the exact spawned child, run-owned proof and normal timer functions.
export function waitForOwnedHarness({spawnChild, readProof, recoverStopped, signal,
  timeoutMs = OWNED_RUN_TIMEOUT_MS, cleanupGraceMs = OWNED_CLEANUP_GRACE_MS,
  setTimer = setTimeout, clearTimer = clearTimeout}) {
  if (signal?.aborted) return Promise.reject(new Error('OWNED_HARNESS_ABORTED_BEFORE_START'));
  return new Promise((resolveExit, reject) => {
    let child, evidence, ownership, cancellation, cancelSent = false;
    let cleanupStarted = false, forced = false, settled = false, closing = false, buffer = '';
    let deadline, cleanupDeadline;
    const dispose = () => {
      clearTimer(deadline); clearTimer(cleanupDeadline);
      signal?.removeEventListener('abort', abort);
      child?.stdout.off('data', output);
      child?.off('message', message); child?.off('error', failed); child?.off('close', closed);
    };
    const settle = (error, value) => {
      if (settled) return;
      settled = true; dispose();
      if (error) reject(error); else resolveExit(value);
    };
    const sendCancellation = () => {
      if (!cancellation || cancelSent || !ownership || !child.connected) return;
      cancelSent = true;
      // A closing channel may reject send. Wait for observed process close and
      // inspect its cleanup evidence; never abandon a child on a send callback.
      try {
        child.send({type:'cancel-owned-run', runId:ownership.runId,
          tokenHash:ownership.tokenHash, reason:cancellation}, () => {});
      } catch { /* The bounded cleanup deadline remains active. */ }
    };
    const requestCancellation = reason => {
      if (settled || cancellation) return;
      cancellation = reason;
      cleanupDeadline = setTimer(() => {
        // Force-stop is an exceptional fallback, never the normal cancellation
        // path. The runner must first prove it entered cleanup after stopping
        // its scenario; otherwise exact ownership still does not prove safety.
        if (!ownership || !cleanupStarted || !child.connected || child.exitCode !== null || child.signalCode !== null) {
          settle(new Error('OWNED_HARNESS_CLEANUP_TIMEOUT: stopped-process ownership recovery required; evidence ' + (ownership?.root ?? 'not available')));
          return;
        }
        try { assert.deepEqual(readProof(evidence, child), ownership); }
        catch {
          settle(new Error('OWNED_HARNESS_FORCE_STOP_PROOF_REJECTED'));
          return;
        }
        forced = true;
        if (!child.kill()) settle(new Error('OWNED_HARNESS_FORCE_STOP_REFUSED: evidence ' + ownership.root));
      }, cleanupGraceMs);
      sendCancellation();
    };
    const abort = () => requestCancellation('aborted');
    const output = chunk => {
      buffer += String(chunk);
      for (let end; (end = buffer.indexOf('\n')) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let value;
        try { value = JSON.parse(line); } catch { continue; }
        if (value.status !== 'starting' || ownership) continue;
        try {
          ownership = readProof(value, child); evidence = value;
          sendCancellation();
        } catch {
          settle(new Error('OWNED_HARNESS_PROOF_REJECTED'));
          return;
        }
      }
      // Reports are line-oriented. An unterminated untrusted line cannot grow
      // the launcher indefinitely or become a source of raw diagnostic output.
      if (buffer.length > 1_048_576) buffer = '';
    };
    const message = value => {
      if (!ownership || value?.runId !== ownership.runId || value.tokenHash !== ownership.tokenHash) return;
      if (value.type === 'owned-run-cleanup-started') cleanupStarted = true;
    };
    const failed = () => settle(new Error('OWNED_HARNESS_SPAWN_FAILED'));
    const closed = async code => {
      if (settled || closing) return;
      closing = true;
      // Stop timers before awaiting recovery; only a closed child may recover
      // an exact proof. A reused/live PID is rejected by the production callback.
      dispose();
      try {
        if (forced) {
          assert.ok(recoverStopped && ownership);
          await recoverStopped({child, evidence, ownership});
        }
        settle(null, {code, evidence, ownership, cancellation, forced});
      } catch {
        settle(new Error('OWNED_HARNESS_RECOVERY_FAILED: evidence ' + ownership?.root));
      }
    };
    try {
      child = spawnChild();
      child.stdout.on('data', output);
      // Do not echo runtime output: it may include SQL/private fixture values.
      child.stderr.resume();
      child.on('message', message); child.once('error', failed); child.once('close', closed);
      signal?.addEventListener('abort', abort, {once:true});
      deadline = setTimer(() => requestCancellation('timeout'), timeoutMs);
      if (signal?.aborted) abort();
    } catch { failed(); }
  });
}

async function recoverStoppedRunner({child, evidence, ownership}, env) {
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  try { process.kill(child.pid, 0); throw new Error('RUN_PARENT_STILL_ALIVE'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  assert.deepEqual(readOwnership(evidence, child), ownership);
  const code = await new Promise((resolveExit, reject) => {
    const recovery = spawn(process.execPath, [runner, '--cleanup', join(ownership.root, 'proof.json')],
      {cwd:bankRoot, env, windowsHide:true, stdio:['ignore','ignore','ignore']});
    recovery.once('error', reject); recovery.once('close', resolveExit);
  });
  assert.equal(code, 0);
  const receipt = JSON.parse(readFileSync(join(ownership.root, 'recovery.json'), 'utf8'));
  assert.ok(receipt.cleanup.length > 0 && receipt.cleanup.every(item => item.removed === true));
}

export async function runOwnedCrossApp({signal} = {}) {
  const env = isolatedEnvironment(process.env);
  assert.ok(existsSync(runner), 'Adjacent backend owned harness is required');
  assert.equal(realpathSync(dirname(dirname(runner))), realpathSync(bankRoot));
  const {code, evidence, cancellation, forced} = await waitForOwnedHarness({signal,
    spawnChild:() => spawn(process.execPath, [runner, '--cross-app'], {
      cwd:bankRoot, env, windowsHide:true, stdio:['ignore','pipe','pipe','ipc'],
    }), readProof:readOwnership, recoverStopped:input => recoverStoppedRunner(input, env)});
  assert.ok(evidence?.evidence && evidence?.runId, 'Harness did not create ownership evidence; check local Docker prerequisites');
  const root = evidence.evidence;
  const proof = JSON.parse(readFileSync(join(root, 'proof.json'), 'utf8'));
  const marker = JSON.parse(readFileSync(join(root, 'owner.json'), 'utf8'));
  const report = JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'));
  assert.equal(proof.runId, evidence.runId);
  assert.equal(marker.runId, proof.runId);
  assert.equal(marker.tokenHash, proof.tokenHash);
  assert.equal(realpathSync(root), realpathSync(proof.root));
  assert.equal(report.runId, proof.runId);
  if (cancellation) {
    if (!forced) assert.ok(report.cleanup.length > 0 && report.cleanup.every(item => item.removed === true), 'Cancelled run cleanup incomplete: ' + root);
    throw new Error('OWNED_HARNESS_' + cancellation.toUpperCase() + ': evidence ' + root);
  }
  assert.equal(code, 0, 'Owned integration failed; evidence: ' + root);
  assert.equal(report.status, 'passed', 'Evidence: ' + root);
  assert.equal(report.scenario?.pass, true);
  assert.ok(report.cleanup.length >= 3 && report.cleanup.every(item => item.removed === true));
  assert.ok(report.scenario.checks.every(item => item.pass === true));
  return {report, root};
}

export function requireCheck(report, name) {
  assert.ok(report.scenario.checks.some(item => item.check === name && item.pass === true), 'Missing executed integration check: ' + name);
}
