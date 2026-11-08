# Harness disposable Control (RC-SJ-02 sampai RC-SJ-06)

Harness ini menjalankan service Control sebenarnya pada PostgreSQL sementara, dengan bank dan SJ sebagai **test double kontrak**. Ini bukan uji lintas aplikasi nyata, bukan preview, dan bukan izin produksi. Tidak ada perubahan UI atau runtime aplikasi.

## Menjalankan

Prasyarat: Node 24+, dependency repository terpasang, Docker lokal melalui named pipe/Unix socket, serta image lokal `postgres:16-alpine`. Harness tidak menarik image dan tidak membaca `.env.local` maupun credential database existing.

Jalankan dari terminal khusus yang tidak memuat konfigurasi aplikasi/DB/proxy eksternal:

```powershell
npm run test:control-disposable:guard
npm run test:control-disposable
npm run test:review-api-disposable
npm run test:dispatch-disposable
npm run test:evidence-disposable
npm run test:read-disposable
```

Variabel target seperti `CONTROL_*`, `PG*`, `DATABASE*`, `REDIS*`, `QUEUE*`, `SJ_*`, storage/cloud credential, `NODE_OPTIONS`, override Docker dan proxy menyebabkan penolakan sebelum pembuatan resource. Jangan menghapus konfigurasi terminal kerja agar tes lolos; gunakan proses/terminal bersih. `NODE_ENV=test` maupun nama database bukan bukti disposable.

## Bukti kepemilikan dan batas mutasi

- Setiap run membuat container baru dengan ID lengkap, label run UUID dan capability acak, serta image SHA lokal. PostgreSQL berada di tmpfs container; bind mount/volume ditolak.
- Tidak ada port preview. Database dan server double memakai port pendukung loopback sementara, terpisah per run, lalu ditutup. Tidak ada fallback ke port aplikasi normal.
- Capability proses, marker direktori, container/image/label, URL hasil provisioning persis, port loopback dan marker DB diverifikasi sebelum akses aplikasi. URL operasional atau URL run lain ditolak sebelum koneksi.
- Superuser container hanya membuat database dan role. Migration dan service memakai role khusus tanpa `SUPERUSER`, `BYPASSRLS`, `CREATEDB` atau `CREATEROLE`. Runtime tidak dapat membuat tabel, mengubah marker kepemilikan, atau menghapus audit.
- Migration existing disalin ke direktori milik run lalu dijalankan dengan migrator repository dari cwd tersebut; `.env.local` repository tidak termuat. Migration historis tidak diubah.
- Registry instansi/key adalah provisioning fixture karena tidak ada API registry; status bisnis tidak disuntik melalui SQL. Bootstrap akun internal, login, ingress snapshot, keputusan dan dispatch memakai service resmi. Tidak ada verifikasi identitas manual atau pembagian role reviewer/observer aktif.
- Control tidak memakai Redis dalam jalur ini. Antrean berupa tabel PostgreSQL milik run. Tidak ada worker/scheduler latar yang dinyalakan; dispatch dipanggil secara eksplisit.
- Kunci dan password acak hanya berlaku untuk run. Kunci file berada di direktori milik run dan dihapus saat cleanup; password tidak disimpan di laporan. Fetch service dibatasi ke origin double milik run, bukan bank/SJ normal. Ini bukan sandbox jaringan tingkat OS.

## Cakupan runner aktif, bukan klaim tes ulang

Rekonsiliasi 7 Oktober 2026 berdasarkan scripts/control-disposable-check.mjs dan tests/support/control-retirement-checks.mjs. Daftar ini menjelaskan pemeriksaan di runner; PASS tetap membutuhkan laporan run pada kandidat yang sama. Hasil tahap lama tetap historis.

