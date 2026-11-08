# Scope awal Control — alur SJ lengkap

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

> Scope/baseline awal dipertahankan sebagai sejarah. Kemampuan dan batas final RC-SJ-11 dirangkum di [control-sj-current.md](control-sj-current.md); bukan klaim seluruh workflow atau integrasi telah selesai.

Tanggal lokal: 10 September 2026. STATUS: fondasi, auth, snapshot/command/ack adapter approve atau revision, antrean/detail/media reviewer, serta monitoring read-only SJ tersedia lokal. Flow disposable profil, kontak dan publikasi sampai tampil di SJ lokal lulus; removal/reconfirm dan koneksi produksi belum tersedia.

## Scope dan pembagian tanggung jawab

- Tahap awal: profil BPRS, kontak WhatsApp, logo/foto, katalog, pemeriksaan perubahan, request penarikan/penghapusan dan monitoring pipeline SJ. Operator Control, permission serta audit wajib sebagai fondasi.
- Bank tetap sumber data: input, simpan draf, tinjau isian, ajukan, perbaiki revisi, lihat hasil dan request hapus. "Review" di bank berarti tinjau isian/hasil, bukan keputusan approval.
- Control mengambil keputusan manusia setelah authority pusat diaktifkan. Tidak menulis SQL bank, memakai token Admin bank atau membuat konten atas nama bank.
- Akun bank (monitoring/create/recovery/delete), pengaduan dan monitoring umum VPS: Coming soon, navigasi disabled, route/API server ditolak dan flag server false. Tidak mengambil data untuk mengisi menu Coming soon. Login/operator Control bukan modul akun bank yang ditunda.
- Development berikutnya langsung aplikasi operasional lokal dengan API/database nyata. Tidak ada prototype/wireframe baru atau kewajiban persetujuan contoh visual sebelum development. Fixture hanya di lingkungan tes terisolasi. Empty hanya setelah query sukses kosong; unknown/error jika sumber belum tersedia.
- Step gabungan mengubah source lokal Control, modul SJ backend Ruwang, API/worker pusat SJ untuk monitoring, serta tiga file modul SJ frontend Ruwang untuk authority-aware read-only. VPS, commit, push dan deployment tidak disentuh.

## Audit source aktual, bukan klaim runtime VPS

SHA/status/checksum source pembanding di source-evidence.json dicocokkan ulang oleh check-integrity. Rujukan fungsi berikut dibaca pada audit ini; path BE relatif D:/backend-production, FE relatif D:/frontend-production, SJ relatif D:/seputarjaminan-production.

