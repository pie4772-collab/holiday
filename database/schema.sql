-- KBI IFRS 사무직 연차정리 (기준일: 2026-08-31)
-- 엑셀: 26' 사무직연차정리(260731)_커서작업용.xlsx

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS employees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no      TEXT UNIQUE,                    -- 사번
  name        TEXT NOT NULL,                  -- 성명
  hire_date   TEXT NOT NULL,                  -- 입사일 (YYYY-MM-DD)
  workplace   TEXT,                           -- 사업장
  workplace_code TEXT,                        -- 사업장코드 (화면 비표시)
  department  TEXT,                           -- 부서
  department_code TEXT,                       -- 부서코드 (화면 비표시)
  job_type    TEXT,                           -- 직종
  position    TEXT,                           -- 직급
  position_code TEXT,                         -- 직급코드 (화면 비표시)
  concurrent_dept TEXT,                       -- 겸직부서
  concurrent_dept_code TEXT,                  -- 겸직부서코드 (화면 비표시)
  concurrent_position TEXT,                   -- 겸직직급
  concurrent_position_code TEXT,              -- 겸직직급코드 (화면 비표시)
  email       TEXT,
  notes       TEXT,                           -- 비고
  is_active   INTEGER NOT NULL DEFAULT 1,     -- 재직 여부
  is_admin    INTEGER NOT NULL DEFAULT 0,     -- 관리자 권한
  terminated_date TEXT,                       -- 퇴사일 (YYYY-MM-DD)
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_seats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_key      TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  step_role     TEXT NOT NULL,
  employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS approval_seat_scopes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_id          INTEGER NOT NULL REFERENCES approval_seats(id) ON DELETE CASCADE,
  workplace_code   TEXT,
  department_code  TEXT NOT NULL,
  department_name  TEXT,
  UNIQUE(seat_id, department_code)
);


CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  username      TEXT NOT NULL UNIQUE,           -- 사번
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE INDEX IF NOT EXISTS idx_employees_emp_no ON employees(emp_no);
CREATE INDEX IF NOT EXISTS idx_employees_hire_date ON employees(hire_date);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);

CREATE TABLE IF NOT EXISTS leave_balance_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  as_of_date      TEXT NOT NULL,              -- 기준일
  display_year    INTEGER NOT NULL,           -- 표시 연도
  accrued         REAL NOT NULL DEFAULT 0,      -- 발생
  used            REAL NOT NULL DEFAULT 0,      -- 사용
  remaining       REAL NOT NULL DEFAULT 0,      -- 잔여
  source_file     TEXT,                         -- 원본 엑셀 파일명
  imported_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(employee_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS leave_usages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  usage_date      TEXT NOT NULL,              -- 사용일
  usage_type      TEXT NOT NULL DEFAULT 'full' CHECK (usage_type IN ('full', 'half')),
  days            REAL NOT NULL,              -- 차감 일수 (1 or 0.5)
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  approved_by     INTEGER,
  approved_at     TEXT,
  reject_reason   TEXT,
  approval_step   TEXT,
  created_by      TEXT DEFAULT 'system',
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_leave_usages_employee ON leave_usages(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_usages_date ON leave_usages(usage_date);

CREATE TABLE IF NOT EXISTS leave_month_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  as_of_date    TEXT NOT NULL,
  generated_by  INTEGER,
  payload       TEXT NOT NULL,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS mail_settings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  enabled      INTEGER NOT NULL DEFAULT 0,
  imap_host    TEXT,
  imap_port    INTEGER,
  imap_secure  TEXT,
  smtp_host    TEXT,
  smtp_port    INTEGER,
  smtp_secure  TEXT,
  username     TEXT,
  password     TEXT,
  from_name    TEXT,
  from_email   TEXT,
  app_url      TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS leave_accruals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  accrual_date    TEXT NOT NULL,              -- 발생일
  accrual_type    TEXT NOT NULL CHECK (accrual_type IN (
                    'first_year_monthly', 'prorated', 'annual', 'adjustment', 'settlement'
                  )),
  amount          REAL NOT NULL,              -- 발생 일수 (+/-)
  description     TEXT,
  is_manual       INTEGER NOT NULL DEFAULT 0, -- 관리자 수동 입력 여부
  created_by      TEXT DEFAULT 'system',
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_leave_accruals_employee ON leave_accruals(employee_id);

CREATE VIEW IF NOT EXISTS v_employee_leave_summary AS
SELECT
  e.id,
  e.emp_no,
  e.name,
  e.hire_date,
  e.department,
  e.position,
  e.notes,
  e.is_active,
  e.terminated_date,
  lbs.as_of_date,
  lbs.display_year,
  lbs.accrued,
  lbs.used,
  lbs.remaining
FROM employees e
LEFT JOIN leave_balance_snapshots lbs ON lbs.employee_id = e.id
WHERE e.is_active = 1;
