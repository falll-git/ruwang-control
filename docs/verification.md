# Verifikasi fondasi lokal — 10 September 2026

> **ARSIP HISTORIS — bukan panduan akses atau hasil gate terkini.** Rekonsiliasi 7 Oktober 2026: pembagian role/grant di bawah telah digantikan satu internal_operator. Verifikasi identitas manual dan pemeriksaan publik Control dihentikan; dua akun berbeda tidak membuktikan dua orang berbeda. Ikuti [indeks dokumentasi](documentation-index.md), [akses aktif](control-internal-access.md) dan [keputusan produk](control-simplification.md). Instruksi, gap dan hasil tes di bawah dipertahankan sebagai sejarah, bukan backlog untuk mengembalikan fitur atau bukti kandidat terbaru.

## Pembaruan autentikasi password-only — 11 September 2026

Keputusan pengguna terbaru mengganti login email+TOTP menjadi username+password. Migration 0006 menghapus credential TOTP dari schema aktif, sesi memakai `authenticated_at`, dan pembuatan operator berikutnya hanya tersedia bagi pengelola akses Control. Catatan MFA di bagian historis di bawah menjelaskan gate versi lama dan bukan perilaku runtime saat ini.

## Checkpoint adapter command/ack pemeriksaan

- Audit pemulihan memastikan patch backend dan Control utuh, tidak ada conflict marker/file terpotong, serta tidak ada proses test yang tertinggal. `D:/ruwang-control` tetap bukan repository Git; backend berada pada HEAD `013d8c7e1f3f4b7c58aaba44e56b98b6619f1dbe` dengan perubahan adapter yang belum di-commit.
- Control menambah kontrak V1 command/ack, migration `0003_bank_review_adapter.sql`, dispatcher allowlisted, API create/query command, signature Ed25519, expiry, nonce/replay guard, idempotency, version/checksum conflict, timeout `UNKNOWN`, dan verifikasi acknowledgment bertanda tangan.
- Backend Ruwang menambah `review_authority` default `local`, external actor berkualifikasi, ledger command/nonce, endpoint internal bertanda tangan, serta domain application profil/kontak/publikasi tanpa token Admin bank atau credential SQL bank. App/worker role tidak memperoleh akses ledger; system role lokal non-superuser yang tervalidasi menjalankan adapter.
- Gate akhir: backend full test dan syntax 479 file lulus, Prisma validate/generate/status 131 migration lulus, RLS verifier lulus dengan rollback; Control lint/typecheck, 48 unit pass + 1 integration gated, build standalone, status/verify database 3 migration dan runtime smoke lulus. Gated integration Control dan backend masing-masing lulus pada database lokal terisolasi; replay, duplicate command, version conflict, signed acknowledgment dan cleanup fixture diverifikasi. Database Control normal berisi 0 row setelah tes.
- Frontend Ruwang, web/API pusat SJ dan VPS tidak disentuh. Tidak ada commit, push atau deployment. Authority pusat tetap nonaktif.
- Belum tersedia: snapshot privat bank ke Control, akses media reviewer, pemetaan identitas orang lintas sistem, removal/reconfirm, retry scheduler/monitoring live dan integrasi SJ end-to-end. Karena itu UI antrean nyata dan flow pusat lengkap belum boleh diklaim selesai.

## Checkpoint auth operator Control

