import test from 'node:test';
import {runOwnedCrossApp, requireCheck, OWNED_TEST_TIMEOUT_MS} from './support/owned-sj-integration.mjs';

test('Control signed snapshot, private media, signed ACK and repeat dispatch on owned disposable databases', {timeout: OWNED_TEST_TIMEOUT_MS}, async t => {
  const {report, root} = await runOwnedCrossApp({signal:t.signal});
  requireCheck(report, 'Control adapter: authenticated reviewer, private media, signed ACK, unsigned ACK stays UNKNOWN without resend or duplicate dispatch');
  requireCheck(report, 'signed bank ledger resolves lost ACK without resend; forged result and wrong instance rejected; concurrent checks preserve original UNKNOWN attempt');
  requireCheck(report, 'real Control decision handlers: two accounts compete once; same-ID and fresh-ID tab replays preserve one signed bank dispatch; auth/CSRF/scope/stale/checksum/intent/session negatives and audit-fault transaction rollback');
  t.diagnostic('Fresh disposable evidence: ' + root);
});
