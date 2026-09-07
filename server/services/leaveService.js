import {
  calculateLeaveBalance,
  formatDate,
  getOneYearAnniversary,
  getCurrentDisplayYear,
  getMonthlyAccrualInYear,
  filterUsagesByYear,
  FISCAL_YEAR_START_MONTH,
} from '../../src/utils/leaveCalculations.js';
import {
  calendarSpanDays,
  describeLeaveDates,
  isValidLeaveDate,
  listLeaveRequestDates,
  MAX_LEAVE_RANGE_DAYS,
} from '../../src/utils/leaveRequestDates.js';
import { getDb, parseEmployeeId } from '../db.js';
import * as approvalService from './approvalService.js';

const AS_OF_DATE = process.env.AS_OF_DATE || '2026-07-10';
const TODAY = new Date(AS_OF_DATE);

function toApiId(dbId) {
  return String(dbId);
}

function mapUsageRow(row) {
  return {
    id: String(row.id),
    employeeId: toApiId(row.employee_id),
    employeeName: row.employee_name || undefined,
    empNo: row.emp_no || undefined,
    workplace: row.workplace || undefined,
    department: row.department || undefined,
    position: row.position || undefined,
    date: row.usage_date,
    type: row.usage_type,
    reason: row.reason,
    status: row.status,
    approvalStep: row.approval_step || null,
    approvalHint: row.approval_hint || undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at || null,
    rejectReason: row.reject_reason || null,
  };
}

function mapAccrualRow(row) {
  return {
    id: String(row.id),
    employeeId: toApiId(row.employee_id),
    type: row.accrual_type,
    amount: row.amount,
    date: row.accrual_date,
    description: row.description,
    isManual: Boolean(row.is_manual),
  };
}

function getEmployeeRow(id) {
  const dbId = parseEmployeeId(id);
  if (!dbId || Number.isNaN(dbId)) return null;
  return getDb()
    .prepare(
      `SELECT e.*, lbs.as_of_date, lbs.display_year, lbs.accrued, lbs.used, lbs.remaining
       FROM employees e
       LEFT JOIN leave_balance_snapshots lbs ON lbs.employee_id = e.id
       WHERE e.id = ? AND e.is_active = 1`
    )
    .get(dbId);
}

function getApprovedUsages(dbId) {
  return getDb()
    .prepare(
      `SELECT * FROM leave_usages
       WHERE employee_id = ? AND status = 'approved'
       ORDER BY usage_date DESC`
    )
    .all(dbId)
    .map(mapUsageRow);
}

function getAllUsages(dbId, year) {
  const rows = getDb()
    .prepare(`SELECT * FROM leave_usages WHERE employee_id = ? ORDER BY usage_date DESC`)
    .all(dbId)
    .map(mapUsageRow);
  return year ? filterUsagesByYear(rows, year) : rows;
}

function getManualAccruals(dbId, year) {
  const rows = getDb()
    .prepare(`SELECT * FROM leave_accruals WHERE employee_id = ? AND is_manual = 1`)
    .all(dbId)
    .map(mapAccrualRow);
  return year ? rows.filter((r) => new Date(r.date).getFullYear() === year) : rows;
}

function getManualAccrualTotal(dbId, year) {
  return getManualAccruals(dbId, year).reduce((sum, a) => sum + a.amount, 0);
}

function toEmployeeBase(row) {
  return {
    id: toApiId(row.id),
    empNo: row.emp_no,
    name: row.name,
    workplace: row.workplace || '',
    department: row.department || '',
    jobType: row.job_type || '사무직',
    position: row.position || '팀원',
    concurrentDept: row.concurrent_dept || '',
    concurrentPosition: row.concurrent_position || '',
    isAdmin: Boolean(row.is_admin),
    hireDate: row.hire_date,
    email: row.email || '',
    notes: row.notes,
  };
}

