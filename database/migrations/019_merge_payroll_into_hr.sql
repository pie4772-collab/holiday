-- 급여담당 역할을 인사담당으로 합칩니다. 급여담당이던 직원은 인사담당이 됩니다.
INSERT INTO employee_roles (employee_id, role)
SELECT employee_id, 'hr' FROM employee_roles WHERE role = 'payroll'
ON CONFLICT (employee_id, role) DO NOTHING;

DELETE FROM employee_roles WHERE role = 'payroll';

-- 인사담당은 연차·전자결재의 관리자 단계를 처리하므로 결재 관리자 표시를 맞춥니다.
UPDATE employees SET is_admin = 1
WHERE is_admin = 0 AND id IN (SELECT employee_id FROM employee_roles WHERE role = 'hr');
