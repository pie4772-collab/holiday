import { getDb } from '../db.js';
import { LEAD_POSITIONS } from '../../src/constants/hr.js';
import { isTeamLeaderFor } from './approvalService.js';

export const ROLE_LABELS = {
  system_admin: '시스템관리자',
  hr: '인사담당',
  payroll: '급여담당',
  site_admin: '사업장관리자',
  dept_head: '부서장',
};

/** 관리자가 부여하는 역할. 부서장은 직급으로 자동 판정합니다. */
export const ASSIGNABLE_ROLES = ['system_admin', 'hr', 'payroll', 'site_admin'];

/** 연차 결재에서 기존 '관리자'(모든 단계 승인, 사업장 관리자 메일)를 이어받는 역할 */
const APPROVAL_ADMIN_ROLES = ['system_admin', 'hr'];

const ROLE_PERMISSIONS = {
  system_admin: [
    'admin', 'employees.view', 'employees.manage', 'leave.view', 'leave.edit',
    'reports.view', 'reports.save', 'approvalLogs.view', 'approvalLines.manage',
    'payroll', 'mail.manage', 'roles.manage',
  ],
  hr: [
    'admin', 'employees.view', 'employees.manage', 'leave.view', 'leave.edit',
    'reports.view', 'reports.save', 'approvalLogs.view', 'approvalLines.manage',
  ],
  payroll: ['admin', 'employees.view', 'reports.view', 'payroll'],
  site_admin: ['admin', 'employees.view', 'leave.view', 'leave.edit', 'reports.view', 'approvalLogs.view'],
  dept_head: ['team.view'],
};

/** 사업장관리자 역할로 받은 권한은 본인 사업장으로 한정합니다. */
const SITE_SCOPED_ROLES = new Set(['site_admin']);

function code(value) {
  return value == null ? '' : String(value).trim();
}

export function isDeptHead(employee) {
  return LEAD_POSITIONS.includes(employee?.position) || LEAD_POSITIONS.includes(employee?.concurrent_position);
}

export async function getStoredRoles(employeeId) {
  const rows = await getDb()
    .prepare('SELECT role FROM employee_roles WHERE employee_id = ? ORDER BY role')
    .all(Number(employeeId));
  return rows.map((row) => row.role).filter((role) => ASSIGNABLE_ROLES.includes(role));
}

export async function getRolesByEmployee() {
  const rows = await getDb().prepare('SELECT employee_id, role FROM employee_roles ORDER BY employee_id, role').all();
  const map = new Map();
  for (const row of rows) {
    if (!ASSIGNABLE_ROLES.includes(row.role)) continue;
    const key = Number(row.employee_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.role);
  }
  return map;
}

/**
 * 직원의 역할·권한·범위를 계산합니다.
 * scopes[permission] 은 'all' 또는 허용된 사업장 코드 Set 입니다.
 */
export async function getAccess(employeeId) {
  const employee = await getDb()
    .prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
    .get(Number(employeeId));
  if (!employee) return null;

  const roles = await getStoredRoles(employee.id);
  if (isDeptHead(employee)) roles.push('dept_head');

  const scopes = {};
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] || []) {
      if (!SITE_SCOPED_ROLES.has(role)) {
        scopes[permission] = 'all';
        continue;
      }
      if (scopes[permission] === 'all') continue;
      const workplaceCode = code(employee.workplace_code);
      if (!scopes[permission]) scopes[permission] = new Set();
      if (workplaceCode) scopes[permission].add(workplaceCode);
    }
  }

  return {
    employee,
    roles,
    scopes,
    has(permission) {
      return Boolean(scopes[permission]);
    },
    /** 해당 권한으로 이 직원(행)을 다룰 수 있는지 */
    covers(permission, target) {
      const scope = scopes[permission];
      if (!scope || !target) return false;
      if (scope === 'all') return true;
      return scope.has(code(target.workplace_code));
    },
    isTeamLead(target) {
      return roles.includes('dept_head') && Boolean(target) && isTeamLeaderFor(employee, target);
    },
  };
}

/** 프런트엔드 메뉴·화면 판정용 요약 */
export function describeAccess(access) {
  if (!access) return { roles: [], permissions: [], scopedPermissions: [] };
  const permissions = Object.keys(access.scopes).sort();
  return {
    roles: access.roles,
    permissions,
    scopedPermissions: permissions.filter((p) => access.scopes[p] !== 'all'),
  };
}

export async function getEmployeeRow(employeeId) {
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(employeeId));
}

/** 권한 범위 안의 직원 id 집합. 전체 범위면 null */
export async function scopedEmployeeIds(access, permission) {
  const scope = access.scopes[permission];
  if (scope === 'all') return null;
  if (!scope || scope.size === 0) return new Set();
  const codes = [...scope];
  const rows = await getDb()
    .prepare(`SELECT id FROM employees WHERE workplace_code IN (${codes.map(() => '?').join(', ')})`)
    .all(...codes);
  return new Set(rows.map((row) => String(row.id)));
}

export async function listTeamMembers(access) {
  if (!access?.roles.includes('dept_head')) return [];
  const rows = await getDb().prepare('SELECT * FROM employees WHERE is_active = 1 ORDER BY name, id').all();
  return rows.filter((row) => Number(row.id) !== Number(access.employee.id) && access.isTeamLead(row));
}

export async function setEmployeeRoles(employeeId, roles) {
  const target = await getEmployeeRow(employeeId);
  if (!target) throw Object.assign(new Error('직원을 찾을 수 없습니다.'), { status: 404 });

  const next = [...new Set((Array.isArray(roles) ? roles : []).map(String))];
  const invalid = next.filter((role) => !ASSIGNABLE_ROLES.includes(role));
  if (invalid.length) {
    throw Object.assign(new Error(`알 수 없는 역할입니다: ${invalid.join(', ')}`), { status: 400 });
  }
  if (next.includes('site_admin') && !code(target.workplace_code)) {
    throw Object.assign(new Error('사업장이 지정되지 않은 직원은 사업장관리자로 지정할 수 없습니다.'), { status: 400 });
  }

  const db = getDb();
  await db.transaction(async () => {
    if (!next.includes('system_admin')) {
      const others = await db
        .prepare(
          `SELECT COUNT(*) AS c FROM employee_roles r
           JOIN employees e ON e.id = r.employee_id
           WHERE r.role = 'system_admin' AND e.is_active = 1 AND r.employee_id != ?`
        )
        .get(Number(target.id));
      if (!Number(others.c)) {
        throw Object.assign(new Error('시스템관리자가 최소 1명은 있어야 합니다.'), { status: 400 });
      }
    }
    await db.prepare('DELETE FROM employee_roles WHERE employee_id = ?').run(Number(target.id));
    for (const role of next) {
      await db.prepare('INSERT INTO employee_roles (employee_id, role) VALUES (?, ?)').run(Number(target.id), role);
    }
    await syncApprovalAdminFlag(target.id, next);
  });

  return { employeeId: String(target.id), roles: next };
}

/** 결재 로직은 employees.is_admin 을 보므로 역할과 맞춰 둡니다. */
async function syncApprovalAdminFlag(employeeId, roles) {
  const isApprovalAdmin = roles.some((role) => APPROVAL_ADMIN_ROLES.includes(role)) ? 1 : 0;
  await getDb()
    .prepare(`UPDATE employees SET is_admin = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`)
    .run(isApprovalAdmin, Number(employeeId));
}
