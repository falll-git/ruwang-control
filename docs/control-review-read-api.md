# Kontrak baca pengajuan Control — RC-SJ-06

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

Kontrak ini mendukung UI baru, tidak mengganti UI pada tahap ini. Semua respons memakai `{ data }` atau `{ error: { code, message, requestId } }`, `Cache-Control: no-store`, dan sesi operator Control nyata. Tidak ada endpoint admin anonim, tindakan retry baru, atau perubahan protokol keputusan/ACK.

## Endpoint dan kompatibilitas

| Endpoint | Izin dan hasil |
| --- | --- |
| GET `/api/reviews` | `review.read` pada instansi dalam grant aktif. Halaman terfilter, ringkasan, eligibility dan count scoped. Tanpa grant menghasilkan halaman kosong; meminta instanceId yang tidak diizinkan menghasilkan 403 |
| GET `/api/instances/:instanceId/reviews/:reviewId` | `review.read` instansi; snapshot tersimpan, keputusan/catatan, versi dan pengamatan publik. ID tidak ditemukan tetap `{data:null}` sesuai kontrak sebelumnya. Mismatch target ditolak sebelum pemeriksaan publik |
| GET `/api/instances/:instanceId/reviews/:reviewId/comparison?against=:snapshotId` | `review.read`; hanya dua snapshot dari instansi, jenis dan sourceId yang sama. `against` adalah snapshot pembanding, bukan versi kerja bank |
| GET `/api/instances/:instanceId/reviews` | Array lama tetap tersedia: IN_REVIEW, maksimum 100, tanpa total. Query tidak didukung sekarang ditolak 400, tidak diabaikan diam-diam. UI baru harus memakai `/api/reviews` |
| POST `/api/instances/:instanceId/reviews/:reviewId/decisions` | Endpoint existing tidak berubah. Izin keputusan, CSRF, versi/checksum, idempotency, authority dan transaksi tetap diperiksa saat tindakan dilakukan |

Daftar lama server component (`listPendingReviews`) dipertahankan. Tidak ada penghapusan audit, baseline migration atau kontrak snapshot bank. DTO detail bertambah secara additive; versionKind/profileMediaId tidak tersedia dinormalisasi ke null. Query pada detail tidak didukung dan ditolak. Konsumen yang sebelumnya mengirim query di endpoint lama harus pindah ke endpoint baru.

Validator dan tipe client/server bersama ada di `src/domain/review-read-contract.ts`: ReviewPage, ReviewSummary, ReviewDetailResponse, SnapshotComparison. Filter memakai `src/domain/review-read.ts`. Ini kontrak TypeScript/Zod, bukan hasil generated OpenAPI baru. Belum ada client UI baru yang dipasang di tahap ini.

## Filter, pagination dan count

| Input | Nilai yang tersedia |
| --- | --- |
| instanceId, sourceId | UUID opsional; sourceId untuk menemukan versi satu aggregate. Gunakan instanceId + kind juga untuk mempersempit identitas |
| group | content (default) atau lifecycle; lifecycle adalah snapshot change_request dari tabel yang sama |
| kind | profile/contact/publication pada content; change_request pada lifecycle |
| state | IN_REVIEW (default), REVISION_REQUIRED, APPROVED, REJECTED, SUPERSEDED, atau all |
| commandState | none, PENDING, DISPATCHING, APPLIED, REJECTED, UNKNOWN; command Control ke bank, bukan outbox bank ke SJ |
| action | UNPUBLISH_PUBLICATION, ARCHIVE_PUBLICATION, HIDE_PROFILE, REVOKE_CONTACT, REVOKE_MEDIA, RECONFIRM_PUBLICATION |
| q | Substring literal case-insensitive pada title/public_name/label/target_label/reference_code snapshot, maksimum 120 karakter. Bukan search nama instansi atau nomor kontak |
| sort | submitted_asc (default) atau submitted_desc |
| limit | Bilangan bulat kanonis 1–100, default 25 |
| cursor | Opaque cursor dari nextCursor, terikat principal, scope instansi dan seluruh filter termasuk limit |

