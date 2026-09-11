import {
  differenceInDays,
  addYears,
  addDays,
  startOfDay,
  isBefore,
  isAfter,
  isSameDay,
  format,
  parseISO,
  endOfYear,
  endOfMonth,
} from 'date-fns';

/** 회계연도 시작일 (1월 1일) */
export const FISCAL_YEAR_START_MONTH = 0; // 0-indexed: January

export function getFiscalYearStart(date) {
  const d = startOfDay(typeof date === 'string' ? parseISO(date) : date);
  const year = d.getFullYear();
  const fiscalStart = new Date(year, FISCAL_YEAR_START_MONTH, 1);
  if (isBefore(d, fiscalStart)) {
    return new Date(year - 1, FISCAL_YEAR_START_MONTH, 1);
  }
  return fiscalStart;
}

export function getNextFiscalYearStart(date) {
  const current = getFiscalYearStart(date);
  return new Date(current.getFullYear() + 1, FISCAL_YEAR_START_MONTH, 1);
}

/**
 * 기준일 당일 포함, 같거나 이후의 첫 회계기준일(1/1)
 * - 1/1 입사 → 일사일도 1/1이므로 그날이 바로 회계연도 전환일
 * - 그 외 → 다음 해 1/1
 */
export function getFirstFiscalYearStartOnOrAfter(date) {
  const d = startOfDay(typeof date === 'string' ? parseISO(date) : date);
  const fiscalStart = getFiscalYearStart(d);
  if (isSameDay(d, fiscalStart)) return fiscalStart;
  return getNextFiscalYearStart(d);
}

/** 입사 후 경과 개월 수 (입사월 제외, 매월 1일 기준) */
export function getMonthsSinceHire(hireDate, asOfDate = new Date()) {
  const hire = startOfDay(typeof hireDate === 'string' ? parseISO(hireDate) : hireDate);
  const asOf = startOfDay(asOfDate);
  if (isBefore(asOf, hire)) return 0;

  let months = 0;
  let cursor = new Date(hire.getFullYear(), hire.getMonth() + 1, 1);

  while (isBefore(cursor, asOf) || cursor.getTime() === asOf.getTime()) {
    months++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    if (months >= 11) break;
  }
  return Math.min(months, 11);
}

/** 첫해 여부: 입사 1년 미만 */
export function isFirstYear(hireDate, asOfDate = new Date()) {
  const hire = typeof hireDate === 'string' ? parseISO(hireDate) : hireDate;
  const oneYearAnniversary = addYears(hire, 1);
  return isBefore(asOfDate, oneYearAnniversary);
}

/** 1년 도달 여부 (정확히 1년 이상) */
export function hasReachedOneYear(hireDate, asOfDate = new Date()) {
  return !isFirstYear(hireDate, asOfDate);
}

/**
 * 첫해 월차 발생량 (최대 11개)
 * 입사 후 매월 1개씩 발생
 */
export function calculateFirstYearMonthlyLeave(hireDate, asOfDate = new Date()) {
  if (!isFirstYear(hireDate, asOfDate)) {
    return 11;
  }
  return getMonthsSinceHire(hireDate, asOfDate);
}

/**
 * 1년 도달 시점 비례 연차
 * 비례 연차 = 15 × (다음 회계연도 시작일까지 남은 일수 / 365)
 * 일사일이 이미 1/1이면 남은 일수 0 → 비례 연차 없음(바로 정규 전환)
 */
export function calculateProratedLeave(hireDate) {
  const hire = typeof hireDate === 'string' ? parseISO(hireDate) : hireDate;
  const oneYearAnniversary = addYears(hire, 1);
  const nextFiscalStart = getFirstFiscalYearStartOnOrAfter(oneYearAnniversary);
  const remainingDays = differenceInDays(nextFiscalStart, oneYearAnniversary);
  if (remainingDays <= 0) return 0;
  return Math.round((15 * (remainingDays / 365)) * 10) / 10;
}

/** 정규 연차 최초 발생일 (비례 연차 기간 종료 후 첫 회계기준일, 1/1 입사는 일사일 당일) */
export function getRegularAnnualLeaveStartDate(hireDate) {
  const oneYear = getOneYearAnniversary(hireDate);
  return getFirstFiscalYearStartOnOrAfter(oneYear);
}

