-- 출근·퇴근을 기록한 사업장(접속 IP가 속한 사업장 코드). 회사 네트워크 밖이면 NULL.
ALTER TABLE attendance_records ADD COLUMN check_in_site TEXT;
ALTER TABLE attendance_records ADD COLUMN check_out_site TEXT;
