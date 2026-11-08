# Pengiriman dan recovery Control — RC-SJ-04

## Pemilik dan arah pesan

| Arah | Kontrak/sumber | Kepemilikan dan arti hasil |
| --- | --- | --- |
| Bank → Control: snapshot | Control `app/api/internal/sj-review/snapshots/route.ts`, `src/server/review-adapter.ts`; bank `src/modules/seputar-jaminan/controlReviewSnapshot.service.js` | Outbox pengirim milik bank. Ingress bertanda tangan menerima snapshot; bukan keputusan atau bukti tampil. |
| Control → bank: keputusan | `POST /api/v1/internal/ruwang-control/sj-review/commands`; Control `src/server/review-adapter.ts`; bank `controlReview.route.js`, `controlReview.contract.js`, `controlReview.service.js` | `review_commands` dan `review_dispatch_attempts` milik Control. ACK wajib schema, identitas, digest, versi, checksum sesuai semantik, nonce, waktu dan signature bank. APPLIED berarti penerapan keputusan bank, bukan publikasi tampil. |
| Bank → SJ: ingest | Bank `src/modules/seputar-jaminan/syncWorker.service.js`; SJ `packages/contracts/openapi/openapi.v1.yaml`, `/v1/ingest/events` | Outbox bank, ingest/proyeksi/scanner SJ bukan antrean Control. ACK ingest SJ tidak diganti menjadi protokol signature ACK Control. |
| Control → bank/SJ: polling baca | `src/server/monitoring.ts`, `src/domain/monitoring-transport.ts`; GET `/api/v1/internal/ruwang-control/sj-monitoring/snapshot` atau `/v1/internal/ruwang-control/sj-monitoring/snapshot` | Control memiliki jadwal dan hasil polling saja. Respons ditandatangani menurut kontrak monitoring. Tidak mengirim ulang pekerjaan bank/SJ. |

Pemeriksaan publik milik Control dihentikan. Pengamatan yang dimiliki bank/SJ tetap terpisah, bukan ACK atau mekanisme recovery command Control. Pengiriman berhasil tidak menjadi label tampil. Panduan ini tidak menambahkan kontrak status baru.

## Claim dan completion

- Enqueue mengikat target dengan digest instansi, URL, audience, ID key Control, ID key bank dan public key bank. Target berubah atau command lama tanpa target yang terbukti ditahan UNKNOWN sebelum jaringan dipanggil. Tidak melakukan backfill dari registry hari ini.
- Claim menggunakan transaksi, lock aggregate dan lock command. Hanya PENDING dengan `dispatch_count=0` dapat membuat attempt. Dua proses memperoleh paling banyak satu claim dan satu pengiriman.
- `dispatch_attempt_id` dan lease menjadi bukti pemilik completion. Anggaran lease berasal dari timeout jaringan + dua timeout statement DB + timeout koneksi DB + margin 1 detik; bukan TTL bisnis atau freshness publik.
- ACK sukses hanya boleh menyelesaikan attempt yang sama dan lease aktif. Hasil pemilik lama setelah recovery tidak mengubah command/snapshot. Snapshot yang sudah SUPERSEDED tidak kembali APPROVED.
- Setelah crash, lease kedaluwarsa ditutup UNKNOWN / `DISPATCH_LEASE_EXPIRED`, beserta catatan attempt. Tidak diklaim berhasil dan tidak dikirim ulang. Command lama DISPATCHING tanpa lease juga ditahan demikian.
- Body ACK dibatasi 64 KiB dan UTF-8 valid. HTTP 200, `{}`, signature salah, identitas salah, hasil/version salah, body terlalu besar atau timeout tidak menjadi APPLIED.

## Retry, batas dan kegagalan

| Kondisi | Penanganan |
| --- | --- |
| DB/key tidak tersedia sebelum claim | Tidak ada kirim; PENDING dapat dicoba melalui siklus berikut setelah dependency pulih dan guard lolos. |
| PENDING stale/expired | REJECTED lokal dengan alasan; tidak memanggil bank. Bukan keputusan pemeriksa menolak isi. |
| Target tidak cocok / tidak terbukti | UNKNOWN, tanpa kirim atau retarget diam-diam. |
| Crash setelah claim, respons hilang, ACK rusak, kegagalan penyimpanan hasil | UNKNOWN setelah failure/recovery; jika DB masih putus tetap DISPATCHING hingga DB pulih dan lease direcover. |
| ACK penolakan bank yang sah | REJECTED; tidak diulang dengan command pengganti untuk snapshot sama. |
| Polling baca gagal | Backoff existing bertambah dengan batas konfigurasi; hasil komponen sebelumnya dipertahankan, hasil percobaan terbaru tidak dilabeli sehat. |

Batas command adalah satu percobaan pengiriman keputusan setelah claim. UNKNOWN adalah penahanan existing, **bukan** enum quarantine baru dan tidak sama dengan quarantine ingest SJ. RC-SJ-10 menambahkan pemeriksaan ledger bertanda tangan, bukan retry mutasi. Tombol “Periksa hasil di bank” hanya ditampilkan menurut eligibility server dan izin keputusan; pemeriksaan baca boleh diulang tanpa menerapkan keputusan bisnis.

