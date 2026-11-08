# Arsitektur dan batas integrasi

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

> Dokumen fondasi historis; perlu dibaca bersama [control-sj-current.md](control-sj-current.md). Kontrak ledger, lineage dan recovery berikutnya tidak boleh dianggap belum tersedia hanya karena belum tercantum di baseline ini. Jaminan identitas manusia tetap belum diimplementasikan.

## Scope aktif Step 0 — SJ-only

Keputusan terbaru berada di [sj-v1-scope.md](sj-v1-scope.md) dan mengungguli rencana cakupan yang lebih luas. Tahap pertama adalah flow profil/kontak/media/katalog SJ, pemeriksaan, request removal dan monitoring pipeline SJ. Bank input/request/tinjau hasil; Control mengambil keputusan final. Operator, permission dan audit tetap fondasi. Akun bank/recovery/delete akun, pengaduan serta monitoring umum Coming soon dan diblokir pada server.

Dokumen scope memuat audit kontrak aktual, matriks permission per bank, batas archive vs purge, dependensi removal profil dan perubahan minimum lintas repo. Kontrak snapshot/command/ack approve atau revision, adapter internal, antrean/detail/media reviewer, serta monitoring read-only bank/pusat telah diimplementasikan lokal; permission dan kontrak removal/reconfirm masih rancangan.

## Revisi UI 0.2 — 10 September 2026

Acuan antarmuka aktif adalah [design-system.md](design-system.md), revisi dashboard putih netral, Inter dan aksen biru royal. Pengguna menolak desain preview 0.1. `dist/` beserta screenshot dan hasil visual lamanya bukan acuan tampilan berikutnya. Perubahan ini menyangkut arsitektur presentasi; identitas operator, database terpisah, grant per instansi, audit, alur bank dan batas keamanan di bawah tetap berlaku.

Presentasi aktif memakai TypeScript + React/Next.js, Tailwind CSS, primitive shadcn/ui varian Radix, Lucide React dan Inter self-hosted. File `.openai/hosting.json` hanya milik preview statis; bukan keputusan memindahkan database Control atau mengaktifkan hosting publik.

Struktur UI yang direncanakan:

```text
app/
  (auth)/login/                 autentikasi internal, setelah layanan auth tersedia
  (control)/layout             sesi + scope, sidebar terang, header
  (control)/dashboard/          ringkasan sumber data yang sudah tersedia
  (control)/reviews/            tabel, filter, pagination
  (control)/reviews/[id]/       detail + keputusan untuk satu instansi
  (control)/instances/          identitas dan status sumber
  (control)/operators/          grant operator pusat
  (control)/audit/              jejak peristiwa yang diizinkan
components/ui/                 primitive bersama bertoken Control
features/                     komposisi review, instansi, operator dan audit
src/domain/                   policy kernel yang ada, tetap tanpa dependensi UI
```

Sebagian direktori di atas tetap blueprint untuk UI berikutnya. Jangan membuat ulang authorization/audit di komponen React atau menjadikan hide-button sebagai permission. Lapisan pengambilan data membedakan snapshot diterima, command dikirim, acknowledgment diterapkan bank dan visibilitas publik.

Navigasi menyerupai dashboard administrasi yang familiar seperti Ruwang, tetapi token/layout/komposisi spesifik mengikuti Control 0.2. Split-pane antrean/detail permanen, sidebar gelap teal, glyph Unicode, uppercase monospace dan heading editorial 0.1 tidak dibawa ke implementasi baru. Card diperbolehkan untuk kelompok yang berguna; tabel menjadi pola utama untuk data yang perlu dibandingkan.

Checkpoint gabungan mengubah runtime/schema lokal Control dan modul SJ backend Ruwang untuk snapshot/command/monitoring; API/worker pusat SJ memiliki endpoint monitoring dari tahap sebelumnya. Frontend Ruwang hanya berubah pada halaman pemeriksaan SJ agar mode pusat tidak menawarkan keputusan lokal. VPS tidak disentuh. Panduan kelanjutan praktis ada di [handoff.md](handoff.md).

## Bukti source lokal

Referensi dibekukan pada `source-evidence.json`; tidak diverifikasi terhadap release VPS pada tahap ini.

