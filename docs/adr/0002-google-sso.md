# Google SSO sebagai jalur masuk utama Staff

Staff masuk lewat Google SSO (authorization code + PKCE, ID token diverifikasi dengan jose terhadap Google JWKS). Nomor telepon + Password Cadangan tetap ada sebagai jalur cadangan. Admin tetap username/password dari env sesuai ADR 0001.

## Konteks

Model sebelumnya memakai username + password sementara yang dibuat Admin. Akunnya harus dibuat satu per satu, password sementara harus disampaikan lewat jalur di luar aplikasi, dan Staff wajib menggantinya saat login pertama. Untuk satu sekolah dengan puluhan pegawai, biaya administrasinya jatuh ke Admin, dan tidak ada bukti kuat bahwa orang yang login memang pegawai tersebut.

Google Workspace sekolah sudah dipakai untuk email, jadi identitas pegawai sudah terverifikasi di sana.

## Keputusan

- **Google SSO adalah jalur utama.** Staff mengklik "Masuk dengan Google", disetujui sekali oleh Admin, lalu masuk dengan satu klik selanjutnya. Identitas diambil dari klaim `sub` (stabil, tidak berubah walau email berganti) dan `email`.
- **Pendaftar, bukan Staff, sampai disetujui.** Baris dibuat dengan status `menunggu` saat pertama kali login Google. Admin menyetujui atau menolak dari panel. Pendaftar belum masuk hitungan rekap dan belum bisa mengirim laporan.
- **Nomor telepon + Password Cadangan sebagai cadangan.** Password dibuat sendiri oleh Staff (bukan oleh Admin), opsional, dan bisa dihapus Admin. Nomor telepon dinormalkan ke format `+62...` dan dipakai sebagai pengenal alternatif saat Google tidak tersedia.
- **Display Name opsional, default dari Google.** Staff dan Admin bisa mengubahnya. Kalau kosong, tampilan jatuh ke email.
- **Status eksplisit:** `menunggu`, `aktif`, `ditolak`, `nonaktif`. Menggantikan kombinasi `is_active` + `must_change_password`.
- **`session_epoch` menggantikan `password_changed_at`.** Angka naik setiap kali Password Cadangan dihapus atau diganti, sehingga sesi lama bisa dibatalkan tanpa menyimpan timestamp.
- **Tautkan akun Google ke Staff yang sudah ada.** Kalau seseorang login Google dengan email yang belum tertaut tetapi nomor teleponnya cocok dengan Staff aktif, Admin bisa menautkan alih-alih membuat baris baru.

## Consequences

- Admin tidak lagi membuat akun satu per satu; beban kerjanya turun jadi menyetujui pendaftar.
- Password sementara hilang dari alur, jadi tidak ada lagi password yang harus disampaikan lewat jalur tidak aman dan tidak ada lagi login paksa ganti password.
- Kalau Google Workspace sekolah berubah (domain ganti, akun dihapus), Staff kehilangan akses sampai email baru ditautkan Admin.
- Nomor telepon jadi satu-satunya jalur masuk saat Google bermasalah, jadi nomor itu harus benar dan bisa dihubungi.
- `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` wajib ada di env; tanpa keduanya jalur Google mati dan hanya login telepon yang berfungsi.
- Tabel `staff` dibuat ulang oleh migrasi `0002_google_sso.sql`, jadi data lama tidak terbawa otomatis.
