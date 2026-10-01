-- 외근·출장 기록의 상급자 확인 (pending / approved / rejected)
ALTER TABLE attendance_records ADD COLUMN remote_status TEXT;
ALTER TABLE attendance_records ADD COLUMN remote_reviewed_by INTEGER;
ALTER TABLE attendance_records ADD COLUMN remote_reviewed_at TEXT;
ALTER TABLE attendance_records ADD COLUMN remote_reject_reason TEXT;

UPDATE attendance_records SET remote_status = 'pending'
WHERE remote_status IS NULL
  AND (check_in_type IN ('outside', 'trip', 'overseas') OR check_out_type IN ('outside', 'trip', 'overseas'));

CREATE INDEX IF NOT EXISTS idx_attendance_records_remote ON attendance_records(remote_status);
