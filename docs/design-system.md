# Ruwang Control — spesifikasi UI dashboard 0.2

> Spesifikasi fondasi ini bukan snapshot UI SJ terkini. Untuk SJ, ikuti AGENTS.md, token source aktif dan [control-sj-current.md](control-sj-current.md). Bagian palet/layout lama yang berbeda tidak menjadi perintah merombak modul lain. Prototype historis tidak membuktikan workflow produksi.

Tanggal: 10 September 2026. STATUS: SPESIFIKASI HISTORIS; bukan acuan aktif jika berbeda dari keputusan terbaru.

Rekonsiliasi 7 Oktober 2026: instruksi lama di bawah mengenai larangan menyalin komponen Arsip telah digantikan oleh permintaan pengguna untuk menyelaraskan komponen yang relevan, dengan warna Control. Ikuti [control-sj-current.md](control-sj-current.md), [control-simplification.md](control-simplification.md), dan source komponen aktif. Jangan membangun ulang prototype atau menghidupkan fitur yang sudah dihentikan hanya untuk mengikuti rancangan lama ini.

Pengguna menolak tampilan 0.1 karena warna, font dan penyajiannya terasa generik serta tidak nyaman. Isi `dist/` masih preview 0.1 yang ditolak; jangan mengambil token, layout atau screenshot-nya sebagai target visual. Dokumen ini adalah keputusan rancangan pengganti, belum hasil implementasi atau persetujuan visual pengguna atas screenshot baru.

Pembaruan scope: sj-v1-scope.md adalah acuan tahap awal SJ-only. Implementasi berikutnya langsung aplikasi operasional, bukan prototype/wireframe. Tidak ada gerbang persetujuan contoh visual sebelum development; penyempurnaan UI dapat menyusul tanpa menunda keamanan dan aksesibilitas.

## 1. Tujuan dan identitas

Bangun dashboard administrasi yang familier, minimalis, terang dan mudah dipakai dalam sesi kerja panjang. Kemudahan memindai pengajuan, membaca data bank, mengambil keputusan dan memahami hasil adalah ukuran utama. Istilah "premium", "eye catching" dan "anti AI slop" diterjemahkan menjadi hierarki yang rapi, proporsi stabil, teks jelas dan interaksi yang dapat diprediksi; bukan jaminan bahwa library tertentu otomatis membuat desain disukai.

Identitas kerja: **Ruwang Control**, deep petrol + putih natural + aksen turquoise. Hijau emerald hanya menandai status sehat. Palet ini menyatu dengan logo, sengaja berbeda dari biru Ruwang Arsip, dan tetap tenang untuk aplikasi operasional. Tata letak, token dan komponen Control dimiliki proyek ini. Boleh memakai font/ikon yang familiar dari Ruwang. Tidak perlu memaksa jenis font berbeda. Jangan menyalin CSS, header atau komponen Ruwang/SJ lintas repo.

## 2. Token warna yang dipilih

Semua nilai berikut adalah target rancangan baru. Sidebar memakai deep petrol agar produk memiliki jangkar visual; area kerja tetap putih/netral supaya nyaman untuk sesi panjang. Turquoise dipakai pada aksi utama, pilihan aktif, link dan fokus. Hijau emerald hanya untuk status sehat. Tidak ada beige kekuningan, gradient, glow, atau warna status sebagai dekorasi.

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| background | #F4F8F8 | Kanvas luar konten, aqua-gray sangat muda |
| surface | #FFFFFF | Header, sidebar, form, tabel, card |
| surface-subtle | #EDF5F4 | Table header, hover netral, panel informasi ringan |
| foreground | #172F34 | Teks utama, heading |
| foreground-muted | #52676B | Label dan teks pendamping penting |
| foreground-secondary | #6B7280 | Metadata sekunder; bukan teks utama |
| border | #D8E6E5 | Pemisah panel dekoratif |
| control-border | #94A8AA | Batas input/kontrol yang perlu dikenali |
| primary | #008C9E | Aksi utama, link, identitas aksen |
| primary-hover | #00717F | Hover aksi utama |
| primary-soft | #E2F6F7 | Pilihan ringan dan row terpilih |
| primary-foreground | #FFFFFF | Teks pada tombol primer |
| focus | #008C9E | Ring fokus yang terlihat |
| success / success-soft | #137A4E / #EAF8F1 | Hasil berhasil yang terkonfirmasi |
| warning / warning-soft | #854D0E / #FFFBEB | Perlu perhatian; tidak untuk dekorasi |
| danger / danger-soft | #B91C1C / #FEF2F2 | Error dan tindakan destruktif |

