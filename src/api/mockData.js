import {
  calculateLeaveBalance,
  formatDate,
  getOneYearAnniversary,
  getCurrentDisplayYear,
  getMonthlyAccrualInYear,
  filterUsagesByYear,
  FISCAL_YEAR_START_MONTH,
} from '../utils/leaveCalculations';
import { parseISO } from 'date-fns';
import { describeLeaveDates, listLeaveRequestDates } from '../utils/leaveRequestDates';

const TODAY = new Date('2026-07-10');
const DISPLAY_YEAR = getCurrentDisplayYear(TODAY);

const employees = [
  {
    id: 'emp-001',
    name: '김민수',
    department: '개발팀',
    position: '선임',
    hireDate: '2025-08-15',
    email: 'minsu.kim@company.com',
  },
  {
    id: 'emp-002',
    name: '이지은',
    department: '디자인팀',
    position: '주임',
    hireDate: '2024-03-01',
    email: 'jieun.lee@company.com',
  },
  {
    id: 'emp-003',
    name: '박준혁',
    department: '인사팀',
    position: '대리',
    hireDate: '2020-01-10',
    email: 'junhyuk.park@company.com',
  },
  {
    id: 'emp-004',
    name: '최수연',
    department: '마케팅팀',
    position: '사원',
    hireDate: '2025-11-01',
    email: 'sooyeon.choi@company.com',
  },
  {
    id: 'emp-005',
    name: '정태호',
    department: '개발팀',
    position: '팀장',
    hireDate: '2018-06-20',
    email: 'taeho.jung@company.com',
  },
];

const leaveUsages = [
  { id: 'use-001', employeeId: 'emp-001', date: '2026-01-20', type: 'full', reason: '개인 사유', status: 'approved' },
  { id: 'use-002', employeeId: 'emp-001', date: '2026-03-10', type: 'half', reason: '병원 방문', status: 'approved' },
  { id: 'use-003', employeeId: 'emp-002', date: '2026-02-14', type: 'full', reason: '가족 행사', status: 'approved' },
  { id: 'use-004', employeeId: 'emp-002', date: '2026-05-02', type: 'half', reason: '개인 용무', status: 'approved' },
  { id: 'use-005', employeeId: 'emp-003', date: '2026-04-15', type: 'full', reason: '휴가', status: 'approved' },
  { id: 'use-006', employeeId: 'emp-003', date: '2026-06-01', type: 'full', reason: '여행', status: 'approved' },
  { id: 'use-007', employeeId: 'emp-005', date: '2026-07-01', type: 'half', reason: '건강검진', status: 'approved' },
];

/** 관리자 수동 입력 연차 발생 */
const manualAccruals = [];

function getManualAccrualsForEmployee(employeeId, year = DISPLAY_YEAR) {
  return manualAccruals.filter(
    (a) => a.employeeId === employeeId && parseISO(a.date).getFullYear() === year
  );
}

function getManualAccrualTotal(employeeId, year = DISPLAY_YEAR) {
  return getManualAccrualsForEmployee(employeeId, year).reduce((sum, a) => sum + a.amount, 0);
}

function buildAutoAccrualLogs(employee) {
  const logs = [];
  const hireDate = employee.hireDate;
  const approvedUsages = leaveUsages.filter(
    (u) => u.employeeId === employee.id && u.status === 'approved'
  );
  const balance = calculateLeaveBalance(hireDate, approvedUsages, TODAY);

  const monthlyInYear = getMonthlyAccrualInYear(hireDate, DISPLAY_YEAR, TODAY);
  const hire = new Date(hireDate);
  for (let m = 1; m <= monthlyInYear; m++) {
    let count = 0;
    for (let i = 1; i <= 11; i++) {
      const accrualDate = new Date(hire.getFullYear(), hire.getMonth() + i, 1);
      if (accrualDate.getFullYear() === DISPLAY_YEAR) {
        count++;
        if (count === m) {
          logs.push({
            id: `log-${employee.id}-monthly-${DISPLAY_YEAR}-${m}`,
            employeeId: employee.id,
            type: 'first_year_monthly',
            amount: 1,
            date: formatDate(accrualDate),
            description: `${DISPLAY_YEAR}년 월차 발생`,
            isManual: false,
          });
          break;
        }
      }
    }
  }

  if (balance.proratedLeave > 0 && getOneYearAnniversary(hireDate).getFullYear() === DISPLAY_YEAR) {
    logs.push({
      id: `log-${employee.id}-prorated`,
      employeeId: employee.id,
      type: 'prorated',
      amount: balance.proratedLeave,
      date: formatDate(getOneYearAnniversary(hireDate)),
      description: `${DISPLAY_YEAR}년 비례 연차 (15 × 남은일수/365)`,
      isManual: false,
    });
  }

  if (balance.annualLeave > 0) {
    logs.push({
      id: `log-${employee.id}-annual-${DISPLAY_YEAR}`,
      employeeId: employee.id,
      type: 'annual',
      amount: balance.annualLeave,
      date: formatDate(new Date(DISPLAY_YEAR, FISCAL_YEAR_START_MONTH, 1)),
      description: `${DISPLAY_YEAR}년 정규 연차 (기본 15일 + 근속 가산)`,
      isManual: false,
    });
  }

  balance.settlements.forEach((s, i) => {
    logs.push({
      id: `log-${employee.id}-settlement-${i}`,
      employeeId: employee.id,
      type: 'settlement',
      amount: -s.settledDays,
      date: formatDate(s.date),
      description: `${DISPLAY_YEAR}년 ${s.description} · 잔여에서 ${s.settledDays}일 차감`,
      isManual: false,
    });
  });

  return logs;
}

