# Bukti monitoring Control — RC-SJ-05

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

Dokumen ini menjelaskan kontrak baca backend, bukan klaim UI baru, integrasi lintas aplikasi nyata, atau kesiapan produksi. Tidak ada endpoint publik/admin baru. DTO bertambah pada GET `/api/instances/[instanceId]/reviews/[reviewId]` dan GET/POST `/api/monitoring` existing; izin review.read/monitoring.read serta scope instansi tetap wajib.

## Arti setiap lapisan

| Lapisan | Sumber Control | Batas klaim |
| --- | --- | --- |
| Pengajuan/keputusan | review_snapshots.state, review_commands.decision | Keputusan pemeriksa, bukan bukti bank menerapkan |
| Penerapan bank | review_commands.state/result_code, ACK bank bertanda tangan | APPLIED hanya sesuai validasi ACK; UNKNOWN tetap belum pasti |
| Pengiriman bank ke SJ | signed snapshot: queues outbox/pipeline | Ringkasan sumber, bukan receipt event/aset tertentu |
| Tanda terima SJ | Tidak tersedia per-event dalam DTO monitoring Control | Tidak boleh disimpulkan dari APPLIED atau HTTP 200 |
| Media/proyeksi | signed snapshot services/queues; media snapshot pengajuan | Snapshot pengajuan bukan status scanner/proyeksi terkini |
| Publik | publicEvidence dari detail API SJ yang tervalidasi | Tersedia/tidak tersedia di API saat dicek; bukan pemeriksaan HTML/CDN/byte media |

## PublicEvidence

Implementasi: `src/domain/public-observation.ts`, `src/server/public-evidence.ts`, `src/server/reviews.ts`; penyimpanan additive `migrations/0011_monitoring_evidence.sql`.

- `latestAttempt`: waktu mulai/selesai dan hasil percobaan terakhir berdasarkan ID bigint numerik, bukan urutan respons datang. Percobaan yang belum selesai menjadi CHECK_INCOMPLETE.
- `lastSuccessfulObservation`: hasil valid visible/not_visible terakhir. Error/timeout tidak menghapusnya.
- `lastFailedAttempt`: hasil unknown terakhir; keberhasilan berikutnya tidak menghapus catatan kegagalan.
- `observedVersion` dan `versionKind`: angka public_asset_version atau public_profile_version yang benar-benar diberikan API. Field tidak tersedia berarti null. Bukan sourceVersion draf/pengajuan bank.
- `versionComparison=NOT_PROVEN`: tidak ada pemetaan terpercaya antara versi event publik dan versi draf bank. Dilarang menyebut pengajuan baru sudah tampil hanya karena endpoint publik tersedia.
- `identity`: instance dari envelope yang telah diverifikasi, resource/target ID, reference code, slug. Digest penyimpanan mengikat identitas itu ke origin konfigurasi dan CONTROL_APP_ENV. Pergantian identitas/origin/environment tidak mewarisi bukti konteks lama.
- `environment` adalah konfigurasi Control, **bukan attestation environment dari SJ**. `sourceOrigin` adalah origin yang benar-benar diminta. Tidak ada klaim remote environment telah dibuktikan.
- `freshness=CHECK_TIME_ONLY`: fakta pada checkedAt, tanpa TTL baru yang dipilih sembarang. Field public_updated_at pada aset diperiksa tidak berada di masa depan; bukan waktu observasi server.

Pemeriksaan publik independen dari keputusan baru: pengajuan IN_REVIEW dapat mempunyai versi lama yang masih publik. Field kompatibel publicVisibility/publicObservation tetap mencerminkan percobaan terbaru, bukan mengganti timeout dengan sukses lama. Konsumen yang ingin menunjukkan fakta lama harus membaca field lastSuccessfulObservation secara terpisah dan menyertakan waktunya.

Validasi mencakup JSON/MIME/UTF-8/ukuran/timeout tubuh respons/redirect, schema allowlist, reference code dan slug instansi. Profil juga membutuhkan kecocokan central_media_id logo snapshot atau binding positif terdahulu dalam konteks sama. Profil tanpa binding mendapat IDENTITY_UNCONFIRMED, bukan diasumsikan tersembunyi. Ini binding terbatas dari kontrak existing, bukan bukti immutable institution ID. URL media/WhatsApp tidak dikunjungi; tidak ada pesan dikirim.

## Lifecycle dan keterbatasan

| Kasus | Aturan bukti |
| --- | --- |
| Profil disembunyikan | Typed INSTITUTION_NOT_FOUND + binding sebelumnya: not_visible pada API. Tanpa binding: unknown. Tidak otomatis membuktikan command hide berhasil |
| Penarikan/arsip | Cek reference aset, bukan profil. Typed ASSET_NOT_FOUND: tidak tersedia; reason dan observedVersion null. Tidak membedakan arsip vs penarikan |
| Kontak/media dicabut | not_applicable untuk halaman publik mandiri. Dampak aset harus diperiksa per-aset; tidak disimpulkan dari kontak/profil |
| Expiry/quarantine | Detail SJ dapat mengembalikan ASSET_NOT_FOUND. Control tidak menebak penyebabnya sebagai expiry/quarantine |
| Versi lama saat revisi | Simpan versi API publik, terpisah dari versi pengajuan dan command |
| Offline/503/timeout/respons tidak sah | unknown untuk percobaan terbaru; fakta valid sebelumnya tetap tersimpan |