- `backend-production/src/modules/seputar-jaminan/seputarJaminan.route.js` menyediakan submit/revision/approve-and-publish, verify profil/kontak dan menu permission pada backend bank.
- `seputarJaminan.service.js:750–867`: revision dan approval publikasi menolak `last_edited_by` atau `submitted_by` yang sama dengan pemeriksa. Approval juga membutuhkan koneksi ACTIVE, sinkronisasi profil/kontak ACKNOWLEDGED dan media READY. Approval dan publish saat ini satu operasi.
- `profileContact.service.js:291–348`: verify profil memeriksa pembuat, checksum payload, status IN_REVIEW dan logo pusat READY sebelum membuat outbox.
- `prisma/seed/seputar-jaminan-rbac.definition.js`: Admin memiliki permission/feature SJ awal. Ini bukan role operator pusat.
- `user.route.js` dan `user.service.js:693–730`: delete user masih tersedia berdasarkan permission lokal, dependensi dan konfirmasi; larangan semua bank menghapus pengguna belum menjadi fakta implementasi.
- `seputarjaminan-production/packages/contracts/openapi/openapi.v1.yaml`: V1 mencakup ingest, media, reconciliation, public dan operations; tidak terdapat kontrak operator pusat untuk review bank. V1 menyatakan Ruwang sebagai sumber kebenaran katalog.

## Keputusan arsitektur tahap fondasi

```text
Browser operator
  -> Control API / sesi operator password-only + grant per instansi
     -> PostgreSQL Control (operator, grant, snapshot, command, audit)
     -> dispatcher dengan target bank terdaftar
        -> adapter internal bank (verifikasi signature, scope, version, authority)
           -> transaksi domain bank + ledger command + audit + outbox
              -> pipeline SJ yang sudah ada -> API/worker/storage SJ -> web publik
        <- acknowledgment bank; status diterapkan hanya setelah acknowledgment
```

Database empat Ruwang dan database pusat SJ tetap independen. Control memiliki database sendiri. Control tidak diberi credential SQL, akses filesystem, shell/PM2 atau kemampuan menjalankan migration bank. Browser hanya berbicara dengan API Control; host bank berasal dari registry server, bukan URL yang diberikan browser. Registry target diterapkan sebagai konfigurasi yang ditinjau; cegah SSRF dan jangan mengikuti redirect lintas host pada adapter.

## Model identitas dan permission

- Akun operator Control terpisah dari pengguna bank. Login Admin bank tidak memberikan akses Control.
- Sesi HttpOnly/Secure production, perlindungan origin+CSRF pada mutasi, password scrypt, expiry dan revocation diimplementasikan server-side. Migration 0006 mengganti login email+TOTP menjadi username+password dan menghapus credential TOTP. Recent re-auth berbasis password khusus perubahan akses masih terbuka dan wajib ditutup sebelum koneksi bank aktif.
- Grant ditentukan oleh `(operator_id, instance_id, role)`, dibaca dari server, tanpa wildcard bank. Setiap permintaan, termasuk read/list/export, memeriksa scope.
- Reviewer: read pengajuan, approve, revision, read instansi. Observer: read pengajuan/instansi/audit. Bank account manager: hak akun bank pada instansi terkait, tetapi modulnya tetap Coming soon. Control access manager: read instansi serta pengelolaan grant/session operator. Mengelola grant tidak memberi hak approval; mutasi grant sendiri ditolak server-side.
- Bootstrap operator pertama dilakukan melalui prosedur administrasi terpisah yang diaudit; jangan sediakan signup publik atau credential default.
- Identitas pembuat/editor/pengaju berbentuk subject berkualifikasi `issuer:id`. Identitas lokal dan pusat tidak boleh dibandingkan hanya dari angka/UUID yang kebetulan sama. Jika operator merangkap akun bank, pemetaan identitas terverifikasi harus ikut pemeriksaan separation-of-duties. Fondasi hanya menguji subject berkualifikasi; pengikatan identitas lintas sistem masih harus diimplementasikan.
- Pemeriksaan UI bukan batas keamanan. Policy kernel TypeScript mengharapkan principal tepercaya; adapter API harus memvalidasi input HTTP terlebih dahulu dan tidak menerima `sessionVerified`/`grants` dari browser.

Kebijakan mengikuti [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): deny-by-default dan periksa izin pada setiap permintaan.

## Pemindahan pemeriksaan ke pusat

