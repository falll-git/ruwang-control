# Handoff Ruwang Control — tahap awal SJ-only

> Rekonsiliasi lokal 7 Oktober 2026: bagian lama di bawah adalah handoff historis, bukan status final terkini. Baca [control-sj-current.md](control-sj-current.md) dan [control-simplification.md](control-simplification.md): migration 0001–0016, akses internal tunggal, verifikasi identitas manual dan pemeriksaan publik Control telah dihentikan; audit historis diarsipkan. Recovery dan lifecycle mengikuti kontrak aktif, bukan keterbatasan tahap awal di bawah. Bukti source JSON lama tidak diperbarui agar sejarahnya tetap utuh. Hasil lokal bukan izin produksi.

Tanggal lokal: 10 September 2026. Fondasi operasional, auth operator, snapshot ingress, antrean/detail/media reviewer dan adapter command/ack pemeriksaan selesai diverifikasi lokal. Flow disposable profil, kontak dan publikasi sampai tampil pada SJ lokal lulus; removal/reconfirm dan koneksi produksi belum tersedia.

## Keputusan terbaru

Tahap awal hanya alur lengkap SJ: profil, kontak, media, katalog, pemeriksaan, request penghapusan dan monitoring pipeline SJ. Bank input/draf/ajukan/perbaiki/tinjau hasil; Control memutuskan persetujuan/revisi serta request penarikan/penghapusan. Bank tidak boleh mengambil keputusan final lewat UI maupun API lama dalam mode pusat, termasuk Admin.

Akun bank (monitoring/create/recovery/delete), pengaduan dan monitoring umum VPS ditunda: Coming soon, disabled, route/API tertutup. Operator Control/permission dan audit tetap fondasi wajib. Jangan membuat prototype/wireframe baru atau mewajibkan persetujuan contoh visual sebelum development. Langsung aplikasi operasional lokal bertahap dengan API/database nyata; fixture hanya untuk tes terisolasi.

## Bacaan wajib

1. AGENTS.md dan [sj-v1-scope.md](sj-v1-scope.md): audit kontrak, izin, flow lengkap, gap dan perubahan minimum.
2. [architecture.md](architecture.md): trust boundary, transport dan audit.
3. [design-system.md](design-system.md) dan [foundation.md](foundation.md).

## Status source saat checkpoint

| Bagian | Status |
| --- | --- |
| src/domain | Kernel permission/review/audit; role observer, reviewer, bank account manager dan Control access manager terpisah per instansi |
| review-command.schema.json | Kontrak V1 approve/request_revision stabil bersama acknowledgment V1; belum removal/reconfirm |
| Database/API dasar Control | PostgreSQL terisolasi, enam migration, health/readiness, dashboard, monitoring, snapshot ingress, antrean/detail/media, create command dan query status tersedia |
| Auth operator | Login username+password scrypt, cookie HttpOnly/SameSite/Secure production, expiry/revocation, CSRF, rate limit, grant per instansi dan audit persisten tersedia; 2FA tidak digunakan |
| Bootstrap | CLI interaktif operator pertama; tanpa signup/credential default, wajib instance key nyata, bootstrap kedua ditolak |
| Adapter/monitoring lintas bank | Snapshot/dispatcher command/ack dan monitoring read-only bertanda tangan untuk bank/pusat tersedia lokal; registry sumber normal kosong dan semua flag tetap false |
| Bank | `review_authority=local|central`, snapshot outbox, external actor, nonce/command ledger, media reviewer dan endpoint internal bertanda tangan tersedia; default tetap local |
| Removal | Unpublish/archive katalog, revoke kontak/media tersedia; belum request-hapus Control atau delete profil pada route yang diperiksa |
| UI | Shell Next.js putih netral/Inter tersedia; `dist` 0.1 tetap arsip historis dan bukan runtime |
| Dependency | Next.js 16.3.4, React 19.3.0, PostgreSQL client, Zod, Tailwind dan primitive UI terkunci di lockfile |
| Tes | Unit Control dan integration gated adapter lulus; flow disposable nyata Ruwang → Control → API/worker/web SJ untuk profil, kontak, revisi dan approve publikasi lulus 1/1 berikut cleanup fixture |
| Git Control | Belum repository Git pada audit ini; gunakan checksum sebelum/sesudah, jangan mengarang Git diff |

## Urutan implementasi berikutnya

1. Fondasi operasional Control: selesai lokal.
2. Auth operator username/password, session, grant per instansi dan audit persisten: selesai lokal; operator pertama dibootstrap secara interaktif dan UI pembuatan operator berikutnya tersedia bagi pengelola akses. Tidak ada signup publik.
3. Snapshot/command/ack, external actor, authority, adapter, version/checksum, nonce/idempotency, timeout recovery, media reviewer, dan monitoring pipeline read-only: selesai lokal.
4. Profil/kontak/media serta katalog: draf, ajukan, revisi/approve, sinkronisasi/scanner dan tayang telah lulus pada flow disposable; browser penuh dan konektivitas live belum diuji.
5. Reconfirm masih perlu dijadikan request pusat dan diuji tanpa bypass publish.
6. Request penarikan/penghapusan katalog/profil/kontak/media terkait, impact, keputusan, eksekusi dan verifikasi hilang dari publik. Archive tidak diklaim purge fisik.
7. Gate integrasi disposable penuh, keamanan, regresi Ruwang lain tanpa redesign, reflow serta cleanup fixture.
8. Freeze/push/deploy hanya pada tahap tersendiri yang diminta; aktivasi per bank setelah semua gap wajib ditutup.

## Pemulihan dan batas bukti

Riwayat tool menunjukkan patch gabungan ditolak karena dua operasi menyasar handoff.md yang sama. Setelah itu AGENTS.md berhasil diperbarui, sedangkan dokumen lain belum. Saat dilanjutkan, pemeriksaan file/checksum mengonfirmasi kondisi tersebut; ini ketidaklengkapan pembaruan dokumen, bukan bukti kode runtime korup. Dokumen scope yang tadinya belum ada kemudian dibuat dan rujukan diselaraskan. Penyebab putusnya jaringan sendiri tidak terbukti.

Tahap gabungan mengubah source lokal Control, modul SJ backend Ruwang, API/worker pusat SJ untuk monitoring, serta tiga file modul SJ frontend Ruwang untuk mode pusat read-only. Commit/push/deploy dan VPS tidak disentuh. Authority dan seluruh flag tetap nonaktif secara default, sehingga hasil tes disposable bukan bukti approval atau monitoring pusat aktif di produksi.

Jika disconnect lagi: periksa file/diff/checksum, status tes dan command sebelum mengulang tindakan. Jangan mengulang mutasi bank hanya dari pesan terakhir tanpa ledger/idempotency.

## Prompt tahap berikutnya

> Lanjutkan hanya ke request removal/reconfirm SJ beserta impact, keputusan, eksekusi dan bukti hilang dari publik. Pertahankan snapshot/command/ack adapter, media reviewer, monitoring read-only, auth operator, migration, API, shell, policy review/audit dan tes yang sudah lulus. Jangan membuat dummy runtime, menyentuh VPS atau commit/push/deploy. Pemetaan identitas lintas sistem di luar subject berkualifikasi, recent re-auth, onboarding operator berikutnya dan konektivitas live tetap gap; jangan mengaktifkan authority pusat di produksi.