/** 정규 연차 기준 근속연수 (해당 회계연도 1/1 발생 시점) */
export function getRegularTenureYears(hireDate, fiscalYear) {
  const regularStartYear = getRegularAnnualLeaveStartDate(hireDate).getFullYear();
  if (fiscalYear < regularStartYear) return 0;
  return fiscalYear - regularStartYear + 1;
}

/** 근속연수에 따른 추가 연차 (2년마다 1일, 정규 연차 3년차부터) */
export function getTenureBonus(yearsOfService) {
  if (yearsOfService < 3) return 0;
  return Math.floor((yearsOfService - 1) / 2);
}

/** 정규 연차 발생량 (회계연도 기준, 근속은 정규 연차 시작일부터) */
export function calculateAnnualLeave(hireDate, fiscalYear) {
  const fiscalStart = new Date(fiscalYear, FISCAL_YEAR_START_MONTH, 1);
  const regularStart = getRegularAnnualLeaveStartDate(hireDate);

  if (isBefore(fiscalStart, regularStart)) {
    return 0;
  }

  const yearsOfService = getRegularTenureYears(hireDate, fiscalYear);
  const base = 15;
  const bonus = getTenureBonus(yearsOfService);
  return base + bonus;
}

/** 비례 연차 대상자 여부: 1년 도달했으나 아직 다음 회계연도 전 (1/1 입사는 해당 없음) */
export function isProratedPeriod(hireDate, asOfDate = new Date()) {
  const hire = typeof hireDate === 'string' ? parseISO(hireDate) : hireDate;
  const oneYearAnniversary = addYears(hire, 1);
  const nextFiscalStart = getFirstFiscalYearStartOnOrAfter(oneYearAnniversary);
  return (
    !isBefore(asOfDate, oneYearAnniversary) &&
    isBefore(asOfDate, nextFiscalStart)
  );
}

export function getLeavePhase(hireDate, asOfDate = new Date()) {
  if (isFirstYear(hireDate, asOfDate)) return 'first_year_monthly';
  if (isProratedPeriod(hireDate, asOfDate)) return 'prorated';
  return 'annual';
}

export function formatLeaveType(type) {
  const labels = {
    first_year_monthly: '첫해 월차',
    prorated: '비례 연차',
    annual: '정규 연차',
    settlement: '연차 정산',
    adjustment: '수동 조정',
    half: '반차',
    full: '연차',
  };
  return labels[type] || type;
}

export function formatDate(date) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

/** 하루 전 (전기 말일) */
export function getPreviousDate(date) {
  const d = startOfDay(typeof date === 'string' ? parseISO(date) : date);
  return addDays(d, -1);
}

/** 입사 1년 연차수당 급여일: 일사일 다음 달 8일 */
export const FIRST_YEAR_PAYROLL_DAY = 8;

export function getFirstYearPayrollDate(anniversaryDate) {
  const d = startOfDay(typeof anniversaryDate === 'string' ? parseISO(anniversaryDate) : anniversaryDate);
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, FIRST_YEAR_PAYROLL_DAY));
}

/** 일사일 (입사 1주년) */
export function getOneYearAnniversary(hireDate) {
  const hire = typeof hireDate === 'string' ? parseISO(hireDate) : hireDate;
  return startOfDay(addYears(hire, 1));
}

function parseHireDate(hireDate) {
  return startOfDay(typeof hireDate === 'string' ? parseISO(hireDate) : hireDate);
}

function sumUsedDays(usages) {
  return usages.reduce((sum, u) => {
    if (typeof u.days === 'number') return sum + u.days;
    return sum + (u.type === 'half' ? 0.5 : 1);
  }, 0);
}

export function parseUsageDate(date) {
  return startOfDay(typeof date === 'string' ? parseISO(date) : date);
}

/** 사용일이 기준일보다 이전인지 (당일은 아직 차감하지 않음) */
export function hasUsageDatePassed(usageDate, asOfDate = new Date()) {
  if (!usageDate) return false;
  return isBefore(parseUsageDate(usageDate), startOfDay(asOfDate));
}

/** 승인됐고 사용일이 지난 연차만 잔여 차감 대상 */
export function filterConsumedUsages(usages = [], asOfDate = new Date()) {
  return usages.filter((usage) => {
    if (usage.status && usage.status !== 'approved') return false;
    return hasUsageDatePassed(usage.date, asOfDate);
  });
}

