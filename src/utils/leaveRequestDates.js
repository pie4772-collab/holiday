import { eachDayOfInterval, format, isAfter, isWeekend, parseISO } from 'date-fns';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_LEAVE_RANGE_DAYS = 31;

export function isValidLeaveDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const parsed = parseISO(value);
  return !Number.isNaN(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === value;
}

export function listLeaveRequestDates(startDate, endDate, { skipWeekends = true } = {}) {
  if (!isValidLeaveDate(startDate) || !isValidLeaveDate(endDate)) return [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isAfter(start, end)) return [];
  const span = eachDayOfInterval({ start, end });
  if (span.length > MAX_LEAVE_RANGE_DAYS) return [];
  return span
    .filter((day) => !skipWeekends || !isWeekend(day))
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