Kontras diuji lagi pada komponen yang dirender: teks normal minimum 4.5:1, teks besar 3:1, indikator kontrol/fokus yang relevan 3:1. Border panel dekoratif tidak diperlakukan seperti satu-satunya batas input. Jangan menurunkan opacity teks penting untuk membuatnya tampak lembut. Warna status selalu disertai label; unknown tidak diberi tanda hijau.

## 3. Tipografi, ikon, bentuk dan spacing

- **Inter**, self-hosted WOFF2/variable dengan lisensi disimpan. Fallback `system-ui, sans-serif`. Jangan bergantung Segoe UI sebagai font rancangan atau memakai font CDN runtime.
- Weight 400 untuk isi, 500 untuk label/menu, 600 untuk heading/aksi. Tidak memakai weight sangat tipis atau bold di seluruh tabel.
- Judul halaman 28px/36px desktop dan 24px/32px mobile; judul section 18px/26px; body/form 16px/24px; menu/header tabel 14px/20px; metadata 13px/20px. Gunakan rem dan hormati pembesaran font browser.
- Letter spacing normal pada isi. Heading boleh -0.02em; hapus eyebrow uppercase berspasi lebar, nomor menu 01–04 dekoratif dan titik warna setelah judul.
- Font mono hanya bila kode/hash memang perlu dibaca atau disalin. Jangan memakai mono untuk seluruh label, status dan penjelasan.
- **Lucide React** sebagai satu keluarga ikon, umumnya 18–20px, stroke 1.75–2. Glyph Unicode seperti ↗/≡/⊞ tidak menjadi ikon UI operasional. Ikon dekoratif aria-hidden; tombol ikon punya accessible name.
- Area klik minimum 44 × 44px, termasuk close, pagination dan row actions. Gunakan tooltip pada ikon yang maknanya kurang jelas; fungsi inti punya teks.
- Spacing mengikuti 4/8/12/16/24/32px. Card padding 20–24px desktop, 16px mobile. Form gap 16px; section gap 24–32px.
- Radius kontrol 6px, card 8px, dialog 10px. Border 1px. Shadow tipis hanya untuk lapisan overlay/dropdown/toast; card tidak mengambang saat hover.
- Gunakan aset `logo-ruwang-arsip.png` yang diberikan pengguna sebagai emblem Control; tampilkan dengan crop yang menjaga fokus pada simbol dan pasangkan dengan wordmark teks Ruwang Control. Jangan menggambar ulang atau mengarang logo BPRS.

## 4. Dashboard shell dan navigasi

Sidebar deep petrol 240px desktop, header putih tinggi 64px, area konten dengan padding 24–32px dan lebar maksimal sekitar 1440px. Item aktif memakai turquoise; item lain tetap berkontras cukup tanpa panel warna berulang. Sidebar collapse ke 64px hanya dengan label/tooltip dan tombol toggle jelas. Pada layar kecil gunakan drawer dengan warna yang sama, bukan deretan link yang terbungkus dua baris.

Header memuat breadcrumb/judul konteks dan menu operator setelah auth tersedia. Pilihan instansi muncul hanya jika operator punya lebih dari satu scope. Tulis "Semua instansi yang dapat diakses" dengan jelas untuk agregasi; mutasi wajib memperlihatkan satu instansi target. Jangan mengubah target keputusan ketika scope header berubah di tengah dialog.

Jangan memasang search global, avatar dummy, notification badge atau kontrol setting hanya agar header terisi. Global search menunggu API pencarian lintas sumber; pencarian lokal tabel cukup pada tahap awal.

| Menu | Isi dan batas |
| --- | --- |
| Dashboard | Ringkasan kerja dan antrean prioritas; hanya angka yang benar-benar tersedia dari kontrak |
| Pemeriksaan | Antrean profil, publikasi dan kontak; filter/pencarian serta detail pengajuan |
| Instansi | Identitas per bank dan status koneksi beserta waktu pemeriksaan terakhir jika tersedia |
| Akses operator | Grant operator per instansi, sesuai scope backend; bukan pengelolaan akun bank |
| Jejak audit | Peristiwa berdasarkan instansi, aktor, aksi, waktu dan hasil |

