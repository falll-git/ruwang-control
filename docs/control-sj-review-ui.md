# Pemeriksaan Seputar Jaminan — RC-SJ-08

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

## Permukaan dan langkah kerja

`/reviews` memakai dua tab: Pengajuan konten dan Penarikan & perubahan. Hanya satu daftar dimuat. Filter, urutan, ukuran halaman dan cursor berasal dari `GET /api/reviews`; jumlah adalah `FILTERED_AUTHORIZED_SNAPSHOTS`, bukan jumlah seluruh bank atau gabungan tab.

Pemeriksa membuka Tinjau, membaca snapshot dan versi, mengisi catatan bila diwajibkan, memilih keputusan, lalu mengonfirmasi. Menutup dialog, menulis catatan, dan membuka media tidak mengirim keputusan. Tidak ada perubahan isi pengajuan bank melalui layar ini.

Filter masing-masing tab disimpan dalam URL; `other` dan `trail` adalah konteks UI, tidak diteruskan ke API. Back/Forward dan tautan kembali ke daftar mempertahankan konteks. Trail menyimpan hingga 50 cursor sebelumnya; melewati itu tetap dapat maju dan browser Back tetap tersedia. Data daftar bersifat LIVE_KEYSET, bukan snapshot jumlah yang dibekukan.

## Sumber data dan batas

- Detail: `/reviews/[reviewId]`, DTO `reviewDetailReadSchema`. Data utama adalah snapshot yang diterima, bukan data kerja bank terbaru.
- Pembanding: endpoint `.../reviews/[reviewId]/comparison?against=...`. Hanya snapshot aggregate yang sama, sesuai izin; bukan pembanding terhadap isi publik. Pemilih menampilkan maksimal 100 snapshot terbaru dan menyatakan batas bila ada halaman berikutnya.
- Media: endpoint privat reviewer `.../reviews/[reviewId]/media/[mediaId]`, sesuai pemeriksaan server. Kontak bukan halaman publik.
- Tindakan: `actions` dari server, termasuk izin dan alasan terhalang. Tanpa izin, tombol tidak dibuat. Server tetap memeriksa ulang authority, scope, versi, checksum, sesi dan idempotency.
- Keputusan: POST endpoint keputusan existing dengan expectedVersion, expectedChecksum, CSRF dan UUID idempotency. Konfirmasi eksplisit wajib; penguncian sinkron mencegah double click.
- Hasil tidak pasti: simpan hanya ID command di sessionStorage per operator/instansi/snapshot; blokir pengajuan baru dan gunakan GET status command. Tidak ada retry pengiriman palsu. Notes dan token tidak disimpan di browser storage.
- Server dapat mengembalikan ID command lama untuk intent identik dari dua tab. UI memvalidasi identitas snapshot/instansi, versi, checksum, keputusan dan catatan command tersebut sebelum menerima hasil.
- Penolakan enqueue yang pasti memuat ulang eligibility. Respons rusak, timeout atau putus koneksi tidak dianggap sukses/gagal bisnis secara otomatis.
- `APPLIED` berlabel Diterapkan di bank, bukan Tampil. Pemeriksaan publik mempertahankan hasil berhasil terakhir dan menunjukkan kegagalan terbaru beserta waktunya; versi publik tidak dianggap sama dengan versi pengajuan.

## Komponen

Shell khusus pemeriksaan, daftar, dokumen snapshot, media, dialog dan formulir keputusan berada di `components/reviews` serta `components/review-decision-form.tsx`. Shell aplikasi lain tidak diganti. Primitive dialog HTML memakai focus trap, Escape, pemulihan fokus dan scroll lock; konfirmasi memfokuskan Batal. Tidak ada dependency baru.

CSS dibatasi `sj-*` pada route pemeriksaan, mengikuti rancangan RC-SJ-07: petrol, aksen turquoise terbatas, Inter, Lucide, kontrol 44px dan dukungan reduced motion. Deskripsi panjang memakai lebar penuh. Tidak ada timeline, dashboard statistik baru atau Bantuan pengelola.

## Verifikasi aman dan dependency

Jangan memakai `npm start` untuk disposable tanpa memeriksa launcher karena ia membaca konfigurasi lokal. Bukti tahap disimpan di luar repository, folder kerja `output/rc-sj-08`; helper membuat database tmpfs terverifikasi, role NOSUPERUSER/NOBYPASSRLS, auth nyata dan snapshot bertanda tangan. Preview tunggal pada 127.0.0.1:4320; tujuan bank/SJ milik run dan berupa contract double. Akhiri dengan cleanup resource exact-ID serta penghentian preview.

Tes kontrak Control dengan double bukan bukti integrasi bank/SJ nyata. Dependency harness lintas aplikasi diperbaiki secara terpisah dengan izin pengguna: bootstrap operator, pembuatan pemeriksa berizin reviewer, login dan logout memakai service auth resmi dalam database disposable. Tidak ada sesi sintetis atau pelemahan `currentDecisionPrincipal`. Dua skenario nyata bank/Control/SJ sudah lulus; bukti pemulihan tersimpan di luar repository pada `output/rc-sj-08-dependency`. Ini pengujian service/API nyata, bukan seluruh perjalanan browser lintas aplikasi.

Fault respons bank tanpa signature diuji terpisah dari alur positif. Ledger bank menunjukkan penerapan, tetapi Control tetap `UNKNOWN` karena ACK tidak sah; pemanggilan dispatch berulang tidak membuat request atau attempt tambahan. Pembacaan ledger oleh harness hanya bukti tes, bukan API recovery baru. Sukses dengan ACK sah tetap diuji tersendiri.

Batas terkini: pembanding data kerja bank terbaru tetap tidak tersedia; pembanding adalah snapshot sah yang telah diajukan. Pemetaan event persetujuan terhadap fakta publik kini mengikuti [sj-delivery-lineage.md](sj-delivery-lineage.md), bukan penyamaan angka versi bank/SJ. UNKNOWN dapat diperiksa melalui ledger-read bertanda tangan menurut [control-dispatch-recovery.md](control-dispatch-recovery.md), tanpa kirim ulang keputusan. Dropdown instansi belum disediakan oleh kontrak daftar; scope server tetap diterapkan. Bukti tahap lama di atas tetap historis; kondisi lintas tahap ada di [control-sj-current.md](control-sj-current.md).