- Audit sebelum edit lulus: 39/39 tes lama, TypeScript, migration status, database verifier dan integrity; tidak ditemukan source terpotong atau conflict marker. `D:/ruwang-control` belum repository Git, sehingga perubahan dilacak dengan file/checksum, bukan klaim Git diff.
- Migration baru `0002_operator_auth.sql` diterapkan setelah checksum migration 0001 dipertahankan. Status akhir 2 applied, 0 pending. Database normal tetap 0 row; tidak ada operator, instance atau fixture runtime.
- Role runtime tetap non-superuser, tanpa CREATEDB/CREATEROLE/BYPASSRLS. Runtime dapat SELECT dan hanya mendapat write allowlist untuk session, MFA counter, rate limit, security audit dan grant; INSERT instance/operator tetap ditolak.
- Login password+scrypt dan TOTP, enkripsi MFA AES-256-GCM, cookie session, idle/absolute expiry, revocation, logout, origin/CSRF, rate limit persisten, empat role per instansi, self-escalation denial serta audit sensitif telah diimplementasikan.
- Bootstrap operator pertama bersifat CLI interaktif, memerlukan instance key nyata, tidak menerima password lewat argumen/environment, tidak menyediakan signup/default credential, dan menolak bootstrap kedua.
- Gate akhir tahap auth: lint dan TypeScript lulus; unit/policy/config/migration 44/44 lulus; production build standalone lulus; runtime smoke lulus; E2E database disposable membuktikan login MFA, CSRF, rate limit, cross-bank denial, forbidden endpoint, self-escalation denial, expiry, revocation, logout dan audit persisten. Database tes dihapus setelah run.
- Satu build awal gagal `EBUSY` karena runtime Control lama masih memegang `.next/standalone`; PID dan command diverifikasi, runtime tersebut dihentikan, lalu build ulang lulus. Dua assertion redirect awal juga dikoreksi setelah respons Next streaming terbukti memakai meta redirect 307 di HTML; API dashboard tetap mengembalikan 401 untuk sesi anonim.
- Belum diimplementasikan: adapter/authority bank, snapshot/ack/removal runtime, onboarding operator kedua melalui UI/API, recovery/reset password, recent re-auth khusus perubahan akses, integrasi SJ dan deployment. Tidak ada perubahan VPS, commit, push, atau repo Ruwang/SJ pada tahap ini.

## Bukti fondasi operasional lokal 0.2 sebelum auth

- Dependency terverifikasi dan terkunci: Next.js 16.3.4, React 19.3.0, TypeScript 5.9.3, PostgreSQL client 8.23.0 dan Zod 4.6.0. `npm audit --audit-level=high` melaporkan 0 vulnerability.
- Lint dan TypeScript lulus. Unit/policy/config/error/migration lulus 39/39 tanpa skipped atau cancelled.
- Production build standalone lulus; static CSS/JavaScript disalin ke artefak standalone dan dapat dilayani.
- Database lokal `ruwang_control` dimulai dari kosong, migration `0001_initial_control.sql` diterapkan dan rerun idempotent. Status akhir: 1 applied, 0 pending.
- Role runtime terbukti bukan superuser, tidak memiliki CREATEDB/CREATEROLE/BYPASSRLS, hanya SELECT pada schema Control, dan INSERT ditolak dengan permission error. Seluruh tabel aplikasi berisi 0 row; tidak ada seed/dummy.
- Smoke runtime lulus: `/api/health`, `/api/readiness`, `/api/dashboard` masing-masing 200, route tidak dikenal 404, dan 10 aset build berhasil dimuat.
- Saat database dihentikan terkontrol, health tetap 200, readiness/dashboard 503 `DATABASE_UNAVAILABLE`, halaman memakai error state, dan respons tidak membocorkan URL/port/password. Database dinyalakan kembali dan readiness pulih 200.
- Policy kernel `authorization.ts`, `review.ts`, `audit.ts` serta `policy.test.mjs` sama byte-for-byte dengan baseline sebelum implementasi.
- Satu kegagalan build `EBUSY` terjadi karena server smoke manual masih memegang artefak `.next/standalone`; server dihentikan, artefak dibangun ulang, lalu full gate lulus. Tidak ada source terpotong atau migration parsial.

Belum diuji pada tahap ini: visual/browser interaktif lintas viewport, auth operator/MFA, adapter bank, command/ack, authority pusat, workflow SJ, VPS, deployment atau hosting. `dist` dan laporan preview di bawah adalah bukti historis 0.1, bukan runtime aktif.

## Checkpoint terbaru — penguncian scope SJ-only

