# Ruwang Control — status fondasi dan arah UI 0.2

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

> Baseline historis. Kondisi terkini RC-SJ-11, batas bukti dan pekerjaan terbuka: [control-sj-current.md](control-sj-current.md). Angka migration/dependency serta daftar kemampuan di bawah menggambarkan tahap fondasi, bukan inventaris final.

Tanggal: 10 September 2026. Status: fondasi aplikasi, auth operator, adapter snapshot/command/ack bank, antrean pemeriksaan, akses media reviewer, dan monitoring read-only pipeline SJ tersedia lokal. Alur disposable profil, kontak dan publikasi hingga tampil pada SJ lokal sudah lulus; removal/reconfirm dan koneksi produksi belum tersedia. UI 0.1 tetap ditolak dan hanya arsip historis.

## Hasil tahap ini

- Aplikasi Next.js operasional lokal berjalan di `127.0.0.1:4320` ketika dimulai; `dist` 0.1 bukan runtime aktif.
- API health, readiness dan dashboard membaca database Control yang nyata.
- PostgreSQL lokal terisolasi memakai database `ruwang_control`, role migration terpisah, serta role runtime non-superuser/BYPASSRLS dengan write allowlist hanya untuk auth, session, grant dan audit.
- Lima migration membuat tabel domain, auth Control, command/ack dispatcher, registry/polling/observasi monitoring, serta snapshot privat/nonce tanpa seed atau data contoh.
- Login operator memakai username dan password scrypt; cookie sesi tidak menyimpan identitas mentah, mutasi dilindungi origin/CSRF dan login dibatasi rate limit persisten. TOTP/2FA tidak digunakan pada alur aktif sesuai keputusan pengguna.
- Domain TypeScript untuk akses per instansi, pemeriksaan keputusan, monitoring status/freshness, dan metadata audit.
- Monitoring read-only memakai sumber bank/pusat bertanda tangan, timeout, polling terbatas, backoff, replay ledger, ukuran respons terbatas, dan hanya menyimpan status/kedalaman antrean minimum. Tidak menyediakan shell, SQL, restart, secret, uptime, atau grafik buatan.
- Spesifikasi arsitektur, kontrak keputusan yang diusulkan, model data, serta batas implementasi berikutnya.
- Pengujian otomatis atas keputusan ditolak, akses lintas bank, versi basi, dan penyajian file preview.

Spesifikasi [design-system.md](design-system.md) revisi 0.2 merupakan acuan desain aktif: dashboard putih netral, Inter, aksen biru royal dan primitive Radix yang ditata khusus Control. Runtime menggunakan TypeScript, React/Next.js dan Node.js dengan PostgreSQL khusus Control. Domain TypeScript tetap tidak bergantung framework. Shell ini belum membuktikan auth operator atau integrasi bank.

Jalankan `npm ci`, `npm run db:local:setup`, `npm run db:migrate`, lalu gate terarah dan `npm run check:operational`. Gunakan `npm run dev` atau build standalone melalui `npm run build && npm start`. Semua runtime lokal bind ke loopback; login operator, snapshot privat dan pengiriman command bertanda tangan ke target loopback terdaftar tersedia ketika flag tes diaktifkan. Authority pusat hanya dibuktikan pada instance disposable; koneksi VPS tidak tersedia.

## Batas cakupan

Fokus pertama: pemeriksaan profil BPRS, kontak publik dan publikasi SJ, identitas operator pusat, permission per instansi, audit keputusan, dan bentuk awal daftar instansi. Halaman monitoring membaca registry/database nyata; tanpa sumber terdaftar ia menampilkan state belum terhubung yang jujur.

Request penghapusan/penarikan SJ belum diimplementasikan. Perpindahan authority profil, kontak dan publikasi sudah fail-closed per bank dan memerlukan perubahan terkoordinasi pada konfigurasi/DB bank serta registry Control; default tetap lokal. Perubahan UI bank dibatasi modul SJ. Akun bank/recovery/delete akun, pengaduan email dan monitoring umum tetap Coming soon, disabled serta diblokir route/API. Deployment merupakan tahap terpisah. Rincian matriks izin dan gap ada di sj-v1-scope.md.

Source backend Ruwang diubah minimum untuk snapshot, adapter internal dan endpoint monitoring SJ. API/worker pusat SJ sebelumnya diubah minimum untuk monitoring dan heartbeat; tahap pemeriksaan tidak mengubah kontrak publik pusat. Frontend Ruwang hanya berubah pada tiga file modul SJ agar mode pusat menjadi read-only. Database Control lokal hanya menerima migration baru dan fixture integration dibersihkan; tidak ada reset, seed runtime, push atau deployment.

