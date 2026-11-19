# Akses internal tunggal

Keputusan pengguna 3 Oktober 2026 menggantikan pembagian role pada dokumentasi historis. Satu role aktif: `internal_operator` (Operator internal). Semua akun aktif Control memperoleh semua tindakan yang tersedia pada seluruh instansi yang terdaftar; bukan hanya instansi yang dahulu dialokasikan ke akun tersebut.

## Akun dan halaman

- Login tetap username/password, session server, CSRF, same-origin dan rate limit. Tidak ada signup publik.
- Buat akun tetap di `/operators`: nama, username dan password. Tidak ada pilihan role atau instansi. Pembuatan akun juga boleh dilakukan sebelum registry berisi instansi.
- Semua akun aktif dapat melihat direktori akun dan membuat akun berikutnya. Akun nonaktif tidak dapat login. Self-revocation sesi melalui API pengelolaan ditolak; keluar sendiri melalui logout.
- `/`, `/reviews`, detail `/reviews/[reviewId]`, `/monitoring`, `/monitoring/pengiriman`, `/monitoring/pemrosesan` dan `/operators` tidak lagi dibedakan menurut role lama.
- Kapabilitas di luar scope SJ, feature flag integrasi yang belum aktif, authority local, koneksi belum dikonfigurasi dan pekerjaan yang tidak memenuhi syarat tetap tidak dibuka. Akses penuh tidak berarti boleh mengarang fungsi atau keberhasilan.

## Penjagaan server

`src/domain/authorization.ts` hanya mengenal satu role. `registeredInternalScopes` memproyeksikan ID instansi aktual dari registry untuk akun aktif; tidak memakai wildcard atau grant dari browser. Transaksi keputusan/recovery/mengelola akun memeriksa ulang akun dan sesi di database. Instansi target, versi, checksum, signature, idempotency, optimistic locking dan larangan self-review tetap berlaku. Menjadi operator internal tidak menghilangkan identitas pengambil keputusan.

Role database PostgreSQL runtime/migration adalah kredensial teknis, bukan pilihan role pengguna. Pemisahan least-privilege database tetap dipertahankan.

Runtime, migrasi, verifikasi database, bootstrap operator, dan registrasi instansi memakai `CONTROL_DATABASE_SSL` yang sama. Jika variabel tidak disetel, default-nya `disable`. Mode `require` memakai TLS tanpa verifikasi sertifikat server. Mode `verify-full` memakai TLS dengan verifikasi sertifikat dan identitas server. Tetapkan mode di variabel tersebut dan singkirkan parameter mode yang bertentangan dari kedua URL database. Untuk CA khusus pada mode `verify-full`, `sslrootcert` pada URL tetap menunjuk ke berkas sertifikat. Parameter TLS ambigu, duplikat, atau tidak valid ditolak sebelum koneksi.

## API akun

`POST /api/operators`: hanya `{username, displayName, password}`; field role/instansi tambahan ditolak. Role ditentukan server/database. Direktori internal tidak mengembalikan credential atau grant historis. Endpoint lama `POST /api/instances/[instanceId]/operator-grants` dihentikan: sesi+CSRF yang sah menerima 410 `ROLE_MANAGEMENT_REMOVED`, bukan sukses palsu. Revokasi sesi tetap melalui API existing dengan ID instansi terdaftar dan operator target eksplisit.

## Transisi database

Migration additive `0014_single_internal_role.sql` menetapkan role tunggal pada akun existing, menonaktifkan grant lama tanpa menghapus catatannya, mencabut sesi lama agar pengguna login ulang dan menulis audit migrasi. Credential, username, status akun, snapshot dan keputusan tidak dihapus. Constraint menolak role akun selain internal dan aktivasi grant lama. Migrator mencabut hak tulis runtime atas grant historis.

Jangan mengedit migration 0001–0013 atau reset database. Backup dan verifikasi target lokal sebelum menerapkan 0014. Schema lama tidak boleh dianggap siap oleh readiness. Jangan menyamakan bukti disposable dengan migration database normal yang sudah diterapkan.

## Tes dan preview aman

Baca script sebelum menjalankan. `node scripts/control-disposable-check.mjs --review-api --dispatch --evidence --read-contract` menggunakan PostgreSQL tmpfs milik run, role non-superuser/non-BYPASSRLS, marker kepemilikan, key dan tujuan double milik run. Nama database saja bukan bukti isolasi. Entry point auth/monitoring integration lama sekarang meneruskan ke harness ini; tidak membaca credential cluster existing.

Gunakan hanya preview Control `http://127.0.0.1:4320`, jangan beralih port ketika terpakai. Catat API double/database pendukung secara terpisah. Tutup preview dan resource milik tugas setelah inspeksi. Browser memeriksa form tiga field, kesetaraan akses, keputusan/recovery, keyboard, fokus, loading/error dan lima viewport. Integrasi bank/SJ nyata tidak digantikan oleh double.

Setelah preview kandidat berjalan dan targetnya telah diverifikasi, `node scripts/runtime-smoke.mjs --existing-preview` memeriksa health/readiness schema 0016, login, proteksi anonim, 404, header dan aset pada URL yang sama. Tanpa opsi tersebut tes menolak berjalan; tidak membuka port alternatif. `db:status` dan `db:verify` kini hanya membaca; tetap periksa target dan script sebelum menjalankan `check:operational`.

Verifikasi identitas lintas akun/issuer dihentikan menurut keputusan pengguna 5 Oktober 2026. Migration additive `0016_retire_identity_and_public_observation.sql` memindahkan bukti lama ke schema audit yang tidak dapat diakses runtime. Tidak ada API/form binding aktif. Larangan self-review hanya membandingkan qualified subject pemeriksa dengan kontributor snapshot dan actor payload; ini **tidak membuktikan** dua akun/issuer berbeda dimiliki manusia berbeda. Jangan mencocokkan nama/email atau membuat binding operasional diam-diam. Auth, CSRF, authority, scope instansi, versi, signature dan idempotency tetap berlaku.

Bukti, screenshot, hasil run dan checkpoint disimpan di luar repository kandidat. Hasil lokal bukan izin produksi.
