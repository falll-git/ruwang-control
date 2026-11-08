# Penyelarasan komponen Control dengan Ruwang Arsip

Keputusan pengguna 3 Oktober 2026 menggantikan batas visual lama yang melarang penggunaan komponen Arsip. Palet Control tetap deep petrol/turquoise. Repository Arsip digunakan sebagai sumber baca.

| Permukaan Control | Sumber nyata di D:/frontend-production | Penyesuaian |
|---|---|---|
| Shell bersama | src/components/dashboard/DashboardLayoutContent.tsx; src/components/dashboard/DashboardSidebarMenu.tsx; src/components/styles/dashboard-sidebar.css | Sidebar fixed 280px, tutup seluruh sidebar (bukan rail), item menu dari CSS sumber, empat route Control. Akun satu baris penuh dan logout baris terpisah agar nama tidak bersaing dengan animasi tombol. Header breadcrumb, bel dan jam. Logo hanya di login. |
| Judul halaman | src/components/ui/FeatureHeader.tsx; src/components/styles/feature-header.css | Komponen disalin ke components/ui/feature-header.tsx; warna Control, layout/icon tile sesuai sumber. |
| Tombol | src/components/ui/SetupPrimaryButton.tsx; src/components/styles/uiverse-modal-button.css | Port primary-button.tsx dan stylesheet arsip-button.css; Button Control menggunakan kelas sumber primary/neutral/danger, disabled dan fokus. Ref React 19 dan Slot tautan tetap didukung. |
| Menu titik tiga | src/components/ui/SetupActionMenu.tsx | Disalin ke components/ui/action-menu.tsx; token biru diganti turquoise. Portal, Arrow/Home/End/Tab/Escape, fokus, disabled reason dipertahankan. |
| Tabel/filter/pagination | src/components/ui/SetupDataTable.tsx; src/components/ui/setupPageStyles.ts; src/components/styles/setup-responsive-table.css; src/components/ui/Pagination.tsx | Komponen tabel dan stylesheet responsif diport. Daftar konten/lifecycle kini mendukung page bernomor dengan count server; cursor legacy tetap tersedia, tidak dicampur dengan page. Recovery peer hanya prev/next tanpa total/jump rekaan. Filter mengikuti API Control. |
| Dialog | src/components/ui/DashboardModal.tsx; src/components/ui/SetupModalCloseButton.tsx; src/components/styles/dashboard-modal.css | Close button diport; ukuran/header/body/footer mengikuti sumber. Native dialog Control dipertahankan untuk focus trap, scroll lock, Escape, restore focus dan busy guard; bukan klaim menyalin hook useAccessibleModal. |
| Tab/status/state | src/components/ui/setupPageStyles.ts; src/components/ui/SetupState.tsx; badge shadcn/ui Radix (components/ui/badge.tsx, vendor/shadcn-LICENSE.md di Control) | Tab/state mengikuti pola Arsip. Badge aktif memakai sumber shadcn berlisensi MIT dan token Control, menggantikan pola badge awal. Enum/status tetap bersumber dari domain. |
| Form operator | src/components/ui/DashboardModal.tsx; src/components/ui/SetupPrimaryButton.tsx; setupPageStyles.ts | Satu dialog Buat akun: nama, username, password; tidak ada verifikasi identitas manual. Directory tetap terlihat. Request dibatasi waktu, receipt divalidasi, respons hilang tidak dilabeli sukses dan tidak otomatis dikirim ulang. Permission dan validasi auth tetap berlaku. |
| Notifikasi pekerjaan | src/components/Notification.tsx (referensi pola), API Control /api/reviews | Dua count scoped dari group content/lifecycle, state IN_REVIEW, diambil ketika panel dibuka. Dua tautan filter yang sama. Bukan feed event atau status baca/hapus: Control belum mempunyai kontrak itu. Tanpa polling/badge global palsu. |

