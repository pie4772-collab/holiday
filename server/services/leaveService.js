import {
  calculateLeaveBalance,
  formatDate,
  getOneYearAnniversary,
  getCurrentDisplayYear,
  getMonthlyAccrualInYear,
  getFirstYearMonthlyAccrualDate,
  filterUsagesByYear,
  filterConsumedUsages,
  filterScheduledUsages,
  sumUsageDays,
  getReportMonthRange,
  FISCAL_YEAR_START_MONTH,
  getSettlementEventsInYear,
  getPayableLeaveDays,
  getOverusedLeaveDays,
  getPriorPeriodOveruseCarryIn,
  getPreviousDate,
  getFirstYearPayrollDate,
} from '../../src/utils/leaveCalculations.js';
import {
  calendarSpanDays,
  describeLeaveDates,
  isValidLeaveDate,
  leaveBlockedReason,
  listLeaveRequestDates,
  MAX_LEAVE_RANGE_DAYS,
} from '../../src/utils/leaveRequestDates.js';
import { getDb, parseEmployeeId } from '../db.js';
import * as approvalService from './approvalService.js';
import * as mailService from './mailService.js';

const AS_OF_DATE = process.env.AS_OF_DATE || '2026-07-10';
const TODAY = new Date(AS_OF_DATE);

function getConsumptionAsOf() {
  const now = new Date();
  return now.getTime() > TODAY.getTime() ? now : TODAY;
}

function hasImportedSnapshot(row) {
  if (row.accrued == null && row.used == null && row.remaining == null) return false;
  return Number(row.accrued) !== 0 || Number(row.used) !== 0 || Number(row.remaining) !== 0;
}

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
    days: row.days,
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

