import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { reviewDetailReadSchema } from '../src/domain/review-read-contract.ts';
import { reviewLabels, bankSnapshotStateLabel } from '../src/domain/review-ui.ts';

// Render the actual synchronous client component, compiled only in memory.
// Next navigation and child header/form/media/button/icon boundaries are test
// doubles. The component's field construction, <dl>, conditions, values, status
// presentation and pure domain modules are real. No browser, HTTP, database,
// environment loading, generated source file or dependency installation occurs.
// This is rendered-unit evidence, not focus/interaction/browser E2E evidence.
const require = createRequire(import.meta.url);
const componentFile = fileURLToPath(new URL('../components/reviews/review-detail.tsx', import.meta.url));
const componentSource = readFileSync(componentFile, 'utf8');
function compileInMemory(file, source = readFileSync(file, 'utf8')) {
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  return runInThisContext(`(function(require,module,exports){\n${compiled.outputText}\n})`, { filename: file });
}
const factory = compileInMemory(componentFile, componentSource);
// This pure response parser has a TS parameter property, so Node's strip-only
// loader cannot import it. Compile its REAL source in memory as well; do not
// change the app or substitute a permissive response validator.
const requestExports = {};
compileInMemory(fileURLToPath(new URL('../components/reviews/review-request.ts', import.meta.url)))(require, { exports: requestExports }, requestExports);
const h = React.createElement;
const ids = Object.freeze({
  review: '10000000-0000-4000-8000-000000000001',
  instance: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  latest: '10000000-0000-4000-8000-000000000005',
  media: '10000000-0000-4000-8000-000000000006',
  centralMedia: '10000000-0000-4000-8000-000000000007',
  command: '10000000-0000-4000-8000-000000000008',
});
const media = Object.freeze({ source_media_id: ids.media, central_media_id: ids.centralMedia,
  state: 'READY', detected_mime: 'image/webp', width: 640, height: 480 });
const lifecycles = [
  ['UNPUBLISH_PUBLICATION', 'PUBLICATION', 'PUBLISHED'],
  ['ARCHIVE_PUBLICATION', 'PUBLICATION', 'UNPUBLISHED'],
  ['RECONFIRM_PUBLICATION', 'PUBLICATION', 'PUBLISHED'],
  ['HIDE_PROFILE', 'PROFILE', 'VERIFIED'],
  ['REVOKE_CONTACT', 'CONTACT', 'VERIFIED'],
  ['REVOKE_MEDIA', 'MEDIA', 'READY'],
];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

function lifecycleReview(action, target, currentState, centralSynced, overrides = {}) {
  return reviewDetailReadSchema.parse({
    id: ids.review, instanceId: ids.instance, instanceName: 'BPRS snapshot terisolasi',
    kind: 'change_request', title: 'Data versi lama yang diajukan', sourceId: ids.source,
    sourceVersion: 1, state: 'IN_REVIEW', submittedAt: '2026-10-05T05:22:00.000Z', authority: 'central',
    commandState: null, commandDecision: null, commandResultCode: null, checksum: 'a'.repeat(64),
    commandId: null, resultCheck: null, decision: null,
    actions: ['approve', 'request_revision', 'reject'].map(action => ({
      action, allowed: true, reasonCode: null, reason: null, requiresReason: true,
    })),
    versions: { submitted: 1, latestReceived: { id: ids.review, version: 1 },
      bankCurrent: null, bankCurrentAvailability: 'NOT_AVAILABLE' },
    detail: {
      kind: 'change_request', action, target_kind: target, target_id: ids.target,
      target_label: 'Objek snapshot lama', current_state: currentState,
      reason: 'Alasan bank yang harus tetap diperiksa.',
      expected_public_visibility: ['CONTACT', 'MEDIA'].includes(target) ? 'not_applicable' :
        action === 'RECONFIRM_PUBLICATION' ? 'visible' : 'not_visible',
      blockers: ['Kendala pengajuan tetap terlihat.'], affected_publications: 0, affected_media: 0,
      central_synced: centralSynced, reference_code: target === 'PUBLICATION' ? 'SJ-SNAPSHOT-LAMA' : null,
      public_slug: target === 'PROFILE' ? 'profil-snapshot-lama' : null,
      media: target === 'CONTACT' ? [] : [{ ...media }],
    },
    ...overrides,
  });
}

