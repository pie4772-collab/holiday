import { format, isWeekend, parseISO } from 'date-fns';
import { buildKrHolidays, getHolidayEndYear } from './krHolidayGenerator.js';

let cachedEndYear = null;
let holidayNames = new Map();

function ensureHolidayMap(asOf = new Date()) {
  const endYear = getHolidayEndYear(asOf);
  if (cachedEndYear === endYear && holidayNames.size) return holidayNames;
  holidayNames = new Map(buildKrHolidays(asOf).map((item) => [item.date, item.name]));
  cachedEndYear = endYear;
  return holidayNames;
}

export function toDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return format(value, 'yyyy-MM-dd');
}

export function getHolidayName(value, asOf = new Date()) {
  return ensureHolidayMap(asOf).get(toDateKey(value)) || null;
}

export function isPublicHoliday(value, asOf = new Date()) {
  return ensureHolidayMap(asOf).has(toDateKey(value));
}

export function isWeekendDate(value) {
  const date = typeof value === 'string' ? parseISO(toDateKey(value)) : value;
  return Number.isNaN(date?.getTime?.()) ? false : isWeekend(date);
}

export function isNonWorkingDay(value, asOf = new Date()) {
  return isWeekendDate(value) || isPublicHoliday(value, asOf);
}

export function isWorkingDay(value, asOf = new Date()) {
  return !isNonWorkingDay(value, asOf);
}

export function nonWorkingDayReason(value, asOf = new Date()) {
  const holiday = getHolidayName(value, asOf);
  if (holiday) return holiday;
  const date = typeof value === 'string' ? parseISO(toDateKey(value)) : value;
  if (Number.isNaN(date?.getTime?.())) return '';
  const day = date.getDay();
  if (day === 0) return '일요일';
  if (day === 6) return '토요일';
  return '';
}