export function filterScheduledUsages(usages = [], asOfDate = new Date()) {
  return usages.filter((usage) => {
    if (usage.status && usage.status !== 'approved') return false;
    return !hasUsageDatePassed(usage.date, asOfDate);
  });
}

export function sumUsageDays(usages = []) {
  return Math.round(sumUsedDays(usages) * 10) / 10;
}

/** 올해(달력연도) 시작·종료 */
export function getCalendarYearStart(year) {
  return new Date(year, 0, 1);
}

export function getCalendarYearEnd(year) {
  return endOfYear(new Date(year, 0, 1));
}

export function getCurrentDisplayYear(asOfDate = new Date()) {
  return startOfDay(asOfDate).getFullYear();
}

/** 월말 보고서 구간: 잔여는 다음 달 1일 0시 기준(말일 사용분 포함) */
export function getReportMonthRange(year, month) {
  const start = startOfDay(new Date(year, month - 1, 1));
  const end = startOfDay(endOfMonth(start));
  const nextStart = startOfDay(new Date(year, month, 1));
  return {
    year,
    month,
    monthStart: formatDate(start),
    monthEnd: formatDate(end),
    nextMonthStart: formatDate(nextStart),
    asOf: end,
    consumptionAsOf: nextStart,
  };
}

/** 올해 사용 연차만 집계 */
export function filterUsagesByYear(usages, year) {
  return usages.filter((u) => parseISO(u.date).getFullYear() === year);
}

/** 올해 발생한 월차 수 (첫해, 달력연도 기준) */
export function getMonthlyAccrualInYear(hireDate, year, asOfDate = new Date()) {
  const hire = parseHireDate(hireDate);
  const asOf = startOfDay(asOfDate);
  const oneYear = getOneYearAnniversary(hireDate);

  if (!isFirstYear(hireDate, asOf) && year < oneYear.getFullYear()) {
    return calculateFirstYearMonthlyLeave(hireDate, oneYear);
  }
  if (!isFirstYear(hireDate, asOf) && year > hire.getFullYear()) {
    return 0;
  }

  let count = 0;
  for (let m = 1; m <= 11; m++) {
    const accrualDate = startOfDay(new Date(hire.getFullYear(), hire.getMonth() + m, 1));
    if (accrualDate.getFullYear() !== year) continue;
    if (isAfter(accrualDate, asOf)) break;
    if (!isBefore(asOf, oneYear) && isBefore(accrualDate, oneYear)) continue;
    count++;
  }
  return count;
}

/** 올해 해당하는 정산 이벤트만 반환 */
export function getSettlementEventsInYear(hireDate, year, asOfDate = new Date()) {
  return getSettlementEvents(hireDate, asOfDate).filter(
    (e) => startOfDay(e.date).getFullYear() === year
  );
}

/** 올해 기준 정산 차감 (현재 활성 구간에 해당하는 정산만) */
export function getCurrentYearSettledDeduction(hireDate, year, asOfDate = new Date()) {
  const asOf = startOfDay(asOfDate);
  const phase = getLeavePhase(hireDate, asOf);
  const oneYear = getOneYearAnniversary(hireDate);
  const events = getSettlementEventsInYear(hireDate, year, asOf);

  if (phase === 'annual') {
    const fiscalStart = getFiscalYearStart(asOf);
    return events
      .filter((e) => {
        if (e.type === 'fiscal_annual') {
          return isSameDay(e.date, fiscalStart);
        }
        return false;
      })
      .reduce((sum, e) => sum + e.settledDays, 0);
  }

  if (phase === 'prorated') {
    const firstFiscal = getFirstFiscalYearStartOnOrAfter(oneYear);
    return events
      .filter((e) => e.type === 'prorated' && isSameDay(e.date, firstFiscal))
      .reduce((sum, e) => sum + e.settledDays, 0);
  }

  if (phase === 'first_year_monthly') {
    return events
      .filter((e) => e.type === 'first_year' && oneYear.getFullYear() === year)
      .reduce((sum, e) => sum + e.settledDays, 0);
  }

  return 0;
}

