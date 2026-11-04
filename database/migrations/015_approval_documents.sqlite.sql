-- 범용 전자결재 문서. form_key 는 src/constants/approvalDocs.js 의 양식 키, body 는 양식 입력값 JSON 입니다.
-- 기안자 소속은 기안 당시 값을 사본으로 남깁니다. document_no 는 완료될 때 양식·연도별 일련번호로 매깁니다.
CREATE TABLE IF NOT EXISTS approval_documents (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  form_key            TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL DEFAULT '{}',
  employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  drafter_name        TEXT NOT NULL,
  drafter_emp_no      TEXT,
  drafter_workplace   TEXT,
  drafter_department  TEXT,
  drafter_position    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  current_step        INTEGER,
  doc_year            INTEGER,
  doc_seq             INTEGER,
  document_no         TEXT UNIQUE,
  source_id           INTEGER REFERENCES approval_documents(id) ON DELETE SET NULL,
  submitted_at        TEXT NOT NULL,
  completed_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_approval_documents_employee ON approval_documents(employee_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_approval_documents_status ON approval_documents(status, form_key);

-- 결재 단계. role 은 팀장·임원·대표이사·공장장·담당·관리자·인사 이고, 결재할 사람은 처리할 때 판정합니다.
CREATE TABLE IF NOT EXISTS approval_document_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  role            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'pending', 'approved', 'rejected', 'skipped')),
  actor_id        INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  actor_name      TEXT,
  actor_position  TEXT,
  proxy           INTEGER NOT NULL DEFAULT 0,
  comment         TEXT,
  acted_at        TEXT,
  UNIQUE (document_id, step_order)
);

-- 참조자
CREATE TABLE IF NOT EXISTS approval_document_refs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  read_at      TEXT,
  UNIQUE (document_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_document_refs_employee ON approval_document_refs(employee_id);
