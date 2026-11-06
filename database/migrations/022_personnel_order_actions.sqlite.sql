-- 결재가 끝난 인사명령의 대상자 한 명당 한 줄. 발령일이 되면 사원 정보에 반영하고 인사기록카드 발령 이력을 남깁니다.
-- action: transfer 전보·승진·직위 변경(사업장·부서·직종·직위), resign 퇴사, hire 입사, record 발령 이력만
-- status: pending 발령 예정, applying 반영 중, applied 반영됨, recorded 이력만 남김, skipped 건너뜀, failed 실패, cancelled 반영 취소
-- before_json / after_json: 반영 전·후 사원 정보, message: 건너뜀·실패 사유나 안내
CREATE TABLE IF NOT EXISTS personnel_order_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,
  entry_index     INTEGER NOT NULL,
  employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  order_type      TEXT NOT NULL,
  effective_date  TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('transfer', 'resign', 'hire', 'record')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applying', 'applied', 'recorded', 'skipped', 'failed', 'cancelled')),
  before_json     TEXT,
  after_json      TEXT,
  message         TEXT,
  record_id       INTEGER,
  applied_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (document_id, entry_index)
);

CREATE INDEX IF NOT EXISTS idx_personnel_order_actions_due ON personnel_order_actions(status, effective_date);
