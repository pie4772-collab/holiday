-- 인사기록카드: 기본정보·병역(1인 1행)과 학력·경력·자격·발령·교육·평가 이력(여러 행)
CREATE TABLE IF NOT EXISTS employee_profiles (
  employee_id         INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  birth_date          TEXT,
  gender              TEXT,
  mobile_phone        TEXT,
  personal_email      TEXT,
  address             TEXT,
  emergency_name      TEXT,
  emergency_relation  TEXT,
  emergency_phone     TEXT,
  military_status     TEXT,
  military_branch     TEXT,
  military_rank       TEXT,
  military_start      TEXT,
  military_end        TEXT,
  military_discharge  TEXT,
  military_notes      TEXT,
  updated_by          INTEGER,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS employee_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN (
                  'education', 'career', 'license', 'appointment', 'training', 'evaluation'
                )),
  start_date    TEXT,
  end_date      TEXT,
  title         TEXT,
  organization  TEXT,
  result        TEXT,
  detail        TEXT,
  notes         TEXT,
  updated_by    INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_employee_records_employee ON employee_records(employee_id, category);