function buildAccrualLogs(employee) {
  const auto = buildAutoAccrualLogs(employee);
  const manual = getManualAccrualsForEmployee(employee.id).map((a) => ({
    ...a,
    isManual: true,
  }));
  return [...auto, ...manual].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function buildLeaveSummary(employee) {
  const usages = leaveUsages.filter((u) => u.employeeId === employee.id && u.status === 'approved');
  const manualTotal = getManualAccrualTotal(employee.id);
  const balance = calculateLeaveBalance(employee.hireDate, usages, TODAY, { manualAccrualTotal: manualTotal });

  return {
    employeeId: employee.id,
    ...balance,
    manualAccrualTotal: manualTotal,
  };
}

function filterUsagesForYear(employeeId) {
  const usages = leaveUsages.filter((u) => u.employeeId === employeeId);
  return filterUsagesByYear(usages, DISPLAY_YEAR);
}

export function getMockEmployees() {
  return employees.map((emp) => ({
    ...emp,
    leaveSummary: buildLeaveSummary(emp),
  }));
}

export function getMockEmployeeById(id) {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return null;
  return {
    ...emp,
    leaveSummary: buildLeaveSummary(emp),
    accrualLogs: buildAccrualLogs(emp),
    usages: filterUsagesForYear(id),
  };
}

export function getMockCurrentEmployee() {
  return getMockEmployeeById('emp-001');
}

export function getMockAdminStats() {
  const all = getMockEmployees();
  const avgRemaining =
    all.reduce((sum, e) => sum + e.leaveSummary.remaining, 0) / all.length;

  const thisMonth = TODAY.getMonth();
  const thisYear = TODAY.getFullYear();
  const monthlyUsage = leaveUsages
    .filter((u) => {
      const d = new Date(u.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear && u.status === 'approved';
    })
    .reduce((sum, u) => sum + (u.type === 'half' ? 0.5 : 1), 0);

  const totalGranted = Math.round(all.reduce((sum, e) => sum + (e.leaveSummary.totalGranted || 0), 0) * 10) / 10;
  const totalUsed = Math.round(all.reduce((sum, e) => sum + (e.leaveSummary.usedDays || 0), 0) * 10) / 10;

  return {
    displayYear: DISPLAY_YEAR,
    totalGranted,
    totalUsed,
    averageUsageRate: totalGranted > 0 ? Math.round((totalUsed / totalGranted) * 1000) / 10 : 0,
    averageUsed: Math.round((totalUsed / (all.length || 1)) * 10) / 10,
    averageRemaining: Math.round(avgRemaining * 10) / 10,
    monthlyUsage,
    firstYearEmployeeCount: all.filter((e) => e.leaveSummary.isFirstYear).length,
    proratedTargetCount: all.filter((e) => e.leaveSummary.isProratedTarget).length,
    totalEmployees: all.length,
  };
}

export function getMockLeaveHistory(employeeId) {
  const emp = getMockEmployeeById(employeeId);
  return emp?.accrualLogs || [];
}

export function getMockLeaveUsages(employeeId) {
  return filterUsagesForYear(employeeId);
}

export function getMockAdminAccruals(employeeId) {
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) return [];
  return buildAccrualLogs(emp);
}

export function getMockAdminUsages(employeeId) {
  return leaveUsages.filter((u) => u.employeeId === employeeId && parseISO(u.date).getFullYear() === DISPLAY_YEAR);
}

export function addMockLeaveRequest(request) {
  const startDate = request.startDate || request.date;
  const endDate = request.type === 'half' ? startDate : request.endDate || request.date || startDate;
  const dates =
    request.type === 'half'
      ? [startDate]
      : listLeaveRequestDates(startDate, endDate);
  const created = dates.map((date, index) => ({
    id: `use-${Date.now()}-${index}`,
    employeeId: request.employeeId,
    date,
    type: request.type,
    reason: request.reason,
    status: 'pending',
  }));
  leaveUsages.push(...created);
  return {
    ...created[0],
    dates,
    items: created,
    count: created.length,
    message: `${request.type === 'half' ? '반차 0.5일' : `${created.length}일`} 연차 신청이 접수되었습니다. ${describeLeaveDates(dates)} · 승인을 기다려주세요`,
  };
}

export function createMockAccrual(data) {
  const item = {
    id: `manual-${Date.now()}`,
    employeeId: data.employeeId,
    type: data.type,
    amount: data.amount,
    date: data.date,
    description: data.description,
    isManual: true,
  };
  manualAccruals.push(item);
  return item;
}

export function updateMockAccrual(id, data) {
  const idx = manualAccruals.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('수동 발생 내역을 찾을 수 없습니다.');
  manualAccruals[idx] = { ...manualAccruals[idx], ...data, isManual: true };
  return manualAccruals[idx];
}

export function deleteMockAccrual(id) {
  const idx = manualAccruals.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('수동 발생 내역을 찾을 수 없습니다.');
  manualAccruals.splice(idx, 1);
}

export function createMockUsage(data) {
  const item = {
    id: `use-${Date.now()}`,
    employeeId: data.employeeId,
    date: data.date,
    type: data.type,
    reason: data.reason,
    status: data.status || 'approved',
  };
  leaveUsages.push(item);
  return item;
}

export function updateMockUsage(id, data) {
  const idx = leaveUsages.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('사용 내역을 찾을 수 없습니다.');
  leaveUsages[idx] = { ...leaveUsages[idx], ...data };
  return leaveUsages[idx];
}

export function deleteMockUsage(id) {
  const idx = leaveUsages.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('사용 내역을 찾을 수 없습니다.');
  leaveUsages.splice(idx, 1);
}