Jangan langsung memanggil endpoint lama dengan token Admin bank. Foreign key `reviewer_id`, `approved_by`, `updated_by` saat ini mengacu identitas bank; memakai ID operator pusat tanpa perubahan model akan salah. Adapter memerlukan representasi external actor dan audit eksplisit yang tervalidasi melalui migration baru, tanpa memalsukan akun manusia lokal.

Flag `review_authority=local|central` telah ditambahkan per bank dengan default `local`. Keputusan lokal profil, kontak dan publikasi menolak saat authority central; endpoint internal command menjadi satu-satunya jalur keputusan yang tersedia pada adapter ini. Jalur removal/media/reconfirm/default contact belum seluruhnya dipindahkan dan authority central tidak boleh diaktifkan sebelum gap tersebut ditutup.

Snapshot review memuat data publik relevan, versi, checksum, sumber instansi dan contributor subjects. Jangan kirim isi dokumen agunan/nasabah atau credential. Pending review tidak dipublikasikan ke API publik SJ; snapshot dikirim melalui ingress Control tersendiri dengan signature, expiry, nonce/replay guard dan digest. Media reviewer diambil dari endpoint privat bank menggunakan request bertanda tangan, bukan URL storage publik.

1. Bank membuat versi pengajuan immutable dan outbox snapshot khusus Control.
2. Control menerima snapshot bertanda tangan, memeriksa scope serta versi dan menampilkan antrean.
3. Operator membaca versi tersebut, memilih approve/revision; revision wajib catatan.
4. API memeriksa session, grant, contributor, versi/checksum, authority dan koneksi. Simpan command plus audit plus outbox dalam satu transaksi Control.
5. Dispatcher mengirim command. Bank mengulang pemeriksaan dalam transaksi dan menjalankan domain action yang ada. Publication approve tetap menggunakan syarat publish saat ini; profil/kontak memakai verify masing-masing. Jangan menandai publication sebagai publik hanya karena Control menerima klik.
6. Bank menyimpan command ledger, audit dan outbox acknowledgment dalam transaksi yang sama dengan perubahan domain. SJ menerima event publik melalui jalur lama setelah prasyarat terpenuhi.
7. Control mengubah status command ke APPLIED hanya setelah acknowledgment sah. Public visibility punya status sendiri, dibuktikan dari hasil pipeline SJ.

## Rancangan transport dan pemulihan

Transport V1 memakai key Ed25519 khusus Control, terpisah dari key ingest SJ, dengan instance binding, key_id, issued_at, expiry, nonce, audience dan body digest. Canonical JSON, signature request, signature acknowledgment dan test vector sudah diuji lokal. Kunci dibaca dari file/configuration reference; tidak disimpan di database atau kontrak.

- Unique ledger `(instance_id, command_id)` mengikat body digest. Command ID sama + body identik mengembalikan hasil terdahulu; ID sama + body berbeda ditolak.
- Unique nonce per key/instance dengan TTL; replay permintaan identik tidak boleh mengulangi efek. Retry command memakai envelope/nonce baru dan command ID tetap.
- Update memakai expected version dan checksum; mismatch menjadi conflict. Dilarang silent overwrite.
- Timeout berarti UNKNOWN/PENDING, bukan gagal pasti dan bukan berhasil. Query status command lebih dahulu sebelum retry. Retry backoff terbatas; rejection 4xx tidak diulang membabi buta.
- Scope command, issuer dan audience harus cocok dengan registry bank dan grant operator. Kunci integrasi tidak menggantikan identitas operator.
- Catatan revision disimpan pada domain review terbatas; audit umum hanya menyimpan kode alasan dan ID catatan, bukan salinan teks bebas.

## Model data

Migration `0001_initial_control.sql` menyediakan registry/snapshot/command/observasi/audit domain. Migration `0002_operator_auth.sql` adalah fondasi historis operator/session/grant. Migration `0003_bank_review_adapter.sql` melengkapi registry target, outbox, acknowledgment dan nonce ledger tanpa seed. Migration `0004_sj_monitoring.sql` menambahkan registry sumber, state polling/backoff, nonce respons dan metadata freshness tanpa seed. Migration `0005_private_review_snapshots.sql` menambahkan envelope/digest snapshot privat serta nonce ingress. Migration `0006_password_only_operator_access.sql` menambah username unik, menghapus tabel credential TOTP dan menamai waktu autentikasi sesi secara netral.

