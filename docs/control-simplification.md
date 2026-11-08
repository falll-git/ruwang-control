# Simplifikasi Control — 5 Oktober 2026

Keputusan pengguna menggantikan instruksi identitas/pengamatan Control yang lebih lama. Ini spesifikasi perilaku, bukan izin deployment atau klaim seluruh integrasi telah lulus.

## Keputusan produk aktif — rekonsiliasi 7 Oktober 2026

| Fitur | Keputusan | Yang tetap dipertahankan |
|---|---|---|
| Bantuan pengelola | Dihentikan; bukan backlog untuk dipasang ulang | Kegagalan penting dan tindakan yang benar-benar didukung kontrak |
| Verifikasi identitas manual Control | Dihentikan, termasuk form dan endpoint | Login, credential wajib/unik/aman, session, CSRF, rate limit, qualified-subject self-review dan audit |
| Pemeriksaan publik milik Control | Dihentikan, bukan dipindah ke panel tersembunyi | Monitoring pipeline bertanda tangan serta kontrak pengamatan bank/SJ yang terpisah; persetujuan bukan bukti publik |
| Pemilih versi pembanding | Dihapus dari UI; jangan dipasang ulang | Snapshot immutable, versi/checksum, superseded, tautan versi terbaru dan API pembanding backend untuk kompatibilitas |
| Banyak role pengguna Control | Diganti satu role aplikasi `internal_operator` | Status akun, autentikasi, scope instansi terdaftar, authority, eligibility dan pengamanan server; role DB runtime/migrator tetap terpisah |

**Batas kebijakan:** sistem tidak membuktikan bahwa dua akun berbeda pasti milik dua orang berbeda, termasuk lintas issuer. Penolakan subject berkualifikasi yang sama bukan verifikasi manusia. Tidak ada pemetaan nama/email atau verifikasi manual yang harus dibangun diam-diam untuk menutup batas ini. Perubahan kebijakan tersebut memerlukan keputusan baru, bukan dianggap fitur selesai atau backlog aktif.

Urutan baca dan status dokumen ada di [documentation-index.md](documentation-index.md). Instruksi historis yang bertentangan tidak berlaku; jangan menghapus audit atau migration historis untuk menyelaraskan dokumentasi.

## Alur aktif

- Dashboard mempunyai tiga tautan kartu: pengajuan konten menunggu, penarikan/perubahan menunggu, dan penerapan keputusan belum selesai. Dua hitungan pengajuan dipisah menurut filter server; tidak mengarah ke daftar yang hanya berisi sebagian angka gabungan.
- Pemeriksaan dan monitoring tetap memisahkan konten/lifecycle. Daftar memakai query server, filter, total terotorisasi dan sorting submitted_at + ID. Pagination bernomor memakai `page`; kontrak cursor lama tetap tersedia dan tidak dicampur dengan page.
- Detail menunjukkan snapshot immutable, media, catatan keputusan dan penerapan bank. Refresh langsung terlihat. Data bank terkini tidak diberi label sebagai snapshot. Versi superseded mempunyai tautan versi terbaru, tanpa panel kuning dekoratif.
- Recovery pengiriman bank dan pemrosesan SJ mempertahankan binding tujuan, permission, receipt, revision dan hasil belum pasti. Kontrak peer hanya cursor, tanpa total; tampilkan navigasi sebelumnya/berikutnya, bukan nomor/total rekaan.
- Semua akun aktif memakai internal_operator. Buat akun melalui dialog tiga field: nama, username, password. Validasi wajib/unik/password aman, session, CSRF, same-origin dan rate limit tetap ada. 'Tanpa verifikasi identitas' tidak berarti credential kosong atau akses anonim diterima.

## Fitur dihentikan

Tidak ada halaman/form/endpoint verifikasi identitas lintas akun. Tidak ada fetch, konfigurasi, DTO, UI atau klaim pemeriksaan publik Control. Bank dan SJ tetap mempunyai kontrak dan audit sendiri; tidak diubah pada pekerjaan ini. Disetujui atau diterapkan di bank tetap bukan bukti tampil publik.

