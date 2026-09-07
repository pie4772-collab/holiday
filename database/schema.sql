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
  department  TEXT,                           -- 부서 (엑셀 미포함, 추후 보완)
  position    TEXT,                           -- 직급 (엑셀 미포함, 추후 보완)
  email       TEXT,
  notes       TEXT,                           -- 비고
  is_active   INTEGER NOT NULL DEFAULT 1,     -- 재직 여부
  terminated_date TEXT,                       -- 퇴사일 (YYYY-MM-DD)
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
  created_by      TEXT DEFAULT 'system',
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_leave_usages_employee ON leave_usages(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_usages_date ON leave_usages(usage_date);

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
