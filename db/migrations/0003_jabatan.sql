-- Menambah fitur jabatan. Satu Staff bisa menjabat lebih dari satu jabatan (maks 3).
-- Jabatan adalah daftar tetap yang dikelola Admin, tidak bisa diubah Staff.

CREATE TABLE jabatan (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT    NOT NULL UNIQUE
);

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

CREATE TABLE staff_jabatan (
  staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  jabatan_id INTEGER NOT NULL REFERENCES jabatan(id),
  PRIMARY KEY (staff_id, jabatan_id)
);

CREATE INDEX idx_staff_jabatan_staff ON staff_jabatan(staff_id);
