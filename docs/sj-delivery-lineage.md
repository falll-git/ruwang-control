# Bukti keputusan, pengiriman, dan versi publik

> HISTORIS: pengamatan/lineage publik milik Control dihentikan 5 Oktober 2026; tidak ada klaim publik di UI/API detail Control. Kontrak peer dan audit historis tetap dipertahankan. Lihat [control-simplification.md](control-simplification.md).

Kontrak lokal tambahan RC-SJ-10. Dokumen ini bukan izin aktivasi produksi.

## Sumber bukti

1. Keputusan Control mengikat snapshot, versi, checksum, instansi, serta target bank.
2. Bank menyimpan hasil command dan membentuk outbox dalam transaksi penerapan keputusan. Migration 147 menautkan event baru ke command persetujuan melalui `source_command_id`; tidak ada pengisian ulang data historis.
3. `POST /api/v1/internal/ruwang-control/sj-review/command-delivery` menerima lookup V1 yang sama dengan command-result: `contract_version`, `command_id`, `command_digest`, `instance_id`, `audience`, `resource`. Transport dan respons ditandatangani. Nonce, waktu, identitas, authority pusat dan scope command diperiksa.
4. Respons bank berisi identitas lookup, nonce permintaan, waktu, origin SJ, scope `DECISION_EVENT_LINEAGE`, dan maksimum 10 event terkait. Tiap event memuat ID, agregat/versi/checksum, jenis, status pengiriman, waktu ACK, bukti proyeksi atau alasan bukti belum tersedia. Tidak memuat key, payload penuh, atau alamat database.
5. Bank hanya membaca bukti SJ jika target outbox masih sama dengan binding immutable. Migration 146 mengikat instalasi, instansi, origin dan fingerprint kunci ketika event dibuat. Event historis tanpa binding tidak diberi target dari konfigurasi sekarang.
6. SJ `POST /v1/integration/delivery-evidence` memeriksa event APPLIED milik instalasi/kunci yang terautentikasi. Bukti proyeksi privat tidak sama dengan fetch publik berhasil.
7. Control menggabungkan bukti privat dengan hasil HTTP publik aktual pada origin, identitas, versi dan waktu yang sesuai. Pemeriksaan ini hanya pada detail yang relevan, bukan fetch per baris daftar.

## Aturan label

| Nilai kontrak | Label/arti |
| --- | --- |
| `NOT_PROVEN` | Hubungannya dengan persetujuan ini belum terbukti. |
| `APPROVED_EVENT_OBSERVED` | Hasil persetujuan ini teramati di publik. |
| `OTHER_EVENT_OBSERVED` | Yang teramati berasal dari perubahan lain, bukan persetujuan ini. |

Ketiganya tetap disertai waktu pengamatan. Pengecekan gagal tidak menghapus pengamatan berhasil terakhir. Jendela lima menit di pembanding adalah batas kesegaran bukti transport yang digunakan bersama, bukan jaminan bisnis bahwa konten terus tampil. Kontak dan lifecycle yang tidak mempunyai halaman publik tidak memicu pembacaan lineage publik. ID profil lokal bank tidak disamakan dengan ID agregat profil SJ; pemetaannya berasal dari resource pada respons bank bertandatangan.

## Batas recovery

`check_result` membaca ledger keputusan di bank dan tidak mengirim ulang keputusan. Hasil tidak ditemukan tetap belum pasti. Bukti pengiriman di atas juga read-only; bukan API retry pekerjaan.

Fondasi asal pekerjaan SJ menggunakan migration `20260930180000_job_installation_provenance`: instalasi asal upload dan job ditetapkan dari autentikasi saat pembuatan. Job proyeksi mencatat event/versi/checksum. Data historis tetap tidak terikat; payload, jenis, dedupe dan asal job tidak boleh ditulis ulang. Fondasi provenance sendiri tidak memberikan grant retry.

Endpoint per-job, grant terpisah, receipt idempotent dan UI recovery kini didokumentasikan di [sj-recovery.md](sj-recovery.md). Recovery tetap terpisah dari bukti lineage di sini. Jangan menggunakan credential ops sebagai pengganti grant atau menganggap reviewer otomatis berhak retry. Status final lintas tahap ada di [control-sj-current.md](control-sj-current.md).

## Pengujian aman

Gunakan harness disposable setelah memeriksa script, pemilik run, target DB, role runtime, storage, antrean dan tujuan integrasi. Tes positif melalui layanan/API; bukti upgrade DDL dipisahkan dari bukti workflow. Jangan menerapkan migration ke database existing sebagai bagian tes. Bukti sementara dan screenshot disimpan di checkpoint eksternal, bukan dokumen ini.
