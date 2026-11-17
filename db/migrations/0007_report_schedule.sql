CREATE TABLE report_schedule (
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  effective_date TEXT NOT NULL,
  musyrif INTEGER NOT NULL CHECK (musyrif IN (0, 1)),
  PRIMARY KEY (staff_id, effective_date)
);

INSERT INTO report_schedule (staff_id, effective_date, musyrif)
SELECT sj.staff_id, '0000-01-01', 1
FROM staff_jabatan sj JOIN jabatan j ON j.id = sj.jabatan_id
WHERE j.nama = 'Tim Kesiswaan (Musyrif)';
