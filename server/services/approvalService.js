import { EXECUTIVE_POSITIONS, LEAD_POSITIONS, SEOUL_WORKPLACE_CODE, isOfficerPosition } from '../../src/constants/hr.js';
import { getDb, parseEmployeeId } from '../db.js';

function code(value) {
  return value == null ? '' : String(value).trim();
}

function isSeoul(emp) {
  return code(emp.workplace_code) === '1' || emp.workplace === '서울';
}

async function getEmployee(id) {
  const dbId = parseEmployeeId(id);
  if (!dbId || Number.isNaN(dbId)) return null;
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(dbId);
}

function requesterTier(emp) {
  if (emp.position === '대표이사') return '대표이사';
  if (isOfficerPosition(emp.position)) return '임원';
  if (emp.position === '공장장') return '공장장';
  if (emp.position === '팀장') return '팀장';
  return '팀원';
}

function getSeatByKey(seatKey) {
  return getDb().prepare('SELECT * FROM approval_seats WHERE seat_key = ?').get(seatKey);
}

function getSeatScopes(seatId) {
  return getDb()
    .prepare(
      `SELECT department_code AS departmentCode, department_name AS departmentName, workplace_code AS workplaceCode
       FROM approval_seat_scopes WHERE seat_id = ? ORDER BY department_name, id`
    )
    .all(seatId);
}

async function findSeatForDepartment(stepRole, requester) {
  const dept = code(requester.department_code);
  const workplace = code(requester.workplace_code) || SEOUL_WORKPLACE_CODE;
  if (!dept) return null;
  return (
    (await getDb()
      .prepare(
        `SELECT s.*
         FROM approval_seats s
         JOIN approval_seat_scopes sc ON sc.seat_id = s.id
         WHERE s.step_role = ?
           AND sc.department_code = ?
           AND (sc.workplace_code IS NULL OR sc.workplace_code = ?)
         LIMIT 1`
      )
      .get(stepRole, dept, workplace)) || null
  );
}

async function seatAssigneeName(seat) {
  if (!seat?.employee_id) return null;
  const emp = await getDb()
    .prepare('SELECT name FROM employees WHERE id = ? AND is_active = 1')
    .get(seat.employee_id);
  return emp?.name || null;
}

function isTeamLeaderFor(approver, requester) {
  const sameDeptLead =
    LEAD_POSITIONS.includes(approver.position) &&
    code(approver.workplace_code) === code(requester.workplace_code) &&
    code(approver.department_code) === code(requester.department_code) &&
    code(requester.department_code) !== '';

  const concurrentLead =
    LEAD_POSITIONS.includes(approver.concurrent_position) &&
    code(approver.concurrent_dept_code) === code(requester.department_code) &&
    code(requester.department_code) !== '';

  return Boolean(sameDeptLead || concurrentLead);
}

function isFactoryOrExecFor(approver, requester, roles = EXECUTIVE_POSITIONS) {
  if (roles.includes(approver.position) && code(approver.workplace_code) === code(requester.workplace_code)) {
    return true;
  }
  return false;
}

function isSeatHolder(approver, seat) {
  return Boolean(seat?.employee_id && Number(seat.employee_id) === Number(approver.id));
}

export async function getApprovalChain(employee) {
  const tier = requesterTier(employee);
  if (tier === '팀원') {
    if (await findSeatForDepartment('담당', employee)) return [{ role: '담당' }];
    return [{ role: '팀장' }];
  }
  if (tier === '팀장' && isSeoul(employee)) {
    return [{ role: '임원' }, { role: '대표이사' }];
  }
  if (tier === '팀장') return [{ role: '공장장' }];
  // 공장장: 본인 신청만으로 최종 승인
  if (tier === '공장장') return [];
  if (tier === '임원') return [{ role: '대표이사' }];
  return [{ role: '관리자' }];
}

function stepFromChain(chain, usageStep) {
  if (usageStep && chain.some((step) => step.role === usageStep)) return usageStep;
  return chain[0]?.role || '팀장';
}

export async function currentApprovalStep(employee, usageStep) {
  return stepFromChain(await getApprovalChain(employee), usageStep);
}

