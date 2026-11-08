# Penerimaan pengajuan dan keputusan Control

## Identitas dan versi

Ingress `POST /api/internal/sj-review/snapshots` menerima envelope bertanda tangan dari instansi yang aktif dengan authority central. Snapshot terikat pada instansi, jenis/ID aggregate, source_version, checksum, contributor dan digest envelope. Checksum payload berasal dari bank; Control tidak menghitung checksum bank dari detail yang telah direduksi untuk pemeriksa.

Snapshot ID yang sama dengan envelope identik dapat diterima ulang memakai nonce transport baru. Nonce lama ditolak. Isi berbeda dengan ID sama, atau ID lain dengan versi yang sama/lebih lama, ditolak. Versi baru menandai snapshot IN_REVIEW yang lebih lama sebagai SUPERSEDED. Keputusan historis tidak dihapus. Urutan versi, bukan urutan waktu tiba, menentukan pengganti.

## Keputusan dan konkurensi

Akses aktif memakai satu role aplikasi internal_operator pada instansi terdaftar; lihat [control-internal-access.md](control-internal-access.md). Verifikasi identitas manual dihentikan. Qualified-subject self-review tetap berlaku, tetapi dua akun berbeda tidak membuktikan dua orang berbeda. Jangan membuat binding manusia dari nama/email atau mengembalikan pembagian role lama.

Endpoint keputusan existing memeriksa sesi, role, scope instansi, authority dan contributor; izin dibaca ulang dalam transaksi termasuk saat idempotent replay. Tidak ada endpoint baru untuk mengedit isi bank. Penguncian transaksi per aggregate dipakai bersama oleh ingress, enqueue dan completion.

- Content: approve atau request_revision, sesuai kontrak existing; revision wajib catatan.
- Lifecycle: approve/reject sesuai kontrak existing dan wajib alasan; tidak menambah keputusan baru.
- Dua pemeriksa dengan intent berbeda tidak dapat membuat dua keputusan untuk snapshot yang sama.
- Intent identik dari pemeriksa yang sama menggunakan command awal, termasuk ketika tab lain membuat idempotency key baru. Catatan/versi/checksum yang berbeda adalah konflik, bukan pembaruan command.
- Pengajuan ulang setelah revisi adalah snapshot versi baru; catatan dan keputusan versi lama tetap tersimpan.
- PENDING berarti keputusan tersimpan untuk dikirim, bukan sudah diterapkan bank. APPLIED baru sesudah ACK bank sah. Semua status ini bukan bukti tampil di SJ.

Dispatch hanya mengklaim PENDING. Perintah kedaluwarsa sebelum kirim atau terkait versi yang sudah digantikan ditolak lokal tanpa memanggil bank (`COMMAND_EXPIRED_BEFORE_SEND`, `SNAPSHOT_SUPERSEDED`). Jangan menganggap REJECTED tersebut sebagai keputusan pemeriksa untuk menolak isi. Tidak ada penggantian command diam-diam.

## ACK dan hasil belum pasti

HTTP 200 saja tidak cukup. Validasi meliputi schema, signature, key, nonce, digest command, identitas instansi/resource dan semantik hasil. Menurut bank saat ini, APPLIED memakai result_code DECISION_APPLIED; versi content bertambah satu, sedangkan request_version lifecycle tetap. Checksum tetap untuk profil/kontak/revisi/lifecycle. Khusus approve publikasi, bank membentuk ulang payload publik beserta waktu penayangan sehingga checksum hasil dapat berubah. Control menerima observed_checksum hasil yang valid menurut schema dan terikat signature serta command_digest; Control tidak mengklaim menghitung ulang checksum hasil publikasi tanpa payload hasil. Rujukan: `D:/backend-production/src/modules/seputar-jaminan/controlReview.service.js`, `profileContact.service.js`, `seputarJaminan.service.js` dan `changeRequest.service.js`.

ACK terlambat hanya boleh merekam hasil command lama selama attempt masih memiliki lease aktif; tidak mengubah snapshot SUPERSEDED atau snapshot baru. Pembaruan command/failure bersyarat pada DISPATCHING dan attempt pemilik. Respons kosong/rusak, timeout atau koneksi putus tidak dijadikan sukses. UNKNOWN/DISPATCHING tidak dikirim ulang oleh klik/tab baru; GET command scoped hanya membaca hasil Control yang tersedia.

**Recovery RC-SJ-10:** bank menyediakan POST baca `/api/v1/internal/ruwang-control/sj-review/command-results`. Control dapat memeriksa hasil UNKNOWN dengan izin keputusan, sesi/CSRF sah dan ikatan tujuan asli. Ini membaca ledger, bukan mengirim ulang keputusan. Hasil sah RECORDED menyelesaikan command; NOT_RECORDED tetap UNKNOWN karena transaksi bank mungkin belum selesai. Riwayat attempt gagal dan snapshot SUPERSEDED dipertahankan. Keputusan REJECTED/expired tidak diperbaiki dengan key baru pada snapshot yang sama. Lihat `docs/control-dispatch-recovery.md` untuk kontrak dan batasnya.

## Migration dan pengujian aman

Migration additive `0008_review_authority_lock.sql` menyediakan fungsi SECURITY DEFINER yang hanya melakukan row lock pada registry/operator dengan search_path pg_catalog. Hak PUBLIC dicabut; migrator memberi EXECUTE hanya ke runtime role terkonfigurasi. Runtime tidak memperoleh UPDATE pada registry/operator. Fungsi diperlukan karena FOR SHARE langsung memerlukan hak tulis yang tidak dimiliki runtime. Readiness menolak schema yang belum memiliki fungsi tersebut.

Catatan RC-SJ-03 tentang fresh 0001–0008 dan upgrade 0001–0007 ke 0008 adalah bukti tahap lama, bukan schema final atau hasil tes ulang. Source sekarang sampai 0016; cakupan runner terkini ada di [control-disposable-tests.md](control-disposable-tests.md). Database normal tidak otomatis dimigrasi oleh tes. Jangan memakai perintah migrasi normal sebelum target dan credential scope diverifikasi. Migration historis tidak diubah.

Jalankan entry point yang didokumentasikan di `docs/control-disposable-tests.md`. Tes memakai PostgreSQL milik run, runtime non-superuser/non-BYPASSRLS dan bank/SJ test double, bukan integrasi lintas aplikasi nyata. In-process API tidak menggantikan browser/HTTP-server test. Tidak ada perubahan tampilan pada tahap ini.