Unknown/duplicate parameter, ID rusak, filter kelompok bertentangan, karakter kontrol, batas tidak valid dan cursor rusak/tidak cocok menghasilkan HTTP 400 (VALIDATION_FAILED). Sesi tidak sah 401, scope eksplisit tidak diizinkan 403; kegagalan DB 503, bukan daftar kosong sukses. Error tidak memuat SQL, credential, payload internal atau detail koneksi.

Urutan stabil adalah `(submitted_at, id UUID)` dengan arah sama pada kedua kolom. Cursor mempertahankan presisi mikrodetik PostgreSQL, dilindungi HMAC dengan domain terpisah; cursor tidak memberikan izin. Rotasi kunci auth membatalkan cursor lama. UI menyimpan cursor tiap halaman untuk Back; ubah filter/limit berarti mulai dari halaman pertama.

count.value menghitung **snapshot dengan envelope yang tersedia**, sesuai group/filter dan grant instansi saat request, tidak dipotong cursor. scope=FILTERED_AUTHORIZED_SNAPSHOTS, includesCursor=false. Bukan jumlah aset unik, jumlah seluruh bank, jumlah yang tayang, atau gabungan content+lifecycle. Nol tetap nol. Total content dan lifecycle tidak dijumlahkan oleh kontrak ini.

consistency=LIVE_KEYSET: count dan halaman berasal dari satu statement DB; antar-request tetap live, bukan transaksi beku. Insert sebelum cursor tidak menggeser/mengulang baris yang sudah dilihat, tetapi baru terlihat setelah refresh dari awal. Perubahan state dapat menambah/menghilangkan baris dari filter di request berikutnya. UI jangan menjanjikan snapshot pagination beku atau jumlah halaman tetap.

## Batas data dan versi

Daftar hanya mengembalikan allowlist identitas, judul, jenis, sourceVersion, state, submittedAt, authority, commandState/resultCode, action/category, eligibility, latestReceivedVersion, dan bukti publik tersimpan. Envelope, contributor subjects, actor internal, kunci/signature, URL adapter, request payload, token dan catatan keputusan tidak ada di ringkasan. Nomor kontak hanya tersedia dalam detail snapshot yang memang diizinkan oleh review.read; kontrak belum memiliki permission masking nomor terpisah.

Daftar melakukan satu query halaman/count dan satu query batch bukti publik (di luar auth), **tanpa fetch detail per baris atau HTTP publik**. publicEvidenceMode=STORED_ONLY; null artinya belum ada bukti dalam konteks identitas/environment/origin sekarang, bukan tidak tayang. latestAttempt tidak mengganti lastSuccessfulObservation. Freshness adalah CHECK_TIME_ONLY, tidak ada TTL bisnis baru. Query batch memakai indeks konteks/ID migration 0011. Benchmark volume produksi belum dilakukan.

Detail mempertahankan snapshot immutable dan checksum dari bank, divalidasi schema, identitas serta digest envelope sebelum disajikan. decision memisahkan action/note/recordedAt dari applicationState/resultCode. APPLIED berarti ACK penerapan bank telah tervalidasi, bukan pengiriman SJ atau publikasi tampil. Endpoint detail masih melakukan pemeriksaan publik dan menyimpan hasil sebagaimana RC-SJ-05; jangan memakainya sebagai pemanggilan tiap baris.

versions.submitted adalah versi snapshot yang dibuka. latestReceived adalah pengajuan terbaru **yang sudah diterima Control**, bukan seluruh perubahan bank. bankCurrent=null, bankCurrentAvailability=NOT_AVAILABLE. Comparison membandingkan detail dua snapshot dengan basis=SUBMITTED_SNAPSHOTS; tidak membandingkan snapshot terhadap database bank atau konten publik. Path memakai JSON Pointer; array dibandingkan sebagai satu nilai. Angka nol, false, string panjang, array kosong yang sah dan null dipertahankan. Field yang tidak ada direpresentasikan null pada sisi perubahan; jangan menganggapnya data bernilai nol.

## Tindakan

