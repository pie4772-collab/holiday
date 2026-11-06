-- 입사 서류 전자 작성. 인사담당이 신규 입사자에게 근로계약서·임금결정통지서·서약서·윤리서약서 작성을 요청하고,
-- 입사자가 동의·서명하면 완성본 PDF를 인사기록카드 증명서류(employee_documents)에 저장합니다.
-- kind: contract 근로계약서, wage 임금결정통지서, pledge 서약서(입사자용), ethics 윤리서약서
-- status: requested 작성 요청, signed 작성 완료, cancelled 요청 취소
-- company_json: 인사담당이 채운 계약 조건·임금, employee_json: 입사자가 적은 주소·연락처 등
CREATE TABLE IF NOT EXISTS onboarding_forms (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id        INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('contract', 'wage', 'pledge', 'ethics')),
  status             TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'signed', 'cancelled')),
  company_json       TEXT,
  employee_json      TEXT,
  document_id        INTEGER REFERENCES employee_documents(id) ON DELETE SET NULL,
  requested_by       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  requested_by_name  TEXT,
  requested_at       TEXT NOT NULL,
  signed_at          TEXT,
  cancelled_at       TEXT,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_onboarding_forms_employee ON onboarding_forms(employee_id, status);