## Peta berkas

| Berkas | Peran |
| --- | --- |
| `AGENTS.md` | Urutan baca dan batas pekerjaan untuk sesi berikutnya |
| `docs/handoff.md` | Status aktual, keputusan UI baru dan langkah implementasi berikutnya |
| `docs/sj-v1-scope.md` | Scope SJ-only, audit kontrak, izin, request removal dan gate |
| `docs/source-evidence.json` | SHA, status modified/untracked dan checksum checkpoint adapter aktif |
| `docs/source-evidence-before-review-adapter.json` | Baseline read-only sebelum perubahan adapter; tidak ditimpa |
| `docs/architecture.md` | Aliran pemeriksaan, trust boundary, data dan rollout |
| `docs/design-system.md` | Spesifikasi UI dashboard 0.2, acuan aktif |
| `app/` dan `components/` | Runtime Next.js, endpoint API dasar, system state dan shell dashboard aktif |
| `migrations/0001_initial_control.sql` | Schema awal database Control tanpa seed |
| `migrations/0002_operator_auth.sql` | Operator, credential, grant, session, rate limit dan audit keamanan tanpa seed |
| `migrations/0003_bank_review_adapter.sql` | Registry target adapter, command/outbox, acknowledgment dan nonce ledger tanpa seed |
| `migrations/0004_sj_monitoring.sql` | Registry sumber, state polling, nonce respons dan observasi minimum tanpa seed |
| `migrations/0005_private_review_snapshots.sql` | Snapshot pemeriksaan privat, envelope/digest dan nonce ingress tanpa seed |
| `contracts/review-snapshot.schema.json` | Kontrak snapshot profil, kontak dan publikasi, hanya data publik serta media READY |
| `src/server/review-snapshot-ingress.ts` dan `src/server/reviews.ts` | Ingress bertanda tangan, antrean/detail, media reviewer dan status visibilitas publik |
| `src/server/monitoring.ts` | Polling read-only terautentikasi, timeout, backoff, freshness dan proyeksi per grant |
| `scripts/local-postgres.mjs` | Klaster PostgreSQL lokal terisolasi dan credential ignored |
| `scripts/migrate.mjs` | Migrator checksum-aware dengan role migration terpisah |
| `contracts/review-command.schema.json` dan `review-ack.schema.json` | Kontrak V1 command/ack approve atau revision yang ditandatangani |
| `src/server/review-adapter.ts` | Enqueue, allowlisted dispatch, idempotency, timeout UNKNOWN dan verifikasi acknowledgment |
| `src/domain/authorization.ts` | Kebijakan permission deny-by-default per instansi |
| `src/domain/review.ts` | Validasi pra-pengiriman keputusan |
| `src/domain/audit.ts` | Proyeksi metadata audit yang dibatasi |
| `dist/` | Arsip preview 0.1 yang ditolak; bukan runtime operasional |
| `tests/` | Uji kebijakan, konfigurasi, error, migration dan batas preview |

## Kelanjutan implementasi yang diperlukan

1. Lengkapi request removal/reconfirm beserta impact, keputusan, eksekusi dan verifikasi hilang dari publik.
2. Lengkapi recent re-auth untuk perubahan akses dan onboarding operator berikutnya; bootstrap pertama sudah tersedia tanpa credential default/signup publik.
3. Lengkapi retry scheduler/rekonsiliasi operasional di atas outbox dan ledger yang sudah tersedia; pertahankan UNKNOWN untuk timeout.
4. Uji UI pemeriksaan dengan browser pada state panjang, error/offline, keyboard, fokus dan conflict sebelum aktivasi.
5. Jalankan shadow read-only satu bank. Setelah removal/reconfirm dan seluruh gate produksi terpenuhi, pindahkan authority secara eksplisit untuk instansi itu; ulangi per bank.

Tes lokal membuktikan snapshot/command/ack profil-kontak-publikasi, media reviewer, revisi wajib catatan, status PENDING/APPLIED/visible, idempotency, monitoring signature/replay/freshness/backoff, RLS runtime dan cleanup fixture pada database terisolasi. Tes tersebut belum membuktikan konektivitas lima sumber live, pemetaan identitas lintas sistem di luar subject berkualifikasi, removal/reconfirm, ketahanan proses jangka panjang atau kesiapan produksi.
