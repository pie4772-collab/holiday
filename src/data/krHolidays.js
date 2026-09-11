import { buildKrHolidays } from '../utils/krHolidayGenerator.js';

export {
  buildKrHolidays,
  getHolidayEndYear,
  generateKrHolidaysForYear,
  HOLIDAY_START_YEAR,
  HOLIDAY_MIN_END_YEAR,
  KR_EXTRA_HOLIDAYS,
} from '../utils/krHolidayGenerator.js';

/** 기준일 기준으로 열린 연도까지의 공휴일 (12월 1일부터 다음 해 포함) */
export const KR_HOLIDAYS = buildKrHolidays();
