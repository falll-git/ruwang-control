# RC-SJ-07 — rancangan ruang kerja pemeriksa SJ

> **ARSIP HISTORIS — bukan instruksi implementasi aktif (rekonsiliasi 7 Oktober 2026).** Seluruh isi tahap lama di bawah, termasuk kata “aktif”, “wajib”, gap dan prompt lanjutan, menggambarkan keputusan/bukti saat itu. Ikuti [indeks dokumentasi](documentation-index.md) dan [keputusan aktif](control-simplification.md). Bantuan pengelola, verifikasi identitas manual Control, pemeriksaan publik Control, pemilih versi pembanding UI dan banyak role Control dibatalkan; bukan pekerjaan tertunda untuk dihidupkan kembali. Dua akun berbeda tidak membuktikan dua orang berbeda. Autentikasi, validasi credential, authority, signature, versioning dan audit tetap berlaku. Angka tes/bukti di arsip bukan hasil verifikasi kandidat terbaru. Isi historis dipertahankan untuk penelusuran.

## Revisi 2 — acuan prototype terbaru, 29 September 2026

Pengguna meminta perombakan prototype dan melarang lanjut tahap berikutnya sebelum ditinjau. Revisi ini menggantikan **rancangan visual prototype revisi 1**, tidak mengganti kontrak atau aplikasi operasional. Bukti revisi 1 tetap disimpan. Acuan terbaru: workspace task `output/rc-sj-07-r2/REPORT.md`, `CHECKPOINT.md`, `verification.json`, dan `prototype/`. Bagian di bawah seksi revisi ini merupakan dokumentasi revisi 1; untuk ukuran/layout yang berbeda gunakan revisi 2.

- Sidebar tetap dua pekerjaan: Pemeriksaan dan Monitoring SJ. Mobile/tablet <=1000 px menggunakan drawer dengan focus trap, Escape dan pengembalian fokus. Bukan menu bank atau dashboard statistik.
- Daftar menjadi satu permukaan kerja dengan tab, pencarian, status, filter lanjutan dan pagination. Status langsung menerapkan filter; pencarian Enter/tombol. Filter instansi/jenis/penerapan/urutan berada dalam dialog. Konteks tiap tab, URL, kembali dari detail dan Back/Forward dipertahankan.
- Detail memakai lembar pengajuan dan panel keputusan. Isi snapshot, perbandingan snapshot, bukti publik terakhir dan keputusan tetap terpisah. Tidak ada editor isi bank, panel data bank terbaru, atau retry palsu.
- Hasil timeout disimpan per pengajuan selama sesi prototype, termasuk saat keluar-masuk detail. Simulasi tidak boleh menciptakan keputusan ulang saat hasil belum pasti. Reload browser menghapus memori simulasi; aplikasi nyata wajib memakai kontrak idempotency/command yang persisten, bukan Map browser ini.
- Header, tombol, tabel/baris mobile, input, tab, dialog, drawer, badge, loading, kosong/error dan monitoring menggunakan CSS custom. Body 16 px; nilai utama 15–16 px; label/metadata penting 13 px; aksi 14 px. Label kecil prototype/footer adalah keterangan lingkungan, bukan status bisnis. Target utama 44 px. Tanggal tetap Asia/Jakarta tanpa GMT. Light theme saja dan reduced motion tanpa animasi dekoratif.
- Perbaikan hasil inspeksi: metadata terlalu kecil; brand/menu membungkus pada 1024 px; pagination sempit 360 px; kata Tinjau pecah; nama sumber monitoring terjepit; fokus keyboard tab berlomba dengan hashchange; Tab keluar dari dialog; warna hasil revisi/ditolak tidak boleh hijau.

### Referensi komponen dan keputusan dependency

Koreksi akhir R2: pencarian simulasi mencocokkan judul/reference_code, label property/house menjadi Properti/Rumah, dan queue depth saja tidak diberi label kendala. Kontrak/filter server tidak diubah.