function buildLeaveSummary(row) {
  const dbId = row.id;
  const approvedUsages = getApprovedUsages(dbId);
  const manualTotal = getManualAccrualTotal(dbId, getCurrentDisplayYear(TODAY));
  const calculated = calculateLeaveBalance(row.hire_date, approvedUsages, TODAY, {
    manualAccrualTotal: manualTotal,
  });

  // DB 사용 내역이 없으면 엑셀 스냅샷 기준값 사용
  if (approvedUsages.length === 0 && row.accrued != null) {
    const accrued = row.accrued + manualTotal;
    const used = row.used;
    const remaining = Math.max(0, Math.round((row.remaining + manualTotal) * 10) / 10);

    return {
      employeeId: toApiId(dbId),
      ...calculated,
      accruedThisYear: accrued,
      usedDays: used,
      remaining,
      totalGranted: accrued,
      manualAccrualTotal: manualTotal,
      snapshotAccrued: row.accrued,
      snapshotUsed: row.used,
      snapshotRemaining: row.remaining,
    };
  }

  return {
    employeeId: toApiId(dbId),
    ...calculated,
    manualAccrualTotal: manualTotal,
  };
}

function buildAutoAccrualLogs(employee, balance) {
  const logs = [];
  const hireDate = employee.hireDate;
  const displayYear = balance.displayYear;
  const monthlyInYear = getMonthlyAccrualInYear(hireDate, displayYear, TODAY);
  const hire = new Date(hireDate);

  for (let m = 1; m <= monthlyInYear; m++) {
    let count = 0;
    for (let i = 1; i <= 11; i++) {
      const accrualDate = new Date(hire.getFullYear(), hire.getMonth() + i, 1);
      if (accrualDate.getFullYear() === displayYear) {
        count++;
        if (count === m) {
          logs.push({
            id: `log-${employee.id}-monthly-${displayYear}-${m}`,
            employeeId: employee.id,
            type: 'first_year_monthly',
            amount: 1,
            date: formatDate(accrualDate),
            description: `${displayYear}년 월차 발생`,
            isManual: false,
          });
          break;
        }
      }
    }
  }

  if (balance.proratedLeave > 0 && getOneYearAnniversary(hireDate).getFullYear() === displayYear) {
    logs.push({
      id: `log-${employee.id}-prorated`,
      employeeId: employee.id,
      type: 'prorated',
      amount: balance.proratedLeave,
      date: formatDate(getOneYearAnniversary(hireDate)),
      description: `${displayYear}년 비례 연차 (15 × 남은일수/365)`,
      isManual: false,
    });
  }

  if (balance.annualLeave > 0) {
    logs.push({
      id: `log-${employee.id}-annual-${displayYear}`,
      employeeId: employee.id,
      type: 'annual',
      amount: balance.annualLeave,
      date: formatDate(new Date(displayYear, FISCAL_YEAR_START_MONTH, 1)),
      description: `${displayYear}년 정규 연차 (기본 15일 + 근속 가산)`,
      isManual: false,
    });
  }

  balance.settlements?.forEach((s, i) => {
    logs.push({
      id: `log-${employee.id}-settlement-${i}`,
      employeeId: employee.id,
      type: 'settlement',
      amount: -s.settledDays,
      date: formatDate(s.date),
      description: `${displayYear}년 ${s.description} · 잔여에서 ${s.settledDays}일 차감`,
      isManual: false,
    });
  });

  return logs;
}