function renderReview(initial, { returnTo = '/reviews?group=lifecycle&state=all' } = {}) {
  const boundaries = { decisions: [], media: [] };
  const exports = {};
  const stubs = {
    'next/link': ({ children, ...props }) => {
      delete props.prefetch;
      return h('a', props, children);
    },
    'lucide-react': Object.fromEntries(['ArrowLeft', 'ClipboardCheck', 'RefreshCw'].map(name =>
      [name, () => h('svg', { 'aria-hidden': true, 'data-icon-boundary': name })])),
    '@/components/ui/feature-header': ({ title, subtitle, actions }) => h('header',
      { 'data-boundary': 'header' }, h('h1', null, title), h('p', null, subtitle), actions),
    '@/components/ui/button': { Button: ({ children, ...props }) => {
      delete props.variant;
      return h('button', props, children);
    } },
    '@/components/ui/badge': { StatusBadge: ({ children, tone }) => h('span', { 'data-tone': tone }, children) },
    '../review-decision-form': { ReviewDecisionForm: ({ review, operatorKey }) => {
      boundaries.decisions.push({ review, operatorKey });
      return h('section', { 'data-boundary': 'decision', 'aria-label': 'Keputusan pemeriksaan' });
    } },
    './review-media': { ReviewMedia: ({ media, instanceId, reviewId }) => {
      boundaries.media.push({ media, instanceId, reviewId });
      return h('section', { 'data-boundary': 'media', 'aria-label': 'Media pengajuan' });
    } },
  };
  const actualModules = {
    '@/src/domain/review-read-contract': '../src/domain/review-read-contract.ts',
    '@/src/domain/review-ui': '../src/domain/review-ui.ts',
    '@/src/domain/publication-display': '../src/domain/publication-display.ts',
    '@/src/domain/review-presentation': '../src/domain/review-presentation.ts',
  };
  function componentRequire(name) {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === './review-request') return requestExports;
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (Object.hasOwn(actualModules, name)) return require(fileURLToPath(new URL(actualModules[name], import.meta.url)));
    throw Error(`Unexpected component import; review the new boundary: ${name}`);
  }
  factory(componentRequire, { exports }, exports);
  const before = hash(initial), detailBefore = hash(initial.detail), originalChecksum = initial.checksum;
  deepFreeze(initial);
  const markup = renderToStaticMarkup(h(exports.ReviewDetail, { initial, returnTo, operatorKey: 'rendered-unit-only' }));
  assert.equal(hash(initial), before, 'render must not alter the input snapshot');
  assert.equal(hash(initial.detail), detailBefore, 'render must not strip central_synced from the signed detail');
  assert.equal(initial.checksum, originalChecksum, 'render must not alter the supplied checksum');
  assert.equal(boundaries.decisions.length, 1);
  assert.equal(boundaries.decisions[0].review, initial, 'decision boundary must receive the same submitted snapshot');
  return { markup, boundaries };
}

function actualRecord(markup) {
  const content = markup.match(/<dl class="sj-record">([\s\S]*?)<\/dl>/)?.[1];
  assert.ok(content, 'actual ReviewDetail definition list must be rendered');
  const rows = [...content.matchAll(/<dt>([^<]*)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)];
  return Object.fromEntries(rows.map(row => [row[1], row[2]]));
}
function assertNoSynchronizationClaim(markup) {
  assert.doesNotMatch(markup, /Sudah tersinkron|Tersinkron saat diajukan|central_synced|Diterima SJ|Tampil saat dicek/i);
}