export async function nextApprovalStep(employee, usageStep) {
  const chain = await getApprovalChain(employee);
  const current = stepFromChain(chain, usageStep);
  const index = chain.findIndex((step) => step.role === current);
  return index >= 0 ? chain[index + 1]?.role || null : null;
}

export async function approvalHintFor(employee, usageStep) {
  const step = await currentApprovalStep(employee, usageStep);
  if (step === '담당') {
    const seat = await findSeatForDepartment('담당', employee);
    const name = await seatAssigneeName(seat);
    if (name) return `${name} 승인 대기`;
    return seat ? `${seat.title} 승인 대기 (공석)` : '담당자 승인 대기';
  }
  if (step === '팀장') return '팀장 승인 대기';
  if (step === '임원') {
    const seat = await findSeatForDepartment('임원', employee);
    const name = await seatAssigneeName(seat);
    if (name) return `${seat.title}(${name}) 승인 대기`;
    if (seat) return `${seat.title} 승인 대기 (공석)`;
    return '소관 임원 승인 대기';
  }
  if (step === '대표이사') {
    const seat = await getSeatByKey('ceo');
    const name = await seatAssigneeName(seat);
    if (name) return `대표이사(${name}) 승인 대기`;
    return '대표이사 승인 대기 (공석)';
  }
  if (step === '공장장') return '공장장 또는 임원 승인 대기';
  return '관리자 승인 대기';
}

/** 결재 단계별 승인 가능 여부 판정에 필요한 좌석 정보를 한 번에 읽어 둡니다. */
async function loadStepSeat(step, requester) {
  if (step === '담당' || step === '임원') return findSeatForDepartment(step, requester);
  if (step === '대표이사') return getSeatByKey('ceo');
  return null;
}

function approverMatchesStep(approver, requester, step, seat) {
  if (step === '담당' || step === '임원') return isSeatHolder(approver, seat);
  if (step === '팀장') return isTeamLeaderFor(approver, requester);
  if (step === '대표이사') return isSeatHolder(approver, seat) || approver.position === '대표이사';
  if (step === '공장장') return isFactoryOrExecFor(approver, requester, EXECUTIVE_POSITIONS);
  return false;
}

export async function listLineApprovers(requester, usageStep) {
  const step = await currentApprovalStep(requester, usageStep);
  const seat = await loadStepSeat(step, requester);
  const rows = await getDb().prepare('SELECT * FROM employees WHERE is_active = 1').all();
  return rows.filter((approver) => {
    if (Number(approver.id) === Number(requester.id)) return false;
    if (step === '관리자') return Boolean(approver.is_admin);
    return approverMatchesStep(approver, requester, step, seat);
  });
}

export function listAdminEmployees() {
  return getDb()
    .prepare('SELECT * FROM employees WHERE is_active = 1 AND is_admin = 1 ORDER BY name, id')
    .all();
}

/** 신청자 사업장(workplace_code)의 관리자 */
export function listWorkplaceAdminEmployees(employee) {
  const workplaceCode = code(employee?.workplace_code);
  if (!workplaceCode) return listAdminEmployees();
  return getDb()
    .prepare(
      `SELECT * FROM employees
       WHERE is_active = 1 AND is_admin = 1 AND workplace_code = ?
       ORDER BY name, id`
    )
    .all(workplaceCode);
}

export async function canApproveRequests(employeeId) {
  const emp = await getEmployee(employeeId);
  if (!emp || !emp.is_active) return false;
  if (emp.is_admin) return true;
  if (emp.position === '대표이사') return true;
  if (LEAD_POSITIONS.includes(emp.position) || LEAD_POSITIONS.includes(emp.concurrent_position)) return true;
  if (EXECUTIVE_POSITIONS.includes(emp.position)) return true;
  const held = await getDb()
    .prepare('SELECT id FROM approval_seats WHERE employee_id = ? LIMIT 1')
    .get(Number(emp.id));
  return Boolean(held);
}

