# Admin hanya dari variabel lingkungan

Hanya ada satu Admin. Kredensialnya (`ADMIN_USERNAME` dan `ADMIN_PASSWORD_HASH`, hash bcrypt/argon2) diset di variabel lingkungan Vercel dan tidak disimpan di database. Dengan begitu tidak ada alur reset password Admin lewat aplikasi, dan tidak ada akun Admin yang bisa dibuat atau diambil alih lewat database. Mengganti password Admin berarti mengganti env lalu redeploy.

## Consequences

- Admin tidak punya baris di tabel pengguna, jadi pelaku di catatan Koreksi ditulis sebagai "admin".
- `ADMIN_USERNAME` dicadangkan dan tidak boleh dipakai sebagai pengenal Staff.
- Menambah Admin kedua kelak berarti mengubah model data dan catatan Koreksi, bukan sekadar menambah env.
- Jika env hilang atau hash salah, tidak ada jalur masuk Admin sampai env diperbaiki dan redeploy.
