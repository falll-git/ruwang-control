import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attributeLabels,publicationAttributeValue} from '../src/domain/publication-display.ts';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('publication display uses bank labels, retains zero/null, and never guesses unknown values',()=>{
  assert.equal(attributeLabels.land_area_m2,'Luas tanah (m²)');
  assert.equal(publicationAttributeValue(0),0);assert.equal(publicationAttributeValue(null),null);
  assert.equal(publicationAttributeValue('MANUAL'),'Manual');assert.equal(publicationAttributeValue('NEW_VALUE'),'NEW_VALUE');
});
test('comparison UI is removed without removing snapshot version and superseded navigation',()=>{
  const detail=source('components/reviews/review-detail.tsx');
  assert.doesNotMatch(detail,/getVersions|snapshotComparisonSchema|\/comparison\?against|Pilih versi pembanding/);
  assert.match(detail,/review\.sourceVersion/);assert.match(detail,/review\.versions\.latestReceived/);assert.match(detail,/Buka versi terbaru/);
  assert.match(source('components/review-decision-form.tsx'),/expectedVersion:review\.sourceVersion,expectedChecksum:review\.checksum/);
});
test('account modal keeps explicit guarded submit and does not turn closing into a decision',()=>{
  const form=source('components/operator-management-client.tsx');
  assert.match(form,/ReviewDialog title="Buat akun operator"/);assert.match(form,/submitting\.current/);
  assert.match(form,/form="create-operator-form" type="submit"/);
  assert.match(form,/AbortSignal.timeout\(15000\)/);assert.match(form,/accountReceipt.safeParse/);
  assert.match(form,/submitting.current \|\| uncertain/);assert.match(form,/Periksa daftar akun/);
  assert.match(source('components/reviews/review-dialog.tsx'),/if \(!busy\) onClose\(\)/);
});
test('notification dropdown uses actual scoped count, without unread or delete fiction',()=>{
  const shell=source('components/reviews/review-shell.tsx');
  assert.match(shell,/notif-panel/);assert.match(shell,/count\.value/);assert.match(shell,/state=IN_REVIEW&limit=1/);
  assert.doesNotMatch(shell,/unreadCount|markAsRead|deleteNotification/);
  assert.match(shell,/pointerdown/);assert.match(shell,/focusin/);assert.match(shell,/Escape/);
});
test('logout has bounded requests, a double-submit lock and honest uncertain result',()=>{
  const logout=source('components/logout-button.tsx');
  assert.match(logout,/if \(lock.current\) return/);
  assert.match(logout,/AbortSignal.timeout\(10000\)/);assert.match(logout,/AbortSignal.timeout\(15000\)/);
  assert.match(logout,/sent && !rejected/);assert.match(logout,/Sesi belum bisa dipastikan tertutup/);
});
test('login keeps server authentication and bounds duplicate/uncertain UI requests',()=>{
  const login=source('app/login/login-form.tsx');
  assert.match(login,/if \(lock.current\) return/);assert.match(login,/AbortSignal.timeout\(15000\)/);
  assert.match(login,/loginReceipt.safeParse\(body\)/);assert.match(login,/Hasil masuk belum dapat dipastikan/);
  assert.match(login,/alert.current\?\.focus\(\)/);
});
test('failed media replaces the broken image with a bounded shared state',()=>{
  const media=source('components/reviews/review-media.tsx');
  assert.match(media,/originalFailed\?<SetupEmptyState/);
  assert.doesNotMatch(media,/failed.includes\(selected.source_media_id\)/);
  assert.match(media,/Coba lagi/);assert.match(media,/variant=thumbnail/);
});
test('decision results receive focus after dialog commits, without stealing validation field focus',()=>{
  const decision=source('components/review-decision-form.tsx');
  assert.match(decision,/!busy && !confirm && \(error \|\| outcome\) && document.activeElement !== field.current/);
  assert.match(decision,/resultMessage.current\?\.focus\(\)/);
  assert.doesNotMatch(decision,/requestAnimationFrame\(\(\)=>resultMessage/);
});
