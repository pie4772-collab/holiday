import { eachDayOfInterval, format, isAfter, parseISO } from 'date-fns';
import { isNonWorkingDay, isWorkingDay, nonWorkingDayReason } from './workCalendar.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_LEAVE_RANGE_DAYS = 31;

export function isValidLeaveDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const parsed = parseISO(value);
  return !Number.isNaN(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === value;
}

export function listLeaveRequestDates(startDate, endDate, { skipNonWorkingDays = true } = {}) {
  if (!isValidLeaveDate(startDate) || !isValidLeaveDate(endDate)) return [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isAfter(start, end)) return [];
  const span = eachDayOfInterval({ start, end });
  if (span.length > MAX_LEAVE_RANGE_DAYS) return [];
  return span
    .filter((day) => !skipNonWorkingDays || isWorkingDay(day))
    .map((day) => format(day, 'yyyy-MM-dd'));
}

export function describeLeaveDates(dates) {
  if (!dates.length) return '';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`;
}

export function calendarSpanDays(startDate, endDate) {
  if (!isValidLeaveDate(startDate) || !isValidLeaveDate(endDate)) return 0;
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isAfter(start, end)) return 0;
  return eachDayOfInterval({ start, end }).length;
}

export function leaveBlockedReason(date) {
  if (!isValidLeaveDate(date) || !isNonWorkingDay(date)) return '';
  const reason = nonWorkingDayReason(date);
  return `${date}은(는) ${reason}이라 연차·반차를 사용할 수 없습니다.`;
}