| Source | Fakta implementasi lokal | Gap menuju target |
| --- | --- | --- |
| BE src/modules/seputar-jaminan/seputarJaminan.route.js | create/draft/submit dan keputusan lokal tetap ada; profile/contact/publication decision menolak saat authority central; endpoint internal snapshot/command/media bertanda tangan tersedia | Removal/reconfirm/media revoke belum seluruhnya authority-aware; central produksi belum boleh diaktifkan |
| BE seputarJaminan.service.js: approveAndPublish | Menolak last_edited_by/submitted_by sama; koneksi ACTIVE, profil/kontak ACKNOWLEDGED, media READY; external actor Control dan outbox publikasi | Pemetaan contributor pusat di luar subject berkualifikasi belum ada |
| BE seputarJaminan.service.js: unpublish/archive | Unpublish hanya PUBLISHED; archive menolak PUBLISHED dan menyimpan archived_at, bukan DELETE row | Archive bukan purge; belum request hapus pusat |
| BE profileContact.service.js: saveProfileDraft/submitProfile/verifyProfile | Versi draf/current_version_id, logo pusat READY, checksum, pembuat berbeda; UPSERT_BPRS_PROFILE | Tidak ada endpoint delete profil pada route yang diperiksa; field agregat lokal ikut berubah ketika draft diedit sehingga draft/published perlu dibedakan |
| BE profileContact.service.js: verifyContact/revokeContact | Verify pembuat berbeda; revoke menolak kontak yang dipakai katalog tayang | Reusable contact harus tetap terlindungi; revoke menjadi request pada mode pusat |
| BE seputarJaminan.route.js dan media.service.js | Upload/status/content serta DELETE media berupa revoke dan event REVOKE_MEDIA | Jangan menjadikan revoke media sebagai bypass penghapusan profil/katalog |
| FE src/components/seputar-jaminan/SeputarJaminanCatalogClient.tsx | Aksi unpublish/archive lokal masih disajikan | Ubah menjadi request/status sesuai authority, bukan redesign seluruh Ruwang |
| FE SeputarJaminanProfileContactClient.tsx dan SeputarJaminanReviewClient.tsx | Draf/submit profil/kontak tersedia; halaman pemeriksaan membaca authority dan menyembunyikan keputusan lokal dalam mode pusat | Timeline request removal/reconfirm belum tersedia |
| SJ packages/contracts/openapi/openapi.v1.yaml | Ingest/media/reconciliation/public/ops; ops memiliki login/MFA/suspend institusi | Ops SJ bukan API review bank Control; suspend institusi bukan hapus profil |
| SJ packages/contracts/schemas/v1/event-envelope.schema.json | UPSERT_BPRS_PROFILE, UPSERT_WHATSAPP_CONTACT, REVOKE_WHATSAPP_CONTACT, UPSERT_PUBLICATION_SNAPSHOT, UNPUBLISH_PUBLICATION, ARCHIVE_PUBLICATION, REVOKE_MEDIA | Belum event penghapusan profil; perlu kontrak/versioning/consumer baru yang kompatibel |
| Control contracts/review-command.schema.json dan review-ack.schema.json | Kontrak V1 publication/profile/contact untuk approve/request_revision dan acknowledgment bertanda tangan tersedia | Belum removal/reconfirm/deny/cancel/impact |
| Control authorization, migration 0002/0003/0004/0005, review adapter dan monitoring | Grant per instansi, auth, snapshot ingress/envelope/nonce, antrean/detail/media, command/outbox/ack, polling bertanda tangan, freshness, timeout/backoff dan status minimum tersedia lokal | Permission removal/reconfirm/retry scheduler dan konektivitas live belum tersedia |
| BE prisma/schema.prisma users, user.service.js, user.route.js, auth.route.js/auth.service.js | Email wajib unik; create menolak password langsung/send_invite false; token reset; delete-impact dan delete lokal dengan dependensi/konfirmasi | Audit konteks saja: akun bank ditunda, jangan ubah auth/users dalam SJ-only |

Audit awal tidak menemukan authority/adapter; checkpoint ini menambahkannya melalui migration baru dan endpoint internal bertanda tangan tanpa token Admin bank. ResetPassword tetap tidak diubah dan modul akun bank tetap Coming soon.

## Matriks permission target per bank

Semua grant dicek server. Read agregat hanya union instansi yang diizinkan; mutasi satu instansi eksplisit. Observer, reviewer, bank account manager dan Control access manager sudah tersedia pada schema/policy lokal. Role/action removal, reconfirm dan retry berikut masih rancangan.