export async function canApproveUsage(approverId, usage) {
  const requesterId = usage.employee_id ?? usage.employeeId;
  if (Number(approverId) === Number(requesterId)) return false;
  const approver = await getEmployee(approverId);
  const requester = await getEmployee(requesterId);
  if (!approver?.is_active || !requester) return false;

  const step = await currentApprovalStep(requester, usage.approval_step);
  if (approver.is_admin) return true;
  return approverMatchesStep(approver, requester, step, await loadStepSeat(step, requester));
}

export async function listPendingApprovals(approverId) {
  const rows = await getDb()
    .prepare(
      `SELECT u.*, e.name AS employee_name, e.emp_no, e.workplace, e.department, e.position,
              e.workplace_code, e.department_code
       FROM leave_usages u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.status = 'pending'
       ORDER BY u.usage_date, u.id`
    )
    .all();

  const allowed = [];
  for (const row of rows) {
    if (await canApproveUsage(approverId, row)) allowed.push(row);
  }
  return allowed;
}

async function mapSeatRow(row) {
  const assignee = row.employee_id
    ? await getDb().prepare('SELECT id, name, emp_no, position FROM employees WHERE id = ?').get(row.employee_id)
    : null;
  return {
    id: String(row.id),
    seatKey: row.seat_key,
    title: row.title,
    stepRole: row.step_role,
    sortOrder: row.sort_order,
    employeeId: row.employee_id ? String(row.employee_id) : null,
    employeeName: assignee?.name || null,
    empNo: assignee?.emp_no || null,
    vacant: !row.employee_id,
    scopes: await getSeatScopes(row.id),
  };
}

export function listDepartmentOptions() {
  return getDb()
    .prepare(
      `SELECT MAX(department) AS name, department_code AS code, MAX(workplace) AS workplace,
              workplace_code AS workplaceCode
       FROM employees
       WHERE department IS NOT NULL AND trim(department) != ''
         AND department_code IS NOT NULL AND trim(department_code) != ''
       GROUP BY workplace_code, department_code
       ORDER BY MAX(workplace), MAX(department)`
    )
    .all();
}

export async function listApprovalLines() {
  const rows = await getDb().prepare('SELECT * FROM approval_seats ORDER BY sort_order, id').all();
  const seats = [];
  for (const row of rows) seats.push(await mapSeatRow(row));
  return { seats, departments: await listDepartmentOptions() };
}

export async function saveApprovalLines(payload) {
  const db = getDb();
  const seats = payload?.seats;
  if (!Array.isArray(seats) || !seats.length) {
    throw Object.assign(new Error('결재 라인 정보가 필요합니다.'), { status: 400 });
  }

  await db.transaction(async () => {
    for (const item of seats) {
      const row = await db
        .prepare('SELECT * FROM approval_seats WHERE id = ? OR seat_key = ?')
        .get(Number(item.id) || 0, item.seatKey);
      if (!row) continue;

      let employeeId = null;
      if (item.employeeId) {
        const emp = await getEmployee(item.employeeId);
        if (!emp) throw Object.assign(new Error('선택한 직원을 찾을 수 없습니다.'), { status: 400 });
        employeeId = emp.id;
      }

      await db
        .prepare(
          `UPDATE approval_seats
           SET employee_id = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        )
        .run(employeeId, row.id);

      if (Array.isArray(item.scopes) && row.step_role !== '대표이사') {
        await db.prepare('DELETE FROM approval_seat_scopes WHERE seat_id = ?').run(row.id);
        const seen = new Set();
        for (const scope of item.scopes) {
          const departmentCode = code(scope.departmentCode || scope.department_code);
          if (!departmentCode || seen.has(departmentCode)) continue;
          seen.add(departmentCode);
          await db
            .prepare('DELETE FROM approval_seat_scopes WHERE department_code = ? AND seat_id != ?')
            .run(departmentCode, row.id);
          await db
            .prepare(
              `INSERT INTO approval_seat_scopes (seat_id, workplace_code, department_code, department_name)
               VALUES (?, ?, ?, ?)`
            )
            .run(
              row.id,
              code(scope.workplaceCode || scope.workplace_code) || SEOUL_WORKPLACE_CODE,
              departmentCode,
              String(scope.departmentName || scope.department_name || '').trim() || departmentCode
            );
        }
      }
    }
  });

  return listApprovalLines();
}
