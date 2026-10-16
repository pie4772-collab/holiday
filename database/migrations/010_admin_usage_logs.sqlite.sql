-- 관리자가 연차 사용 내역을 직접 등록·수정·삭제한 기록도 승인·반려 이력에 남깁니다.
-- SQLite는 CHECK 제약을 바꿀 수 없어 테이블을 새로 만들어 옮깁니다.
CREATE TABLE leave_approval_logs_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_usage_id    INTEGER REFERENCES leave_usages(id) ON DELETE SET NULL,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_id          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  action            TEXT NOT NULL CHECK (action IN (
                      'submit', 'auto_approve', 'step_approve', 'approve', 'reject',
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
  l.id,
  CASE WHEN EXISTS (SELECT 1 FROM leave_usages u WHERE u.id = l.leave_usage_id) THEN l.leave_usage_id END,
  l.employee_id,
  CASE WHEN EXISTS (SELECT 1 FROM employees a WHERE a.id = l.actor_id) THEN l.actor_id END,
  l.action, l.step, l.note,
  l.usage_date, l.usage_type, l.days, l.reason,
  l.employee_emp_no, l.employee_name, l.workplace, l.workplace_code, l.department, l.position,
  l.actor_emp_no, l.actor_name, l.actor_position, l.created_at
FROM leave_approval_logs l
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id = l.employee_id);

DROP TABLE leave_approval_logs;
ALTER TABLE leave_approval_logs_new RENAME TO leave_approval_logs;

CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_created ON leave_approval_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_employee ON leave_approval_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_action ON leave_approval_logs(action);

-- 지금까지 이력 없이 관리자가 입력한 사용 내역 (처리자는 기록이 없어 비워 둡니다)
INSERT INTO leave_approval_logs (
  leave_usage_id, employee_id, actor_id, action, step, note,
  usage_date, usage_type, days, reason,
  employee_emp_no, employee_name, workplace, workplace_code, department, position,
  actor_emp_no, actor_name, actor_position, created_at
)
SELECT
  u.id, u.employee_id, NULL, 'admin_create', NULL, '이력 기능 이전 관리자 입력 · 처리자 기록 없음',
  u.usage_date, u.usage_type, u.days, u.reason,
  e.emp_no, e.name, e.workplace, e.workplace_code, e.department, e.position,
  '', '', '', u.created_at
FROM leave_usages u
JOIN employees e ON e.id = u.employee_id
WHERE COALESCE(u.created_by, 'system') <> 'employee'
  AND NOT EXISTS (SELECT 1 FROM leave_approval_logs l WHERE l.leave_usage_id = u.id);
