-- 역할 기반 권한. 부서장은 직급(팀장)으로 자동 판정하므로 저장하지 않습니다.
CREATE TABLE IF NOT EXISTS employee_roles (
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE DEFERRABLE,
  role         TEXT COLLATE "C" NOT NULL,
  created_at   TEXT COLLATE "C" NOT NULL DEFAULT to_char(LOCALTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  PRIMARY KEY (employee_id, role)
);

-- 기존 관리자는 시스템관리자로 옮깁니다.
INSERT INTO employee_roles (employee_id, role)
SELECT id, 'system_admin' FROM employees WHERE is_admin = 1;
