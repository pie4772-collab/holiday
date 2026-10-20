import { getCurrentDisplayYear } from '../../src/utils/leaveCalculations.js';
import { DEFAULT_POSITION, POSITIONS } from '../../src/constants/hr.js';
import { getDb, parseEmployeeId } from '../db.js';
import { ensureUserForEmployee } from './authService.js';
import { getRolesByEmployee, isDeptHead } from './accessService.js';
import { cleanHireType, syncPlan } from './evaluationService.js';

function normalizePosition(value) {
  const position = String(value || '').trim();
  return POSITIONS.includes(position) ? position : DEFAULT_POSITION;
}

const AS_OF_DATE = process.env.AS_OF_DATE || '2026-07-31';
const DISPLAY_YEAR = getCurrentDisplayYear(new Date(AS_OF_DATE));

function toApiId(dbId) {
  return String(dbId);
}

function mapEmployeeRow(row, roles = []) {
  return {
    roles: [...roles, ...(isDeptHead(row) ? ['dept_head'] : [])],
    id: toApiId(row.id),
    empNo: row.emp_no || '',
    name: row.name,
    workplace: row.workplace || '',
    department: row.department || '',
    jobType: row.job_type || '사무직',
    position: row.position || DEFAULT_POSITION,
    concurrentDept: row.concurrent_dept || '',
    concurrentPosition: row.concurrent_position || '',
    hireDate: row.hire_date,
    hireType: row.hire_type || '',
    probationEnd: row.probation_end || '',
    regularDate: row.regular_date || '',
    email: row.email || '',
    notes: row.notes || '',
    isActive: Boolean(row.is_active),
    isAdmin: Boolean(row.is_admin),
    terminatedDate: row.terminated_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 결재선·외근 확인·사업장 범위는 이름이 아니라 코드로 사람을 찾습니다. 부서와 겸직부서는 같은 코드 체계입니다. */
const DEPT_CODE_GROUP = [
  ['department', 'department_code'],
  ['concurrent_dept', 'concurrent_dept_code'],
];
const ORG_CODES = [
  { column: 'workplace', code: 'workplace_code', group: [['workplace', 'workplace_code']] },
  { column: 'department', code: 'department_code', group: DEPT_CODE_GROUP },
  { column: 'concurrent_dept', code: 'concurrent_dept_code', group: DEPT_CODE_GROUP },
];

async function lookupOrgCode(db, group, name, excludeId) {
  for (const [nameCol, codeCol] of group) {
    const row = await db
      .prepare(
        `SELECT ${codeCol} AS code, COUNT(*) AS n FROM employees
         WHERE ${nameCol} = ? AND id <> ? AND ${codeCol} IS NOT NULL AND ${codeCol} <> ''
         GROUP BY ${codeCol} ORDER BY n DESC LIMIT 1`
      )
      .get(name, excludeId);
    if (row?.code) return String(row.code);
  }
  return null;
}

async function nextOrgCode(db, group) {
  let max = 0;
  for (const [, codeCol] of group) {
    const rows = await db.prepare(`SELECT DISTINCT ${codeCol} AS code FROM employees WHERE ${codeCol} IS NOT NULL`).all();
    for (const { code } of rows) {
      const n = Number(code);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return String(max + 1);
}

/**
 * 이름이 그대로면 기존 코드를 유지하고, 바뀌었거나 코드가 없으면 같은 이름을 쓰는 직원의 코드를 따릅니다.
 * 처음 보는 이름이면 그 코드 체계의 다음 번호를 붙입니다.
 */
async function syncOrgCodes(db, id, previous = null) {
  const row = await db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  const sets = [];
  const values = [];
  for (const { column, code, group } of ORG_CODES) {
    const name = String(row[column] || '').trim();
    const current = row[code] ? String(row[code]) : null;
    let value = null;
    if (name && current && previous && String(previous[column] || '').trim() === name) {
      value = current;
    } else if (name) {
      value = (await lookupOrgCode(db, group, name, row.id)) || (await nextOrgCode(db, group));
    }
    if (value !== current) {
      sets.push(`${code} = ?`);
      values.push(value);
    }
  }
  if (!sets.length) return false;
  await db.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...values, row.id);
  return true;
}

/** 사원 명부에서 등록·수정하면서 코드가 비어 버린 직원을 채웁니다. 서버 시작 때 실행합니다. */
export async function fillMissingOrgCodes() {
  const db = getDb();
  const rows = await db
    .prepare(
      `SELECT * FROM employees
       WHERE (COALESCE(workplace, '') <> '' AND COALESCE(workplace_code, '') = '')
          OR (COALESCE(department, '') <> '' AND COALESCE(department_code, '') = '')
          OR (COALESCE(concurrent_dept, '') <> '' AND COALESCE(concurrent_dept_code, '') = '')
       ORDER BY id`
    )
    .all();
  let filled = 0;
  for (const row of rows) {
    if (await syncOrgCodes(db, row.id, row)) filled += 1;
  }
  return filled;
}

function getEmployeeRowAny(id) {
  const dbId = parseEmployeeId(id);
  if (!dbId || Number.isNaN(dbId)) return null;
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(dbId);
}

export async function getEmployeeRoster(includeInactive = true) {
  const sql = includeInactive
    ? `SELECT * FROM employees ORDER BY is_active DESC, lower(name), id`
    : `SELECT * FROM employees WHERE is_active = 1 ORDER BY lower(name), id`;
  const rolesByEmployee = await getRolesByEmployee();
  return (await getDb().prepare(sql).all()).map((row) => mapEmployeeRow(row, rolesByEmployee.get(Number(row.id))));
}

export async function createEmployee(data) {
  const db = getDb();
  const empNo = data.empNo?.trim() || null;
  const name = data.name?.trim();
  const hireDate = data.hireDate;
  const hireType = cleanHireType(data.hireType);

  if (!name) throw new Error('이름은 필수입니다.');
  if (!hireDate) throw new Error('입사일은 필수입니다.');

  return db.transaction(async () => {
    if (empNo) {
      const dup = await db.prepare('SELECT id FROM employees WHERE emp_no = ?').get(empNo);
      if (dup) throw new Error('이미 사용 중인 사번입니다.');
    }

    const result = await db
      .prepare(
        `INSERT INTO employees (
           emp_no, name, hire_date, hire_type, workplace, department, job_type, position,
           concurrent_dept, concurrent_position, email, notes, is_active, is_admin
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        empNo,
        name,
        hireDate,
        hireType,
        data.workplace?.trim() || null,
        data.department?.trim() || null,
        data.jobType?.trim() || '사무직',
        normalizePosition(data.position),
        data.concurrentDept?.trim() || null,
        data.concurrentPosition?.trim() || null,
        data.email?.trim() || '',
        data.notes?.trim() || null,
        0
      );

    const employeeId = result.lastInsertRowid;
    await syncOrgCodes(db, employeeId);
    if (empNo) await ensureUserForEmployee(employeeId, empNo);

    await db
      .prepare(
        `INSERT INTO leave_balance_snapshots
           (employee_id, as_of_date, display_year, accrued, used, remaining, source_file)
         VALUES (?, ?, ?, 0, 0, 0, 'manual_hire')`
      )
      .run(employeeId, AS_OF_DATE, DISPLAY_YEAR);

    if (hireType) await syncPlan(employeeId);

    return mapEmployeeRow(await db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId));
  });
}

export async function updateEmployee(id, data) {
  const db = getDb();
  const row = await getEmployeeRowAny(id);
  if (!row) throw new Error('직원을 찾을 수 없습니다.');

  const empNo = data.empNo?.trim() || null;
  if (empNo) {
    const dup = await db.prepare('SELECT id FROM employees WHERE emp_no = ? AND id != ?').get(empNo, row.id);
    if (dup) throw new Error('이미 사용 중인 사번입니다.');
  }
  const hireDate = data.hireDate || row.hire_date;
  const hireType = 'hireType' in data ? cleanHireType(data.hireType) : row.hire_type;

  await db.transaction(async () => {
    await writeEmployee(db, row, data, empNo, hireDate, hireType);
    await syncOrgCodes(db, row.id, row);
    if (hireType !== row.hire_type || hireDate !== row.hire_date) await syncPlan(row.id);
  });

  if (empNo) await ensureUserForEmployee(row.id, empNo);

  return mapEmployeeRow(await db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}

async function writeEmployee(db, row, data, empNo, hireDate, hireType) {
  await db
    .prepare(
      `UPDATE employees
       SET emp_no = ?, name = ?, hire_date = ?, hire_type = ?, workplace = ?, department = ?, job_type = ?,
           position = ?, concurrent_dept = ?, concurrent_position = ?,
           email = ?, notes = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(
      empNo,
      data.name?.trim() || row.name,
      hireDate,
      hireType,
      data.workplace?.trim() ?? row.workplace,
      data.department?.trim() ?? row.department,
      data.jobType?.trim() ?? row.job_type ?? '사무직',
      normalizePosition(data.position ?? row.position),
      data.concurrentDept?.trim() ?? row.concurrent_dept,
      data.concurrentPosition?.trim() ?? row.concurrent_position,
      data.email?.trim() ?? row.email ?? '',
      data.notes?.trim() ?? row.notes,
      row.id
    );
}

export async function terminateEmployee(id, terminatedDate) {
  const db = getDb();
  const row = await getEmployeeRowAny(id);
  if (!row) throw new Error('직원을 찾을 수 없습니다.');
  if (!row.is_active) throw new Error('이미 퇴사 처리된 직원입니다.');

  const date = terminatedDate || AS_OF_DATE;
  await db
    .prepare(
      `UPDATE employees
       SET is_active = 0, terminated_date = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(date, row.id);

  return mapEmployeeRow(await db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}

export async function reactivateEmployee(id) {
  const db = getDb();
  const row = await getEmployeeRowAny(id);
  if (!row) throw new Error('직원을 찾을 수 없습니다.');
  if (row.is_active) throw new Error('이미 재직 중인 직원입니다.');

  await db
    .prepare(
      `UPDATE employees
       SET is_active = 1, terminated_date = NULL, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(row.id);

  return mapEmployeeRow(await db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}
