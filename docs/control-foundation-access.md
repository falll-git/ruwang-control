# Fondasi akses Control — koreksi RC-SJ-10

> **ARSIP HISTORIS — bukan panduan akses atau hasil gate terkini.** Rekonsiliasi 7 Oktober 2026: pembagian role/grant di bawah telah digantikan satu internal_operator. Verifikasi identitas manual dan pemeriksaan publik Control dihentikan; dua akun berbeda tidak membuktikan dua orang berbeda. Ikuti [indeks dokumentasi](documentation-index.md), [akses aktif](control-internal-access.md) dan [keputusan produk](control-simplification.md). Instruksi, gap dan hasil tes di bawah dipertahankan sebagai sejarah, bukan backlog untuk mengembalikan fitur atau bukti kandidat terbaru.

Dokumen ini melengkapi catatan foundation/handoff historis. Status runtime harus dibaca dari konfigurasi dan hasil pemeriksaan aktual, bukan klaim integrasi aktif/nonaktif pada dokumen lama.

## Metrik

`getDashboardSnapshot` menghitung setiap kelompok data dengan scope aksinya sendiri: `instance.read`, `review.read`, dan `monitoring.read`. Memiliki grant pengelola akses pada instansi A tidak memberi izin membaca jumlah pengajuan A. Angka nol pada scope kosong bukan bukti instansi tersebut tidak memiliki pekerjaan. Dashboard menyembunyikan metrik dan tautan pemeriksaan jika tidak memiliki izin baca pengajuan.

## Pencabutan sesi operator

Sesi operator bersifat global, bukan per instansi. Endpoint existing `POST /api/instances/:instanceId/operators/:operatorId/revoke-sessions` hanya boleh mencabut sesi bila:

- Sesi pelaku masih aktif; izin terbaru `session.revoke` tersedia pada instansi input.
- Target memiliki grant aktif pada instansi input.
- Pelaku memiliki `session.revoke` pada **setiap** instansi yang mempunyai grant aktif untuk target.
- Target bukan pelaku sendiri. Logout tetap digunakan untuk sesi sendiri.

Jika salah satu syarat tidak terpenuhi, respons FORBIDDEN tidak mengungkap daftar instansi target. Tidak ada pemotongan scope diam-diam atau pembukaan izin baru. Seluruh grant dibaca ulang dalam transaksi; lock tabel grant mencegah penambahan/pencabutan grant bersamaan menyelinap di antara pemeriksaan dan pencabutan sesi. Lock singkat mengikuti batas waktu statement database existing. Penolakan dicatat dalam audit tanpa memaparkan grant target.

Ini batas aman untuk kapabilitas existing, bukan kebijakan identitas orang lintas aplikasi atau kebijakan re-auth baru. Tidak menambah mapping berdasarkan nama/email, tidak menghapus audit, dan tidak menambah migration.

## Form operator

Form menyimpan referensi elemen sebelum operasi async, menahan submit ganda, mempertahankan isian ketika gagal, dan mengarahkan fokus ke pesan error. Keberhasilan mereset form, menutupnya, memuat ulang daftar, dan mengembalikan fokus ke Buat akun. Nama instansi dicantumkan pada grant agar perannya tidak ambigu.

## Pengujian

`tests/support/control-foundation-checks.mjs` dijalankan oleh harness disposable Control: role runtime non-superuser/NOBYPASSRLS, akun nyata, service/route handler auth resmi, kasus mixed scope, target instansi lain, target multi-instansi, grant pelaku dicabut, CSRF/session negatif dan pencabutan sah. Tidak memakai perubahan status SQL untuk membuat alur positif lulus. Baca script dan guard target sebelum menjalankan; jangan arahkan ke database existing.

Laporan browser, screenshot, manifest dan hasil gate berada di workspace tugas di luar kandidat release. Tes bank/SJ double dipisahkan dari integrasi service nyata; hasil lokal bukan izin produksi.