| Aksi | Bank sesuai Role–Menu SJ | Observer Control | Reviewer SJ Control | Pengelola removal SJ | Control access manager |
| --- | --- | --- | --- | --- | --- |
| Baca data/status SJ | Bank sendiri | Scope grant | Scope grant | Scope grant | Metadata instansi/grant saja |
| Input/draf/upload/ajukan/tinjau hasil | Ya | Tidak | Tidak | Tidak | Tidak |
| Approve/minta revisi profil/kontak/katalog | Tidak dalam mode pusat | Tidak | Ya, bukan contributor | Perlu grant reviewer tambahan | Tidak |
| Request hapus/penarikan/reconfirm | Ya, bank sendiri | Tidak | Tidak menggantikan bank | Tidak menggantikan bank | Tidak |
| Tinjau dampak/putuskan request removal | Lihat dampak/status sendiri | Baca | Perlu grant removal tambahan | Setujui/tolak/minta perbaikan, bukan pengaju | Tidak |
| Putuskan reconfirm | Lihat status | Baca | Ya | Tidak | Tidak |
| Retry/reconciliation teknis | Lihat status | Tidak otomatis | Tidak otomatis | Tidak otomatis | Tidak otomatis |
| Baca audit | Riwayat objek bank sendiri | Scope grant | Riwayat keputusan relevan | Riwayat removal relevan | Audit grant saja |
| Kelola grant Control | Tidak | Tidak | Tidak | Tidak | Ya, tanpa self-escalation |
| SQL/purge fisik/audit delete | Tidak | Tidak | Tidak | Tidak | Tidak |
| Akun bank/Coming soon melalui Control | Tidak | Tidak | Tidak | Tidak | Tidak |

- Admin/reviewer bank tidak otomatis menjadi operator Control. Tidak ada wildcard bank atau grant berdasarkan nama role saja. Operator boleh mendapat beberapa grant eksplisit; removal dipisahkan karena dampaknya lebih besar.
- `monitoring.read` sudah diimplementasikan untuk observer/reviewer sesuai grant instansi. Action tambahan yang perlu diimplementasikan: removal.read/decide, reconfirm.decide, sync.retry. Retry memerlukan grant teknis khusus per instansi dan audit, tanpa mengubah payload/versi/target atau menghidupkan kembali objek yang dihapus.
- Keputusan membutuhkan sesi sah, grant per instansi, versi/checksum dan authority pusat. Removal membutuhkan re-auth password baru, alasan dan konfirmasi objek+bank. Pemohon/pembuat/pengaju dan pemutus berbeda berdasarkan identitas berkualifikasi serta pemetaan lintas akun yang terverifikasi, bukan UUID mentah saja.
- Bank tetap menggunakan Role–Menu untuk hak input/read/request. Role–Menu tidak bisa mengesampingkan larangan approval/removal lokal saat pusat aktif.
- Bootstrap operator/grant recovery harus diaudit, tanpa signup publik/default superadmin atau self-escalation. Permission tambahan tidak otomatis terpasang hanya karena ditulis di dokumen.

## Flow profil, kontak, media dan katalog

1. Bank isi draf, upload melalui jalur media/scanner yang ada, tinjau isian dan ajukan versi tertentu. Control hanya menerima data SJ minimum; bukan dokumen nasabah/agunan internal.
2. Snapshot immutable dikirim privat ke Control dengan instansi, contributor, jenis, versi/checksum dan referensi media berizin. Pending review tidak ditayangkan melalui API publik SJ.
3. Operator tinjau. Revisi mengembalikan catatan wajib ke bank; bank perbaiki dan ajukan ulang. Persetujuan dikirim sebagai command kepada adapter bank, bukan SQL pusat atau impersonasi Admin.
4. Profil/kontak menggunakan verify masing-masing, katalog approve-and-publish dengan prasyarat aktual. Jangan bypass media READY, scanner, profil/kontak acknowledged atau self-review.
5. Command/audit/outbox Control atomik; domain/ledger/ack bank atomik. UI membedakan diterima, diterapkan bank, sinkron pusat dan tayang. Timeout menjadi pending/unknown, bukan sukses palsu.
6. Perubahan setelah tayang menjadi draf/versi baru dan melalui pemeriksaan ulang. Draf belum disetujui tidak mengganti versi publik yang sah. Uji pembacaan agregat lokal vs snapshot publik karena saveProfileDraft sekarang mengubah field/state agregat lokal juga.
7. Reconfirm yang mengubah status/snapshot publik menjadi request keputusan Control, bukan publish bypass. Aturan keselamatan otomatis seperti expiry/unavailable/quarantine tetap bekerja; jangan mempertahankan konten berbahaya sambil menunggu approval manusia.
8. Bank melihat timeline/status/error dan tidak diberi tombol approval/delete langsung. Data stale, versi conflict, koneksi hilang dan outbox pending tampil jujur.