[shadcn Data Table](https://ui.shadcn.com/docs/components/radix/data-table) dan [Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar) dipakai sebagai referensi komposisi, bukan skin atau kode yang disalin. [MagicUI Shimmer Button](https://magicui.design/docs/components/shimmer-button) dievaluasi tetapi animasi dekoratif terus-menerus tidak diambil untuk tombol keputusan. [Uiverse UI kits](https://uiverse.io/ui-kits) dievaluasi sebagai referensi; tidak ada komponen/asset yang disalin. Tidak memasang dependency baru. Lisensi MIT shadcn/MagicUI tidak berlaku otomatis untuk aset berbayar atau pihak ketiga.

Ikon memakai Lucide 1.43.0 yang sudah terpasang (ISC/MIT, notice disimpan di artifact revisi 2); Inter existing tetap self-hosted. Native dialog/select/input dipertahankan untuk fondasi interaksi dengan pengujian fokus tambahan. Tidak menganggap Radix Dialog/Menu sudah terpasang. Perhitungan bundle Next belum berlaku: ini server statis terisolasi, bukan komponen Next operasional. Logo sumber existing disajikan tanpa mengubah aset; ukuran logo masih besar, dicatat sebagai batas prototype.

### Batas verifikasi revisi 2

Browser: daftar, detail, konfirmasi, drawer, filter dan monitoring pada 360/390/768/1024/1440 CSS px. Matriks utama 138 pemeriksaan dan tambahan 25 pemeriksaan lulus; seluruhnya simulasi. Enam jenis lifecycle, profil/kontak, versi lama/pemeriksaan publik gagal, readonly, konflik, timeout dan data parsial termasuk nilai nol dicakup. Bukti final mengikat hash artifact dan manifest repo, bukan nomor tes saja.

Zoom browser 200% **belum terverifikasi**: shortcut tidak mengubah DPR/innerWidth; uji reflow 720 CSS px dicatat terpisah. Screen reader dan browser engine lain belum diuji. Media/logo pengajuan serta viewer autentikasi belum dibuat pada prototype; placeholder menyatakan keterbatasan, tidak mengaku media siap. Tidak ada tes API nyata/DB/worker/peer atau build Next pada perubahan prototype-only ini. Dependency kontrak yang dijelaskan dalam dokumen ini tetap terbuka. Penilaian visual pengguna masih diperlukan; RC-SJ-08 belum dimulai.

Preview hanya `http://127.0.0.1:4320/` dari `node output/rc-sj-07-r2/server.mjs` di workspace task. Server tidak fallback port, tidak membaca env atau DB, menolak POST, dan membatasi koneksi browser dengan CSP. Jangan jalankan preview revisi 1 dan 2 bersamaan. Setelah pemeriksaan, hentikan hanya PID server milik tugas yang telah diverifikasi.

29 September 2026. Tahap ini menghasilkan spesifikasi dan prototype terisolasi, **bukan penggantian UI operasional**. Instruksi pengguna RC-SJ-07 yang meminta prototype berlaku untuk tahap ini meskipun handoff awal menyebut pembangunan operasional langsung. RC-SJ-08 tidak dimulai.

## Dasar dan batas

Dasar aktual: `docs/control-review-read-api.md`, `control-monitoring-evidence.md`, `control-dispatch-recovery.md`, `src/domain/review-read-contract.ts`, `review-snapshot.ts`, `review.ts`, `src/server/review-read.ts`, `reviews.ts`, `monitoring.ts`, route API di bawah, dan komponen existing. Catatan RC-SJ-06 dipakai setelah pemeriksaan hash, bukan sebagai klaim integrasi terbaru.

Tidak ada perubahan database, API, permission, worker, timestamp, desain modul non-SJ, atau protokol bank/SJ. Aplikasi normal tidak membaca fixture prototype. Data bank/SJ terkini, pemulihan UNKNOWN, korelasi receipt/media per event dan kecocokan versi publik tetap terbatas kontraknya.

## Arsitektur informasi

**Pemeriksaan** adalah pintu masuk pekerjaan SJ. **Monitoring SJ** adalah tujuan terpisah ketika ada kendala sumber/layanan. Tidak menyalin empat menu input bank: Control memeriksa snapshot, bukan mengedit profil/kontak/aset bank.

- Pemeriksaan: dua tab biasa, **Pengajuan konten** dan **Penarikan & perubahan**. Tab kedua meliputi penarikan, arsip, sembunyikan profil, pencabutan kontak/media, konfirmasi ketersediaan; label baris menyebut tindakan tepatnya.
- Detail berada pada route pengajuan, bukan modal panjang yang menutup daftar. Tautan kembali memulihkan filter/tab/cursor. Browser Back/Forward berfungsi.
- Monitoring: sumber dan hasil terakhir, percobaan/kegagalan terbaru, layanan dan antrean yang memang dikembalikan API. Tidak ada kartu KPI dekoratif atau hitungan aset tayang.
- Operator Control tetap fitur fondasi existing sesuai permission, di luar rancangan SJ ini. Prototype hanya menampilkan navigasi SJ; bukan instruksi menghapus route operator/dashboard existing.
- Tidak ada Bantuan pengelola, menu audit baru, timeline dekoratif, wizard, atau panel keadaan terbaru bank yang tidak didukung.

## Matriks layar dan kontrak

Semua path API di tabel milik Control. Session/grant dan validasi server wajib; menyembunyikan tombol bukan otorisasi.

| Permukaan | Tujuan/data/versi | Tindakan dan sumber | Izin / batas |
| --- | --- | --- | --- |
| Daftar pemeriksaan | Identitas instansi, title, kind/action, sourceVersion, state, submittedAt, commandState | GET `/api/reviews`; tab `group=content/lifecycle`; q, state, kind, action, instanceId, commandState, sort, limit, cursor sesuai kontrak | `review.read`, scope instansi; count FILTERED_AUTHORIZED_SNAPSHOTS, bukan aset unik/total lintas tab |
| Filter utama | q maksimum120, state, sort submitted_asc/desc | Cari judul/referensi, status pengajuan, urutan; Terapkan filter eksplisit | Tidak melakukan filter global dari satu halaman hasil |
| Filter lainnya | instanceId, kind, commandState; action lifecycle saat diperlukan | Dialog pendek, batal membuang perubahan filter, terapkan mereset cursor | Nilai instansi harus berasal dari daftar grant yang sah; opsi lengkap belum punya endpoint baca khusus, dependency internal di bawah |
| Detail snapshot | detail immutable menurut kind, checksum/version disimpan untuk POST; versions.submitted dan latestReceived | GET `/api/instances/:instanceId/reviews/:reviewId` | `review.read`; bankCurrent NOT_AVAILABLE. GET detail juga memeriksa publik, bukan pemanggilan per baris |
| Perbandingan | changes.path/before/after, from/to versi snapshot satu aggregate | GET detail `/comparison?against=:snapshotId`; pilihan versi diperoleh lewat `/api/reviews?instanceId=…&sourceId=…&kind=…&state=all` | Hanya SUBMITTED_SNAPSHOTS. Jangan memakai label “versi publik” atau “data kerja bank” pada kolom perbandingan |
| Catatan/keputusan | decision.action/note/recordedAt, applicationState/resultCode | POST detail `/decisions`; simpan commandId idempotency, expectedVersion/checksum | `review.approve` atau `review.request_revision`; konten hanya approve/request_revision; lifecycle juga reject. Maks2000, nonkosong jika requiresReason |
| Konfirmasi | Instansi, judul target, versi, keputusan, alasan, dampak | Dialog sebelum keputusan; Batal aman, aksi final eksplisit | actions dari server. Authority/local, self-review, superseded, konfigurasi, grant berubah tetap diperiksa server |
| Status keputusan | Keputusan tersimpan terpisah dari penerapan bank | GET `/api/instances/:instanceId/review-commands/:commandId` setelah respons hilang, bukan POST baru | Kontrak lookup Control bukan lookup ledger bank; UNKNOWN tidak berarti boleh dikirim ulang |
| Bukti publik | publicEvidence.latestAttempt, lastSuccessfulObservation, lastFailedAttempt; observedVersion, versionKind, checkedAt | Tampilkan hasil valid terakhir dan error terbaru berdampingan | CHECK_TIME_ONLY. Tidak menetapkan TTL baru; versionComparison NOT_PROVEN. Kontak not_applicable |
| Monitoring | MonitoringView.sources, source.status, lastSuccessfulCheck, lastAttempt, lastFailure, services/queues, observedAt | GET `/api/monitoring`; POST endpoint sama + CSRF untuk pemeriksaan sesuai scope/config | `monitoring.read`, sumber grant aktif, enabled. Queue depth bukan jumlah gagal/berhasil; status worker bukan bukti antrean sudah diproses |
| Media pemeriksaan | detail.logo atau detail.media, ID dan metadata READY pada snapshot | GET detail `/media/:mediaId`, route existing; thumbnail membuka preview aksesibel pada implementasi | Izin reviewer + scope snapshot. READY lampiran tidak membuktikan proyeksi/media publik siap. Gagal memuat gambar tidak menghilangkan snapshot |

### Tata daftar dan state

Desktop: kolom Pengajuan (judul, instansi, jenis, versi, waktu), Pemeriksaan, Penerapan bank, Tinjau. Mobile: baris terstruktur, identitas lebar penuh, dua label status, tautan Tinjau 44px. Bukan katalog marketplace.

Hanya satu daftar aktif. Masing-masing tab menyimpan filter/cursor; total tidak dijumlahkan. Default menunggu pemeriksaan, paling lama dahulu. Ringkasan publik tersedia dalam DTO tetapi bukan badge tambahan wajib di setiap baris; fokus daftar ini adalah keputusan. Detail menjelaskan bukti publik.

Cursor produksi adalah opaque dari server, disimpan per halaman di konteks URL/riwayat; perubahan filter/limit menghapus cursor. Count live dapat berubah antar-request. Jangan membuat nomor halaman absolut palsu. Prototype memakai cursor `demo-N` dan page size3 untuk memeriksa interaksi pada seluruh fixture di memori; **bukan algoritme pagination produksi**.

Loading mempertahankan struktur dan status memuat. Kosong menjelaskan filter dan memberi reset. 401 memerlukan login, 403 akses tidak tersedia, data:null tidak ditemukan, 400 cursor invalid menawarkan mulai ulang, 503 menampilkan gagal dimuat; jangan semuanya menjadi kosong. Daftar lama boleh dipertahankan saat refresh gagal tetapi harus diberi penanda belum diperbarui. Jangan tampilkan data tenant sebelumnya setelah perubahan scope/logout.

### Detail dan keputusan

1. Header: judul, instansi, jenis, versi yang diajukan, status pemeriksaan.
2. Data snapshot: profil (nama/slug/deskripsi/kota/provinsi/website/logo); kontak (label/nomor/versi templat pesan); publikasi (reference/category/subcategory/title/description/location/availability/attributes/media/contact/profile); lifecycle (action/target/reason/current_state/blockers/affected counts/expected visibility).
3. Kolom keputusan desktop atau bagian di bawah data pada mobile: catatan + satu aksi utama Setujui; Minta revisi sekunder; Tolak permintaan khusus lifecycle bergaya risiko. Tiga aksi keputusan penting tetap eksplisit, tidak perlu disembunyikan dalam menu titik tiga. Tidak membuat menu tambahan tanpa kebutuhan.
4. Perubahan antar-pengajuan saat pembanding sah tersedia. Nol/false dipertahankan, field absen bukan nol, array dibandingkan sebagai satu nilai sesuai API. Tidak menampilkan pembanding identik untuk mengisi halaman. Fixture memakai dua snapshot berbeda; permintaan pembanding identik dan API error perlu pengujian integrasi implementasi.
5. Bukti publik terakhir terpisah. Profil tampil hanya tentang profil; kontak bukan halaman publik. Versi publik17 bukan otomatis sourceVersion17.

Catatan wajib divalidasi sebelum konfirmasi; fokus ke field dan alasan inline. Bukan toast + panel identik. Konfirmasi menampilkan identitas/versi yang tidak bisa diedit, catatan utuh yang dapat digulir, dan dampak sesuai action. Header/footer dialog tetap terlihat. Tindakan destructive tidak default fokus; Batal mendapat fokus awal. Jangan mengubah status lewat JS/SQL untuk menandai alur produksi berhasil.

Selama menyimpan: cegah klik ganda, pertahankan input. 409: blok keputusan lama, muat ulang snapshot dan eligibility, jangan ganti version/checksum diam-diam. 403: hapus tindakan yang tidak lagi berizin. Respons hilang: pertahankan commandId, cek status sah; jika belum pasti jangan membuat command baru. APPLIED hanya penerapan bank. Setelah request_revision, tunggu snapshot pengajuan ulang bank; Control tidak mengedit isinya.

Prototype mensimulasikan keputusan di memori saja. Tombol Periksa status mensimulasikan hasil UNKNOWN yang sudah tercatat di Control; **bukan bukti lookup aplikasi nyata**. Tidak menyediakan retry karena kontraknya belum aman.

## Kamus status

| Sumber | Label | Batas makna/tindakan |
| --- | --- | --- |
| state IN_REVIEW | Menunggu pemeriksaan | Tinjau; tindakan hanya dari actions |
| REVISION_REQUIRED | Perlu diperbaiki | Catatan keputusan terlihat; perbaikan di bank |
| APPROVED / REJECTED | Disetujui / Ditolak | Keputusan, bukan keadaan publik |
| SUPERSEDED | Sudah digantikan | Buka pengajuan terbaru diterima, bukan data kerja bank |
| command PENDING / DISPATCHING | Menunggu penerapan / Sedang dikirim ke bank | Tidak menambah retry |
| command APPLIED | Diterapkan di bank | ACK tervalidasi, bukan SJ tampil |
| command REJECTED | Ditolak bank | Jangan disamakan dengan pemeriksa menolak isi |
| command UNKNOWN | Penerapan belum pasti | Periksa status Control; pemulihan bank tetap dependency |
| observation visible + checkedAt | Tampil saat dicek · waktu | Bukti API pada waktu itu, bukan jaminan kini |
| observation not_visible | Tidak tampil saat dicek · waktu | Bukan hasil timeout; sertakan scope bila tersedia |
| unknown/not_checked | Belum bisa dicek / Belum ada bukti tampil | Simpan keberhasilan terakhir terpisah |
| latest failure | Pemeriksaan terbaru gagal · waktu | Hasil sebelumnya tetap terlihat, tidak menjadi tidak tampil |
| Monitoring status stale | Hasil belum diperbarui | Ikuti status stale server/config sumber; jangan menentukan TTL frontend |

Tidak ada enum UI baru yang dikirim ke API. Quarantine SJ per-event tidak diklaim dari status UNKNOWN Control; hanya tampilkan fakta quarantine jika suatu kontrak benar-benar menyediakannya.

## Komponen dan token

| Komponen | Keputusan | Sumber/perilaku |
| --- | --- | --- |
| AppShell | Pertahankan identitas deep-petrol/Inter dan fondasi sesi existing | Navigasi SJ baru terbatas dua pekerjaan; jangan redesign halaman operator |
| Button, StatusBadge, Skeleton | Pertahankan dasar existing `components/ui/*` | Mapping label per domain, bukan satu badge sehat untuk semua status |
| Input/select/textarea | Native accessible, style token konsisten | Label nyata, error aria-describedby, 44px target; bukan dropdown custom demi kosmetik |
| Tabs pengajuan | Komposisi khusus kecil; belum ada wrapper existing | Tablist dua item, aria-selected/controls, roving tabindex, Arrow/Home/End, fokus terjaga |
| ReviewWorklist | Khusus pemeriksa, bukan generic dashboard | DTO ringkasan dan count scoped; satu render baris tanpa fetch detail |
| SnapshotFields / SnapshotComparison | Khusus snapshot immutable | Allowlist per kind, field label Indonesia, provenance versi eksplisit |
| DecisionPanel / DecisionConfirmation | Khusus risiko keputusan versi tertentu | actions/requiresReason, note, version/checksum; dialog accessible |
| PublicEvidence | Khusus pemisahan bukti | Keberhasilan terakhir + gagal terbaru; tidak menghapus salah satunya |
| MonitoringSource | Susun ulang data source/services/queues existing | Pemeriksaan baca saja; kegagalan terbaru tidak meninggalkan badge sehat palsu |
| Dialog/filter | Native HTML dialog pada prototype | showModal membuat latar inert; Escape, focus return, scroll lock; implementasi React dapat membungkus primitive teruji setelah evaluasi tersendiri |

Token usulan (hanya prototype, belum memodifikasi shared UI): canvas #F4F8F8, surface #FFFFFF, subtle #EDF5F4, text #172F34, muted #52676B, border #D8E6E5, input-border #94A8AA, sidebar #12343B; primary **#00717F**, hover #005F6C, soft #E2F6F7. Primary lama #008C9E terhadap putih hanya4,00:1; baru5,72:1. Sukses #137A4E/#EAF8F1, warning #854D0E/#FFFBEB, error #B91C1C/#FEF2F2. Status selalu punya kata, bukan warna saja.

Inter variable existing: body15/1.55, tabel14, metadata12–13, heading28 desktop/24 mobile, weight400/500/600/700. Spacing4/8/12/16/20/24/32; radius6 control,8panel,10dialog. Target44px; focus ring3px dengan offset3, putih di sidebar. Tabel tidak memakai zebra/dekorasi berlebihan. Dialog max85dvh, isi scroll terpisah, tombol tidak menutup isi. Tidak ada animasi dekoratif; reduced motion tidak menjalankan animasi. Tema aktif light; preferensi OS dark tidak membuat tema baru.

Tidak memasang dependency. Next16.3.4/React19.3.0/TS5.9.3 installed telah diidentifikasi; dokumentasi Next lokal CSS/font dibaca. Prototype HTML/CSS/JS native di luar aplikasi, tidak mengubah lockfile atau bundle Next. Inter existing5.3.0, SIL Open Font License1.1, file latin variable48256byte disajikan lokal. Lucide existing1.43.0 tersedia untuk implementasi, tidak menambah paket ikon/komponen. Radix yang terpasang hanya react-slot: **jangan menganggap Dialog/Tabs/Menu Radix sudah tersedia**. Keputusan paket primitive tambahan ditunda sampai implementasi dengan audit lisensi/ukuran/kompatibilitas spesifik; prototype tidak membutuhkannya.

Rujukan perilaku: [dialog HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [WAI-ARIA Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Native dialog bukan alasan melewatkan uji keyboard/browser pembungkus React nantinya.

## Langkah pengguna (rancangan, bukan pengukuran operasional baru)

Perbandingan dihitung dari halaman daftar yang sudah terbuka, tanpa menghitung ketikan atau scroll. Existing diperiksa lewat source RC00/halaman saat ini, bukan stopwatch browser aplikasi operasional.

| Pekerjaan | Existing menurut source | Prototype |
| --- | --- | --- |
| Menemukan snapshot | Telusuri daftar maksimum100 IN_REVIEW; tidak ada filter UI | Isi q/status, Terapkan, Tinjau; filter tambahan opsional, context kembali utuh |
| Menyetujui | Tinjau → Setujui (2klik, tanpa konfirmasi terpisah) | Tinjau → Setujui → konfirmasi (3klik); sengaja menambah satu batas risiko |
| Meminta revisi | Tinjau → isi catatan → Minta revisi | Sama ditambah konfirmasi versi; error langsung ke catatan |
| Melihat versi lama | Pembanding belum ada pada UI existing | Tinjau → bandingkan dua snapshot yang tersedia; bukan versi kerja/publik |
| Respons keputusan hilang | Pesan kegagalan umum pada form | Hasil belum pasti → periksa status command; aksi ulang diblokir |
| Kendala | Baca status layanan/antrean dengan istilah teknis | Monitoring sumber → waktu/error terakhir → Periksa sekarang sesuai izin; tidak berpura-pura punya recovery |

## Dependency yang tetap terbuka

1. **Opsi instansi lengkap untuk filter**: Control `src/server/reviews.ts::reviewInstanceIds` menyediakan ID sesuai grant; `/api/reviews` menyediakan nama hanya pada hasil. Tidak ada GET `/api/instances` dalam source. Jangan membangun daftar “semua instansi” dari satu halaman atau memakai grants operator-management. Implementasi perlu server projection allowlist `{id,displayName}` scoped review.read atau kontrak baca khusus. Prototype memakai satu instansi fixture. Ini pekerjaan internal Control tahap implementasi, bukan API yang diklaim sudah ada.
2. **Data kerja bank**: `D:/backend-production/src/modules/seputar-jaminan/controlReview.route.js` hanya POST `/api/v1/internal/ruwang-control/sj-review/commands` dan GETmedia, belum GETaggregate. bankCurrent=null; tidak ada panel “data terbaru bank”.
3. **Pemulihan UNKNOWN**: file bank yang sama belum menyediakan GETledger command. Kebutuhan field command_id/instance/resource/digest/result/version/checksum/processed_at + bukti autentikasi/signature harus ditentukan terpisah. Tombol baca Control tidak mengatasinya.
4. **Receipt/media/proyeksi per-event**: bank `controlMonitoring.contract.js`, `controlMonitoring.service.js`, `controlMonitoring.route.js`; SJ `apps/api/src/control-monitoring.ts`. Snapshot monitoring menyediakan services/queues, bukan receipt/media aset tertentu.
5. **Kecocokan versi publik**: SJ `apps/api/src/public-service.ts`, GET `/v1/public/assets/:referenceCode` dan `/v1/public/institutions/:publicSlug`, belum menghubungkan submissionId/version/checksum bank ke public_asset_version/public_profile_version. Identitas environment/installation terattestasi belum tersedia. Tampilkan batas bukti, bukan exact-version sukses.

Prompt dependency Control untuk tahap berikut yang diizinkan:

> Baca RC-SJ-06 dan rancangan RC-SJ-07. Tambahkan projection pilihan instansi berizin untuk filter reviewer (ID/nama saja, tanpa registry/secret); audit scope review.read, disabled instance, revoked grant dan hasil kosong. Pertahankan kontrak cursor/list. Uji disposable dan sinkronkan tipe/validator sebelum menyambungkan UI. Jangan memakai daftar satu halaman sebagai daftar seluruh instansi atau membuka akses operator-management.

Prompt dependency lintas repo **tidak untuk dijalankan pada RC-SJ-07**:

> Dalam tahap terpisah yang diizinkan, rancang kontrak baca ledger command/data bank terkini serta korelasi receipt/media/proyeksi/publik menggunakan file/endpoint di atas. Definisikan identity, scope, version/checksum, waktu dan signature sesuai masing-masing protokol. Uji duplicate, stale, scope lintas instansi, timeout dan ACK hilang pada disposable. Jangan melakukan retry UNKNOWN atau membuat fallback sukses. Integrasikan consumer Control hanya setelah kontrak terbukti.

## Prototype dan verifikasi

Artifact ada di workspace task `output/rc-sj-07/prototype/`, server `output/rc-sj-07/server.mjs`, bukan kandidat release. Server GET/HEAD allowlist file, bind127.0.0.1:4320, POST405, path tak dikenal404, CSP connect-src none/form-action none. Tidak membaca .env, tidak terhubung DB, tidak memakai credential. Port terpakai menghasilkan error, tidak fallback port. URL `http://127.0.0.1:4320/` dengan `#/reviews`, `#/reviews/:fixtureId`, `#/monitoring`.

Preview: inspeksi script, cek pemilik port4320, lalu dari workspace task jalankan `node output/rc-sj-07/server.mjs`. **Jangan** jalankan npm dev bersamaan. Setelah review berhenti, hentikan hanya PID server ini. Prototype tidak dimasukkan ke runtime Next dan tidak boleh dijadikan fallback API normal.

13 fixture summary dan13 detail payload diperiksa dengan schema Zod existing. Filter, pagination, keputusan, error dan monitoring di browser tetap **simulasi**, bukan pengujian API atau integrasi bank/SJ. Sebagian konten detail diringkas untuk rancangan: foto/logo riil dan viewer media belum diimplementasikan/diuji di prototype; state tidak tersedia dijelaskan. Jangan mengartikan prototype sebagai layar pemeriksaan operasional lengkap.

Hasil, screenshot, daftar temuan dan checkpoint ada di laporan eksternal RC-SJ-07. Kelulusan rancangan tidak menutup dependency RC-SJ-06 atau menandai workflow produksi selesai. Build Next, DB/migration normal, auth/API nyata, integrasi peer, akses scanner/media, volume produksi dan assistive technology selain keyboard browser tidak diulang pada tahap ini.
