# Monitoring SJ — RC-SJ-09

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

## Perilaku

`/monitoring` memakai shell Pemeriksaan dan dua tab biasa: Pengajuan dan Layanan. Tidak ada dashboard angka gabungan atau tindakan pemulihan semu.

- Pengajuan menggunakan GET `/api/reviews`, filter server, count sesuai izin/filter, cursor, dan konteks URL. Default Monitoring semua status; default Pemeriksaan tetap IN_REVIEW. Konten dan lifecycle memiliki konteks terpisah, tidak dijumlahkan. Data ringkas sudah berisi bukti publik tersimpan: tidak ada fetch detail per baris.
- Keputusan, penerapan bank, dan fakta publik dibaca terpisah. Versi publik bukan versi pengajuan. Fakta publik selalu menyertakan waktu; kegagalan percobaan terbaru tidak menghapus fakta terakhir. Kontak dan pencabutan kontak/media tidak diberi halaman publik mandiri.
- Tinjau membuka detail pemeriksaan existing, dengan tautan kembali ke Monitoring beserta filter/cursor. Tidak ada perubahan cara mengambil keputusan.
- Layanan membaca GET `/api/monitoring`. Muat ulang hanya mengambil data Control. Periksa sumber menggunakan POST existing dengan sesi/CSRF, scope monitoring.read, feature flag, jadwal/backoff dan signature server. Observer memiliki monitoring.read menurut kontrak existing; tidak diberi hak keputusan.
- Tidak ada polling otomatis frontend. Pemeriksaan sumber manual tetap tunduk pada jadwal server, sehingga klik tidak selalu membuat probe baru. Tidak ada pengiriman ulang command/job melalui tombol ini.
- Timeout permintaan UI 20 detik membatasi penantian, bukan menyatakan efek server dibatalkan. Klik ganda dicegah dengan ref sinkron; unmount membatalkan penantian klien. Respons harus sesuai schema sebelum mengganti data.
- Error refresh tetap ditampilkan selama percobaan berikutnya berjalan. Hasil sebelumnya tetap berlabel hasil sebelumnya; judul kondisi saat ini menjadi belum diketahui. HTTP200 dengan JSON kosong tidak diterima sebagai sukses.
- Freshness layanan mengikuti stale_after_seconds server; tidak ada TTL publik baru. CHECK_TIME_ONLY berarti fakta pada saat diperiksa. Status proses aktif/jumlah nol tidak membuktikan hasil pekerjaan.

## Sumber label

| Informasi | Field/aturan |
| --- | --- |
| Menunggu pemeriksaan/revisi/disetujui | review.state, kamus reviewLabels |
| Penerapan menunggu/dikirim/diterapkan/tidak diterapkan/belum pasti | commandState; bukan status SJ |
| Tujuan berubah, pengiriman ditahan | commandResultCode COMMAND_TARGET_CHANGED, commandState UNKNOWN |
| Tampil/tidak ditemukan saat dicek | publicEvidence.lastSuccessfulObservation.state + checkedAt |
| Pemeriksaan terbaru belum berhasil | latestAttempt.observation.state unknown |
| Kondisi sumber/perlu pemeriksaan baru | source.status, server displayStatus |
| Berhasil terakhir/percobaan/kegagalan | lastSuccessfulCheck / lastAttempt / lastFailure, terpisah |
| Pengiriman gagal atau ditahan | OUTBOX_FAILED_ITEMS; bank menggabungkan FAILED dan QUARANTINED |
| Pekerjaan gagal diproses | DEAD_LETTER_PRESENT pada sumber SJ; tidak disamakan dengan quarantine bank |
| Angka pekerjaan | queues.depth sesuai sumber: menunggu/diproses, bukan jumlah gagal atau jumlah aset |

Formatter reviewDate mempertahankan Asia/Jakarta; hanya tampilan tanpa GMT. Timestamp, expiry dan jadwal tidak diubah. Kode sumber ditampilkan hanya sebagai rincian diagnosis yang sudah ada dalam allowlist API.

## Batas yang belum didukung kontrak

1. `D:/backend-production/src/modules/seputar-jaminan/controlMonitoring.service.js`, `controlMonitoring.contract.js`, `controlMonitoring.route.js`, GET `/api/v1/internal/ruwang-control/sj-monitoring/snapshot`: `queues[].depth/detail_code` belum menyediakan daftar job, pemisahan jumlah FAILED/QUARANTINED, identitas event, eligibility retry atau endpoint recovery. UI tidak dapat menunjuk job mana yang ditahan atau memperbaikinya dari Control.
2. `D:/seputarjaminan-production/apps/api/src/control-monitoring.ts`, GET `/v1/internal/ruwang-control/sj-monitoring/snapshot`: `central_jobs` adalah ringkasan. Belum ada retry terizin per-job pada kontrak ini.
3. `D:/backend-production/src/modules/seputar-jaminan/controlReview.route.js`: tersedia POST `/commands` dan GET `/media/:mediaId`, tetapi belum ada GET ledger keputusan untuk menyelesaikan UNKNOWN setelah ACK hilang. Control tidak mengirim ulang efek yang belum pasti.
4. `D:/seputarjaminan-production/apps/api/src/public-service.ts`, GET `/v1/public/assets/:referenceCode` dan `/v1/public/institutions/:publicSlug`: tidak ada binding immutable installation/environment/submission checksum ke versi publik. Tidak ada alasan privat absence/media quarantine/projection per event. Versi publik tidak dipetakan ke versi pengajuan.

Prompt tahap dependency terpisah:

> Audit endpoint/file/field di atas pada bank dan SJ. Rancang kontrak privat authenticated/signed untuk daftar job gagal/ditahan, eligibility serta recovery idempotent, ledger penerapan keputusan, dan bukti event/media/publik yang terikat identitas serta versi. Tetapkan scope dan reason aman. Jangan mengekspos endpoint admin publik. Uji target berubah, respons hilang, duplicate, stale, tenant/role dan kegagalan dengan resource disposable. Jangan mengubah hasil UNKNOWN menjadi sukses tanpa bukti. Consumer Control dan integrasi aplikasi nyata diuji setelah kontrak tersedia.

## Pengujian aman

Baca script sebelum menjalankan. `test:read-disposable` menggunakan PostgreSQL tmpfs milik run, role runtime non-superuser/NOBYPASSRLS, marker kepemilikan, dan bank/SJ contract doubles. Itu bukan E2E aplikasi bank/SJ. Jangan memakai `.env.local` normal untuk tes mutatif.

Bukti tahap, browser harness, screenshot, hasil dan checkpoint disimpan di workspace tugas `output/rc-sj-09` serta `output/playwright/rc-sj-09`, bukan kandidat release. Preview tunggal 127.0.0.1:4320 hanya selama inspeksi; database dan double memakai loopback port milik run. Cleanup menghentikan preview, menghapus container serta credential tes milik run; tidak menyentuh database existing.