## Flow request hapus/penarikan

Bank request -> Control tinjau dampak -> setujui/tolak/minta perbaikan -> adapter bank eksekusi -> pusat SJ konfirmasi tidak publik -> selesai. Status request, command dan visibility dipisahkan; enum final belum ada pada schema.

- Request mengikat instansi, jenis/ID, versi/checksum, pemohon, alasan, tindakan dan impact snapshot. Perubahan dependensi setelah review memerlukan impact/konfirmasi ulang.
- Penolakan tidak menghapus objek. Cancel oleh pemohon hanya sebelum eksekusi dengan race/lock teruji; command terkirim harus direkonsiliasi dulu. Keputusan ganda tidak mengulangi efek.
- Semua state katalog termasuk draf melalui request; tidak ada delete lokal sebagai celah. Katalog tayang diturunkan dahulu, kemudian bukti pusat tidak tayang diverifikasi sebelum final removal/archive. Objek yang belum pernah dikirim tidak memerlukan event pusat fiktif.
- **Rekomendasi semantik awal, bukan klaim hard-delete:** removal operasional menghilangkan objek dari publik/daftar aktif tetapi mempertahankan tombstone, ledger dan audit. Jangan memberi label hapus permanen pada archive. Purge fisik/retensi belum disepakati dan tidak boleh diimplementasikan diam-diam; jika pengguna menghendakinya, perlu kebijakan dependensi/pemulihan terpisah sebelum operasi diaktifkan.
- Profil belum memiliki kontrak delete. Target memblokir removal profil bila katalog aktif atau command publikasi masih bergantung padanya. Tampilkan dampak, selesaikan request penarikan katalog terkait terlebih dahulu; jangan cascade tersembunyi. Sesudah aman, kontrak baru menghapus visibilitas profil dari direktori/detail/search dan mencegah publikasi baru. Jangan menghapus institution/credential/domain bank sebagai pengganti hapus profil.
- Kontak reusable tidak boleh dicabut jika masih dipakai katalog tayang; gantikan kontak melalui versi/review katalog terlebih dahulu. Default contact lokal boleh hanya jika tidak mengubah versi publik; perubahan publik harus diajukan.
- Bank boleh menata link media draf, tetapi tidak revoke/delete media pusat yang dipakai versi pending/tayang. Pelepasan link bukan pemusnahan file. Destruksi media terpakai mengikuti request dan impact; cleanup upload gagal/tidak terpakai memerlukan aturan teruji yang tidak memengaruhi publik. Scanner tetap dapat mengarantina sesuai aturan keselamatan.
- Retry/event lama/outbox in-flight setelah removal tidak boleh memunculkan kembali objek: version/tombstone guards, ledger dan rekonsiliasi wajib di kedua sisi. Reaktivasi/recreate perlu pengajuan baru serta kebijakan ID/slug yang diuji, bukan efek otomatis retry.
- Verifikasi hasil pada katalog, detail aset, profil, search dan cache/proxy media sesuai aturan akses. Tidak menjanjikan menghapus salinan yang sudah diunduh pihak lain. Dokumen/data bisnis Ruwang tidak ikut dihapus.

## Kontrak wajib yang belum tersedia