function buildLeaveSummary(row, options = {}) {
  const dbId = row.id;
  const asOf = options.asOfDate || TODAY;
  const consumptionAsOf = options.consumptionAsOf || getConsumptionAsOf();
  const approvedUsages = getApprovedUsages(dbId);
  const manualTotal = getManualAccrualTotal(dbId, getCurrentDisplayYear(asOf));
  const calculated = calculateLeaveBalance(row.hire_date, approvedUsages, asOf, {
    manualAccrualTotal: manualTotal,
    consumptionAsOf,
    skipSettledDeduction: Boolean(options.skipSettledDeduction),
    skipCarryIn: Boolean(options.skipCarryIn),
  });

  // Excel 스냅샷은 첫해·정규 구간의 잔액 기준으로 사용.
  // 비례 구간에서는 스냅샷이 첫해 숫자(예: 발생 11)를 그대로 두는 경우가 많아
  // 엔진 비례 발생분(15×남은일/365)을 우선한다.
  if (
    !options.skipSnapshot &&
    hasImportedSnapshot(row) &&
    calculated.phase !== 'prorated'
  ) {
    const snapshotAsOf = row.as_of_date;
    const newUsages = approvedUsages.filter((usage) => !snapshotAsOf || usage.date > snapshotAsOf);
    const extraUsed = sumUsageDays(filterConsumedUsages(newUsages, consumptionAsOf));
    const scheduledDays = sumUsageDays(filterScheduledUsages(newUsages, consumptionAsOf));
    const accrued = row.accrued + manualTotal;
    const used = Math.round(((row.used || 0) + extraUsed) * 10) / 10;
    const carryInDays = options.skipCarryIn
      ? 0
      : getPriorPeriodOveruseCarryIn(row.hire_date, asOf, approvedUsages, {
          manualAccrualTotal: manualTotal,
          consumptionAsOf,
        });
    const rawRemaining = Math.round((Number(row.remaining || 0) + manualTotal - extraUsed - carryInDays) * 10) / 10;
    const remaining = getPayableLeaveDays(rawRemaining);
    const overusedDays = getOverusedLeaveDays(rawRemaining);

    return {
      employeeId: toApiId(dbId),
      ...calculated,
      accruedThisYear: accrued,
      usedDays: used,
      remaining,
      rawRemaining,
      overusedDays,
      carryInDays,
      scheduledDays,
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

  for (let m = 1; m <= monthlyInYear; m++) {
    let count = 0;
    for (let i = 1; i <= 11; i++) {
      const accrualDate = getFirstYearMonthlyAccrualDate(hireDate, i);
      if (accrualDate.getFullYear() === displayYear) {
        count++;
        if (count === m) {
          logs.push({
            id: `log-${employee.id}-monthly-${displayYear}-${m}`,
            employeeId: employee.id,
            type: 'first_year_monthly',
            amount: 1,
            date: formatDate(accrualDate),
            description: `${displayYear}년 월차 발생 (입사 대응일)`,
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

  const consumedBefore = formatDate(getConsumptionAsOf());
  const monthlyUsage = getDb()
    .prepare(
      `SELECT usage_type FROM leave_usages
       WHERE status = 'approved'
         AND usage_date < ?
         AND substr(usage_date, 1, 4) = ?
         AND CAST(substr(usage_date, 6, 2) AS INTEGER) = ?`
    )
    .all(consumedBefore, String(thisYear), thisMonth + 1)
    .reduce((sum, u) => sum + (u.usage_type === 'half' ? 0.5 : 1), 0);

  const avgRemaining =
    employees.reduce((sum, e) => sum + e.leaveSummary.remaining, 0) / (employees.length || 1);
  const totalGranted = round1(
    employees.reduce((sum, e) => sum + (Number(e.leaveSummary.totalGranted) || 0), 0)
  );
  const totalUsed = round1(
    employees.reduce((sum, e) => sum + (Number(e.leaveSummary.usedDays) || 0), 0)
  );
  const averageUsageRate = totalGranted > 0 ? round1((totalUsed / totalGranted) * 100) : 0;
  const averageUsed = round1(totalUsed / (employees.length || 1));

  return {
    displayYear,
    totalGranted,
    totalUsed,
    averageUsageRate,
    averageUsed,
    averageRemaining: Math.round(avgRemaining * 10) / 10,
    monthlyUsage,
    firstYearEmployeeCount: employees.filter((e) => e.leaveSummary.isFirstYear).length,
    proratedTargetCount: employees.filter((e) => e.leaveSummary.isProratedTarget).length,
    totalEmployees: employees.length,
  };
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function getSavedMonthReport(year, month) {
  return getDb()
    .prepare('SELECT * FROM leave_month_reports WHERE year = ? AND month = ?')
    .get(year, month);
}

export function getMonthlyLeaveReport(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw Object.assign(new Error('연월을 확인해주세요.'), { status: 400 });
  }

  const range = getReportMonthRange(y, m);
  const rows = getDb()
    .prepare(
      `SELECT e.*, lbs.as_of_date, lbs.display_year, lbs.accrued, lbs.used, lbs.remaining
       FROM employees e
       LEFT JOIN leave_balance_snapshots lbs ON lbs.employee_id = e.id
       WHERE e.hire_date <= ?
         AND (
           (e.is_active = 1 AND (e.terminated_date IS NULL OR e.terminated_date > ?))
           OR (e.terminated_date IS NOT NULL AND e.terminated_date >= ? AND e.terminated_date <= ?)
         )
       ORDER BY e.workplace, e.name`
    )
    .all(range.monthEnd, range.monthEnd, range.monthStart, range.monthEnd);

  const employees = rows.map((row) => {
    const base = toEmployeeBase(row);
    const summary = buildLeaveSummary(row, {
      asOfDate: range.asOf,
      consumptionAsOf: range.consumptionAsOf,
    });
    const approved = getApprovedUsages(row.id);
    const usedInMonth = sumUsageDays(
      approved.filter((usage) => usage.date >= range.monthStart && usage.date <= range.monthEnd)
    );
    const pendingInMonth = sumUsageDays(
      getAllUsages(row.id).filter(
        (usage) =>
          usage.status === 'pending' &&
          usage.date >= range.monthStart &&
          usage.date <= range.monthEnd
      )
    );
    const terminatedInMonth = Boolean(
      row.terminated_date && row.terminated_date >= range.monthStart && row.terminated_date <= range.monthEnd
    );

    return {
      id: base.id,
      empNo: base.empNo || '',
      name: base.name,
      workplace: base.workplace || '미지정',
      workplaceCode: row.workplace_code || '',
      department: base.department,
      position: base.position,
      hireDate: base.hireDate,
      terminatedDate: row.terminated_date || null,
      status: terminatedInMonth ? '당월 퇴사' : '재직',
      accrued: summary.accruedThisYear,
      usedToDate: summary.usedDays,
      usedInMonth,
      remaining: summary.remaining,
      pendingInMonth,
      scheduledDays: summary.scheduledDays || 0,
    };
  });

  const workplaceMap = new Map();
  for (const emp of employees) {
    if (!workplaceMap.has(emp.workplace)) {
      workplaceMap.set(emp.workplace, {
        workplace: emp.workplace,
        workplaceCode: emp.workplaceCode,
        employeeCount: 0,
        accrued: 0,
        usedInMonth: 0,
        remaining: 0,
        pendingInMonth: 0,
        employees: [],
      });
    }
    const group = workplaceMap.get(emp.workplace);
    group.employeeCount += 1;
    group.accrued += emp.accrued;
    group.usedInMonth += emp.usedInMonth;
    group.remaining += emp.remaining;
    group.pendingInMonth += emp.pendingInMonth;
    group.employees.push(emp);
  }

  const workplaces = [...workplaceMap.values()].map((group) => ({
    ...group,
    accrued: round1(group.accrued),
    usedInMonth: round1(group.usedInMonth),
    remaining: round1(group.remaining),
    pendingInMonth: round1(group.pendingInMonth),
  }));

  const totals = workplaces.reduce(
    (acc, group) => ({
      employeeCount: acc.employeeCount + group.employeeCount,
      accrued: round1(acc.accrued + group.accrued),
      usedInMonth: round1(acc.usedInMonth + group.usedInMonth),
      remaining: round1(acc.remaining + group.remaining),
      pendingInMonth: round1(acc.pendingInMonth + group.pendingInMonth),
    }),
    { employeeCount: 0, accrued: 0, usedInMonth: 0, remaining: 0, pendingInMonth: 0 }
  );

  const saved = getSavedMonthReport(y, m);

  return {
    year: y,
    month: m,
    monthStart: range.monthStart,
    asOfDate: range.monthEnd,
    consumptionAsOf: range.nextMonthStart,
    standard: 'IFRS IAS 19',
    note: '월말 미사용 연차(잔여)는 단기종업원급여 부채 산정 기초입니다. 금액은 일급을 곱해 회계에서 계산합니다.',
    totals,
    workplaces,
    saved: saved
      ? {
          generatedAt: saved.generated_at,
          generatedBy: saved.generated_by ? String(saved.generated_by) : null,
        }
      : null,
  };
}

export function saveMonthlyLeaveReport(year, month, generatedBy) {
  const report = getMonthlyLeaveReport(year, month);
  getDb()
    .prepare(
      `INSERT INTO leave_month_reports (year, month, as_of_date, generated_by, payload, generated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(year, month) DO UPDATE SET
         as_of_date = excluded.as_of_date,
         generated_by = excluded.generated_by,
         payload = excluded.payload,
         generated_at = excluded.generated_at`
    )
    .run(report.year, report.month, report.asOfDate, generatedBy || null, JSON.stringify(report));

  return {
    ...report,
    saved: {
      generatedAt: getSavedMonthReport(report.year, report.month)?.generated_at,
      generatedBy: generatedBy ? String(generatedBy) : null,
    },
  };
}

export function getSavedMonthlyLeaveReport(year, month) {
  const saved = getSavedMonthReport(Number(year), Number(month));
  if (!saved) return null;
  try {
    const payload = JSON.parse(saved.payload);
    return {
      ...payload,
      saved: {
        generatedAt: saved.generated_at,
        generatedBy: saved.generated_by ? String(saved.generated_by) : null,
      },
    };
  } catch {
    return null;
  }
}

/** 월 통상임금 → 일급 환산 기준 시간(근로기준법 통상 월 소정근로시간) */
export const ORDINARY_WAGE_HOURS = 209;

function roundMoney(value) {
  return Math.round(Number(value) || 0);
}

function getSavedPaySettlement(year, month) {
  return getDb()
    .prepare('SELECT * FROM leave_pay_settlements WHERE year = ? AND month = ?')
    .get(year, month);
}

export function updateEmployeeOrdinaryWage(employeeId, ordinaryWage) {
  const dbId = parseEmployeeId(employeeId);
  if (!dbId) throw Object.assign(new Error('유효하지 않은 직원 ID입니다.'), { status: 400 });
  const emp = getDb().prepare('SELECT id FROM employees WHERE id = ?').get(dbId);
  if (!emp) throw Object.assign(new Error('직원을 찾을 수 없습니다.'), { status: 404 });

  const wage = ordinaryWage === '' || ordinaryWage == null ? null : Number(ordinaryWage);
  if (wage != null && (!Number.isFinite(wage) || wage < 0)) {
    throw Object.assign(new Error('통상임금은 0 이상의 숫자로 입력해주세요.'), { status: 400 });
  }

  getDb()
    .prepare(
      `UPDATE employees
       SET ordinary_wage = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(wage, dbId);

  return {
    id: String(dbId),
    ordinaryWage: wage,
  };
}

function normalizeEmpNo(value) {
  return String(value ?? '')
    .trim()
    .replace(/^'|'$/g, '');
}

function parseOrdinaryWageValue(value) {
  if (value == null) return { skip: true, wage: null };
  const raw = String(value).trim().replace(/,/g, '');
  if (raw === '') return { skip: true, wage: null };
  const wage = Number(raw);
  if (!Number.isFinite(wage) || wage < 0) {
    throw Object.assign(new Error(`통상임금 값이 올바르지 않습니다: ${value}`), { status: 400 });
  }
  return { skip: false, wage };
}

/** 통상임금 업로드 양식 (사번 기준) */
export function getOrdinaryWageTemplate() {
  const rows = getDb()
    .prepare(
      `SELECT emp_no, name, ordinary_wage, workplace, department, is_active
       FROM employees
       WHERE emp_no IS NOT NULL AND TRIM(emp_no) != ''
       ORDER BY is_active DESC, workplace, name`
    )
    .all();

  return {
    headers: ['사번', '이름', '월통상임금', '사업장', '부서', '재직'],
    rows: rows.map((row) => ({
      empNo: row.emp_no,
      name: row.name,
      ordinaryWage: row.ordinary_wage == null ? '' : Number(row.ordinary_wage),
      workplace: row.workplace || '',
      department: row.department || '',
      active: row.is_active ? 'Y' : 'N',
    })),
  };
}

/**
 * 사번 기준 통상임금 일괄 반영
 * - 월통상임금 칸이 비어 있으면 해당 행은 건너뜀
 */
export function bulkUpdateOrdinaryWagesByEmpNo(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('업로드할 행이 없습니다.'), { status: 400 });
  }

  const db = getDb();
  const findByEmpNo = db.prepare(
    `SELECT id, emp_no, name FROM employees WHERE lower(emp_no) = lower(?) LIMIT 1`
  );
  const updateWage = db.prepare(
    `UPDATE employees
     SET ordinary_wage = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  );

  const updated = [];
  const skipped = [];
  const missing = [];
  const errors = [];
  const seen = new Set();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] || {};
    const empNo = normalizeEmpNo(item.empNo ?? item.사번);
    const line = i + 2; // header = 1

    if (!empNo) {
      skipped.push({ line, reason: '사번 없음' });
      continue;
    }
    if (seen.has(empNo.toLowerCase())) {
      skipped.push({ line, empNo, reason: '중복 사번' });
      continue;
    }
    seen.add(empNo.toLowerCase());

    let parsed;
    try {
      parsed = parseOrdinaryWageValue(item.ordinaryWage ?? item.월통상임금 ?? item.통상임금);
    } catch (error) {
      errors.push({ line, empNo, reason: error.message });
      continue;
    }
    if (parsed.skip) {
      skipped.push({ line, empNo, reason: '통상임금 미입력' });
      continue;
    }

    const emp = findByEmpNo.get(empNo);
    if (!emp) {
      missing.push({ line, empNo });
      continue;
    }

    updateWage.run(parsed.wage, emp.id);
    updated.push({
      id: String(emp.id),
      empNo: emp.emp_no,
      name: emp.name,
      ordinaryWage: parsed.wage,
    });
  }

  if (updated.length === 0 && errors.length === 0 && missing.length === 0) {
    throw Object.assign(new Error('반영할 통상임금 행이 없습니다. 사번과 월통상임금을 확인해 주세요.'), {
      status: 400,
    });
  }

  return {
    updatedCount: updated.length,
    skippedCount: skipped.length,
    missingCount: missing.length,
    errorCount: errors.length,
    updated,
    skipped,
    missing,
    errors,
  };
}

export function getLeavePaySettlement(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw Object.assign(new Error('연월을 확인해주세요.'), { status: 400 });
  }

  const range = getReportMonthRange(y, m);
  const rows = getDb()
    .prepare(
      `SELECT e.*, lbs.as_of_date, lbs.display_year, lbs.accrued, lbs.used, lbs.remaining
       FROM employees e
       LEFT JOIN leave_balance_snapshots lbs ON lbs.employee_id = e.id
       WHERE e.hire_date <= ?
         AND (
           (e.is_active = 1 AND (e.terminated_date IS NULL OR e.terminated_date > ?))
           OR (e.terminated_date IS NOT NULL AND e.terminated_date >= ? AND e.terminated_date <= ?)
         )
       ORDER BY e.workplace, e.name`
    )
    .all(range.monthEnd, range.monthEnd, range.monthStart, range.monthEnd);

  const employees = rows.map((row) => {
    const base = toEmployeeBase(row);
    const summary = buildLeaveSummary(row, {
      asOfDate: range.asOf,
      consumptionAsOf: range.consumptionAsOf,
    });
    const ordinaryWage = row.ordinary_wage == null ? null : Number(row.ordinary_wage);
    const remaining = getPayableLeaveDays(summary.remaining);
    const overusedDays = Number(summary.overusedDays) || 0;
    const dailyRate =
      ordinaryWage != null && ordinaryWage > 0
        ? Math.round((ordinaryWage / ORDINARY_WAGE_HOURS) * 100) / 100
        : null;
    const allowance =
      dailyRate != null ? roundMoney(dailyRate * remaining) : ordinaryWage != null ? 0 : null;
    const terminatedInMonth = Boolean(
      row.terminated_date && row.terminated_date >= range.monthStart && row.terminated_date <= range.monthEnd
    );

    return {
      id: base.id,
      empNo: base.empNo || '',
      name: base.name,
      workplace: base.workplace || '미지정',
      workplaceCode: row.workplace_code || '',
      department: base.department,
      position: base.position,
      hireDate: base.hireDate,
      terminatedDate: row.terminated_date || null,
      status: terminatedInMonth ? '당월 퇴사' : '재직',
      remaining: round1(remaining),
      overusedDays: round1(overusedDays),
      carryInDays: round1(summary.carryInDays || 0),
      ordinaryWage,
      dailyRate,
      allowance,
      wageMissing: ordinaryWage == null,
    };
  });

  const workplaceMap = new Map();
  for (const emp of employees) {
    if (!workplaceMap.has(emp.workplace)) {
      workplaceMap.set(emp.workplace, {
        workplace: emp.workplace,
        workplaceCode: emp.workplaceCode,
        employeeCount: 0,
        remaining: 0,
        allowance: 0,
        wageMissingCount: 0,
        employees: [],
      });
    }
    const group = workplaceMap.get(emp.workplace);
    group.employeeCount += 1;
    group.remaining += emp.remaining;
    group.allowance += emp.allowance || 0;
    if (emp.wageMissing) group.wageMissingCount += 1;
    group.employees.push(emp);
  }

  const workplaces = [...workplaceMap.values()].map((group) => ({
    ...group,
    remaining: round1(group.remaining),
    allowance: roundMoney(group.allowance),
  }));

  const totals = workplaces.reduce(
    (acc, group) => ({
      employeeCount: acc.employeeCount + group.employeeCount,
      remaining: round1(acc.remaining + group.remaining),
      allowance: roundMoney(acc.allowance + group.allowance),
      wageMissingCount: acc.wageMissingCount + group.wageMissingCount,
    }),
    { employeeCount: 0, remaining: 0, allowance: 0, wageMissingCount: 0 }
  );

  const saved = getSavedPaySettlement(y, m);

  return {
    year: y,
    month: m,
    asOfDate: range.monthEnd,
    wageHours: ORDINARY_WAGE_HOURS,
    formula: `연차부채 = (월 통상임금 ÷ ${ORDINARY_WAGE_HOURS}) × max(0, 잔여일수)`,
    note: '월말 미사용 연차가 0보다 작으면 부채 일수는 0으로 둡니다. 초과 사용분은 연차 정산에서 다음 주기로 이월 차감합니다.',
    totals,
    workplaces,
    saved: saved
      ? {
          generatedAt: saved.generated_at,
          generatedBy: saved.generated_by ? String(saved.generated_by) : null,
        }
      : null,
  };
}

export function saveLeavePaySettlement(year, month, generatedBy) {
  const settlement = getLeavePaySettlement(year, month);
  getDb()
    .prepare(
      `INSERT INTO leave_pay_settlements (year, month, as_of_date, generated_by, payload, generated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(year, month) DO UPDATE SET
         as_of_date = excluded.as_of_date,
         generated_by = excluded.generated_by,
         payload = excluded.payload,
         generated_at = excluded.generated_at`
    )
    .run(
      settlement.year,
      settlement.month,
      settlement.asOfDate,
      generatedBy || null,
      JSON.stringify(settlement)
    );

  return {
    ...settlement,
    saved: {
      generatedAt: getSavedPaySettlement(settlement.year, settlement.month)?.generated_at,
      generatedBy: generatedBy ? String(generatedBy) : null,
    },
  };
}

export function getSavedLeavePaySettlement(year, month) {
  const saved = getSavedPaySettlement(Number(year), Number(month));
  if (!saved) return null;
  try {
    const payload = JSON.parse(saved.payload);
    return {
      ...payload,
      saved: {
        generatedAt: saved.generated_at,
        generatedBy: saved.generated_by ? String(saved.generated_by) : null,
      },
    };
  } catch {
    return null;
  }
}

const EVENT_TYPE_LABELS = {
  first_year: '입사 1년',
  prorated: '회계기준 전환',
  fiscal_annual: '회계기준일',
  resignation: '중도 퇴사',
};

function eventTypeLabel(type) {
  return EVENT_TYPE_LABELS[type] || type;
}

function toDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return formatDate(value);
}

function toLocalDate(value) {
  const key = toDateKey(value);
  if (!key) return new Date(NaN);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function closingPeriodStart(hireDate, eventType, eventDate) {
  if (eventType === 'first_year') return String(hireDate).slice(0, 10);
  if (eventType === 'prorated') return toDateKey(getOneYearAnniversary(hireDate));
  const periodEnd = getPreviousDate(eventDate);
  return `${periodEnd.getFullYear()}-01-01`;
}

function snapshotCoversPeriod(row, periodStart, periodEndKey) {
  if (!hasImportedSnapshot(row) || !row.as_of_date) return false;
  const snap = String(row.as_of_date).slice(0, 10);
  return snap >= periodStart && snap <= periodEndKey;
}

function getSavedEventSettlement(year) {
  return getDb().prepare('SELECT * FROM leave_event_settlements WHERE year = ?').get(year);
}

function listEventSettlementYears() {
  const current = getConsumptionAsOf().getFullYear();
  const bounds = getDb()
    .prepare(
      `SELECT
         MIN(CASE WHEN terminated_date IS NOT NULL THEN substr(terminated_date, 1, 4) END) AS min_term,
         MAX(CASE WHEN terminated_date IS NOT NULL THEN substr(terminated_date, 1, 4) END) AS max_term
       FROM employees`
    )
    .get();
  const minTerm = Number(bounds?.min_term);
  const maxTerm = Number(bounds?.max_term) || current;
  // 정기·전환 정산은 현재 시점 이후만 보여 주므로 연도 기본은 올해부터.
  // 입사 1년은 일사일 다음 달 8일(급여일)까지 정산하므로 전년도도 포함.
  // 중도 퇴사는 과거 연도도 조회할 수 있게 퇴사 이력이 있는 연도까지 포함.
  const start = Number.isFinite(minTerm) ? Math.min(current - 1, minTerm) : current - 1;
  const end = Math.max(current + 2, maxTerm);
  const years = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

/**
 * 연차 정산(수당 지급) 대상
 * - 선택 연도 내 도래하는 정산 시점(미래 포함)을 연말 기준으로 미리 표시
 * - 입사 1년(월차 정산)
 * - 회계기준 전환(비례) / 회계기준일(정규)
 * - 1/1 입사: 일사일 정산 후 바로 회계연도(정규) 전환
 * - 중도 퇴사(퇴사일 잔여) — 과거 연도의 퇴사자(is_active=0)도 해당 연도에서 계산
 * - 입사 1년은 일사일 다음 달 8일(급여일)까지 정산 가능. 그 외 회계전환·회계기준일은 현재 시점 이전은 제외
 * 매월 정산하지 않음.
 */
export function getLeaveEventSettlement(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw Object.assign(new Error('연도를 확인해주세요.'), { status: 400 });
  }

  const yearStart = `${y}-01-01`;
  const yearEnd = `${y}-12-31`;
  // 해당 연도에 도래하는 모든 정산(아직 오지 않은 미래 시점 포함)을 보이도록 연말 기준
  const asOf = new Date(y, 11, 31);
  const todayKey = toDateKey(getConsumptionAsOf());

  // 연중 재직자 + 해당 연도 퇴사자(과거 퇴사·비활성 포함). 퇴사일이 연초 이전인 사람만 제외.
  const rows = getDb()
    .prepare(
      `SELECT e.*, lbs.as_of_date, lbs.display_year, lbs.accrued, lbs.used, lbs.remaining
       FROM employees e
       LEFT JOIN leave_balance_snapshots lbs ON lbs.employee_id = e.id
       WHERE e.hire_date IS NOT NULL
         AND substr(e.hire_date, 1, 10) <= ?
         AND (
           e.terminated_date IS NULL
           OR substr(e.terminated_date, 1, 10) >= ?
         )
       ORDER BY e.workplace, e.name`
    )
    .all(yearEnd, yearStart);

  const items = [];
  const workplaceCatalog = new Map();

  for (const row of rows) {
    const workplaceName = row.workplace || '미지정';
    if (!workplaceCatalog.has(workplaceName)) {
      workplaceCatalog.set(workplaceName, {
        workplace: workplaceName,
        workplaceCode: row.workplace_code || '',
      });
    }
    const base = toEmployeeBase(row);
    const ordinaryWage = row.ordinary_wage == null ? null : Number(row.ordinary_wage);
    const dailyRate =
      ordinaryWage != null && ordinaryWage > 0
        ? Math.round((ordinaryWage / ORDINARY_WAGE_HOURS) * 100) / 100
        : null;
    const terminatedDate = row.terminated_date ? String(row.terminated_date).slice(0, 10) : null;

    const events = [];

    for (const event of getSettlementEventsInYear(row.hire_date, y, asOf)) {
      const eventDate = toDateKey(event.date);
      // 퇴사일 이후 도래하는 부여 정산은 제외 (퇴사 정산으로 갈음)
      if (terminatedDate && eventDate > terminatedDate) continue;
      const payrollDate =
        event.type === 'first_year' ? toDateKey(getFirstYearPayrollDate(eventDate)) : null;
      // 입사 1년: 일사일 다음 달 8일(급여일)까지는 기간이 지나도 정산
      if (event.type === 'first_year') {
        if (payrollDate && payrollDate < todayKey) continue;
      } else if (eventDate < todayKey) {
        // 회계전환·회계기준일은 이미 지난 시점이면 정산 완료로 보고 제외
        continue;
      }

      // 정산일수 = 전기(전년도·이전 주기) 사용 후 잔여. 부여일이 아님.
      const periodEnd = getPreviousDate(eventDate);
      const periodEndKey = toDateKey(periodEnd);
      const periodStart = closingPeriodStart(row.hire_date, event.type, eventDate);
      const useSnapshot = snapshotCoversPeriod(row, periodStart, periodEndKey);
      const summary = buildLeaveSummary(row, {
        asOfDate: periodEnd,
        consumptionAsOf: toLocalDate(eventDate),
        skipSnapshot: !useSnapshot,
        skipSettledDeduction: true,
        skipCarryIn: useSnapshot,
      });
      const raw = Number(summary.rawRemaining ?? summary.remaining) || 0;
      const overusedDays = getOverusedLeaveDays(raw);
      const grantDays = round1(event.settledDays);
      const usedDays = round1(summary.usedDays || 0);
      const settledDays = getPayableLeaveDays(raw);
      const isUpcoming = eventDate > todayKey;
      const inPayrollWindow = Boolean(payrollDate && eventDate <= todayKey && payrollDate >= todayKey);
      const statusLabel = isUpcoming ? '도래 예정' : inPayrollWindow ? '급여일 대기' : '도래';
      const payrollNote = payrollDate ? ` · 급여일 ${payrollDate}까지 정산` : '';
      const description =
        overusedDays > 0
          ? `${event.description} · 전기 초과사용 ${overusedDays}일 다음 주기 이월 차감${payrollNote}`
          : `${event.description} · 전기 잔여 ${settledDays}일 (부여 ${grantDays}일 − 사용 ${usedDays}일)${payrollNote}`;
      events.push({
        type: event.type,
        typeLabel: eventTypeLabel(event.type),
        date: eventDate,
        grantDays,
        settledDays,
        overusedDays,
        carryInDays: round1(summary.carryInDays || 0),
        description,
        basis: event.basis,
        isUpcoming,
        inPayrollWindow,
        payrollDate,
        statusLabel,
      });
    }

    if (terminatedDate && terminatedDate >= yearStart && terminatedDate <= yearEnd) {
      const summary = buildLeaveSummary(row, {
        asOfDate: new Date(terminatedDate),
        consumptionAsOf: new Date(terminatedDate),
      });
      const raw = Number(summary.rawRemaining ?? summary.remaining) || 0;
      const payableDays = getPayableLeaveDays(raw);
      const overusedDays = getOverusedLeaveDays(raw);
      const isUpcoming = terminatedDate > todayKey;
      events.push({
        type: 'resignation',
        typeLabel: eventTypeLabel('resignation'),
        date: terminatedDate,
        grantDays: null,
        settledDays: payableDays,
        overusedDays,
        carryInDays: round1(summary.carryInDays || 0),
        description:
          overusedDays > 0
            ? `중도 퇴사 정산 · 초과사용 ${overusedDays}일 다음 주기 이월 차감`
            : '중도 퇴사 정산 (퇴사일 잔여)',
        basis: 'resignation',
        isUpcoming,
        statusLabel: isUpcoming ? '도래 예정' : '도래',
      });
    }

    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    for (const event of events) {
      const allowance =
        dailyRate != null ? roundMoney(dailyRate * event.settledDays) : ordinaryWage != null ? 0 : null;
      items.push({
        id: `${base.id}-${event.type}-${event.date}`,
        employeeId: base.id,
        empNo: base.empNo || '',
        name: base.name,
        workplace: base.workplace || '미지정',
        workplaceCode: row.workplace_code || '',
        department: base.department,
        position: base.position,
        hireDate: base.hireDate,
        terminatedDate,
        eventType: event.type,
        eventTypeLabel: event.typeLabel,
        eventDate: event.date,
        description: event.description,
        basis: event.basis,
        grantDays: event.grantDays,
        settledDays: event.settledDays,
        overusedDays: event.overusedDays,
        carryInDays: event.carryInDays,
        isUpcoming: event.isUpcoming,
        inPayrollWindow: Boolean(event.inPayrollWindow),
        payrollDate: event.payrollDate || null,
        statusLabel: event.statusLabel,
        ordinaryWage,
        dailyRate,
        allowance,
        wageMissing: ordinaryWage == null,
      });
    }
  }

  const workplaceMap = new Map();
  for (const item of items) {
    if (!workplaceMap.has(item.workplace)) {
      workplaceMap.set(item.workplace, {
        workplace: item.workplace,
        workplaceCode: item.workplaceCode,
        eventCount: 0,
        settledDays: 0,
        allowance: 0,
        wageMissingCount: 0,
        employees: [],
      });
    }
    const group = workplaceMap.get(item.workplace);
    group.eventCount += 1;
    group.settledDays += item.settledDays;
    group.allowance += item.allowance || 0;
    if (item.wageMissing) group.wageMissingCount += 1;
    group.employees.push(item);
  }

  const workplaces = [...workplaceMap.values()].map((group) => ({
    ...group,
    settledDays: round1(group.settledDays),
    allowance: roundMoney(group.allowance),
  }));

  const totals = workplaces.reduce(
    (acc, group) => ({
      eventCount: acc.eventCount + group.eventCount,
      employeeCount: acc.employeeCount + new Set(group.employees.map((e) => e.employeeId)).size,
      settledDays: round1(acc.settledDays + group.settledDays),
      allowance: roundMoney(acc.allowance + group.allowance),
      wageMissingCount: acc.wageMissingCount + group.wageMissingCount,
    }),
    { eventCount: 0, employeeCount: 0, settledDays: 0, allowance: 0, wageMissingCount: 0 }
  );

  // employeeCount across workplaces can double-count if we sum sets per group — recompute uniquely
  totals.employeeCount = new Set(items.map((item) => item.employeeId)).size;

  const saved = getSavedEventSettlement(y);

  return {
    year: y,
    asOfDate: yearEnd,
    wageHours: ORDINARY_WAGE_HOURS,
    formula: `연차수당 = (월 통상임금 ÷ ${ORDINARY_WAGE_HOURS}) × max(0, 전기 잔여)`,
    note: '정산일수는 해당 시점에 새로 발생하는 부여일이 아니라, 전년도·이전 주기에 사용하고 남은 잔여입니다. 잔여가 0 미만이면 수당 0, 초과분은 다음 주기로 이월 차감됩니다. 입사 1년·회계전환·회계기준일은 현재 이후 도래 대상만 표시하고, 중도 퇴사는 과거 연도도 조회할 수 있습니다.',
    note: '입사 1년 정산은 일사일 다음 달 8일(급여일)까지 계산할 수 있습니다. 회계기준 전환·회계기준일은 현재 시점 이후 도래 대상만 보여 주고, 이미 지난 정산은 완료된 것으로 봅니다. 중도 퇴사는 과거 연도의 퇴사자도 해당 연도를 선택하면 계산됩니다.',
    availableYears: listEventSettlementYears(),
    eventTypes: [
      { value: 'first_year', label: '입사 1년' },
      { value: 'prorated', label: '회계기준 전환' },
      { value: 'fiscal_annual', label: '회계기준일' },
      { value: 'resignation', label: '중도 퇴사' },
    ],
    totals,
    workplaces,
    workplaceOptions: [...workplaceCatalog.values()],
    saved: saved
      ? {
          generatedAt: saved.generated_at,
          generatedBy: saved.generated_by ? String(saved.generated_by) : null,
        }
      : null,
  };
}

export function saveLeaveEventSettlement(year, generatedBy) {
  const settlement = getLeaveEventSettlement(year);
  getDb()
    .prepare(
      `INSERT INTO leave_event_settlements (year, as_of_date, generated_by, payload, generated_at)
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(year) DO UPDATE SET
         as_of_date = excluded.as_of_date,
         generated_by = excluded.generated_by,
         payload = excluded.payload,
         generated_at = excluded.generated_at`
    )
    .run(settlement.year, settlement.asOfDate, generatedBy || null, JSON.stringify(settlement));

  return {
    ...settlement,
    saved: {
      generatedAt: getSavedEventSettlement(settlement.year)?.generated_at,
      generatedBy: generatedBy ? String(generatedBy) : null,
    },
  };
}

export function getSavedLeaveEventSettlement(year) {
  const saved = getSavedEventSettlement(Number(year));
  if (!saved) return null;
  try {
    const payload = JSON.parse(saved.payload);
    return {
      ...payload,
      saved: {
        generatedAt: saved.generated_at,
        generatedBy: saved.generated_by ? String(saved.generated_by) : null,
      },
    };
  } catch {
    return null;
  }
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

  const dates = listLeaveRequestDates(startDate, endDate);
  if (!dates.length) {
    const blocked = leaveBlockedReason(startDate) || leaveBlockedReason(endDate);
    throw httpError(
      blocked ||
        (type === 'full'
          ? '선택한 기간에 신청할 평일이 없습니다. 주말·공휴일은 제외됩니다.'
          : '반차는 평일에만 사용할 수 있습니다. 주말·공휴일은 제외됩니다.')
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

  mailService.notifyLeaveSubmitted(employee, items, approvalHint).catch((error) => {
    console.error('[mail] notifyLeaveSubmitted:', error.message);
  });

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
  const mapped = mapUsageRow(updated);
  const approvalHint =
    updated.status === 'pending' ? approvalService.approvalHintFor(requester, updated.approval_step) : null;

  if (updated.status === 'rejected') {
    mailService.notifyLeaveFinal(requester, mapped, 'reject', updated.reject_reason).catch((error) => {
      console.error('[mail] notifyLeaveFinal:', error.message);
    });
  } else if (updated.status === 'approved') {
    mailService.notifyLeaveFinal(requester, mapped, 'approve').catch((error) => {
      console.error('[mail] notifyLeaveFinal:', error.message);
    });
  } else if (updated.status === 'pending') {
    mailService.notifyLeaveAdvanced(requester, mapped, approvalHint).catch((error) => {
      console.error('[mail] notifyLeaveAdvanced:', error.message);
    });
  }

  return {
    ...mapped,
    approvalHint,
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
  if (!isValidLeaveDate(data.date)) throw new Error('날짜를 확인해주세요.');
  const blocked = leaveBlockedReason(data.date);
  if (blocked) throw httpError(blocked);

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
  if (!isValidLeaveDate(data.date)) throw new Error('날짜를 확인해주세요.');
  const blocked = leaveBlockedReason(data.date);
  if (blocked) throw httpError(blocked);

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
