# Media snapshot pemeriksaan

Control membaca media lewat GET privat bank:
`/api/v1/internal/ruwang-control/sj-review/snapshots/:snapshotId/media/:mediaId`.
Path lengkap terikat signature Ed25519. Endpoint lama tetap kompatibel tetapi
dibatasi pada pengajuan yang sedang diperiksa; Control baru tidak fallback ke sana.

Sebelum request, Control memeriksa izin review.read per instansi serta keanggotaan
media di snapshot immutable yang checksum-nya valid. Bank memeriksa authority,
identitas instalasi, nonce, signature, snapshot outbox asli, digest snapshot,
keanggotaan media dan target immutable yang masih cocok dengan konfigurasi.
Snapshot yang tidak tersedia atau target lama yang tidak dapat dibuktikan ditolak,
bukan diganti data kerja terbaru. Legacy tanpa binding tidak dibackfill otomatis.

Keputusan APPROVED atau draf yang lebih baru tidak menghilangkan akses media
snapshot lama. Media tetap harus READY dan belum dicabut. Pencabutan membatalkan
akses juga dari snapshot historis; kegagalan tersebut bukan bukti publikasi hilang.
Storage checksum, MIME dan signature respons tetap diverifikasi. Respons dibatasi
10 MiB secara streaming dan timeout mencakup pembacaan body, bukan hanya header.

Tidak ada perubahan timestamp, permission, status bisnis, migration historis,
atau publikasi URL storage. Deploy bank yang menyediakan route ini adalah
dependency Control baru; HTTP404 tidak diubah menjadi sukses atau fallback.

## Thumbnail privat

UI grid meminta route media Control yang sama dengan `?variant=thumbnail`;
preview penuh tetap meminta original ketika dibuka. Permission/snapshot/signature/
checksum original diverifikasi sebelum transformasi Sharp. Output WebP maksimal
640×480, quality 70, orientasi dinormalisasi, tanpa upscale, animasi atau metadata
privat. Input maksimal 16 juta piksel, body original tetap maksimal 10 MiB dan
transformasi dibatasi waktunya. Foto rusak/terlalu besar menghasilkan error,
bukan gambar dummy. Respons `private, no-store` dan `nosniff`; bukan URL publik.

Optimasi mengurangi transfer gambar ke browser, bukan transfer original dari
bank ke server Control. Tidak ada cache publik atau klaim seluruh pipeline media
lebih cepat. Bandingkan ukuran dan perilaku original dalam pengujian.