/**
 * 연차 정산 이벤트 생성
 * - 첫해: 일사일(입사 1주년) 기준 월차 정산
 * - 1/1 입사: 일사일 = 회계기준일이므로 최초 1년 정산 후 바로 정규(회계연도) 전환 (비례 없음)
 * - 그 외: 일사일 이후 첫 1/1에 비례 정산, 이후 매 1/1 정규 연차 정산
 * - asOf 이전·당일 이벤트만 포함. 연간 정산 미리보기는 연말 asOf로 호출.
 */
export function getSettlementEvents(hireDate, asOfDate = new Date()) {
  const hire = parseHireDate(hireDate);
  const asOf = startOfDay(asOfDate);
  const oneYear = getOneYearAnniversary(hireDate);
  const events = [];

  if (!isBefore(asOf, oneYear)) {
    const firstYearSettled = calculateFirstYearMonthlyLeave(hireDate, oneYear);
    const sameDayFiscalSwitch = isSameDay(oneYear, getFirstFiscalYearStartOnOrAfter(oneYear));
    events.push({
      type: 'first_year',
      date: oneYear,
      settledDays: firstYearSettled,
      description: sameDayFiscalSwitch
        ? '첫해 월차 정산 (일사일 = 회계기준일, 이후 정규 연차 전환)'
        : '첫해 월차 정산 (일사일 기준)',
      basis: 'anniversary',
    });
  }

  const firstFiscalSettlement = getFirstFiscalYearStartOnOrAfter(oneYear);

  if (!isBefore(asOf, firstFiscalSettlement)) {
    const prorated = calculateProratedLeave(hireDate);
    if (prorated > 0) {
      events.push({
        type: 'prorated',
        date: firstFiscalSettlement,
        settledDays: prorated,
        description: '비례 연차 정산 (회계기준일)',
        basis: 'fiscal',
      });
    }
  }

  // 회계연도 종료 시(다음 회계기준일) 이전 연도 정규 연차 정산
  // firstFiscal 당일은 비례(또는 1/1 입사 전환)이고, 정규 정산은 그 다음 1/1부터
  let fiscalSettlementDate = addYears(firstFiscalSettlement, 1);

  while (isBefore(fiscalSettlementDate, asOf) || isSameDay(fiscalSettlementDate, asOf)) {
    const settledFiscalYear = addYears(fiscalSettlementDate, -1).getFullYear();
    const annual = calculateAnnualLeave(hireDate, settledFiscalYear);
    if (annual > 0) {
      events.push({
        type: 'fiscal_annual',
        date: fiscalSettlementDate,
        settledDays: annual,
        description: `${settledFiscalYear} 회계연도 연차 정산 (회계기준일)`,
        basis: 'fiscal',
      });
    }
    fiscalSettlementDate = addYears(fiscalSettlementDate, 1);
  }

  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * 올해 기준 잔여 연차 계산
 * 잔여(표시/부채) = max(0, 순잔여)
 * 초과사용 = max(0, -순잔여) → 다음 주기 이월 차감
 */
export function calculateLeaveBalance(hireDate, usages = [], asOfDate = new Date(), options = {}) {
  const {
    manualAccrualTotal = 0,
    consumptionAsOf = asOfDate,
    skipCarryIn = false,
    skipSettledDeduction = false,
  } = options;
  const asOf = startOfDay(asOfDate);
  const year = getCurrentDisplayYear(asOf);
  const oneYear = getOneYearAnniversary(hireDate);
  const phase = getLeavePhase(hireDate, asOf);

  const consumedUsages = filterConsumedUsages(usages, consumptionAsOf);
  const yearUsages = filterUsagesByYear(consumedUsages, year);
  const usedDays = sumUsedDays(yearUsages);
  const scheduledDays = sumUsedDays(filterUsagesByYear(filterScheduledUsages(usages, consumptionAsOf), year));

  let accruedThisYear = 0;
  let firstYearMonthly = 0;
  let proratedLeave = 0;
  let annualLeave = 0;

  if (phase === 'first_year_monthly') {
    firstYearMonthly = getMonthlyAccrualInYear(hireDate, year, asOf);
    accruedThisYear = firstYearMonthly;
  } else if (phase === 'prorated') {
    if (oneYear.getFullYear() === year) {
      proratedLeave = calculateProratedLeave(hireDate);
      accruedThisYear = proratedLeave;
    }
    firstYearMonthly = oneYear.getFullYear() === year
      ? calculateFirstYearMonthlyLeave(hireDate, oneYear)
      : 0;
  } else {
    const currentFY = getFiscalYearStart(asOf).getFullYear();
    if (currentFY === year || year === asOf.getFullYear()) {
      annualLeave = calculateAnnualLeave(hireDate, currentFY);
      accruedThisYear = annualLeave;
    }
    proratedLeave = 0;
    firstYearMonthly = 0;
  }

  const yearSettlements = getSettlementEventsInYear(hireDate, year, asOf);
  const settledDeduction = skipSettledDeduction
    ? 0
    : getCurrentYearSettledDeduction(hireDate, year, asOf);
  const carryInDays = skipCarryIn
    ? 0
    : getPriorPeriodOveruseCarryIn(hireDate, asOf, usages, {
        manualAccrualTotal,
        consumptionAsOf,
      });
  const totalAccrued = accruedThisYear + manualAccrualTotal;

  const rawRemaining = Math.round((totalAccrued - usedDays - settledDeduction - carryInDays) * 10) / 10;
  const remaining = Math.max(0, rawRemaining);
  const overusedDays = Math.max(0, Math.round((-rawRemaining) * 10) / 10);

  const settlementInYear = yearSettlements.find((e) => e.type === 'first_year');
  const firstYearSettled = !isBefore(asOf, oneYear);

  return {
    displayYear: year,
    phase,
    isFirstYear: isFirstYear(hireDate, asOf),
    isProratedTarget: isProratedPeriod(hireDate, asOf),
    remaining,
    rawRemaining,
    overusedDays,
    carryInDays,
    accruedThisYear: Math.round((accruedThisYear + manualAccrualTotal) * 10) / 10,
    firstYearMonthly,
    proratedLeave,
    annualLeave,
    usedDays,
    scheduledDays: Math.round(scheduledDays * 10) / 10,
    totalGranted: Math.round(totalAccrued * 10) / 10,
    settledDeduction,
    settlements: yearSettlements,
    firstYearMonthlySettlement: {
      totalMonths: phase === 'first_year_monthly'
        ? getMonthlyAccrualInYear(hireDate, year, asOf)
        : calculateFirstYearMonthlyLeave(hireDate, oneYear),
      totalDays: firstYearMonthly,
      settled: firstYearSettled,
      settledThisYear: firstYearSettled && oneYear.getFullYear() === year,
      settledDate: firstYearSettled ? formatDate(oneYear) : null,
      settledDays: settlementInYear?.settledDays ?? 0,
      basis: 'anniversary',
    },
    fiscalSettlements: yearSettlements.filter((s) => s.basis === 'fiscal'),
  };
}

/** 현재 주기 시작일 (입사일 / 일사일 / 회계기준일) */
export function getLeavePeriodStart(hireDate, asOfDate = new Date()) {
  const asOf = startOfDay(asOfDate);
  const phase = getLeavePhase(hireDate, asOf);
  if (phase === 'first_year_monthly') return parseHireDate(hireDate);
  if (phase === 'prorated') return getOneYearAnniversary(hireDate);
  return getFiscalYearStart(asOf);
}

/**
 * 직전 주기에서 초과 사용한 연차(절대값)를 이번 주기 발생분에서 차감
 */
export function getPriorPeriodOveruseCarryIn(hireDate, asOfDate, usages = [], options = {}) {
  const asOf = startOfDay(asOfDate);
  const hire = parseHireDate(hireDate);
  const periodStart = getLeavePeriodStart(hireDate, asOf);
  if (isSameDay(periodStart, hire) || isBefore(periodStart, hire)) return 0;

  const priorAsOf = addDays(periodStart, -1);
  if (isBefore(priorAsOf, hire)) return 0;

  const prior = calculateLeaveBalance(hireDate, usages, priorAsOf, {
    ...options,
    // 직전 주기 자체 이월은 재귀로 반영. 무한루프 방지를 위해 skip은 쓰지 않음.
  });
  return prior.overusedDays || 0;
}

/** IFRS 부채·수당 지급에 쓰는 연차 일수 (음수면 0) */
export function getPayableLeaveDays(days) {
  const value = Number(days) || 0;
  return Math.max(0, Math.round(value * 10) / 10);
}

/** 초과 사용 일수 (음수 잔여의 절대값) */
export function getOverusedLeaveDays(days) {
  const value = Number(days) || 0;
  return value < 0 ? Math.round((-value) * 10) / 10 : 0;
}
