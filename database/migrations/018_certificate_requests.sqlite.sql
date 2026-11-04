-- 직원의 증명서 발급 신청. 사업장 인사담당이 접수해 관리팀 내부 결재(전자결재 "증명서 발급 품의")로 발급합니다.
-- request 는 기재 항목·용도 등 신청 내용(JSON), workplace_code 등은 신청 당시 소속 사본(접수 사업장 판정용)입니다.
-- status: requested 접수 대기, processing 내부 결재 중(document_id), issued 발급(certificate_id), rejected 반려, cancelled 직원 취소
CREATE TABLE IF NOT EXISTS certificate_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cert_type       TEXT NOT NULL CHECK (cert_type IN ('employment', 'career')),
  request         TEXT NOT NULL DEFAULT '{}',
  employee_name   TEXT NOT NULL,
  workplace_code  TEXT,
  workplace       TEXT,
  department      TEXT,
  position        TEXT,
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'issued', 'rejected', 'cancelled')),
  document_id     INTEGER REFERENCES approval_documents(id) ON DELETE SET NULL,
  certificate_id  INTEGER REFERENCES certificates(id) ON DELETE SET NULL,
  handler_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  handler_name    TEXT,
  reject_reason   TEXT,
  requested_at    TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_certificate_requests_status ON certificate_requests(status, workplace_code);
CREATE INDEX IF NOT EXISTS idx_certificate_requests_employee ON certificate_requests(employee_id, requested_at);
