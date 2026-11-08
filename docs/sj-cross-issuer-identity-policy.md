# Catatan historis identitas pemeriksa SJ lintas akun

> DIHENTIKAN oleh keputusan pengguna 5 Oktober 2026. Form/API/service binding tidak lagi aktif; audit lama diarsipkan melalui 0016. Aturan aktif dan batas self-review ada di [control-simplification.md](control-simplification.md). Isi di bawah menjelaskan implementasi terdahulu, bukan instruksi operasional sekarang.

Rekonsiliasi lokal 4 Oktober 2026, berdasarkan delegasi pengguna. Registry dan enforcement telah dipasang dan diuji; hal itu tidak membuktikan identitas manusia operasional telah diverifikasi. Satu role `internal_operator` menggantikan pembagian role lama.

## Aturan

1. Satu manusia tidak boleh memutuskan pengajuan yang ia buat, ubah, atau ajukan, termasuk melalui akun lain atau issuer lain. Subject tetap pasangan `issuer:id`; UUID, nama, username, dan email yang sama/berbeda tidak membuktikan identitas manusia.
2. Organisasi pemilik Control bertanggung jawab atas bukti identitas dan penugasan petugas verifikasi, dibantu penanggung jawab akses bank. Akun internal boleh mencatat verifikasi akun lain pada instansi terdaftar. Binding tidak memberikan permission tambahan dan tidak menciptakan role baru.
3. Bukti verifikasi harus berasal dari prosedur identitas organisasi yang sah. Simpan referensi bukti dan siapa/waktu yang memverifikasi, bukan salinan dokumen identitas di snapshot SJ, browser, log, atau command. Tidak ada pencocokan otomatis berdasarkan nama/email.
4. Binding harus mencakup issuer, subject immutable, scope instansi, identitas manusia internal yang terverifikasi, status berlaku/dicabut, versi, dan provenance verifikasi. Perubahan, konflik, pencabutan, serta upaya self-verification harus diaudit. Subject yang belum dikenal tidak otomatis berarti orang berbeda.
5. Dalam mode enforcement lintas manusia, keputusan harus ditolak bila actor atau contributor belum dapat dipetakan secara sah, binding bertentangan/dicabut, atau actor dan contributor dipetakan ke manusia yang sama. Periksa ulang di transaksi keputusan dan sebelum pengiriman yang belum terjadi; retry tidak boleh mengganti actor, versi, atau keputusan lama.
6. Persetujuan lifecycle tetap mengikuti permission dan jenis keputusan existing. Dokumen ini tidak menambah enum atau mengklaim bahwa role khusus/re-auth keputusan lifecycle sudah tersedia. Perubahan kebijakan tersebut memerlukan implementasi dan tes tersendiri.

## Implementasi dan batas kepercayaan

- `migrations/0015_verified_subject_bindings.sql`: registry per instansi/subject, version, status VERIFIED/REVOKED, petugas, waktu, referensi dan history append-only.
- `src/domain/subject-identity.ts` dan `src/server/subject-identity.ts`: aturan qualified subject/manusia, input strict, known subject, optimistic locking, instance advisory lock serta audit keberhasilan dan penolakan self/unknown/conflict yang tetap commit.
- GET/POST `/api/instances/[instanceId]/identities`: allowlist direktori tanpa referensi bukti privat; session, permission dan CSRF/same-origin untuk mutasi. Bukan admin publik.
- Transaksi keputusan memeriksa binding actor dan contributor; dispatch PENDING memeriksa ulang sebelum mengirim. UNKNOWN tidak dikirim ulang otomatis setelah binding berubah.
- `/operators#identity`: form/button existing, tanpa autosave. Respons hilang/malformed/5xx membuat hasil belum pasti; simpan ulang diblokir sampai pengguna membaca status terbaru melalui GET yang sah.
- Subject sendiri dan human ID yang diketahui sama dengan verifikator ditolak. Bootstrap petugas tanpa binding mempercayai kewenangan akun internal dan prosedur organisasi; sistem tidak bisa membuktikan bahwa akun yang belum dipetakan tersebut dimiliki manusia berbeda. Ini trust boundary, bukan identitas otomatis. Tidak boleh membuat binding berdasarkan tebakan nama/email.
- Tidak ada binding operasional yang dibuat agent. Referensi bukti tes hanya berlaku disposable.

Mekanisme pemisahan lintas manusia kini diuji, tetapi kebenaran manusia operasional tetap tanggung jawab organisasi. Jangan menyebut seluruh tahap bebas blocker atau identitas orang terbukti hanya berdasarkan tes ini.

## Bukti dan prasyarat operasional

- Bank contributor subject snapshot (`src/modules/seputar-jaminan/controlReviewSnapshot.service.js`) dan command (`controlReview.service.js`) tetap memakai issuer/subject sah; tidak ada rewrite identitas historis untuk membuat keputusan lolos.
- Disposable membuktikan same-human lintas issuer, different-human verified, unknown/revoked/conflict, instansi tidak dikenal, audit penolakan, dua pemeriksa, perubahan binding saat dispatch, fresh 0015 dan upgrade 0014→0015 dengan hash data lama dipertahankan.
- Browser membuktikan simpan/cabut/verifikasi ulang, dua klik, self-denial, respons hilang, pemulihan melalui GET, offline, lima viewport dan native zoom 200%. Test identities membuktikan mekanisme, bukan identitas manusia operasional.
- Operasional: pemilik organisasi menugaskan verifikator dan menyediakan bukti identitas yang sah. Agent tidak boleh mengarang bukti tersebut.
