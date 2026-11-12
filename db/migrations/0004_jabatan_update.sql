-- Mengganti daftar jabatan dengan daftar resmi yang baru.
-- Hapus semua jabatan lama (CASCADE ke staff_jabatan otomatis via FK).
DELETE FROM staff_jabatan;
DELETE FROM jabatan;

-- Reset autoincrement supaya id mulai dari 1 lagi.
DELETE FROM sqlite_sequence WHERE name = 'jabatan';

-- Daftar jabatan resmi (14 item).
INSERT INTO jabatan (nama) VALUES
  ('Kepala Sekolah'),
  ('Wakil Kepala Sekolah'),
  ('Admin Keuangan'),
  ('Staf'),
  ('Kabid Diknas'),
  ('Kabid IT'),
  ('Kabid Kesiswaan'),
  ('Kabid Sarpras'),
  ('Tim Diknas (Mentor)'),
  ('Tim IT'),
  ('Tim Kesiswaan (Musyrif)'),
  ('Tim Sarpras'),
  ('Branding & Marketing'),
  ('Resto & Mart');
