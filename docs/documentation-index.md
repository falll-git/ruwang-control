# Indeks dokumentasi dan keputusan aktif

Rekonsiliasi lokal 7 Oktober 2026, Langkah 3. Indeks ini mengatur cara membaca
dokumentasi, bukan menyatakan seluruh gate aplikasi/produksi lulus. Scope tugas
pengguna terbaru tetap menentukan izin perubahan. Jangan otomatis menjalankan
prompt lama, migration, preview, tes mutatif atau tahap berikutnya.

## Urutan acuan aktif

1. [control-simplification.md](control-simplification.md): lima keputusan fitur
   yang dihentikan dan batas kebijakan identitas manusia.
2. [control-internal-access.md](control-internal-access.md): satu role aplikasi,
   akun internal, sesi, izin server dan pemisahan role database.
3. [control-sj-current.md](control-sj-current.md): workflow, label, peta halaman/API,
   preview tunggal dan batas bukti.
4. [control-ui-alignment.md](control-ui-alignment.md): sumber komponen, interaksi
   dan aksesibilitas yang dipertahankan. Screenshot lama bukan spesifikasi aktif.
5. Kontrak, source dan tes yang terkait perubahan; periksa kandidat aktual.

Jika rancangan atau hasil tes lama bertentangan dengan keputusan di atas,
jangan mengembalikan fitur lama agar cocok dengan dokumen/tes. Catat selisih dan
uji perilaku yang benar. Tidak ada izin menghapus audit atau migration sejarah.

## Panduan kontrak dan pengujian aktif

| Dokumen | Cakupan dan batas |
|---|---|
| [control-review-decisions.md](control-review-decisions.md) | Snapshot, keputusan, konkurensi, signed ACK; angka gate RC-SJ-03 tetap historis |
| [control-dispatch-recovery.md](control-dispatch-recovery.md) | Pengiriman milik Control, lease dan baca hasil bank; bukan probe publik |
| [sj-recovery.md](sj-recovery.md) | Recovery milik bank/SJ lewat kontrak bertanda tangan, binding target, eligibility dan satu role Control |
| [review-media.md](review-media.md) | Media privat snapshot dan thumbnail; bukan URL storage publik |
| [control-disposable-tests.md](control-disposable-tests.md) | Resource owned, fresh/upgrade sampai 0016; bank/SJ double bukan integrasi nyata; evidence menguji retirement |
| [disposable-sj-tests.md](disposable-sj-tests.md) | Integrasi service peer nyata terisolasi; tidak otomatis membuktikan browser E2E |

Autentikasi, validasi credential, authority local/central, signature, versioning,
checksum, idempotency, audit, scope target dan pengamanan server tetap berlaku.
Satu role internal bukan akses anonim atau penghapusan role teknis database.
Setelah verifikasi manusia dihentikan, sistem **tidak membuktikan dua akun
berbeda pasti dimiliki dua orang berbeda**, termasuk lintas issuer. Pemeriksaan
qualified subject bukan pengganti pembuktian itu. Batas ini bukan backlog
verifikasi manual dan tidak boleh diam-diam dinyatakan selesai.

## Arsip historis — bukan instruksi pekerjaan aktif

Seluruh isi dokumen berikut dipertahankan untuk sejarah. Kata “aktif”, “wajib”,
gap, prompt berikutnya dan hasil PASS di dalam bagian historis merujuk waktu
penulisannya. Jangan menjalankan ulang instruksinya tanpa audit source/target.

| Dokumen | Status / pengganti |
|---|---|
| [handoff.md](handoff.md) | Handoff fondasi September; baca panduan aktif di atas |
| [sj-v1-scope.md](sj-v1-scope.md) | Scope/grant/roadmap tahap awal, bukan kontrak final |
| [architecture.md](architecture.md) | Desain fondasi, termasuk identitas/role yang dibatalkan |
| [foundation.md](foundation.md) | Checkpoint fondasi dan enam migration saat itu, bukan readiness sekarang |
| [design-system.md](design-system.md) | Desain 0.2 historis; penyelarasan Arsip dan simplifikasi mengunggulinya |
| [verification.md](verification.md) | Hasil gate September pada kandidat lama |
| [control-monitoring-evidence.md](control-monitoring-evidence.md) | RC-SJ-05; fitur pemeriksaan publik Control telah dihentikan |
| [control-review-read-api.md](control-review-read-api.md) | RC-SJ-06; grant/DTO publik/pagination lama bukan kontrak terkini |
| [control-sj-ui-design.md](control-sj-ui-design.md) | Prototype RC-SJ-07, bukan target implementasi ulang |
| [control-sj-review-ui.md](control-sj-review-ui.md) | RC-SJ-08 sebelum penghapusan pemilih pembanding dan panel publik |
| [control-monitoring-ui.md](control-monitoring-ui.md) | RC-SJ-09 sebelum simplifikasi publik/role |
| [control-foundation-access.md](control-foundation-access.md) | Gate akses sebelum internal_operator, bukan instruksi grant per instansi |
| [sj-cross-issuer-identity-policy.md](sj-cross-issuer-identity-policy.md) | Kebijakan binding manusia dihentikan, bukan menunggu implementasi |
| [sj-delivery-lineage.md](sj-delivery-lineage.md) | Lineage pemeriksaan publik Control dihentikan; bank/SJ terpisah |
| [source-evidence.json](source-evidence.json), [source-evidence-before-review-adapter.json](source-evidence-before-review-adapter.json) | Hash/snapshot historis; tidak ditulis ulang untuk menyerupai kandidat sekarang |

## Batas lintas repository

- Bank: `D:/frontend-production/docs/seputar-jaminan-operator-access.md`
  menetapkan penghapusan Bantuan pengelola, Ringkasan dan tab teknis. Permission
  bernama ringkasan pada API privat bukan alasan mengembalikan halaman.
- Bank: `D:/backend-production/src/modules/seputar-jaminan/WORKFLOW-GUIDE.md`
  dan `PUBLIC-OBSERVATION.md` tetap memisahkan keputusan/penerapan/pengiriman
  dari pengamatan publik bank. Penghapusan Control tidak menghapus fitur bank.
- SJ: `D:/seputarjaminan-production/INTEGRATION_BOUNDARIES.md` memuat
  rekonsiliasi OPS09. `OPS09_DOWNSTREAM_PROMPTS.md` adalah prompt historis;
  prompt pemeriksaan publik Control dibatalkan, bukan dependency aktif.
- Data role bank, ops SJ, role DB dan layanan pemeriksa bank bukan role aplikasi
  Control. Jangan menghapusnya karena Control memakai satu role.

Commit/push, hosted CI, deploy, VPS dan bukti operasi tiap lingkungan tetap
pekerjaan terpisah yang memerlukan izin. Dokumentasi ini tidak mengubah hasil
PASS/FAIL/SKIP/NOT RUN lama atau menganggap blocker lain selesai.
