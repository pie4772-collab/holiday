-- 잘못 결재된 인사명령의 발령 취소. 인사담당이 사유를 적어 취소하면 대장에 "발령 취소"로 남고,
-- 반영 전 발령은 반영하지 않으며 이미 반영된 사원 정보·발령 이력은 되돌립니다(personnel_order_actions.message 에 결과).
CREATE TABLE IF NOT EXISTS personnel_order_cancels (
  document_id        INTEGER PRIMARY KEY REFERENCES approval_documents(id) ON DELETE CASCADE DEFERRABLE,
  reason             TEXT COLLATE "C" NOT NULL,
  cancelled_by       INTEGER REFERENCES employees(id) ON DELETE SET NULL DEFERRABLE,
  cancelled_by_name  TEXT COLLATE "C",
  cancelled_at       TEXT COLLATE "C" NOT NULL
);
