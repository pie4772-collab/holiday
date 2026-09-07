import { getCurrentDisplayYear } from '../../src/utils/leaveCalculations.js';
import { DEFAULT_POSITION, POSITIONS } from '../../src/constants/hr.js';
import { getDb, parseEmployeeId } from '../db.js';
import { ensureUserForEmployee } from './authService.js';

function normalizePosition(value) {
  const position = String(value || '').trim();
  return POSITIONS.includes(position) ? position : DEFAULT_POSITION;
}

const AS_OF_DATE = process.env.AS_OF_DATE || '2026-08-31';
const DISPLAY_YEAR = getCurrentDisplayYear(new Date(AS_OF_DATE));

function toApiId(dbId) {
  return String(dbId);
}

function mapEmployeeRow(row) {
  return {
    id: toApiId(row.id),
    empNo: row.emp_no || '',
    name: row.name,
    department: row.department || '사무직',
    position: row.position || DEFAULT_POSITION,
    hireDate: row.hire_date,
    email: row.email || '',
    notes: row.notes || '',
    isActive: Boolean(row.is_active),
    isAdmin: Boolean(row.is_admin),
    terminatedDate: row.terminated_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getEmployeeRowAny(id) {
  const dbId = parseEmployeeId(id);
  if (!dbId || Number.isNaN(dbId)) return null;
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(dbId);
}

export function getEmployeeRoster(includeInactive = true) {
  const sql = includeInactive
    ? `SELECT * FROM employees ORDER BY is_active DESC, name COLLATE NOCASE`
    : `SELECT * FROM employees WHERE is_active = 1 ORDER BY name COLLATE NOCASE`;
  return getDb().prepare(sql).all().map(mapEmployeeRow);
}

export function createEmployee(data) {
  const db = getDb();
  const empNo = data.empNo?.trim() || null;
  const name = data.name?.trim();
  const hireDate = data.hireDate;

  if (!name) throw new Error('이름은 필수입니다.');
  if (!hireDate) throw new Error('입사일은 필수입니다.');

  if (empNo) {
    const dup = db.prepare('SELECT id FROM employees WHERE emp_no = ?').get(empNo);
    if (dup) throw new Error('이미 사용 중인 사번입니다.');
  }

  const result = db
    .prepare(
      `INSERT INTO employees (emp_no, name, hire_date, department, position, email, notes, is_active, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(
      empNo,
      name,
      hireDate,
      data.department?.trim() || '사무직',
      normalizePosition(data.position),
      data.email?.trim() || '',
      data.notes?.trim() || null,
      data.isAdmin ? 1 : 0
    );

  const employeeId = result.lastInsertRowid;
  if (empNo) ensureUserForEmployee(employeeId, empNo);

  db.prepare(
    `INSERT INTO leave_balance_snapshots
       (employee_id, as_of_date, display_year, accrued, used, remaining, source_file)
     VALUES (?, ?, ?, 0, 0, 0, 'manual_hire')`
  ).run(employeeId, AS_OF_DATE, DISPLAY_YEAR);

  return mapEmployeeRow(db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId));
}

export function updateEmployee(id, data) {
  const db = getDb();
  const row = getEmployeeRowAny(id);
  if (!row) throw new Error('직원을 찾을 수 없습니다.');

  const empNo = data.empNo?.trim() || null;
  if (empNo) {
    const dup = db.prepare('SELECT id FROM employees WHERE emp_no = ? AND id != ?').get(empNo, row.id);
    if (dup) throw new Error('이미 사용 중인 사번입니다.');
  }

  db.prepare(
    `UPDATE employees
     SET emp_no = ?, name = ?, hire_date = ?, department = ?, position = ?,
         email = ?, notes = ?, is_admin = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(
    empNo,
    data.name?.trim() || row.name,
    data.hireDate || row.hire_date,
    data.department?.trim() || row.department,
    normalizePosition(data.position ?? row.position),
    data.email?.trim() ?? row.email ?? '',
    data.notes?.trim() ?? row.notes,
    data.isAdmin === undefined ? (row.is_admin ? 1 : 0) : data.isAdmin ? 1 : 0,
    row.id
  );

  if (empNo) ensureUserForEmployee(row.id, empNo);

  return mapEmployeeRow(db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}

export function terminateEmployee(id, terminatedDate) {
  const db = getDb();
  const row = getEmployeeRowAny(id);
  if (!row) throw new Error('직원을 찾을 수 없습니다.');
  if (!row.is_active) throw new Error('이미 퇴사 처리된 직원입니다.');

  const date = terminatedDate || AS_OF_DATE;
  db.prepare(
    `UPDATE employees
     SET is_active = 0, terminated_date = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(date, row.id);

  return mapEmployeeRow(db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}

export function reactivateEmployee(id) {
  const db = getDb();
  const row = getEmployeeRowAny(id);
  if (!row) throw new Error('직원을 찾을 수 없습니다.');
  if (row.is_active) throw new Error('이미 재직 중인 직원입니다.');

  db.prepare(
    `UPDATE employees
     SET is_active = 1, terminated_date = NULL, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(row.id);

  return mapEmployeeRow(db.prepare('SELECT * FROM employees WHERE id = ?').get(row.id));
}
