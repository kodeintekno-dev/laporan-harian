ALTER TABLE staff ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1));
ALTER TABLE staff ADD COLUMN monitoring_only INTEGER NOT NULL DEFAULT 0 CHECK (monitoring_only IN (0, 1));
ALTER TABLE staff ADD COLUMN initial_password INTEGER NOT NULL DEFAULT 0 CHECK (initial_password IN (0, 1));
ALTER TABLE correction_log ADD COLUMN actor_staff_id INTEGER REFERENCES staff(id);

CREATE TABLE reporting_policy (
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  effective_date TEXT NOT NULL,
  exempt INTEGER NOT NULL CHECK (exempt IN (0, 1)),
  PRIMARY KEY (staff_id, effective_date)
);