Dasar SJ: `D:/seputarjaminan-production/apps/api/src/public-service.ts`, visibilityWhere/getAsset/getInstitution. Filter publik mempertimbangkan status publikasi, availability, reconfirmation, instansi/profil aktif, kontak VERIFIED dan cover READY. Tidak semua media harus tersedia agar detail tetap tampil; profil dapat tampil tanpa bukti byte logo atau semua aset. Karena itu Control tidak mengklaim semua media/semua aset sehat.

## Monitoring pipeline

`src/server/monitoring.ts` menyimpan last_snapshot bertanda tangan, last_success_at, percobaan terakhir dan kegagalan terakhir secara terpisah. Tidak ada backfill sukses untuk data historis tanpa binding. Digest target mengikat instansi, jenis sumber, origin, audience, key respons dan environment Control. Perubahan target menyembunyikan bukti konteks lama, tanpa menghapusnya dari database.

Ringkasan kosong atau komponen unknown bukan healthy. Degraded pada service ATAU queue menghasilkan degraded. Healthy hanya menyatakan komponen yang dilaporkan sumber, bukan seluruh publikasi. Nol antrean bukan bukti worker berhasil memproses. Poll berlangsung tidak mempertahankan status sehat sebagai hasil percobaan yang belum selesai. Signature, schema, instance/kind, nonce, checksum, waktu sumber dan ownership tetap diperiksa. Respons lama tidak menimpa snapshot baru. Freshness memakai stale_after_seconds konfigurasi existing, tidak ada ambang bisnis baru.

DTO `lastSuccessfulCheck`, `lastAttempt`, `lastFailure` dan `evidenceScope=SIGNED_PIPELINE_SNAPSHOT` membedakan sumber bukti. UI belum ditambah panel baru pada tahap backend ini. Browser/viewport bukan bukti yang diklaim di sini.

## Dependency yang tetap BLOCKED

1. **Identitas/environment publik penuh dan pemetaan versi.** SJ `apps/api/src/public-service.ts` GET `/v1/public/assets/:referenceCode` serta `/v1/public/institutions/:publicSlug` hanya memberi reference/slug, versi event publik dan konten publik. Tidak ada immutable institution/installation identity, environment teratestasi, bank submission ID/version/checksum atau mapping ke snapshot yang disetujui. Jangan menyebut konten versi bank tertentu telah tayang.
2. **Alasan hilang dan kesiapan media/proyeksi per-aset.** File/endpoint yang sama tidak memberikan private reason, media revocation/quarantine/expiry evidence, processed-event identity atau correlation ke receipt. Typed 404 tidak membuktikan penyebab maupun keberhasilan lifecycle.
3. **Monitoring per-event dan recovery ACK hilang.** Bank `src/modules/seputar-jaminan/controlMonitoring.contract.js`, `controlMonitoring.service.js`, `controlMonitoring.route.js`, GET `/api/v1/internal/ruwang-control/sj-monitoring/snapshot`; SJ `apps/api/src/control-monitoring.ts`, GET `/v1/internal/ruwang-control/sj-monitoring/snapshot`: services/queues adalah ringkasan, bukan ledger event/aset. Kontrak baca ledger keputusan bank yang dicatat RC-SJ-04 juga masih belum tersedia.

Prompt dependency terpisah (belum diotorisasi/dikerjakan):

> Audit dan perluas kontrak baca bukti SJ/bank dalam tahap lintas repository tersendiri. Periksa file/endpoint di atas; rancang identitas instalasi/instansi/environment yang tervalidasi, korelasi resource/event/submission/versi/checksum, waktu bukti, status penerapan/pengiriman/receipt/proyeksi/media dan alasan tidak publik yang aman. Jangan membocorkan alasan privat melalui endpoint publik. Tentukan izin dan protokol authenticated/signed yang sesuai masing-masing jalur, bukan menyamakan ACK ingest SJ dengan ACK Control. Pertahankan kompatibilitas; gunakan migration additive jika diperlukan. Uji disposable positif/negatif, tenant/scope, replay/stale, response loss, timeout dan versi lama. Jangan mengarang keberhasilan atau retry efek belum pasti. Setelah kontrak tersedia, lakukan tahap consumer Control dan gate integrasi nyata terpisah.

## Operasi aman

Jalankan `test:evidence-disposable` setelah inspeksi script dan target. Database normal tidak dimigrasi oleh tes. Sebelum runtime normal memakai source ini, migration 0011 harus diterapkan melalui pekerjaan database terverifikasi; readiness memeriksa tabel baru. Tidak ada reset atau migrasi otomatis saat membaca detail. Observasi tersimpan tidak dipangkas otomatis; kebijakan retention/volume operasional perlu ditetapkan terpisah, tanpa hard-delete audit diam-diam. Tes lokal bank/SJ memakai double, bukan integrasi nyata.
