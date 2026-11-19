# Control SJ — panduan aktif

Rekonsiliasi keputusan produk 7 Oktober 2026; versi dependency dan panduan build diselaraskan dengan source pada 19 November 2026. Keputusan terbaru ada di [control-simplification.md](control-simplification.md); klasifikasi aktif/arsip ada di [documentation-index.md](documentation-index.md). Dokumen dan hasil tes sebelumnya tidak otomatis membuktikan kandidat terbaru. Hasil lokal bukan izin produksi.

## Kontrak dan workflow

- Next.js 16.4.6, React 19.3.0, Node.js 24+, PostgreSQL SQL migrations 0001–0016. Versi dependency mengikuti [package.json](../package.json) dan [package-lock.json](../package-lock.json); Control tidak menggunakan Prisma atau Redis sebagai antrean lokal.
- Bank mengelola versi kerja dan menerapkan keputusan. Control memeriksa snapshot immutable dan menyimpan/mengirim keputusan. SJ memiliki ingest, media/proyeksi dan halaman publiknya sendiri.
- Review state, command state, pengiriman bank dan pemrosesan SJ tidak digabung. Disetujui bukan diterapkan; diterapkan/receipt bukan tampil publik.
- Profil, kontak, empat kategori publikasi dan lifecycle memakai versi/checksum/identitas/authority yang sah. Revisi dilakukan di bank kemudian diterima sebagai versi baru. Pemeriksa tidak mengedit snapshot bank.
- Keputusan memakai ID/version/checksum dan actor server. Catatan revisi dan lifecycle sesuai validator. Dua pemeriksa/tab, stale, superseded, timeout dan respons hilang tidak boleh menghasilkan keputusan ganda. UNKNOWN membaca ledger melalui check_result, bukan mengirim ulang.
- Qualified-subject self-review tetap berlaku. Verifikasi identitas manusia lintas akun dihentikan; nama/email bukan pengganti binding. Dua akun berbeda tidak membuktikan dua orang berbeda, termasuk lintas issuer. Ini batas kebijakan, bukan jaminan segregasi manusia atau backlog verifikasi manual. Semua akun aktif internal_operator mempunyai akses tindakan yang tersedia, tetapi auth/session/CSRF/authority/version/target checks tetap wajib.
- Pemeriksaan publik milik Control dihentikan di UI, DTO, service dan konfigurasi. UI tidak menggantikannya dengan klaim tampil. Audit lama di control_audit_archive tidak dapat diakses runtime. Bank/SJ tidak berubah karena penghapusan ini.

## Kamus status

| Sumber | Label | Batas |
|---|---|---|
| review-ui / snapshot | Menunggu pemeriksaan, Perlu diperbaiki, Disetujui, Ditolak, Sudah digantikan | Tidak menyatakan penerapan bank/publik |
| review-ui / command | Menunggu penerapan, Sedang dikirim ke bank, Diterapkan di bank, Tidak diterapkan bank, Penerapan belum pasti | UNKNOWN diperiksa melalui ledger, bukan dianggap gagal/sukses |
| delivery-recovery / bank | QUEUED/SENDING/ACKNOWLEDGED/RETRYING/FAILED/QUARANTINED | Protokol bank; receipt retry hanya penjadwalan |
| delivery-recovery / SJ | PENDING/PROCESSING/RETRY_WAIT/COMPLETED/DEAD_LETTER | Protokol SJ; bukan ACK bank atau bukti tampil |
| monitoring-read / sumber | Tanpa kendala yang dilaporkan, Ada kendala, Tidak dapat dihubungi, Perlu pemeriksaan baru, Belum dapat dipastikan | Antrean nol/worker hidup bukan jaminan layanan sehat |

Tanggal memakai reviewDate Asia/Jakarta, id-ID, 24 jam, tanpa GMT pada UI. Timestamp, expiry, jadwal dan format mesin tidak diubah. Nol dipertahankan; null bukan nol.

Detail lifecycle tidak menampilkan baris “Sudah tersinkron” dari
`detail.central_synced`. Field legacy bank tersebut menandai counter aggregate
yang sudah dibuat atau ID media pusat yang telah dialokasikan; keduanya bisa
terbentuk sebelum pengiriman/ACK selesai. Bukan bukti sudah diterima atau tampil,
bahkan jika diberi keterangan “saat diajukan”. Field tetap utuh dalam snapshot,
DTO, checksum, audit dan backend untuk kompatibilitas/validasi; hanya klaim UI
yang dihapus. Status saat diajukan, versi, alasan, dampak, kendala, media,
keputusan dan penerapan bank tetap ditampilkan.

## Peta halaman/API

