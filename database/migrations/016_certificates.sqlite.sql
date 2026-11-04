-- 증명서 발급대장. content 는 발급 당시 기재 내용 사본(JSON)이라 다시 인쇄해도 그대로 나옵니다.
-- items 는 직원이 요청한 기재 항목(JSON 배열)입니다. 근로기준법 제39조: 요구한 사항만 적습니다.
CREATE TABLE IF NOT EXISTS certificates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cert_type       TEXT NOT NULL CHECK (cert_type IN ('employment', 'career', 'retirement')),
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  seq             INTEGER NOT NULL,
  cert_no         TEXT NOT NULL UNIQUE,
  verify_code     TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  submit_to       TEXT NOT NULL DEFAULT '',
  items           TEXT NOT NULL DEFAULT '[]',
  content         TEXT NOT NULL DEFAULT '{}',
  show_seal       INTEGER NOT NULL DEFAULT 1,
  channel         TEXT NOT NULL CHECK (channel IN ('self', 'admin', 'approval')),
  document_id     INTEGER REFERENCES approval_documents(id) ON DELETE SET NULL,
  issued_by       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  issued_by_name  TEXT,
  issued_at       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  revoked_at      TEXT,
  revoked_by      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  revoked_by_name TEXT,
  revoke_reason   TEXT,
  UNIQUE (year, seq)
);

CREATE INDEX IF NOT EXISTS idx_certificates_employee ON certificates(employee_id, issued_at);