function buildAccrualLogs(employee, balance) {
  const auto = buildAutoAccrualLogs(employee, balance);
  const manual = getManualAccruals(parseEmployeeId(employee.id), balance.displayYear);
  return [...auto, ...manual].sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getAllEmployees() {
  const rows = getDb()
    .prepare(
      `SELECT e.*, lbs.as_of_date, lbs.display_year, lbs.accrued, lbs.used, lbs.remaining
       FROM employees e
       LEFT JOIN leave_balance_snapshots lbs ON lbs.employee_id = e.id
       WHERE e.is_active = 1
       ORDER BY e.name`
    )
    .all();

  return rows.map((row) => {
    const base = toEmployeeBase(row);
    return { ...base, leaveSummary: buildLeaveSummary(row) };
  });
}

export function getEmployeeById(id) {
  const row = getEmployeeRow(id);
  if (!row) return null;

  const base = toEmployeeBase(row);
  const leaveSummary = buildLeaveSummary(row);
  const displayYear = leaveSummary.displayYear;

  return {
    ...base,
    leaveSummary,
    accrualLogs: buildAccrualLogs(base, leaveSummary),
    usages: getAllUsages(row.id, displayYear),
  };
}

export function getCurrentEmployee(employeeId) {
  const id = employeeId || process.env.CURRENT_EMPLOYEE_ID || '1';
  const emp = getEmployeeById(id);
  if (!emp) return null;
  return {
    ...emp,
    canApprove: approvalService.canApproveRequests(id),
    approvalHint: approvalService.approvalHintFor({ position: emp.position }),
  };
}

export function getAdminStats() {
  const employees = getAllEmployees();
  const displayYear = getCurrentDisplayYear(TODAY);
  const thisMonth = TODAY.getMonth();
  const thisYear = TODAY.getFullYear();

  const monthlyUsage = getDb()
    .prepare(
      `SELECT usage_type FROM leave_usages
       WHERE status = 'approved'
         AND substr(usage_date, 1, 4) = ?
         AND CAST(substr(usage_date, 6, 2) AS INTEGER) = ?`
    )
    .all(String(thisYear), thisMonth + 1)
    .reduce((sum, u) => sum + (u.usage_type === 'half' ? 0.5 : 1), 0);

  const avgRemaining =
    employees.reduce((sum, e) => sum + e.leaveSummary.remaining, 0) / (employees.length || 1);

  return {
    displayYear,
    averageRemaining: Math.round(avgRemaining * 10) / 10,
    monthlyUsage,
    firstYearEmployeeCount: employees.filter((e) => e.leaveSummary.isFirstYear).length,
    proratedTargetCount: employees.filter((e) => e.leaveSummary.isProratedTarget).length,
    totalEmployees: employees.length,
  };
}

export function getLeaveHistory(employeeId) {
  const emp = getEmployeeById(employeeId);
  return emp?.accrualLogs || [];
}

export function getLeaveUsages(employeeId) {
  const row = getEmployeeRow(employeeId);
  if (!row) return [];
  const year = String(getCurrentDisplayYear(TODAY));
  return getAllUsages(row.id).filter(
    (usage) =>
      usage.status === 'pending' ||
      usage.status === 'rejected' ||
      usage.date?.slice(0, 4) === year
  );
}

export function getAdminAccruals(employeeId) {
  return getLeaveHistory(employeeId);
}

export function getAdminUsages(employeeId) {
  const row = getEmployeeRow(employeeId);
  if (!row) return [];
  return getAllUsages(row.id, getCurrentDisplayYear(TODAY));
}

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function submitLeaveRequest(data) {
  const dbId = parseEmployeeId(data.employeeId);
  if (!dbId) throw httpError('유효하지 않은 직원 ID입니다.');
  const employee = getDb().prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1').get(dbId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.');

  const type = data.type === 'half' ? 'half' : data.type === 'full' ? 'full' : null;
  if (!type) throw httpError('연차 유형을 선택해주세요.');
  const reason = String(data.reason || '').trim();
  if (!reason) throw httpError('연차 사유를 입력해주세요.');

  const startDate = data.startDate || data.date;
  const endDate = type === 'half' ? startDate : data.endDate || data.date || startDate;
  if (!isValidLeaveDate(startDate) || !isValidLeaveDate(endDate)) {
    throw httpError('날짜를 확인해주세요.');
  }
  if (type === 'full' && endDate < startDate) {
    throw httpError('종료일은 시작일 이후여야 합니다.');
  }
  if (type === 'full' && calendarSpanDays(startDate, endDate) > MAX_LEAVE_RANGE_DAYS) {
    throw httpError(`한 번에 최대 ${MAX_LEAVE_RANGE_DAYS}일까지 신청할 수 있습니다.`);
  }

  const dates = listLeaveRequestDates(startDate, endDate, { skipWeekends: type === 'full' });
  if (!dates.length) {
    throw httpError(
      type === 'full' ? '선택한 기간에 신청할 평일이 없습니다. 주말은 제외됩니다.' : '반차는 사용할 날짜를 선택해주세요.'
    );
  }
  if (type === 'half' && dates.length !== 1) {
    throw httpError('반차는 하루만 신청할 수 있습니다.');
  }

  const placeholders = dates.map(() => '?').join(', ');
  const conflicts = getDb()
    .prepare(
      `SELECT usage_date, status FROM leave_usages
       WHERE employee_id = ?
         AND usage_date IN (${placeholders})
         AND status IN ('pending', 'approved')
       ORDER BY usage_date`
    )
    .all(dbId, ...dates);

  if (conflicts.length) {
    const first = conflicts[0];
    const label = first.status === 'pending' ? '승인 대기 중' : '이미 승인됨';
    throw httpError(`${first.usage_date}은(는) ${label}인 연차가 있어 신청할 수 없습니다.`);
  }

  const daysPerDate = type === 'half' ? 0.5 : 1;
  const firstStep = approvalService.getApprovalChain(employee)[0]?.role || '팀장';
  const insert = getDb().prepare(
    `INSERT INTO leave_usages (employee_id, usage_date, usage_type, days, reason, status, created_by, approval_step)
     VALUES (?, ?, ?, ?, ?, 'pending', 'employee', ?)`
  );

  const items = dates.map((date) => {
    const result = insert.run(dbId, date, type, daysPerDate, reason, firstStep);
    return mapUsageRow(
      getDb().prepare('SELECT * FROM leave_usages WHERE id = ?').get(result.lastInsertRowid)
    );
  });

  const approvalHint = approvalService.approvalHintFor(employee);
  const dateLabel = describeLeaveDates(dates);
  const countLabel = type === 'half' ? '반차 0.5일' : `${dates.length}일`;

  return {
    ...items[0],
    dates,
    items,
    count: items.length,
    approvalHint,
    message: `${countLabel} 연차 신청이 접수되었습니다. ${dateLabel}${
      approvalHint ? ` · ${approvalHint}` : ' · 승인을 기다려주세요'
    }`,
  };
}

