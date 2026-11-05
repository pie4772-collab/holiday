-- 연차 외 휴가(경조휴가·공가·출산전후휴가·배우자 출산휴가·가족돌봄휴가). 연차 잔여에서 빼지 않습니다.
-- request_group: 한 번에 신청한 여러 날을 묶어 한 번에 승인·반려·취소합니다.
ALTER TABLE leave_usages ADD COLUMN leave_kind TEXT NOT NULL DEFAULT 'annual';
ALTER TABLE leave_usages ADD COLUMN request_group TEXT;
ALTER TABLE leave_approval_logs ADD COLUMN leave_kind TEXT;
CREATE INDEX IF NOT EXISTS idx_leave_usages_group ON leave_usages(request_group);
