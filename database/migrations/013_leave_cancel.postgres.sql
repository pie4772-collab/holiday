-- 직원이 승인 전 연차 신청을 직접 취소한 기록도 승인·반려 이력에 남깁니다.
ALTER TABLE leave_approval_logs DROP CONSTRAINT IF EXISTS leave_approval_logs_action_check;
ALTER TABLE leave_approval_logs ADD CONSTRAINT leave_approval_logs_action_check CHECK (action IN (
  'submit', 'auto_approve', 'step_approve', 'approve', 'reject', 'cancel',
  'admin_create', 'admin_update', 'admin_delete'
));
