# Pemulihan pengiriman bank dan pemrosesan SJ

Kapabilitas ini tidak memberi izin keputusan, tidak mengubah isi pengajuan,
dan tidak membuktikan data tampil publik. `SCHEDULED` hanya berarti permintaan
penjadwalan tercatat di tujuan. Jangan menafsirkan antrean kosong sebagai sehat.

## Akses dan konfigurasi

- Akses memakai role tunggal `internal_operator` pada instansi terdaftar,
  sesuai [control-internal-access.md](control-internal-access.md). Tidak ada
  pemberian role delivery_operator/reviewer/observer melalui UI atau API.
  Server tetap memeriksa akun aktif, sesi, izin tindakan, target instansi,
  authority central, feature flag, CSRF dan origin pada setiap tindakan.
- Bank: `/monitoring/pengiriman`, API Control
  `POST /api/instances/:instanceId/delivery-recovery`. Tujuan adalah signed
  `POST /api/v1/internal/ruwang-control/sj-review/recovery` milik bank.
- SJ: `/monitoring/pemrosesan`, API Control
  `POST /api/instances/:instanceId/processing-recovery`. Tujuan adalah signed
  `POST /v1/internal/ruwang-control/sj-jobs/recovery` milik SJ.
- Pemrosesan SJ default mati (`CONTROL_ENABLE_SJ_RECOVERY=false`). Registry
  `control.instances.sj_recovery_binding` harus diisi eksplisit oleh operator
  konfigurasi yang sah: `url`, `audience`, `institutionId`, `installationId`,
  `keyId`, `publicKey`. Ini bukan tebakan dari sumber monitoring. Tidak ada
  UI/API publik untuk mengubah binding tersebut.
- Identitas penandatangan Control memakai `CONTROL_BANK_SIGNING_KEY_ID` dan
  `CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE`. Jangan menaruh private key di
  registry, respons API, dokumentasi, atau source.
- Migration 0012 menyimpan intent recovery; 0013 memisahkan provider BANK/SJ
  dan menambah binding SJ. Baris lama tetap BANK. Kebijakan akses kemudian
  diganti oleh 0014 (internal_operator); source kini sampai 0016. Jangan
  mengaktifkan grant historis atau berhenti di 0013 dari panduan recovery ini.
  Verifikasi schema dengan migrator/readiness aktual; jangan memigrasi database
  existing sebagai bagian tes disposable.

## Kontrak tindakan

Input API Control strict: `list` (`state`, `cursor`), `detail` (`jobId`),
`retry` (`jobId`, `requestId`, `expectedRevision`, `reason`), `check_result`
atau `repeat_request` (`requestId`). Daftar berisi maksimal 25 baris, sort ID
stabil dan cursor server; `total:null` bukan nol dan bukan total global.

Bank mempertahankan identitas/version aggregate serta status kirim.
SJ mengembalikan job type, status pemrosesan, percobaan dan waktu, tanpa
payload/error internal. SJ tidak mengarang versi aset dari ID job.
Job legacy tanpa asal instalasi tidak dimasukkan ke daftar scoped.

SJ hanya mengizinkan retry DEAD_LETTER tanpa lease untuk PROCESS_MEDIA,
REBUILD_PUBLICATION_PROJECTION, RECONCILE_MANIFEST. Worker tetap menjalankan
validasi media, quarantine dan lifecycle normal. Audit tujuan menyimpan alasan
dan jumlah percobaan sebelumnya meski counter worker direset untuk retry.

Control menyimpan intent UNKNOWN sebelum pengiriman. Saat respons hilang,
periksa receipt dengan request ID/digest yang sama. Jika tujuan membuktikan
belum tercatat, tindakan eksplisit dapat mengirim permintaan yang persis sama;
bukan membuat ID atau versi baru. Binding tujuan yang berubah membatalkan
dispatch, bukan mengalihkan intent lama ke instalasi baru. Respons harus
memiliki signature, identitas, nonce, digest dan waktu sah.

## Pengujian aman

Periksa script dan target terlebih dahulu. `scripts/control-disposable-check.mjs`
menyiapkan resource berlabel kepemilikan, migrator non-superuser, runtime
terbatas dan test double; itu bukan integrasi bank/SJ nyata.
`tests/control-adapter-integration.test.mjs` menjalankan layanan bank/Control/SJ
nyata pada resource disposable terverifikasi. Jangan mengganti target dengan
database normal. Bukti browser, screenshot, manifest dan checkpoint disimpan
di luar repository; jangan menyimpulkan PASS dari keberadaan dokumen ini.
