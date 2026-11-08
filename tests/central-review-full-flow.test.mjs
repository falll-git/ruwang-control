import test from 'node:test';
import {runOwnedCrossApp, requireCheck, OWNED_TEST_TIMEOUT_MS} from './support/owned-sj-integration.mjs';

test('central review lifecycle through real bank, Control and SJ with run-owned resources', {timeout: OWNED_TEST_TIMEOUT_MS}, async t => {
  const {report, root} = await runOwnedCrossApp({signal:t.signal});
  requireCheck(report, 'real upload/scanner, profile/contact signed snapshots, Control decisions, signed bank ACK, SJ ingest and identity-bound public observation');
  requireCheck(report, 'four categories published through bank API and actual Control/SJ; API identity/time evidence, zero attribute and WhatsApp URL checked without sending');
  requireCheck(report, 'Control lifecycle: publication revision/resubmit, rejected and approved reconfirmation, withdrawal revision/resubmit');
  requireCheck(report, 'real Control rejects a decision on an older bank snapshot without changing commands or dispatching');
  requireCheck(report, 'real signed Control decisions archive all categories without hard delete, reject contact revoke while referenced, then revoke contact, hide profile and revoke released photo; actual SJ ACK and public absence');
  t.diagnostic('Fresh disposable evidence: ' + root);
});