actions dihitung server menggunakan permission existing, validasi keputusan, authority, state, keterlibatan pengaju, snapshot lebih baru, command yang sudah tercatat, flag integrasi dan kelengkapan konfigurasi. Aksi tanpa izin tidak dikirim. Aksi berizin tetapi terhalang tetap memiliki allowed=false, reasonCode dan alasan singkat.

Konten hanya approve/request_revision; lifecycle juga reject sesuai kontrak existing. requiresReason mengikuti validasi server. Tidak ada edit isi bank, retry UNKNOWN, atau tombol recovery tanpa kontrak. Eligibility adalah preflight pada waktu baca, bukan reservasi, pemeriksaan kesehatan jaringan/kunci file, atau jaminan keputusan akan berhasil. POST tetap memeriksa ulang state/grant/config dan mengunci aggregate. UI harus menangani 409/403/503 setelah tombol sempat tersedia.

## Dependency yang tidak boleh ditebak

| Kebutuhan | Kontrak yang diperiksa | Status |
| --- | --- | --- |
| Data kerja terkini di bank | `D:/backend-production/src/modules/seputar-jaminan/controlReview.route.js`: POST `/api/v1/internal/ruwang-control/sj-review/commands`, GET `/media/:mediaId`; tidak ada GET aggregate terkini untuk Control | BLOCKED; latestReceived tidak boleh dinamai data terbaru di bank |
| Kepastian efek command UNKNOWN | File route bank yang sama: tidak ada GET ledger command | BLOCKED; tidak ada retry otomatis/aksi recovery baru |
| Receipt/pengiriman/media per-event | Bank `controlMonitoring.contract.js`, `controlMonitoring.service.js`, `controlMonitoring.route.js`; SJ `apps/api/src/control-monitoring.ts`; GET `/api/v1/internal/ruwang-control/sj-monitoring/snapshot` (bank), `/v1/internal/ruwang-control/sj-monitoring/snapshot` (SJ) hanya services/queues | BLOCKED; summary antrean bukan status aset/receipt tertentu |
| Identitas/environment dan versi publik yang sesuai snapshot bank | `D:/seputarjaminan-production/apps/api/src/public-service.ts`, GET `/v1/public/assets/:referenceCode`, `/v1/public/institutions/:publicSlug`; public_asset_version/public_profile_version belum memberi mapping submission ID/version/checksum | BLOCKED untuk klaim exact-version; bukti API saat dicek tetap dapat ditampilkan sesuai batas RC-SJ-05 |

Prompt dependency terpisah:

> Pada tahap lintas repository yang diizinkan, audit route/service di tabel dependency. Rancang kontrak baca bank terkini dan ledger command dengan identity/instance/aggregate/version/checksum, serta korelasi pengiriman/receipt/proyeksi/media/publik per-event. Terapkan permission dan protokol authenticated/signed yang sesuai, response allowlist, scope instansi, batas freshness dan kompatibilitas. Jangan menambah alasan privat ke API publik, menyamakan versi event dengan versi draf, atau mengirim ulang efek UNKNOWN. Uji disposable positif/negatif, tenant, stale/version, respons hilang dan recovery; setelah itu sinkronkan consumer Control dan jalankan integrasi aplikasi nyata. Jangan mengedit repository lain sebagai bagian RC-SJ-06.

Rincian batas bukti tetap berlaku pada `control-monitoring-evidence.md` dan `control-dispatch-recovery.md`. Tidak ada migration baru RC-SJ-06. Source membutuhkan migration 0011 dari RC-SJ-05; database normal belum dimigrasikan oleh pekerjaan ini.

## Verifikasi aman

Setelah membaca script dan memverifikasi target, npm run test:read-disposable menjalankan akun reviewer/observer nyata, API Next in-process, DB milik run dengan runtime non-superuser/non-BYPASSRLS, dan double bank/SJ milik run. Lihat `control-disposable-tests.md`. Ini bukan browser/HTTP Next atau integrasi bank/SJ nyata.

Tidak ada perubahan visual pada tahap ini. Inspeksi viewport/tema/keyboard/screenshot NOT APPLICABLE; pemakaian DTO oleh UI baru dan browser perlu tahap UI tersendiri. Tidak ada preview normal yang dinyalakan otomatis.
