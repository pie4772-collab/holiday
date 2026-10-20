-- 입사 구분과 수습. hire_type: 'new'(신입, 수습 3개월) | 'experienced'(경력) | NULL(미지정)
ALTER TABLE employees ADD COLUMN hire_type TEXT;
ALTER TABLE employees ADD COLUMN probation_end TEXT;
ALTER TABLE employees ADD COLUMN regular_date TEXT;

-- 수습평가(신입 3개월)·3개월 평가(경력)·입사 1년 평가(신입). 수습을 연장하면 round 를 올려 한 번 더 만듭니다.
-- 흐름: pending(평가자=팀장 작성) → reviewing(임원 의견, 임원을 지정했을 때만) → submitted(인사담당 확정 대기) → confirmed
CREATE TABLE IF NOT EXISTS employee_evaluations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('probation', 'three_month', 'one_year')),
  round             INTEGER NOT NULL DEFAULT 1,
  due_date          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'submitted', 'confirmed', 'cancelled')),
  evaluator_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  reviewer_id       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  scores            TEXT,
  total_score       INTEGER,
  max_score         INTEGER,
  comment           TEXT,
  reviewer_comment  TEXT,
  recommendation    TEXT,
  outcome           TEXT,
  outcome_date      TEXT,
  hr_note           TEXT,
  submitted_by      INTEGER,
  submitted_at      TEXT,
  reviewed_by       INTEGER,
  reviewed_at       TEXT,
  confirmed_by      INTEGER,
  confirmed_at      TEXT,
  record_id         INTEGER,
  reminded_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (employee_id, kind, round)
);

CREATE INDEX IF NOT EXISTS idx_employee_evaluations_status ON employee_evaluations(status, due_date);
CREATE INDEX IF NOT EXISTS idx_employee_evaluations_evaluator ON employee_evaluations(evaluator_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_evaluations_reviewer ON employee_evaluations(reviewer_id, status);