Pada 10 September 2026 (lokal), audit source dan riwayat tool mengonfirmasi patch gabungan sebelumnya ditolak; hanya AGENTS.md yang sempat diperbarui. Handoff/arsitektur masih lama dan sj-v1-scope.md belum ada. Kelanjutan menyelesaikan dokumen tersebut, bukan membuat ulang kode runtime. Penyebab disconnect jaringan tidak dapat dibuktikan dari pemeriksaan ini.

Perubahan step dokumentasi: AGENTS.md, architecture.md, handoff.md, foundation.md, design-system.md dan laporan ini; ditambahkan sj-v1-scope.md. Cakupan SJ-only, matriks izin, request penghapusan, backlog akun/recovery dan batas kontrak terdokumentasi. Instruksi wajib prototype/persetujuan wireframe dihapus. Dokumen design-system/foundation ikut diperbarui untuk menghilangkan pertentangan dengan handoff.

Pemeriksaan ulang npm run check selesai exit 0: TypeScript, 30/30 tes fondasi (0 fail/skip/cancel), syntax JS, referensi aset, UTF-8/JSON, tanpa file kosong/NUL/conflict marker dan kecocokan SHA/status/checksum source pembanding. Ini hanya gate fondasi yang ada, bukan pengujian integrasi SJ pusat yang belum diimplementasikan. Tidak menjalankan tes browser/production build/deploy pada perubahan dokumentasi ini.

Checksum sebelum/sesudah dipakai karena D:/ruwang-control belum repository Git. Tidak mengubah runtime, tes, dependency/lockfile, JSON contract atau source-evidence.json; tidak mengubah tiga repo pembanding, database atau VPS. Pemeriksaan source bukan bukti kondisi VPS terbaru. Tidak ada hasil tes running yang diklaim selesai; gate lokal mengembalikan exit code final.

Kekurangan yang tetap terbuka: auth/MFA/database/adapter Control, kontrak snapshot/ack/removal/reconfirm, external actor/authority pusat, consumer penghapusan profil dan runtime permission/Coming soon. Purge fisik bukan archive, kebijakannya belum disepakati. Langkah berikutnya hanya fondasi operasional pada handoff.md, bukan langsung mengaktifkan bank atau menyentuh produksi.

## Bukti historis preview 0.1

CATATAN STATUS: laporan ini adalah bukti pengujian teknis preview 0.1. Pengguna kemudian menolak desain visualnya. Hasil tes di bawah tidak merupakan persetujuan UI, dan tidak membuktikan UI dashboard 0.2 yang belum dibangun. Acuan aktif berikutnya adalah design-system.md dan handoff.md.

## Checkpoint pemulihan

Riwayat tool sebelumnya berhenti pada inspeksi dialog simulasi permintaan revisi. Source, dependency terpasang, source-evidence.json dan proses preview masih tersedia ketika pekerjaan dilanjutkan. Preview ditemukan sebagai satu listener 127.0.0.1:4318, PID 17264. Penyebab putusnya jaringan tidak diketahui; tidak ada operasi database, migration, login bank, publikasi atau deployment pada pekerjaan fondasi ini.

Ketiga repo pembanding tetap pada SHA dan checksum dalam source-evidence.json, dengan status Git kosong. Skrip check-integrity.mjs membandingkan ulang hasil aktual terhadap baseline tersebut.

## Temuan dan perubahan minimum pada lanjutan

1. Searchbox tidak memiliki accessible name: tambahkan aria-label pada dist/index.html.
2. Native dialog memindahkan fokus ke BODY pada akhir siklus Tab: tambahkan penanganan Tab/Shift+Tab pada batas dialog di dist/app.js. Tetap memakai dialog native.
3. Skip link memakai fragment #content yang juga dibaca router: fokuskan main tanpa mengganti fragment agar halaman aktif dipertahankan. Diuji pada Jejak audit.
4. contracts/review-command.schema.json kekurangan penutup object pada allOf: tambahkan satu karakter `}`. Patch terdahulu sudah memperlihatkan kesalahan yang sama; tidak dapat diatribusikan ke disconnect.
5. Tambahkan scripts/check-integrity.mjs ke npm run check: UTF-8 valid, file tidak kosong/NUL/conflict marker, parse semua JSON, syntax JS/MJS, serta kecocokan SHA/status/checksum tiga repo referensi.

