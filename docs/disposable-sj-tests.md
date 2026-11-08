# Integrasi SJ disposable (pengganti dua tes legacy)

Jalankan dari Control: `node --test --test-concurrency=1 tests/control-adapter-integration.test.mjs tests/central-review-full-flow.test.mjs`.
Keduanya juga termasuk `npm test`. Tidak ada flag opt-in atau skip senyap.
Prasyarat yang tidak tersedia menghasilkan FAIL, bukan PASS/SKIP.

## Prasyarat dan isolasi

- Checkout bank berada di sibling `../backend-production`, beserta dependency terpasang.
- Harness lintas aplikasi bank saat ini memakai checkout Control/SJ pada drive D
  yang diperiksa di source harness. Ini runner integrasi workspace lokal, bukan
  runner portable atau bukti deployment.
- Docker lokal dan scanner ClamAV dengan marker yang diverifikasi oleh
  `backend-production/scripts/run-sj-isolated-tests.js` harus siap.
- Launcher tidak memuat .env/.env.local, tidak menerima URL database/Redis/storage
  existing, dan hanya meneruskan environment infrastruktur yang diizinkan.
- Setiap test membuat run baru: container PostgreSQL/Redis tmpfs, marker+token,
  database bank/Control/SJ terpisah, role runtime non-owner/non-superuser/non-BYPASS,
  storage dan integration origin loopback milik run.
- Database operational tidak direset. Fixture bisnis melalui API/service sah.
  Provisioning akun/izin bank khusus tes bukan transisi status bisnis. Akun
  Control memakai internal_operator, bukan reviewer/observer dengan grant lama.
  Tidak ada verifikasi identitas manusia manual atau probe publik Control;
  pengamatan publik bank dan akses API publik SJ tetap berbeda dari keputusan.
- Cleanup memverifikasi ownership dan hanya menghapus resource milik run.
  Report/proof tetap di direktori temporer run untuk diagnosis/recovery.

## Cakupan yang dipindahkan

| Legacy | Pengganti |
|---|---|
| control-adapter-integration: signed snapshot, media reviewer, signed ACK, repeat dispatch | Peer Control/SJ nyata dalam owned harness; private media diambil melalui service reviewer; signature ACK dicabut sebagai fault khusus tes dan harus ditolak; retry signed ACK pulih; repeat terminal tidak menambah dispatch attempt |
| central-review-full-flow: profil/kontak/foto, revisi dan approval publikasi, reconfirm reject/approve, withdrawal revision/resubmit, archive/revoke/hide | Alur resmi bank API → Control → SJ, empat kategori, last-public vs draf, signature/version/authority, scanner nyata clean/EICAR, penarikan dan lifecycle negatif |

Full-flow ini menguji API/service dan URL publik, **bukan rendering HTML website
SJ atau login operator melalui browser**. Assertion HTML legacy terhadap server
existing tidak dipertahankan sebagai bukti palsu; verifikasi browser/production
build merupakan gate terpisah dengan target dan bukti sendiri. ACK tetap
berbeda dari pengamatan publik pada waktu tertentu.

File lama yang membaca database existing sudah diganti, bukan sekadar
diaktifkan melalui RUN_* flags. Salinan historis dipertahankan dalam checkpoint
lokal di luar release. Jangan memakai ulang cleanup SQL legacy.