Migration 0016 memindahkan verified_subject_bindings, subject_binding_versions dan public_observation_attempts ke control_audit_archive, tanpa DELETE atau DROP TABLE. Runtime tidak mempunyai USAGE/SELECT pada schema tersebut. Migration historis tetap utuh. Control memakai SQL PostgreSQL, **bukan Prisma**, sehingga tidak ada schema Prisma Control yang harus diubah.

Self-review tetap ditolak untuk qualified subject pemeriksa yang sama dengan kontributor/actor snapshot. Setelah binding manusia dihapus, Control tidak dapat membuktikan bahwa dua akun/issuer adalah orang berbeda. Jangan mengarang pemetaan nama/email. Ini perubahan kebijakan eksplisit, bukan jaminan segregasi manusia lintas issuer.

## Komponen dan pesan

Pagination diadaptasi dari src/components/ui/Pagination.tsx Ruwang Arsip. Badge bersumber shadcn/ui Radix, MIT, dengan token Control; sumber dan lisensi ada pada components/ui/badge.tsx dan vendor/shadcn-LICENSE.md. Tidak ada dependency baru. Bell memakai aksen turquoise Control. Kartu memiliki hover/focus ringan dan mematuhi reduced motion.

Informasi rutin memakai konteks netral ringkas, kegagalan penting tetap alert merah dekat tindakannya. Tidak semua kondisi berbeda diringkas menjadi Diproses. Tidak ada Bantuan pengelola, tooltip/accordion untuk menumpuk penjelasan atau badge sukses tanpa kontrak.

## Pemeriksaan dan preview

Perbaikan audit 5 Oktober: lookup keputusan Control mengembalikan 404 `COMMAND_NOT_FOUND` hanya setelah autentikasi dan izin instansi. UI membaca ulang pengajuan sebelum membuka konfirmasi ulang dan tetap menggunakan ID percobaan sebelumnya; tidak otomatis mengirim keputusan. Gagal mengecek/timeout tetap belum pasti. Ketiadaan hasil pada bank bukan ketiadaan command di Control.

Catatan approve konten disimpan di review_reasons Control, tidak dimasukkan ke reason payload bank V1 yang melarangnya. Catatan ikut perbandingan idempotency termasuk dua tab. Catatan yang sudah terbuang pada versi lama tidak direkonstruksi. API command menyediakan decision_note untuk verifikasi intent; versi/snapshot dan validasi tetap berlaku.

Filter state daftar sekarang memakai keputusan tersimpan di Control (prioritas SUPERSEDED), bukan menunggu acknowledgment bank. Response state tetap status snapshot; commandDecision dan commandState terpisah. Dashboard/notifikasi tidak menghitung pengajuan yang sudah mempunyai keputusan sebagai pekerjaan menunggu pemeriksaan. Kegagalan penerapan tetap ditampilkan pada kolom penerapan.

Refresh detail mencoba ulang thumbnail tanpa menghapus isian catatan. Kegagalan thumbnail tidak menghalangi membuka media asli; dialog media mempunyai Coba lagi. Username duplikat diarahkan ke field username dengan pesan khusus.

Baca script, konfigurasi dan pemilik listener sebelum menjalankan. npm run test:read-disposable menguji fresh/upgrade, guards, auth, API, dispatch dan read-contract dalam resource owned. Double bank/SJ tidak disebut integrasi nyata. npm test juga mempunyai dua tes lintas aplikasi melalui harness bank; kompatibilitas harness tersebut harus dinilai terpisah.

Satu URL Control: http://127.0.0.1:4320. Database dan tujuan integrasi dicatat terpisah. Jangan memakai port alternatif ketika terpakai. Jangan menyamakan build lama dengan source baru. Bukti, backup source, manifest, screenshot dan checkpoint berada di luar kandidat release pada output/playwright/control-simplification-20261005 di workspace audit. Runtime inspeksi disposable bukan fallback dummy untuk aplikasi normal.
### Ringkasan waktu layanan

Kartu layanan menampilkan pemeriksaan berhasil terakhir sebagai waktu utama. Percobaan berhasil dan waktu data sumber yang menghasilkan teks menit yang sama tidak diulang. Percobaan gagal atau belum pasti selalu tampil, begitu juga waktu sumber yang berbeda. Aturan ini hanya mengurangi teks berulang pada presisi tampilan; timestamp API, kebijakan freshness, dan kegagalan terakhir tidak berubah.
