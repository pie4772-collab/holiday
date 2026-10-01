-- 근태 관리: 반차 오전/오후 구분, 사업장 근무시간·허용 IP, 출퇴근 기록·변경 이력, 월 마감
ALTER TABLE leave_usages ADD COLUMN half_period TEXT;

CREATE TABLE IF NOT EXISTS attendance_sites (
  workplace_code  TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  work_start      TEXT NOT NULL,
  work_end        TEXT NOT NULL,
  lunch_start     TEXT NOT NULL,
  lunch_end       TEXT NOT NULL,
  grace_minutes   INTEGER NOT NULL DEFAULT 15,
  ip_ranges       TEXT NOT NULL DEFAULT '',
  updated_by      INTEGER,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT OR IGNORE INTO attendance_sites (workplace_code, name, work_start, work_end, lunch_start, lunch_end, grace_minutes, ip_ranges)
VALUES
  ('1', '서울', '08:30', '17:30', '11:40', '12:40', 15, '175.192.184.0/28
192.168.80.0/24'),
  ('2', '천안', '08:00', '17:00', '12:00', '13:00', 15, '221.145.232.0/25'),
  ('3', '충주', '08:00', '17:00', '12:00', '13:00', 15, '59.31.6.0/27
59.31.6.64/26
121.191.197.128/27
128.231.154.128/25');

CREATE TABLE IF NOT EXISTS attendance_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date        TEXT NOT NULL,
  check_in_at      TEXT,
  check_in_ip      TEXT,
  check_in_type    TEXT,
  check_in_place   TEXT,
  check_out_at     TEXT,
  check_out_ip     TEXT,
  check_out_type   TEXT,
  check_out_place  TEXT,
  corrected        INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(work_date);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    TEXT NOT NULL,
  action       TEXT NOT NULL,
  occurred_at  TEXT NOT NULL,
  ip           TEXT,
  work_type    TEXT,
  place        TEXT,
  actor_id     INTEGER,
  reason       TEXT,
  detail       TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee ON attendance_logs(employee_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_closings (
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL,
  closed_by  INTEGER,
  closed_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (year, month)
);