1. Runner memeriksa fresh migration 0001–0016; upgrade memakai baseline 0001–0012 (opsi --upgrade-baseline-7 memakai 0001–0007), lalu sampai 0016. Fixture audit historis sebelum 0016 harus identik setelah diarsipkan, sesi lama dicabut dan akun aktif memakai internal_operator. Runtime ditolak membaca control_audit_archive. Ini bukan upgrade salinan database operasional; fixture audit bukan status bisnis positif. Lihat [control-sj-current.md](control-sj-current.md).
2. Akun internal melalui service auth, akses setara ke instansi terdaftar; penolakan sesi dicabut dan instansi tak terdaftar. Qualified-subject self-review tetap ditolak. Dua akun berbeda tidak membuktikan dua orang berbeda; tidak ada langkah verifikasi manusia manual.
3. Snapshot profil, kontak, publikasi LAND/BUILDING/MACHINE_EQUIPMENT/VEHICLE; lifecycle UNPUBLISH_PUBLICATION, ARCHIVE_PUBLICATION, HIDE_PROFILE, REVOKE_CONTACT, REVOKE_MEDIA, RECONFIRM_PUBLICATION.
4. Ingress bertanda tangan, media privat bertanda tangan, keputusan sah, revisi/reject lifecycle, versi stale, pengulangan dispatch dengan command ID sama.
5. Fault injection eksplisit: ACK kosong, signature salah, timeout, koneksi putus dan bank menolak versi. Hasil tidak dipaksa sukses. Tidak menjalankan pemeriksaan publik Control yang telah dihentikan.
6. Penolakan cleanup container run lain; setelah cleanup run utama, DB canary dan sentinel run lain masih dapat dibaca.
7. Pemulihan resource dari runner yang sudah keluar; pemulihan runner yang masih hidup ditolak.

Double bank memeriksa schema, signature, instance, audience, expiry, nonce, versi dan checksum yang diberikan, lalu memodelkan ledger ACK. Respons double SJ bukan bukti pemeriksaan publik oleh Control; mode evidence sekarang memeriksa penghentian fitur. Checksum snapshot adalah checksum fixture sintetis; ini **tidak** membuktikan algoritme snapshot bank, scanner media, lifecycle bank, pemrosesan/proyeksi SJ, atau keputusan lintas aplikasi nyata. Fixture media READY hanya input kontrak tes, bukan hasil scanner. Tidak ada pesan WhatsApp yang dikirim.

Mode dasar memanggil service resmi. Mode `test:review-api-disposable` juga memanggil handler API Next.js sebenarnya dengan NextRequest/NextResponse, cookie login nyata dari database run, CSRF dan akun internal. Ini pengujian API **in-process**, bukan koneksi HTTP ke server Next/browser. Cakupannya termasuk snapshot immutable, duplicate/stale/superseded, scope endpoint, pencabutan session, dua pemeriksa/tab, revisi, respons hilang, ACK terlambat dan ACK versi/checksum salah. Fault injection hanya pada double milik run.

Mode `test:dispatch-disposable` menambahkan dua dispatcher Node terpisah, crash proses setelah claim dan setelah respons bank, restart melalui CLI satu siklus, completion terlambat, kegagalan koneksi DB yang diinjeksi pada adapter, pin tujuan, batas ukuran/identitas/HTTP ACK, serta ownership polling, urutan waktu sumber dan backoff. Ini bukan pengujian mematikan server PostgreSQL/Redis atau scheduler produksi. Redis tidak digunakan Control.

Fault injection waktu lease memakai argumen jam tes; fault jadwal polling hanya mengubah `next_poll_at` pada DB milik run. Perubahan registry tujuan hanya fixture fault yang dipulihkan. Tidak ada perubahan status bisnis SQL untuk membuat alur positif berhasil. Subproses memverifikasi Docker dan marker DB sebelum impor service, lalu membatasi fetch ke origin double milik run, termasuk CLI.

Mode `test:evidence-disposable` mempertahankan nama entry point untuk kompatibilitas, tetapi kini menambahkan runRetirementChecks: detail tanpa publicVisibility/publicObservation/publicEvidence, tidak ada fetch keluar saat membaca detail, tabel fitur lama tidak ada di schema runtime, dan runtime ditolak membaca arsip audit. Jangan mengembalikan probe publik atau binding manusia untuk mengikuti nama skrip/tes lama. `control-monitoring-evidence.md` adalah arsip RC-SJ-05, bukan instruksi runner aktif.