1. Pemetaan identitas contributor lintas sistem di luar subject berkualifikasi yang sudah digunakan snapshot dan command.
2. Retry scheduler/status reconciliation operasional di atas adapter allowlist, authority, signed command/ack/status, canonicalization, nonce/ledger/outbox yang sudah tersedia lokal.
3. Request removal/reconfirm, impact, cancel/deny/revision, version/tombstone dan recovery. Kontrak command V1 sekarang hanya mendukung approve/request_revision.
4. Removal profil bank + kontrak ingest/consumer/read model/cache pusat, dengan kompatibilitas tervalidasi. Suspend institusi dan event V1 yang ada bukan pengganti.
5. Konektivitas live dan registrasi lima sumber monitoring yang sudah memiliki proyeksi minim data, freshness, autentikasi, timeout, polling terbatas dan backoff; aktivasi bukan bagian tahap lokal ini.
6. Enforcement semua jalur lama termasuk media revoke, default contact, reconfirm dan retry, serta route/flag Coming soon.

Semua gap wajib ditutup sebelum mengklaim flow V1 lengkap atau mengaktifkan bank di produksi. Kontrak snapshot/command/ack approve atau revision dan monitoring operasional stabil pada checkpoint lokal ini, tetapi belum terhubung ke sumber live.

## Perubahan minimum yang direncanakan

| Repository | Perubahan pada step implementasi terkait | Batas |
| --- | --- | --- |
| D:/ruwang-control | Runtime/DB sendiri, auth username/password, grant/audit, UI SJ, dispatcher, request/decision/monitoring | Tidak menyimpan credential SQL bank; tidak membangun akun bank/monitoring umum |
| D:/backend-production | SJ route/service/validation, adapter, RBAC SJ, authority/external actor/request/ledger/outbox dan migration baru | Tidak rewrite auth/users/modul lain atau mengubah migration lama |
| D:/frontend-production | SJ input/request/tinjau hasil, authority-aware controls, request hapus dan timeline/status, service/types terkait | Shared Ruwang/branding/modul lain tidak dirombak |
| D:/seputarjaminan-production | Kontrak/consumer removal profil, visibility/cache/proxy yang diperlukan, ledger/version guards dan tes | Tidak redesign web publik, ganti storage adapter atau campur DB |

Ini rencana, bukan perubahan yang sudah dilakukan atau izin mengedit repo tersebut pada Step 0. Scope bank hanya SJ; audit fresh diff kembali saat implementasi.

## Backlog akun bank/recovery — diblokir

Audit akun dilakukan untuk menjaga batas, bukan mengaktifkannya. Saat scope kelak dibuka, izin read/create/recover/disable/delete diberikan terpisah per bank, tidak diwarisi reviewer SJ. Recovery tanpa email memerlukan verifikasi identitas penerima, re-auth operator, alasan/audit, token sekali pakai kedaluwarsa melalui kanal sah, rate limit dan pencabutan sesi. Jangan email palsu, password default, log token/password atau email_verified palsu. Hapus akun berbeda dari nonaktifkan: periksa dependensi, jaga audit dan akses administratif terakhir. Kontrak lengkap harus ditinjau kembali pada tahap itu; belum implementasi sekarang.

## Gate sebelum aktivasi per bank

- Draf/revisi/approve profil/kontak/katalog, versi baru, reconfirm, reusable contact, scan/processing/error media dan visibilitas publik.
- Removal draf/tayang/profil/kontak/media: dependensi, reject/cancel/race, versi berubah, duplicate/replay/timeout, outbox tertunda, event lama, cache dan pencegahan objek muncul kembali.
- Admin bank tidak bisa approve/delete lewat API lama dalam mode pusat; bank A tidak membaca/memutasi B; session/grant revoke/self-escalation, RLS non-superuser.
- Kegagalan audit/transaksi, restart/retry bounded dan status pending yang benar; tidak ada tindakan destruktif otomatis dari unknown.
- Regresi modul Ruwang lain tanpa redesign, reflow/keyboard serta data tes DB/Redis/storage terisolasi; tidak meninggalkan katalog uji publik produksi.
- Shadow read-only, drain command, lalu aktivasi authority pusat per bank setelah gate. local hanya mode kompatibilitas sebelum aktivasi, bukan fallback otomatis ketika Control mati. Rollback authority memerlukan ledger konsisten dan prosedur terpisah.