export function getPendingApprovals(approverId) {
  return approvalService.listPendingApprovals(approverId).map((row) => {
    const mapped = mapUsageRow(row);
    return {
      ...mapped,
      approvalHint: approvalService.approvalHintFor(
        {
          position: row.position,
          workplace: row.workplace,
          workplace_code: row.workplace_code,
          department_code: row.department_code,
        },
        row.approval_step
      ),
    };
  });
}

export function decideLeaveRequest(usageId, approverId, action, rejectReason) {
  const approverDbId = parseEmployeeId(approverId);
  const row = getDb().prepare('SELECT * FROM leave_usages WHERE id = ?').get(Number(usageId));
  if (!row) throw Object.assign(new Error('신청 내역을 찾을 수 없습니다.'), { status: 404 });
  if (row.status !== 'pending') throw Object.assign(new Error('이미 처리된 신청입니다.'), { status: 400 });
  if (!approvalService.canApproveUsage(approverDbId, row)) {
    throw Object.assign(new Error('이 신청을 승인할 권한이 없습니다.'), { status: 403 });
  }

  if (action === 'reject') {
    getDb()
      .prepare(
        `UPDATE leave_usages
         SET status = 'rejected', approved_by = ?, approved_at = datetime('now', 'localtime'),
             reject_reason = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(approverDbId, rejectReason || '', row.id);
  } else {
    const requester = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(row.employee_id);
    const nextStep = approvalService.nextApprovalStep(requester, row.approval_step);
    if (nextStep) {
      getDb()
        .prepare(
          `UPDATE leave_usages
           SET approval_step = ?, approved_by = ?, approved_at = datetime('now', 'localtime'),
               updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        )
        .run(nextStep, approverDbId, row.id);
    } else {
      getDb()
        .prepare(
          `UPDATE leave_usages
           SET status = 'approved', approved_by = ?, approved_at = datetime('now', 'localtime'),
               reject_reason = NULL, updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        )
        .run(approverDbId, row.id);
    }
  }

  const updated = getDb().prepare('SELECT * FROM leave_usages WHERE id = ?').get(row.id);
  const requester = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(row.employee_id);
  return {
    ...mapUsageRow(updated),
    approvalHint:
      updated.status === 'pending' ? approvalService.approvalHintFor(requester, updated.approval_step) : null,
  };
}

export function createAccrual(data) {
  const dbId = parseEmployeeId(data.employeeId);
  if (!dbId) throw new Error('유효하지 않은 직원 ID입니다.');

  const result = getDb()
    .prepare(
      `INSERT INTO leave_accruals (employee_id, accrual_date, accrual_type, amount, description, is_manual, created_by)
       VALUES (?, ?, ?, ?, ?, 1, 'admin')`
    )
    .run(dbId, data.date, data.type, data.amount, data.description);

  return mapAccrualRow(
    getDb().prepare('SELECT * FROM leave_accruals WHERE id = ?').get(result.lastInsertRowid)
  );
}

export function updateAccrual(id, data) {
  const row = getDb().prepare('SELECT * FROM leave_accruals WHERE id = ? AND is_manual = 1').get(id);
  if (!row) throw new Error('수동 발생 내역을 찾을 수 없습니다.');

  getDb()
    .prepare(
      `UPDATE leave_accruals
       SET accrual_date = ?, accrual_type = ?, amount = ?, description = ?,
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(data.date, data.type, data.amount, data.description, id);

  return mapAccrualRow(getDb().prepare('SELECT * FROM leave_accruals WHERE id = ?').get(id));
}

export function deleteAccrual(id) {
  const result = getDb().prepare('DELETE FROM leave_accruals WHERE id = ? AND is_manual = 1').run(id);
  if (result.changes === 0) throw new Error('수동 발생 내역을 찾을 수 없습니다.');
}

export function createUsage(data) {
  const dbId = parseEmployeeId(data.employeeId);
  if (!dbId) throw new Error('유효하지 않은 직원 ID입니다.');

  const days = data.type === 'half' ? 0.5 : 1;
  const result = getDb()
    .prepare(
      `INSERT INTO leave_usages (employee_id, usage_date, usage_type, days, reason, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'admin')`
    )
    .run(dbId, data.date, data.type, days, data.reason, data.status || 'approved');

  return mapUsageRow(
    getDb().prepare('SELECT * FROM leave_usages WHERE id = ?').get(result.lastInsertRowid)
  );
}

export function updateUsage(id, data) {
  const row = getDb().prepare('SELECT * FROM leave_usages WHERE id = ?').get(id);
  if (!row) throw new Error('사용 내역을 찾을 수 없습니다.');

  const days = data.type === 'half' ? 0.5 : 1;
  getDb()
    .prepare(
      `UPDATE leave_usages
       SET usage_date = ?, usage_type = ?, days = ?, reason = ?, status = ?,
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(data.date, data.type, days, data.reason, data.status, id);

  return mapUsageRow(getDb().prepare('SELECT * FROM leave_usages WHERE id = ?').get(id));
}

export function deleteUsage(id) {
  const result = getDb().prepare('DELETE FROM leave_usages WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('사용 내역을 찾을 수 없습니다.');
}