UI, browser dan scheduler otomatis tetap memerlukan gate tersendiri. ACK rusak atau respons hilang tetap UNKNOWN; perintah tersebut tidak dikirim ulang melalui klik lain. Lease kedaluwarsa dapat ditutup UNKNOWN, bukan diubah menjadi sukses. Kontrak baca ledger bank kini tersedia melalui `check_result`; itu pembacaan hasil bertanda tangan, bukan kirim ulang keputusan. Lihat [control-dispatch-recovery.md](control-dispatch-recovery.md). Pengujian binding manusia sebelum penghentian fitur adalah bukti historis, bukan jaminan identitas manusia pada kebijakan sekarang.

Mode `test:read-disposable` menambahkan pengujian daftar/detail/comparison API dengan cookie login nyata, allowlist DTO, scope instansi terdaftar, sesi, filter content/lifecycle/command/sourceId, cursor invalid atau berbeda scope, timestamp mikrodetik sama, insert di antara halaman, count scoped, snapshot lama, catatan keputusan, nol/data parsial dan kegagalan database. Tidak ada HTTP publik per baris. Comparison API dipertahankan untuk kompatibilitas, bukan pemilih pembanding di UI. Peta aktif ada di [control-sj-current.md](control-sj-current.md); `control-review-read-api.md` adalah baseline historis RC-SJ-06.

## Cleanup dan pemulihan setelah disconnect

Runner mencetak path `%TEMP%/rc-sj-owned-<acak>/report.json`. Laporan disimpan setiap pemeriksaan, dengan status `running`, `failed` atau `passed`; jangan menganggap `running` sebagai lulus. Owner/journal dan salinan migration nonsecret dipertahankan untuk bukti. Container PostgreSQL tmpfs dan file kunci milik run dihapus; tidak ada penghapusan rekursif folder umum.

Jika runner terputus, periksa `owner.json` dan `resource.json` pada path yang dicetak. Setelah proses pemilik benar-benar tidak hidup, gunakan path absolut **run tersebut**:

```powershell
node scripts/control-disposable-cleanup.mjs 'C:\Users\<user>\AppData\Local\Temp\rc-sj-owned-<run>'
```

Recovery memeriksa host, PID, root temp persis, marker, journal, container ID/image/label dan jenis storage sebelum menghapus. Ia menolak pemilik aktif atau bukti yang berubah; tidak mencari atau menghapus container berdasarkan pola nama. Jika cleanup sudah berhasil, perintah recovery berikutnya menolak container yang tidak ada. Jangan memakai `docker prune`, menghapus semua container, atau memaksa cleanup saat bukti tidak cocok. Hard kill di tengah pembuatan resource dapat memerlukan pemeriksaan manual label/ID; keberhasilan satu skenario interupsi tidak berarti semua titik crash telah diuji.

Cleanup tidak memulihkan transaksi bisnis. Jalankan gate berikutnya pada run baru; laporan lama tetap disimpan sebagai bukti. Simpan salinan laporan/checkpoint di luar kandidat release tanpa credential.

## Entry point lama dan batas pengujian

Entry point `test:auth-integration` dan `test:monitoring-integration` meneruskan ke harness owned, bukan credential cluster 55432. Catatan RC-SJ-02 lama tetap historis, bukan instruksi menargetkan resource lama. Tes HTTP/runtime/browser mempunyai bukti terpisah; kelulusan service tidak otomatis membuktikan semuanya. `test:runtime` hanya menggunakan preview existing yang targetnya telah diverifikasi.

`npm test` mencakup runner integrasi lain; jangan menjalankannya tanpa memeriksa target dan izin lintas repository. Gunakan entry point eksplisit di atas. Tidak ada tes lama yang dihapus, diganti ekspektasinya atau diam-diam ditandai PASS.
