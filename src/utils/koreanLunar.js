import KoreanLunarCalendar from 'korean-lunar-calendar';

const calendar = new KoreanLunarCalendar();

/** 음력 year년 month월 day일 → 양력 Date (로컬 정오). */
export function lunarToSolar(year, month, day, isLeapMonth = false) {
  const ok = calendar.setLunarDate(year, month, day, Boolean(isLeapMonth));
  if (!ok) {
    throw new Error(`음력 날짜를 변환할 수 없습니다: ${year}-${month}-${day}`);
  }
  const solar = calendar.getSolarCalendar();
  return new Date(solar.year, solar.month - 1, solar.day, 12, 0, 0);
}

export function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}
