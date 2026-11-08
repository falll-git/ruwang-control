import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {reviewSummarySchema} from '../src/domain/review-read-contract.ts';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('manual identity feature removed, account keeps exactly required credentials and CSRF',()=>{
  for(const path of ['src/server/subject-identity.ts','src/domain/subject-identity.ts','components/identity-verification.tsx','app/api/instances/[instanceId]/identities/route.ts'])
    assert.equal(existsSync(new URL('../'+path,import.meta.url)),false);
  const form=source('components/operator-management-client.tsx');
  assert.doesNotMatch(form,/identityOpen|Verifikasi identitas|humanId/);
  assert.match(form,/name="displayName"/);assert.match(form,/name="username"/);assert.match(form,/name="password"/);
  assert.match(form,/x-csrf-token/);assert.match(form,/submitting.current/);
  assert.doesNotMatch(source('src/server/review-adapter.ts'),/requireSubjectIdentity|IDENTITY_UNVERIFIED/);
});
test('public observation removed end to end without replacing it with a success claim',()=>{
  for(const path of ['src/server/public-evidence.ts','src/domain/public-observation.ts','src/domain/review-delivery.ts'])assert.equal(existsSync(new URL('../'+path,import.meta.url)),false);
  for(const path of ['components/reviews/review-detail.tsx','components/reviews/review-list.tsx','src/server/reviews.ts'])
    assert.doesNotMatch(source(path),/publicEvidence|publicObservation|Pemeriksaan publik terakhir|Tampil saat dicek/);
  assert.ok(!Object.hasOwn(reviewSummarySchema.shape,'publicEvidence'));
  assert.doesNotMatch(source('tests/support/control-fixtures.mjs'),/\/v1\/public\/|public-error|public-absent|public-timeout/);
  const migration=source('migrations/0016_retire_identity_and_public_observation.sql');
  assert.match(migration,/SET SCHEMA control_audit_archive/);assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|TRUNCATE/i);
});
test('refresh, sourced badge, server-numbered pagination and dashboard cards share real contracts',()=>{
  const detail=source('components/reviews/review-detail.tsx');
  assert.doesNotMatch(detail,/SetupActionMenu|Muat ulang pengajuan/);assert.match(detail,/>Refresh</);
  assert.match(source('components/ui/badge.tsx'),/shadcn\/ui Radix Badge/);
  assert.match(source('components/ui/pagination.tsx'),/Arsip src\/components\/ui\/Pagination.tsx/);
  assert.match(source('components/reviews/review-list.tsx'),/data.page.number/);
  assert.match(source('components/reviews/review-list.tsx'),/isLoading=\{busy\}/);
  assert.match(source('components/reviews/review-list.tsx'),/aria-label="Halaman sebelumnya"/);
  assert.match(source('src/server/review-read.ts'),/LIVE_NUMBERED/);
  assert.match(source('app/(control)/page.tsx'),/className="control-work-card"/);
  assert.match(source('src/server/dashboard.ts'),/AS pending_content/);
});