Dashboard menjadi ringkasan dari sumber yang sama dengan halaman kerja, bukan API statistik baru yang diasumsikan tersedia. Jika total global belum ada, jangan menyebut total dari jumlah page. Jangan membuat empat KPI hanya karena ada empat bank. Untuk data belum terhubung tampilkan satu pesan koneksi dan state unknown, bukan card nol berulang.

Halaman akun bank/recovery/delete akun, pengaduan dan monitoring umum tidak ditampilkan pada navigasi selama belum aktif. Route/API server tetap diblokir. Instansi/Dashboard hanya monitoring pipeline SJ. Request penghapusan SJ termasuk halaman kerja aktif yang direncanakan, bukan modul hapus akun.

## 5. Alur halaman yang harus dibangun

### Dashboard

Judul "Dashboard" dengan penjelasan singkat bila perlu. Ringkasan maksimum tiga metrik yang berguna dan didukung data, misalnya menunggu pemeriksaan atau keputusan menunggu konfirmasi. Antrean yang perlu ditindaklanjuti menjadi bagian terbesar. Status koneksi instansi berupa tabel/list ringkas. Grafik hanya ditambahkan bila ada data historis dan pertanyaan operasional yang dijawab, tidak ada sparkline atau persentase tren buatan.

### Pemeriksaan

Judul "Pemeriksaan", filter jenis/status/instansi, searchbar dan tabel. Kolom desktop: pengajuan, jenis, instansi, diajukan pada, status, aksi "Tinjau". Kolom pengaju/version hanya bila tersedia dan memang membantu. Sorting default harus disepakati berdasarkan kontrak, tidak diasumsikan dari urutan array.

Klik Tinjau membuka halaman detail pengajuan dengan tombol kembali yang menjaga filter/page. Desktop detail memuat informasi utama dan panel keputusan samping secukupnya; bukan split-pane antrean/detail permanen 0.1. Mobile menjadi alur vertikal. Gunakan modal ringkas hanya untuk konfirmasi keputusan. Rute di bawah adalah rancangan, belum endpoint aktif.

Halaman detail memuat identitas pengajuan, instansi, versi, status, data publik relevan, media, ringkasan perubahan jika tersedia, catatan/riwayat dan tindakan. Jangan menampilkan dokumen nasabah. Approve publikasi, verify profil dan verify kontak tetap mengikuti domain masing-masing; label harus menyatakan efek sebenarnya. Persetujuan diterima API tidak disamakan dengan publikasi sudah tayang.

### Instansi dan akses operator

Gunakan tabel responsif, section heading dan form yang berlabel. Tampilkan data per scope; tidak ada tombol shell/restart/SQL. Akses operator mengutamakan nama, peran, instansi dan status grant. Jangan menampilkan kartu penjelasan role sebagai pengganti halaman pengelolaan yang berfungsi; penjelasan tersedia seperlunya dekat kontrol.

### Jejak audit

Tabel waktu, operator, instansi, tindakan, objek dan hasil. Detail event dibuka melalui aksi eksplisit. Konten catatan panjang wrap di detail, bukan tooltip-only. Jejak command pending, applied dan rejected dibedakan. Akses baca mengikuti grant; password, token dan payload mentah tidak ditampilkan.

### Login saat autentikasi diimplementasikan

Halaman login mengikuti struktur autentikasi Ruwang Arsip: bidang brand putih di kiri dan bidang deep petrol Control di kanan dengan card form putih. Turquoise menjadi aksen input, tombol dan fokus. Tidak ada pattern garis atau ornamen dekoratif. Input, ikon, hard shadow, radius dan tombol mengikuti ukuran/interaksi form Ruwang; fitur yang kontraknya tidak tersedia seperti ingat akun dan lupa password tidak ditambahkan. Pada mobile bidang brand disembunyikan dan form memenuhi layar. Tanpa akun demo default atau login palsu pada preview dokumentasi.

## 6. Peta komponen dan sumber implementasi

Pilihan fondasi UI: **shadcn/ui varian Radix + Tailwind CSS**, **Lucide React**, dan **Inter**. Ini keputusan teknis untuk tahap implementasi, belum dependency terpasang. Periksa versi kompatibel, lisensi dan lockfile saat pemasangan; jangan mencampur varian Radix, Base UI dan React Aria tanpa kebutuhan spesifik. Komponen shadcn disimpan/dimiliki Control dan ditata melalui token di atas. Tidak menyalin keseluruhan demo dashboard beserta data contoh, grafik, billing atau chat.

