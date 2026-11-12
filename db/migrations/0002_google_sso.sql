-- Autentikasi Staff pindah ke Google SSO (lihat GLOSSARY: Pendaftar, Password Cadangan, Display Name).
-- Tabel staff dibentuk ulang. Ini aman hanya karena saat migrasi ditulis database produksi
-- berisi 0 Staff dan 0 laporan. Jika sudah ada data, migrasi ini harus diganti dengan salinan data.
-- Tabel daily_report, absence, dan correction_log merujuk staff(id) lewat nama, jadi tidak perlu diubah.

DROP TABLE staff;

CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Identitas Google yang stabil. NULL setelah Admin melepas tautan Google.
  google_sub TEXT UNIQUE,
  -- Email Google terakhir yang terlihat saat login. Dipakai sebagai Pengenal jika display_name kosong.
  email TEXT NOT NULL COLLATE NOCASE,
  full_name TEXT NOT NULL,
  -- Opsional. Awalnya dari klaim name Google, bisa diubah Staff maupun Admin.
  display_name TEXT,
  -- Format ternormalisasi +62..., diisi sendiri oleh Pendaftar dan tidak diverifikasi lewat SMS.
  phone TEXT NOT NULL CHECK (phone LIKE '+62%'),
  -- menunggu: Pendaftar belum diputuskan. aktif: Staff Aktif. ditolak: ditolak Admin, barisnya tetap tersimpan.
  -- nonaktif: Staff yang dinonaktifkan Admin.
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'aktif', 'ditolak', 'nonaktif')),
  -- Password Cadangan untuk login nomor telepon. NULL sampai Staff membuatnya.
  password_hash TEXT,
  -- Dinaikkan untuk mencabut semua sesi Staff (nonaktif, lepas tautan Google, Password Cadangan dihapus atau diganti).
  session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  -- Waktu Admin menyetujui atau menolak. NULL selama menunggu.
  decided_at INTEGER
);

-- Nomor telepon unik hanya di antara Staff yang sudah disetujui, supaya Pendaftar iseng tidak bisa mengunci nomor pegawai asli.
CREATE UNIQUE INDEX idx_staff_phone_disetujui ON staff(phone) WHERE status IN ('aktif', 'nonaktif');

CREATE INDEX idx_staff_status ON staff(status);