| Entitas | Kunci / invariant |
| --- | --- |
| operators | ID pusat, status, external auth subject; tidak menyimpan password bank |
| instances | ID immutable, target adapter allowlisted, expected audience, mode, key reference |
| operator_grants | operator + instance + role; pemberi/revoker grant dapat ditelusuri |
| review_snapshots | instance + source kind + source ID + version; checksum dan contributor subjects |
| review_commands | instance + command ID unique; snapshot version/checksum, actor, result |
| command_outbox | command ID, attempt, next attempt, lease; bounded concurrency |
| command_acknowledgments | instance + command ID unique; hasil bank yang ditandatangani |
| audit_events | server event ID/time, request ID, actor, instance, resource, action, outcome, version |

Foreign key gabungan ber-scope mencegah resource bank A direferensikan command bank B. Role runtime Control bukan owner/migrator, tanpa BYPASSRLS; write hanya pada allowlist adapter/auth. Role aplikasi bank tidak dapat membaca/menulis ledger adapter. Pemeriksaan role non-superuser dan RLS telah lulus pada database lokal; ini bukan bukti produksi.

## Audit dan monitoring

Audit mutasi merupakan append-only dari perspektif role runtime; tidak mengizinkan UPDATE/DELETE. Peristiwa permintaan, penolakan dan hasil dibedakan. Retensi dan backup terpisah dari log aplikasi; tidak dipangkas otomatis.

`createAuditMetadata` tetap proyektor allowlist; penyimpanan audit Control sudah persisten dan command, audit serta outbox dibuat dalam satu transaksi. Ketahanan gangguan jangka panjang dan deteksi manipulasi masih perlu gate terpisah. Password, key, token, cookie, URL credential, nomor kontak dan payload lengkap tidak masuk metadata audit.

Monitoring awal telah diimplementasikan lokal sebagai read-only hanya pipeline SJ: frontend/API/readiness, worker/pipeline, antrean yang tersedia, last observed dan freshness. Control menarik maksimal lima sumber terotorisasi per siklus dari registry server, dengan URL terbatasi, timeout, ukuran respons maksimum, signature dua arah, nonce/replay ledger, polling tab-visible dan backoff. Bank serta pusat SJ mengirim proyeksi minimum; bukan environment, secret atau data bisnis. Status membedakan healthy, degraded, offline, stale dan unknown. Monitoring umum VPS tetap ditunda. Tidak ada grafik/angka uptime buatan, restart proses, shell atau SQL console. Flag dan registry normal tetap mati/kosong sampai tahap aktivasi terpisah.

## Akun bank ditunda; profil SJ termasuk scope awal

Pengelolaan pengguna pusat harus membedakan tutup akses, cabut sesi, anonimisasi dan hapus permanen. Default rancangan adalah tutup akses dengan identitas historis tetap dapat dirujuk. Hapus permanen memerlukan pemeriksaan dependensi/audit, scope bank, reason dan approval terpisah; tidak digantikan cascade delete. Aturan pengguna ini belum dipasang ke bank.

UI profil bank membaca state asli: draft/review/revision/verified, terpisah dari versi publik yang sudah sah. Saat verified tampil ringkasan identitas/logo/kontak/status; edit melalui draf/review baru. Hapus katalog/profil melalui request ke Control, bukan hapus row. Impact, dependency, tombstone, sinkronisasi dan gap kontrak removal profil diatur pada sj-v1-scope.md. Jangan mengklaim archive sebagai hard-delete. Perubahan FE yang diperlukan dibatasi modul SJ, tidak menyalin desain Control ke Ruwang.

## Gate sebelum pengaktifan

Autentikasi username/password dan grant server; migration baru; RLS; authz seluruh endpoint; kontrak snapshot/command/ack; signature/nonce/expiry; duplicate command; version conflict; bank outage; audit failure; rollback authority; regresi profil/kontak/publish lama; pembuktian tidak ada data lintas bank. Flow disposable snapshot sampai publik terlihat sudah lulus, tetapi seluruh daftar gate—terutama removal/reconfirm, browser penuh dan konektivitas live—tetap wajib sebelum shadow mode dan aktivasi bertahap.
