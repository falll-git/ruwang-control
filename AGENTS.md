# Panduan pekerjaan Ruwang Control

## Baca sebelum melanjutkan

1. `docs/documentation-index.md` — pemisahan panduan aktif dan arsip historis.
2. `docs/control-simplification.md`, `docs/control-internal-access.md`, `docs/control-sj-current.md` — keputusan produk, akses dan kontrak aktif.
3. `docs/control-ui-alignment.md`, `docs/control-dispatch-recovery.md`, `docs/sj-recovery.md` — komponen dan tindakan yang dipertahankan; cocokkan dengan source sebelum mengubah.
4. `docs/control-disposable-tests.md` dan `docs/disposable-sj-tests.md` — batas harness, kepemilikan resource dan jenis bukti. Baca script sebelum menjalankannya.

`handoff.md`, `sj-v1-scope.md`, `design-system.md`, `architecture.md`, `foundation.md` dan JSON source-evidence adalah baseline historis, bukan backlog atau bukti kandidat terkini. Jangan menghidupkan fitur yang dibatalkan dari instruksi lama di dalamnya.

## Keputusan pengguna yang berlaku

- Keputusan 5 Oktober 2026: hentikan verifikasi identitas manual dan pemeriksaan publik milik Control. Buat akun hanya nama/username/password; detail berakhir pada media pengajuan. Migration 0016 mengarsipkan bukti historis, bukan menghapus audit. Pertahankan autentikasi, validasi credential, qualified-subject self-review, authority, signature, versi dan idempotency. Baca docs/control-simplification.md; instruksi identitas/pengamatan Control yang lebih lama bukan kebijakan aktif.

- Keputusan terbaru 3 Oktober 2026: satu role `internal_operator` untuk seluruh akun aktif dan seluruh instansi terdaftar. Buat Akun hanya nama, username dan password. Baca `docs/control-internal-access.md`; referensi grant per instansi/pengelola akses di catatan historis berikut bukan kebijakan akses aktif. Feature flag, authority, status akun, session dan validasi bisnis tetap berlaku.

- Pengguna menolak desain UI 0.1 di `dist/`: warna graphite–teal, font dan susunannya tidak disukai. Jangan gunakan sebagai target visual walaupun tesnya lulus.
- Bangun dashboard minimalis dan nyaman: sidebar deep-petrol, header dan konten putih natural, kanvas aqua-gray muda, aksen turquoise terbatas, hijau emerald hanya untuk status sehat, Inter, Lucide, primitive shadcn/ui varian Radix ditata melalui token Control. Palet ini menyatu dengan logo dan sengaja berbeda dari biru Ruwang Arsip. Penggunaan font atau ikon yang familiar diperbolehkan; jangan menyalin keseluruhan tampilan Ruwang/SJ.
- Card, table, searchbar, skeleton, button, form, dialog dan notification harus konsisten. Gunakan komponen Arsip yang relevan dengan token Control sesuai control-ui-alignment.md dan control-simplification.md; design-system.md adalah sejarah rancangan.
- Fokus SJ: profil BPRS, kontak, media, katalog, pemeriksaan, lifecycle dan monitoring pipeline SJ. Bank input/draf/ajukan/perbaiki/lihat hasil. Dalam authority central, Control mengambil keputusan dan bank menerapkannya; UI bank tidak memberi keputusan lokal sebagai bypass. Authority local tetap mengikuti kontrak bank, bukan otomatis diubah oleh panduan ini.
- Kerjakan hanya tahap yang diminta. Tahap dokumentasi tidak otomatis memberi izin implementasi, menjalankan preview, atau memulai tahap berikutnya. Keamanan dan aksesibilitas tetap dipertahankan.
- Akun bank (termasuk recovery tanpa email dan hapus akun), monitoring umum VPS dan pengaduan belum menjadi scope aktif, tetap diblokir route/API server, dan tidak ditampilkan di navigasi. Operator Control dan permission tetap fondasi aktif yang sudah dibangun; audit sensitif berjalan sebagai kapabilitas backend, bukan menu terpisah pada tahap ini.
- Source menggunakan SQL migrations 0001–0016 dan satu role aplikasi internal_operator. Login/session/CSRF/rate limit, audit, signature, authority, version/checksum, idempotency, fencing dan validasi target tetap berlaku. Role database runtime/migrator bukan role pengguna dan tetap terpisah. Jangan menyimpulkan isi registry, authority efektif, flag, migration terpasang atau kesiapan runtime dari catatan lama; periksa konfigurasi/target aktual tanpa membocorkan secret. Keberhasilan lokal bukan izin deploy.
- Jangan menghidupkan Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI atau banyak role Control. API pembanding backend dan audit historis bukan izin mengembalikan UI tersebut. Dua akun berbeda tidak membuktikan dua orang berbeda; qualified-subject self-review tetap wajib, bukan jaminan pemisahan manusia lintas akun/issuer.

## Batas implementasi

Pertahankan `src/domain`, adapter snapshot/command/ack dan tes yang masih benar. Audit diff sebelum edit; koreksi minimum sesuai tugas. Jangan membangun ulang permission atau audit hanya untuk mengikuti template. Catatan perubahan lintas repository pada handoff adalah sejarah, bukan izin perubahan berikutnya. Ikuti scope pengguna yang sedang aktif; repository pembanding read-only kecuali mendapat izin tersendiri. Jangan mengubah auth akun bank atau modul lain untuk scope SJ-only.

`dist/` adalah source preview yang ditulis tangan, bukan output build yang otomatis boleh dihapus. `.openai/hosting.json` hanya menjelaskan preview statis; jangan otomatis mendaftarkan/mempublikasikan situs atau mengganti arsitektur data. Tetap bekerja lokal di `D:/ruwang-control` sampai pengguna meminta tahap lain.

Database Control harus terpisah dari bank/SJ. Nama database maupun localhost bukan bukti target disposable. Auth/session password-only tersedia; operator pertama dibuat interaktif dengan `npm run operator:bootstrap` setelah memeriksa script dan target. Bootstrap boleh sebelum instansi didaftarkan; tindakan bank tetap memerlukan registry/authority sah. Operator berikutnya dibuat dari menu Operator Control oleh akun internal aktif dengan sesi sah; tidak ada signup publik atau credential default. API Control menerima snapshot privat bertanda tangan, menyajikan antrean/detail/media, membuat command dan membaca hasil. Endpoint internal bank menerapkan command sah; monitoring bank/SJ menyajikan status minimum bertanda tangan, bukan pemeriksaan publik Control. Fixture hanya pada resource disposable yang terbukti milik run; tidak ada dummy sebagai fallback operasional.

## Verifikasi dan pelaporan

Pilih pemeriksaan sesuai perubahan. Dokumentasi saja: cek konsistensi rujukan, status dan integritas file; tidak perlu build ulang aplikasi. Saat UI dibangun: lint/typecheck/build sesuai stack, uji browser desktop/mobile, keyboard/focus/reflow dan state penting. `npm run check:integrity` membandingkan repo pembanding dengan baseline sebelum adapter; perubahan backend yang tercatat pada handoff memang membuat baseline itu berbeda. Jangan diam-diam mengganti baseline agar tes hijau.

Laporan `docs/verification.md` hanya bukti teknis 0.1. Jangan menggunakannya untuk mengklaim UI 0.2 atau integrasi produksi sudah lulus. Catat secara eksplisit file/perilaku yang berubah, pemeriksaan yang dijalankan dan bagian yang belum diimplementasikan.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
