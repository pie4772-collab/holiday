-- 관리자가 연차 사용 내역을 직접 등록·수정·삭제한 기록도 승인·반려 이력에 남깁니다.
ALTER TABLE leave_approval_logs DROP CONSTRAINT IF EXISTS leave_approval_logs_action_check;
ALTER TABLE leave_approval_logs ADD CONSTRAINT leave_approval_logs_action_check CHECK (action IN (
  'submit', 'auto_approve', 'step_approve', 'approve', 'reject',
  'admin_create', 'admin_update', 'admin_delete'
));

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