| Kebutuhan | Primitive / sumber | Aturan Control |
| --- | --- | --- |
| Sidebar/header | Sidebar, Sheet, Breadcrumb | Sidebar putih; satu item aktif, hierarki pendek, mobile drawer |
| Card | Card | Untuk kelompok informasi yang jelas; judul dan konten, tanpa icon tile besar atau card dalam card |
| Tabel | Table; TanStack Table untuk sorting/filter/pagination kompleks | Semantic table, align text left/numbers right, row minimum 52px, garis horizontal ringan |
| Pencarian | Input/InputGroup + ikon Search | Label aksesibel, placeholder faktual, clear button saat ada isi, tinggi 44px |
| Filter | Select, Popover/Combobox sesuai data | Searchable hanya untuk opsi banyak, active filters jelas, reset tidak menghapus input lain tanpa alasan |
| Tabs | Tabs | Untuk jenis konten terkait, bukan pengganti link sidebar; keyboard dan aria benar |
| Form | Field/Label, Input, Textarea, Select, Checkbox | Helper/error terhubung lewat aria-describedby; placeholder tidak menggantikan label |
| Tombol | Button | Primary/secondary/ghost/destructive, ukuran stabil saat loading, tidak ada dua primary untuk aksi bertentangan |
| Menu aksi | DropdownMenu, Tooltip | Edit/reload netral, tindakan berisiko dipisahkan; aksi inti Tinjau tetap terlihat |
| Status | Badge/teks+ikon | Palet semantik lembut, label faktual, bukan semua status pill berwarna menyala |
| Konfirmasi | Dialog atau AlertDialog | Judul tindakan, nama objek+instansi, catatan bila perlu, Batal netral; focus trap/return dan scroll lock |
| Skeleton | Skeleton | Meniru geometri komponen aktual, abu netral, bukan glow/shimmer; aria-busy pada region |
| Proses | Progress/Spinner | Persentase hanya jika terukur; jika tidak, indikator indeterminate dengan teks |
| Toast | Sonner | Pesan singkat, maksimum 2 terlihat, tidak menutup tombol penting; error penting tetap inline |
| Notifikasi tersimpan | Popover/Sheet + list | Hanya setelah sumber event ada; waktu, baca/belum baca dan link tujuan nyata; jangan badge angka palsu |
| Empty/error | Empty/Alert | Satu state sesuai sebab, recovery jelas; failed fetch bukan "tidak ada data" |
| Pagination | Pagination | Prev/next dan page yang didukung kontrak, total hanya bila tersedia |
| Media/file | Input file semantik + preview custom + Progress | Nama/tipe/ukuran/error, fallback netral, aksi hapus jelas; contract upload tidak diciptakan dari UI |
| Detail record | Description list + Separator | Nilai lengkap mudah dipindai, section sederhana, bagian panjang punya heading |

Button primer: submit/save/approve sesuai tahap. Netral: kembali/batal/edit/reload/minta revisi. Destruktif: revoke/delete yang memang tersedia. Tombol disabled disertai alasan di dekatnya bila pengguna perlu tahu penyebab, bukan tooltip yang tidak dapat difokuskan. Loading mencegah double-submit dan mempertahankan lebar tombol.

Jika primitive bersama sudah ada pada implementasi baru, perluas minimal dan uji pemanggilnya; jangan menambah ButtonV2/CardPremium/ModalCustom tandingan per halaman. Komponen custom diperbolehkan untuk komposisi bisnis seperti ReviewTable, InstanceStatusRow dan DecisionSummary, bukan membuat ulang focus trap atau combobox dari awal.

## 7. State, feedback dan motion

