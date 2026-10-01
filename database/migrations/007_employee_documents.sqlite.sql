-- 인사기록카드 입사 증명서류. content 는 암호화한 파일 내용(enc:v1: + base64)입니다.
CREATE TABLE IF NOT EXISTS employee_documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  extension     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT NOT NULL,
  notes         TEXT,
  content       TEXT NOT NULL,
  uploaded_by   INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id, id);
