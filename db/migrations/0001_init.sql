-- Waktu disimpan sebagai epoch milidetik (UTC). Tanggal laporan disimpan sebagai 'YYYY-MM-DD' menurut WIB.

CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  password_changed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE daily_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  report_date TEXT NOT NULL,
  tasks_json TEXT NOT NULL,
  note TEXT,
  submitted_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('staff', 'admin')),
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'dibatalkan')),
  UNIQUE (staff_id, report_date)
);

CREATE INDEX idx_daily_report_date ON daily_report(report_date);

CREATE TABLE absence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  absence_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Sakit', 'Izin', 'Cuti', 'Tanpa Keterangan')),
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (staff_id, absence_date)
);

CREATE INDEX idx_absence_date ON absence(absence_date);

CREATE TABLE correction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('laporan', 'tidak_hadir')),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  target_date TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_correction_log_staff ON correction_log(staff_id, target_date);

CREATE TABLE login_attempt (
  key TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_fail_at INTEGER NOT NULL DEFAULT 0
);