- Data unknown/unconnected, empty terkonfirmasi, no-results, loading, offline, timeout, error, permission-denied, session-expired, stale-version, command-pending, applied/rejected harus berbeda.
- State loading mempertahankan ruang tabel/form. Jangan mengganti seluruh halaman dengan skeleton setiap filter berubah. Pertahankan data sebelumnya dengan indikator refresh bila aman dan beri penanda stale.
- Catatan revisi wajib: error inline lalu fokus ke field. Konflik versi memerlukan baca ulang data; jangan overwrite otomatis. Draft catatan dipertahankan selama aman di sesi halaman, tidak diam-diam disimpan ke browser storage.
- Toast sukses hanya setelah hasil yang sesuai terkonfirmasi: "Keputusan dikirim" berbeda dari "Disetujui". Notification center tidak menggantikan audit bisnis.
- Transition warna/opacity 120–180ms; buka panel/dialog 180–220ms. Tidak ada bounce, parallax, hover lift, entrance stagger semua card atau angka yang menghitung dari nol.
- Reduced motion menonaktifkan transform/transisi nonesensial; skeleton boleh statis. Tidak memasang library motion berat hanya untuk hover/button.

## 8. Responsive, aksesibilitas dan performa

- Desktop ≥1200px: sidebar 240px, toolbar satu baris jika muat, tabel penuh. Tablet 768–1199px: sidebar compact/drawer berdasarkan ruang aktual, filter wrap rapi.
- Mobile 320–767px: drawer navigasi, padding 16px (12px bila diperlukan pada 320), filter lanjutan dalam sheet, daftar vertikal berlabel dari data yang sama. Jangan membuat seluruh halaman scroll horizontal.
- Detail dan modal dapat discroll; footer keputusan sticky tidak menutup field/error atau keyboard virtual. Status/aksi utama tetap terlihat dan area sentuh minimal 44px.
- Heading berurutan, form label permanen, fokus terlihat, Escape, focus return, skip link, scroll lock, route change focus serta aria-live yang tidak berisik harus diuji.
- Pembesaran 200% dan font fallback diuji langsung; tidak boleh menetapkan tinggi tetap pada card/row berisi teks panjang.
- Pagination server sesuai contract; batasi payload/page, batalkan request search lama, debounce sekitar 250ms. Jangan render seluruh data bank, polling agresif, memuat semua gambar, atau memuat semua view detail sekaligus.
- Tidak memasang chart/virtualization/global state library sebelum ada kebutuhan terukur. Target ringan harus dibuktikan dengan build, network dan responsiveness, bukan dinyatakan "anti lag" dari pilihan framework.

## 9. Kriteria pemeriksaan visual berikutnya

1. Bangun shell, tabel pemeriksaan, detail, dialog dan form sebagai bagian aplikasi operasional yang memakai API/database nyata, bertahap sesuai step aktif. Jangan membuat runtime prototype/wireframe tambahan.
2. Fixture hanya dalam lingkungan tes terisolasi, tidak menjadi fallback runtime. Jika kontrak/sumber belum tersedia, tampilkan unknown/unconnected/error yang benar, bukan angka dummy atau klaim integrasi.
3. Bandingkan desktop 1440, laptop, tablet portrait/landscape, mobile 320/390/430, keyboard dan zoom 200%; periksa normal, panjang, empty, error, loading dan disabled.
4. Pastikan font Inter benar-benar ter-load, contrast/control area cukup, tidak ada overflow, warna status tidak berlebihan dan seluruh aksi dapat dipahami.
5. Laporkan hasil visual aplikasi yang dibangun tanpa menjadikan persetujuan wireframe/preview syarat development. Hasil tes tidak otomatis berarti desain disukai; penyempurnaan dapat dilakukan kemudian.
6. Gunakan primitive konsisten pada modul SJ scope awal dan jalankan gate integrasi architecture.md/sj-v1-scope.md. Modul Coming soon tetap diblokir. Jangan mengubah domain hanya agar cocok dengan template.

## 10. Referensi primer dan status pemasangan

Dokumentasi sumber diperiksa pada 10 September 2026. Dipakai untuk menentukan primitive, bukan klaim telah menguji tampilannya pada proyek ini.

- [shadcn/ui Sidebar (Radix)](https://ui.shadcn.com/docs/components/radix/sidebar)
- [shadcn/ui Data Table (Radix)](https://ui.shadcn.com/docs/components/radix/data-table) — panduan komposisi Table + TanStack; gunakan API versi yang benar-benar dipasang.
- [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) — fondasi keyboard/focus/semantics; aplikasi tetap perlu diuji.
- [Inter resmi](https://rsms.me/inter/) — sumber font dan lisensi.

Saat dokumen ini ditulis package.json masih hanya mempunyai TypeScript sebagai devDependency; Next/React/shadcn/Radix/Tailwind/Lucide/Inter belum dipasang. Perubahan tahap ini hanya dokumentasi dan panduan kelanjutan.