## Hasil otomatis

- TypeScript: lulus.
- Unit/policy dan batas HTTP preview: 30/30 lulus, tidak ada skipped/cancelled.
- Syntax JavaScript dan referensi aset lokal: lulus.
- Dependency audit: 0 vulnerabilities pada waktu pemeriksaan.
- Integrity: lulus setelah koreksi JSON; mencakup file fondasi di luar node_modules.
- git diff --check pada ketiga repo pembanding: lulus, tidak ada perubahan source di repo tersebut.

## Hasil browser lokal

Inspeksi memakai in-app browser. Tab QA terpisah dibuat untuk menyelesaikan pengujian dan ditutup setelah selesai; tab preview pengguna dipertahankan.

- Mode awal menampilkan unconnected, bukan klaim antrean kosong dari server.
- Mode simulasi menampilkan tiga jenis pengajuan: profil, publikasi, kontak.
- Filter jenis, pencarian tidak cocok dan hapus pencarian lewat keyboard bekerja. Operasi fill string kosong pada kontrol browser sempat tidak mengosongkan input; penghapusan via Ctrl+A/Backspace berhasil tanpa perubahan aplikasi.
- Revision tanpa catatan ditolak inline dan fokus ke textarea; body overflow hidden saat dialog terbuka.
- Revision dengan catatan dan approval tanpa catatan menghasilkan audit simulasi dan menonaktifkan keputusan ulang pada item itu.
- Escape, Batal, tombol tutup, focus return, dan perpindahan Tab/Shift+Tab pada batas dialog diperiksa. Setelah submit, fokus pindah ke row antrean karena tombol keputusan menjadi disabled.
- Label pencarian terbaca sebagai Cari pengajuan atau instansi.
- Akhiri simulasi membersihkan audit simulasi dan reset state lokal. Reload kembali ke mode unconnected.
- Skip link pada Jejak audit mempertahankan #audit dan fokus ke main.
- Console tab QA: tidak ditemukan warning/error dalam hasil log yang diperiksa.

Reflow detail publikasi dengan judul panjang:

| Viewport CSS px | clientWidth | scrollWidth |
| --- | --- | --- |
| 320 | 305 | 305 |
| 390 | 375 | 375 |
| 430 | 415 | 415 |
| 768 | 753 | 753 |
| 1440 | 1425 | 1425 |

Selisih 15 px berasal dari scrollbar vertikal pada browser pengujian. Keempat halaman juga mempunyai scrollWidth = clientWidth pada 320 px. Dialog revisi pada 320 × 740 berukuran 288 × 613.95 px, batas kiri 16 dan kanan 304 px; teks validasi dan tombol terlihat. Screenshot desktop dialog, desktop daftar/detail dan mobile 390/320 diperiksa langsung; capture full-page awal memperlihatkan duplikasi stitching sehingga tidak digunakan sebagai bukti tata letak.

## Batas bukti

Reduced motion tersedia sebagai CSS media query; belum diuji dengan pengaturan OS. Zoom 200%, screen reader nyata, browser selain browser pengujian, Linux/Android font fallback dan seluruh matriks aksesibilitas produksi belum diverifikasi. Kontrak command masih draft; parse JSON yang lulus tidak berarti signature/canonicalization/transport terimplementasi atau schema interoperabilitas sudah lolos.

Authentication, MFA, grant persistence, database/RLS Control, audit transaksional, adapter bank, antrean, signature/replay/idempotency runtime, monitoring live dan penghapusan pengguna belum dibuat. Hasil di atas menyelesaikan pemeriksaan fondasi lokal yang sudah dikerjakan, bukan menyatakan produk operasional atau integrasi produksi selesai.
