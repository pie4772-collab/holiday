import { getCurrentDisplayYear } from '../../src/utils/leaveCalculations.js';
import {
  DEFAULT_POSITION,
  JOB_RANKS,
  PAY_GRADES,
  PAY_STEP_MAX,
  POSITIONS,
  gradesForRank,
  hasPayGrade,
} from '../../src/constants/hr.js';
import { getDb, parseEmployeeId } from '../db.js';
import { ensureUserForEmployee } from './authService.js';
import { getRolesByEmployee, isDeptHead } from './accessService.js';
import { cleanHireType, syncPlan } from './evaluationService.js';

function normalizePosition(value) {
  const position = String(value || '').trim();
  return POSITIONS.includes(position) ? position : DEFAULT_POSITION;
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/** 직위·급·호봉을 함께 검사합니다. 빠진 항목은 row(기존 값)를 따릅니다. */
function cleanRankGrade(data, row = {}) {
  const pick = (key, column) => String((key in data ? data[key] : row[column]) ?? '').trim();
  const jobRank = pick('jobRank', 'job_rank') || null;
  const payGrade = pick('payGrade', 'pay_grade') || null;
  const rawStep = pick('payStep', 'pay_step');
  if (jobRank && !JOB_RANKS.includes(jobRank)) throw badRequest(`직위는 ${JOB_RANKS.join('·')} 중에서 고르세요.`);
  if (!hasPayGrade(jobRank) && (payGrade || rawStep)) throw badRequest(`${jobRank} 직위는 급호가 없습니다. 급호를 비워 주세요.`);
  const grade = payGrade && PAY_GRADES.find((g) => g.key === payGrade);
  if (payGrade && !grade) throw badRequest('급호의 급을 목록에서 고르세요.');
  if (grade && jobRank && grade.rank !== jobRank) {
    throw badRequest(`${jobRank} 직위의 급은 ${gradesForRank(jobRank).map((g) => g.key).join('·')}입니다.`);
  }
  const payStep = rawStep ? Number(rawStep) : null;
  if (rawStep && (!Number.isInteger(payStep) || payStep < 1 || payStep > PAY_STEP_MAX)) {
    throw badRequest(`호봉은 1~${PAY_STEP_MAX} 사이로 입력하세요.`);
  }
  if (Boolean(payGrade) !== Boolean(payStep)) throw badRequest('급호는 급과 호봉을 함께 입력하세요.');
  return { jobRank, payGrade, payStep };
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
    jobRank: row.job_rank || '',
    payGrade: row.pay_grade || '',
    payStep: row.pay_step == null ? null : Number(row.pay_step),
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
         GROUP BY ${codeCol} ORDER BY n DESC, ${codeCol} LIMIT 1`
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
 * 같은 이름을 쓰는 다른 직원이 있으면 그 코드를 따릅니다. 없으면 이름이 그대로일 때 기존 코드를 유지하고,
 * 처음 보는 이름이면 그 코드 체계의 다음 번호를 붙입니다.
 */
async function syncOrgCodes(db, id, previous = null) {
  const row = await db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  const sets = [];
  const values = [];
  for (const { column, code, group } of ORG_CODES) {
    const name = String(row[column] || '').trim();
    const current = row[code] ? String(row[code]) : null;
    const unchanged = Boolean(previous) && String(previous[column] || '').trim() === name;
    let value = unchanged ? current : null;
    if (name) {
      value = (await lookupOrgCode(db, group, name, row.id)) || value || (await nextOrgCode(db, group));
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

/** 사원 명부에서 등록·수정하면서 비거나 이름과 어긋난 코드를 바로잡습니다. 서버 시작 때 실행합니다. */
export async function repairOrgCodes() {
  const db = getDb();
  const rows = await db.prepare('SELECT * FROM employees ORDER BY id').all();
  const repaired = [];
  for (const row of rows) {
    if (await syncOrgCodes(db, row.id, row)) repaired.push(row.emp_no);
  }
  return repaired;
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
  const { jobRank, payGrade, payStep } = cleanRankGrade(data);

  return db.transaction(async () => {
    if (empNo) {
      const dup = await db.prepare('SELECT id FROM employees WHERE emp_no = ?').get(empNo);
      if (dup) throw new Error('이미 사용 중인 사번입니다.');
    }

    const result = await db
      .prepare(
        `INSERT INTO employees (
           emp_no, name, hire_date, hire_type, workplace, department, job_type, position, job_rank, pay_grade, pay_step,
           concurrent_dept, concurrent_position, email, notes, is_active, is_admin
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
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
        jobRank,
        payGrade,
        payStep,
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
  const rankStep = cleanRankGrade(data, row);

  await db.transaction(async () => {
    await writeEmployee(db, row, data, empNo, hireDate, hireType, rankStep);
    await syncOrgCodes(db, row.id, row);
    if (hireType !== row.hire_type || hireDate !== row.hire_date) await syncPlan(row.id);
  });

  if (empNo) await ensureUserForEmployee(row.id, empNo);

  return mapEmployeeRow(await db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}

async function writeEmployee(db, row, data, empNo, hireDate, hireType, { jobRank, payGrade, payStep }) {
  await db
    .prepare(
      `UPDATE employees
       SET emp_no = ?, name = ?, hire_date = ?, hire_type = ?, workplace = ?, department = ?, job_type = ?,
           position = ?, job_rank = ?, pay_grade = ?, pay_step = ?, concurrent_dept = ?, concurrent_position = ?,
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
      jobRank,
      payGrade,
      payStep,
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
