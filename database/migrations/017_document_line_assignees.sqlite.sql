-- 기안자가 지정한 결재선. kind 는 결재(approval)·합의(agreement), assignee_* 는 지정한 사람과 기안 당시 직위 사본입니다.
-- assignee_id 가 없는 단계(인사 확인, 이전 문서의 직위별 단계)는 role 로 결재할 사람을 판정합니다.
ALTER TABLE approval_document_steps ADD COLUMN kind TEXT NOT NULL DEFAULT 'approval' CHECK (kind IN ('approval', 'agreement'));
ALTER TABLE approval_document_steps ADD COLUMN assignee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE approval_document_steps ADD COLUMN assignee_name TEXT;
ALTER TABLE approval_document_steps ADD COLUMN assignee_department TEXT;
ALTER TABLE approval_document_steps ADD COLUMN assignee_position TEXT;

CREATE INDEX IF NOT EXISTS idx_approval_document_steps_assignee ON approval_document_steps(assignee_id, status);