Polling menggunakan token per reservasi. Completion memeriksa token serta identitas/tujuan/key sumber. Poll lama tidak bisa menimpa pemilik baru; waktu observasi sumber yang lebih tua ditolak dan komponen baru tetap disimpan. Reservasi crash dapat diambil lagi ketika `next_poll_at` jatuh tempo. Ini bukti status sumber monitoring, bukan pemeriksaan publik Control; fitur publik Control telah dihentikan, bukan menunggu tahap lain.

## Siklus pemeliharaan eksplisit

`npm run review:dispatch-cycle -- --instance <UUID>` melakukan satu siklus: pulihkan maksimal 100 lease, periksa maksimal 25 PENDING menurut created_at/id, lalu selesai. Tidak ada daemon/scheduler otomatis, port atau `.env.local` otomatis. Script memerlukan konfigurasi runtime yang disuntik secara eksplisit, role database terkonfigurasi tanpa SUPERUSER/BYPASSRLS/hak CREATE schema, schema siap dan instansi aktif central. Ini akses pemeliharaan server melalui credential runtime, bukan izin baru bagi reviewer atau endpoint publik.

**Jangan jalankan terhadap database normal untuk mengetes.** Verifikasi target dan scope dahulu; untuk pengujian gunakan `test:dispatch-disposable` yang menyiapkan target milik run dan menjalankan CLI di sana. Siklus tidak menghapus audit, mereset database, memperbarui target command lama atau mengirim UNKNOWN. Tidak menjanjikan antrean habis dalam satu siklus. Count `failed` menunjukkan kegagalan siklus, bukan keberhasilan pengiriman; `held` bukan APPLIED.

Claim/recovery diperkenalkan melalui migration additive 0009 dan 0010. Keduanya bukan schema final: source sekarang memuat 0001–0016; ikuti migrator/readiness aktual, jangan berhenti di 0010 karena catatan RC-SJ-04. Dokumen ini tidak menjalankan migration database normal; migration historis tidak diubah.

## Kontrak hasil bank setelah ACK hilang — RC-SJ-10

Repository: `D:/backend-production`.
File: `src/modules/seputar-jaminan/controlReview.route.js`, `controlReview.controller.js`, `controlReview.service.js`, `controlReview.contract.js`.
POST `/api/v1/internal/ruwang-control/sj-review/command-results` adalah operasi baca ledger. Body strict: `contract_version:1`, `command_id`, `command_digest`, `instance_id`, `audience`, `resource:{kind,id}`. Transport Ed25519 memakai path tersebut, timestamp baru, nonce sekali pakai dan digest body. Command asli tidak dikirim ulang dan boleh sudah kedaluwarsa; permintaan baca tetap harus segar. Bank memeriksa instalasi, authority central dan review_enabled, memakai role review terbatas yang sama.

Respons bertanda tangan mengikat `instance_id`, `command_id`, `command_digest`, `resource`, `request_nonce`, `checked_at`, `state:RECORDED|NOT_RECORDED`, `acknowledgment`. RECORDED membawa ACK ledger asli; NOT_RECORDED membawa null. Ketidakcocokan identitas/digest ditolak, bukan dianggap tidak ditemukan. HTTP200/JSON kosong bukan hasil sah. Body dibatasi 64KiB; waktu, nonce respons, signature dan semantik ACK divalidasi Control.

Consumer Control: POST `/api/instances/:instanceId/review-commands/:commandId`, body strict `{action:"check_result"}`; sesi, origin, CSRF dan izin keputusan dibaca ulang sebelum jaringan dan sebelum completion. Tuple target immutable harus tetap cocok. Dua pemeriksaan bersamaan hanya menyelesaikan hasil sekali; tidak membuat command/dispatch attempt baru. Hasil penerapan tetap bukan bukti publik.

NOT_RECORDED, timeout, signature salah dan respons rusak tetap UNKNOWN. Tidak boleh menyimpulkan gagal atau mengirim pengganti dari ketiadaan ledger. Tujuan lama yang tidak terbukti tetap terhalang. Recovery per-job bank/SJ mengikuti kontrak terpisah di [sj-recovery.md](sj-recovery.md), bukan endpoint hasil command ini. Lineage publik Control telah dihentikan bersama pemeriksaan publik, bukan dependency untuk dipasang ulang.

## Bukti dan batas

`test:dispatch-disposable` menjalankan service/handler Control nyata dan dua proses dispatcher dengan database terisolasi, **bank/SJ test double**, bukan aplikasi bank/SJ nyata. Upgrade baseline registry bukan salinan transaksi produksi. Failure DB diinjeksi pada koneksi adapter, bukan mematikan shared PostgreSQL. Tidak ada Redis Control. UI/browser tidak diubah dan inspeksi visual tidak berlaku. Lihat `control-disposable-tests.md` untuk cleanup dan pemulihan runner setelah disconnect.
