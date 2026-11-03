-- 직원이 승인 전 연차 신청을 직접 취소한 기록도 승인·반려 이력에 남깁니다.
-- SQLite는 CHECK 제약을 바꿀 수 없어 테이블을 새로 만들어 옮깁니다.
CREATE TABLE leave_approval_logs_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_usage_id    INTEGER REFERENCES leave_usages(id) ON DELETE SET NULL,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_id          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  action            TEXT NOT NULL CHECK (action IN (
                      'submit', 'auto_approve', 'step_approve', 'approve', 'reject', 'cancel',
                      'admin_create', 'admin_update', 'admin_delete'
                    )),
  step              TEXT,
  note              TEXT,
  usage_date        TEXT NOT NULL,
  usage_type        TEXT NOT NULL,
  days              REAL NOT NULL,
  reason            TEXT,
  employee_emp_no   TEXT,
  employee_name     TEXT NOT NULL,
  workplace         TEXT,
  workplace_code    TEXT,
  department        TEXT,
  position          TEXT,
  actor_emp_no      TEXT,
  actor_name        TEXT,
  actor_position    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO leave_approval_logs_new (
  id, leave_usage_id, employee_id, actor_id, action, step, note,
  usage_date, usage_type, days, reason,
  employee_emp_no, employee_name, workplace, workplace_code, department, position,
  actor_emp_no, actor_name, actor_position, created_at
)
SELECT
  id, leave_usage_id, employee_id, actor_id, action, step, note,
  usage_date, usage_type, days, reason,
  employee_emp_no, employee_name, workplace, workplace_code, department, position,
  actor_emp_no, actor_name, actor_position, created_at
FROM leave_approval_logs;

DROP TABLE leave_approval_logs;
ALTER TABLE leave_approval_logs_new RENAME TO leave_approval_logs;

CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_created ON leave_approval_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_employee ON leave_approval_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_action ON leave_approval_logs(action);