for (const [action, target, state] of lifecycles) {
  for (const centralSynced of [false, true]) {
    test(`rendered ${action}/${target} central_synced=${centralSynced}: omit misleading row, preserve snapshot facts`, () => {
      const initial = lifecycleReview(action, target, state, centralSynced);
      const { markup, boundaries } = renderReview(initial);
      assertNoSynchronizationClaim(markup);
      assert.deepEqual(actualRecord(markup), {
        Permintaan: reviewLabels[action], 'Data terkait': 'Objek snapshot lama',
        'Status saat diajukan': bankSnapshotStateLabel(state), 'Alasan bank': initial.detail.reason,
        'Publikasi terdampak': '0', 'Media terdampak': '0',
      });
      assert.match(markup, /Data yang diajukan/);
      assert.match(markup, /Kendala pada pengajuan/);
      assert.match(markup, /Kendala pengajuan tetap terlihat\./);
      assert.match(markup, /aria-label="Media pengajuan"/);
      assert.equal(boundaries.media.length, 1);
      assert.equal(boundaries.media[0].media, initial.detail.media);
      assert.equal(boundaries.media[0].reviewId, initial.id);
      assert.equal(initial.detail.central_synced, centralSynced, 'contract field remains available to the untouched data layer');
    });
  }
}

test('rendered superseded lifecycle retains old snapshot/version and exact latest-version navigation', () => {
  const initial = lifecycleReview('ARCHIVE_PUBLICATION', 'PUBLICATION', 'UNPUBLISHED', true, {
    state: 'SUPERSEDED', sourceVersion: 1,
    versions: { submitted: 1, latestReceived: { id: ids.latest, version: 2 },
      bankCurrent: null, bankCurrentAvailability: 'NOT_AVAILABLE' },
    actions: ['approve', 'request_revision', 'reject'].map(action => ({ action,
      allowed: false, reasonCode: 'SNAPSHOT_SUPERSEDED', reason: 'Ada pengajuan yang lebih baru.', requiresReason: true })),
  });
  const { markup } = renderReview(initial, { returnTo: '/monitoring?group=lifecycle&state=all' });
  assertNoSynchronizationClaim(markup);
  assert.equal(actualRecord(markup)['Data terkait'], 'Objek snapshot lama');
  assert.equal(actualRecord(markup)['Status saat diajukan'], 'Publikasi ditarik di bank');
  assert.match(markup, /Data versi lama yang diajukan/);
  assert.match(markup, /Versi 1/);
  assert.match(markup, /Pengajuan ini sudah digantikan versi 2\./);
  assert.match(markup, /Sudah digantikan/);
  assert.ok(markup.includes(`href="/reviews/${ids.latest}?returnTo=%2Fmonitoring%3Fgroup%3Dlifecycle%26state%3Dall"`));
  assert.match(markup, /Kembali ke monitoring/);
});

test('rendered partial lifecycle retains zeros, empty media and unresolved application outcome', () => {
  const initial = lifecycleReview('REVOKE_CONTACT', 'CONTACT', 'VERIFIED', false, {
    commandId: ids.command, commandState: 'UNKNOWN', commandDecision: null, commandResultCode: 'DISPATCH_LEASE_EXPIRED',
  });
  initial.detail.blockers = [];
  const { markup, boundaries } = renderReview(initial);
  assertNoSynchronizationClaim(markup);
  assert.equal(actualRecord(markup)['Publikasi terdampak'], '0');
  assert.equal(actualRecord(markup)['Media terdampak'], '0');
  assert.deepEqual(boundaries.media[0].media, []);
  assert.match(markup, /Penerapan keputusan: Penerapan belum pasti\./);
  assert.doesNotMatch(markup, /Diterapkan di bank|Kendala pada pengajuan/);
});

test('source-only guard retains refresh error branch; error transition is NOT rendered/browser proof', () => {
  assert.match(componentSource, /catch \{ setError\("Pengajuan belum berhasil diperbarui\. Data di bawah adalah hasil pemuatan sebelumnya\."\)/);
  assert.match(componentSource, /\{error\?<p role="alert" className="sj-error">\{error\}<\/p>:null\}/);
  assert.match(componentSource, /AbortSignal\.timeout\(15000\)/);
});