| Halaman | Komponen / API |
|---|---|
| / | Kartu tautan kerja; getDashboardSnapshot dengan hitungan content/lifecycle/PENDING-DISPATCHING-UNKNOWN terpisah |
| /reviews | ReviewList; GET /api/reviews, group/filter/sort/page atau cursor; count FILTERED_AUTHORIZED_SNAPSHOTS |
| /reviews/:reviewId | ReviewDetail; GET /api/instances/:i/reviews/:r, media private dan POST decisions; Refresh langsung |
| Hasil keputusan | GET /api/instances/:i/review-commands/:c; POST check_result; tidak membuat keputusan ulang |
| /monitoring | MonitoringClient/ReviewList; GET/POST /api/monitoring untuk sumber/penerapan, bukan pemeriksaan publik |
| /monitoring/pengiriman | DeliveryRecoveryClient; POST /api/instances/:i/delivery-recovery |
| /monitoring/pemrosesan | Komponen recovery sama; POST /api/instances/:i/processing-recovery, binding instalasi SJ eksplisit |
| /operators | Dialog nama/username/password; POST /api/operators untuk membuat akun (sesi server dan CSRF); direktori SSR melalui listManagedOperators(session) |
| /login | Login nyata; tidak ada signup publik atau credential operasional default |

List tidak fetch detail/media per baris. Numbered page mempunyai count terfilter/izin dan sorting stabil. Legacy cursor berbeda filter/principal ditolak. Recovery peer tidak menyediakan total/nomor halaman; navigasi tidak mengarang total. Snapshot comparison API lama tetap kontrak backend, tetapi fitur pemilihan pembanding di UI tidak ada.

Kontrak arah/signature/receipt/binding: [sj-recovery.md](sj-recovery.md), [control-dispatch-recovery.md](control-dispatch-recovery.md), [review-media.md](review-media.md). Instruksi identitas/publik Control yang lebih lama sudah dihentikan dan tidak boleh dipakai sebagai kebijakan aktif.

## Kandidat build dan rilis

Gunakan checkout bersih dari SHA rilis yang sama dengan bukti gate CI. Pasang dependency dari lockfile pada SHA tersebut dengan `npm ci`. [Workflow Quality](../.github/workflows/quality.yml) memakai Node.js 24.13.0 dan npm 11.21.0; cocokkan toolchain serta OS/arsitektur tujuan saat menyiapkan artifact.

`npm run build` menjalankan build Next.js lalu [prepare-standalone.mjs](../scripts/prepare-standalone.mjs), yang menyiapkan `.next/standalone/server.js` beserta aset static/public. `npm start` memakai [start-standalone.mjs](../scripts/start-standalone.mjs). Artifact harus dibangun ulang dari SHA yang diuji; keberadaan `.next` atau `node_modules` lokal lama tidak membuktikan artifact kandidat sudah sesuai.

Sebelum aktivasi yang diizinkan, cocokkan konfigurasi proses tujuan dengan [schema environment](../src/lib/env.ts): mode production, `CONTROL_RELEASE` berupa SHA rilis, origin HTTPS, identitas/role database, mode TLS dan sertifikat, serta key/binding integrasi yang diaktifkan. Credential tetap berada pada konfigurasi privat tujuan. Schema dan privilege database, backup/restore, reverse proxy, health/readiness dan prosedur rollback perlu bukti pada target VPS. Kelulusan build/CI belum membuktikan kondisi tersebut dan tidak memberi izin menjalankan migrasi atau aktivasi produksi.

## Komponen, tes dan layanan

Gunakan komponen Arsip yang dipindahkan dengan token Control dan sumber/lisensi yang dicatat. Badge shadcn/ui Radix bersumber MIT; tidak menambah dependency. Tidak ada Bantuan pengelola, wizard, timeline atau tooltip penampung penjelasan tersembunyi. Informasi rutin netral singkat; error penting tetap terlihat.

Dialog native memakai Tab trap/Escape/fokus kembali/scroll lock. Uji perilaku aktual, bukan menganggap seluruh dialog memakai Radix. Satu tema light saat ini; jangan menambah tema. Inspeksi 360/390/768/1024/1440 CSS px, reduced motion, native zoom, loading/kosong/panjang/parsial/error/saving.

Preview Control hanya http://127.0.0.1:4320, tidak beralih port bila terpakai. Verifikasi source/build manifest dan pemilik proses sebelum restart. Database/double/worker pendukung dicatat terpisah. Resource tes harus run-owned dengan marker/container ID/image/mount/role/URL proof, bukan hanya nama tes. Fresh/upgrade dan alur positif melalui API/service resmi. SQL fixture hanya provisioning akun/registry/audit canary, bukan status bisnis untuk meloloskan skenario.

npm test mencakup dua integrasi nyata peer. Pada pekerjaan 5 Oktober, izin penyesuaian harness bank dibatasi pada sj-cross-app-peer.mjs dan sj-cross-app-scenario.js, tanpa mengubah aplikasi bank/SJ dalam pekerjaan tersebut. Catatan ini bukan izin lintas repository untuk tugas berikutnya. Test double, service lintas aplikasi dan browser tetap jenis bukti berbeda. Izin hosted CI, commit/push, deploy dan akses VPS mengikuti instruksi pengguna untuk pekerjaan yang sedang berjalan; keberhasilan tes saja tidak memberi izin tahap berikutnya.

Bukti pekerjaan 5 Oktober: workspace audit output/playwright/control-simplification-20261005 di luar kandidat, bukan bukti pengujian ulang 7 Oktober. PASS harus merujuk run/kandidat yang sama; FAIL awal tetap disimpan. Cleanup exact resource, jangan docker prune/kill semua node atau reset database. Sesudah disconnect, periksa checkpoint, manifest, process/listener dan owner journal sebelum mengulang.