Tidak ada dependency baru. Komponen umum baru bersumber dari Arsip (termasuk SetupEmptyState). Komposisi snapshot, keputusan dan recovery tetap khusus Control; tidak ada tindakan bisnis baru. UI pilih versi pembanding beserta state/fetch/CSS tak terpakai dihapus. API pembanding dan audit backend dipertahankan. Versi snapshot, pemberitahuan superseded dan tautan versi terbaru tetap tersedia.

Preview tetap satu URL http://127.0.0.1:4320. Bukti penyelarasan awal berada di workspace output/playwright/control-ui-convergence-20261005, output/control-ui-alignment dan output/control-ui-repair, di luar kandidat release. Keputusan setelahnya mengikuti [control-simplification.md](control-simplification.md), bukan screenshot lama. Hasil lokal bukan pengulangan seluruh gate historis RC-SJ-11. Role aktif hanya internal_operator; penyelarasan visual tidak menghilangkan pengamanan server.

## Aturan pemeliharaan

- Shell dimiliki app/(control)/layout.tsx. Dashboard, pemeriksaan, monitoring, recovery, operator, loading dan error tidak membuat shell ulang. Identifikasi menu aktif dari pathname melalui src/lib/control-navigation.ts; URL asing tidak memakai fallback Dashboard.
- Halaman dan API tetap memeriksa sesi/permission. Layout yang persisten bukan pengganti pemeriksaan akses server.
- Pada layar kecil, status filter mendapat satu baris penuh agar label tidak terpotong. Search input mengisi ruang tersisa dan tombol cari berada di ujung field. Tab reflow, tidak memerlukan scroll horizontal.
- Jangan memunculkan kembali pemilih versi pembanding. Backend versioning, checksum dan keputusan tepat versi tetap wajib.
- FeatureHeader dan menu aksi berasal dari source Arsip, bukan komponen dekoratif baru. Pertahankan keyboard, portal dan pengembalian fokus ketika menyesuaikan warna.
- Sidebar mobile berupa drawer kiri dengan satu tombol tutup. Logout berada di bawah navigasi. Branding gambar hanya di halaman login; panel branding login mobile tetap mengikuti perilaku existing.
- Permintaan keluar dibatasi waktu. Respons hilang tidak dinyatakan sebagai sesi berhasil ditutup; arahkan pengguna memuat ulang untuk memeriksa sesi lewat server.
- Form masuk juga mengunci klik ganda, membatasi waktu request, memvalidasi bentuk receipt API login yang tersedia, dan mengembalikan fokus ke kegagalan. Autentikasi/session/CSRF/rate limit server tidak diganti oleh logika UI.
- Tindakan keputusan, retry dan pemeriksaan tetap mengikuti eligibility server. Penyesuaian CSS tidak menambah hak operator.
- Setelah modal keputusan selesai, pesan hasil atau hasil belum pasti menerima fokus. Validasi catatan kosong tetap memfokuskan textarea; pemicu yang menjadi disabled bukan tujuan pengembalian fokus. Penjagaan idempotency, versi dan checksum tetap berlaku.
- Notifikasi pekerjaan menampilkan dua jumlah terpisah menurut filter dan akses, bukan total lintas endpoint. Jangan menambahkan badge belum dibaca, hapus notifikasi atau angka global tanpa kontrak baru.
- Error memuat jumlah menggantikan angka, bukan menampilkan nol seolah-olah permintaan berhasil. Buka panel mengambil dua request; tidak ada polling notifikasi.
- Password operator mempunyai label tersendiri; petunjuk dihubungkan melalui aria-describedby. Dialog yang sedang menyimpan tidak ditutup lewat backdrop atau Escape.

Verifikasi perubahan ini memakai build produksi lokal, akun/DB disposable Control, dan test double bank/SJ bertanda tangan. Ini bukan pengulangan gate integrasi nyata atau izin deployment. Laporan rinci, screenshot sebelum/sesudah, hash kandidat, dan daftar pemeriksaan ada pada checkpoint di luar repository.
