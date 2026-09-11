import { addDays, formatYmd, lunarToSolar } from './koreanLunar.js';

/** 임시공휴일·선거일 등 규칙으로 계산되지 않는 날 */
export const KR_EXTRA_HOLIDAYS = [
  { date: '2025-06-03', name: '제21대 대통령 선거' },
  { date: '2026-06-03', name: '전국동시지방선거' },
];

export const HOLIDAY_START_YEAR = 2025;
/** 초기 배포 시 최소로 열어 둘 연도 */
export const HOLIDAY_MIN_END_YEAR = 2028;

const NAME_ORDER = [
  '신정',
  '설날',
  '설날 연휴',
  '삼일절',
  '근로자의 날',
  '어린이날',
  '부처님오신날',
  '현충일',
  '제헌절',
  '광복절',
  '개천절',
  '추석',
  '추석 연휴',
  '한글날',
  '크리스마스',
];

/**
 * 매년 12월 1일부터 다음 해 달력을 연다.
 * 예: 2028-12-01 → 2029까지, 2029-12-01 → 2030까지.
 */
export function getHolidayEndYear(asOf = new Date()) {
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  const year = date.getFullYear();
  const unlocked = date.getMonth() === 11 && date.getDate() >= 1 ? year + 1 : year;
  return Math.max(unlocked, HOLIDAY_MIN_END_YEAR);
}

function weekday(date) {
  return date.getDay();
}

function parseYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function sortNames(names) {
  return [...names].sort((a, b) => {
    const ai = NAME_ORDER.indexOf(a);
    const bi = NAME_ORDER.indexOf(b);
    const av = ai === -1 ? 1000 : ai;
    const bv = bi === -1 ? 1000 : bi;
    if (av !== bv) return av - bv;
    return a.localeCompare(b, 'ko');
  });
}

function primaryName(names) {
  return sortNames(names).join('·');
}

function addHoliday(map, date, name, { weekendSub = 'none', overlapSub = false, group = null } = {}) {
  const key = formatYmd(date);
  const existing = map.get(key);
  if (existing) {
    if (!existing.names.includes(name)) existing.names.push(name);
    if (weekendSub === 'satSun') existing.weekendSub = 'satSun';
    else if (weekendSub === 'sun' && existing.weekendSub === 'none') existing.weekendSub = 'sun';
    existing.overlapSub = existing.overlapSub || overlapSub;
    if (group) existing.groups.add(group);
    return;
  }
  map.set(key, {
    names: [name],
    weekendSub,
    overlapSub,
    groups: new Set(group ? [group] : []),
  });
}

function nextNonHoliday(startDate, occupied) {
  let cursor = addDays(startDate, 1);
  for (let i = 0; i < 14; i += 1) {
    const key = formatYmd(cursor);
    const day = weekday(cursor);
    if (day !== 0 && day !== 6 && !occupied.has(key)) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function substituteLabel(names) {
  return `${primaryName(names)} 대체공휴일`;
}

/** 설·추석 대체 표기용 이름 */
function lunarGroupSubNames(days, group) {
  const groups = new Set(days.flatMap(([, info]) => [...info.groups]));
  const names = new Set(days.flatMap(([, info]) => info.names));

  if (group === 'seollal') return ['설날'];
  if (group === 'chuseok') {
    if (groups.has('foundation') || names.has('개천절')) return ['개천절', '추석'];
    return ['추석'];
  }
  return sortNames([...names].filter((n) => n !== '설날 연휴' && n !== '추석 연휴'));
}

/** 겹침 대체 표기: 어린이날+부처님오신날 → 어린이날 */
function singleSubNames(info) {
  if (info.groups.has('children') && info.groups.has('buddha')) return ['어린이날'];
  if (info.groups.has('foundation') && info.groups.has('chuseok')) return ['개천절', '추석'];
  return sortNames(info.names);
}

export function generateKrHolidaysForYear(year) {
  const map = new Map();

  addHoliday(map, new Date(year, 0, 1, 12), '신정', { weekendSub: 'none' });

  const seollal = lunarToSolar(year, 1, 1);
  addHoliday(map, addDays(seollal, -1), '설날 연휴', { weekendSub: 'sun', overlapSub: true, group: 'seollal' });
  addHoliday(map, seollal, '설날', { weekendSub: 'sun', overlapSub: true, group: 'seollal' });
  addHoliday(map, addDays(seollal, 1), '설날 연휴', { weekendSub: 'sun', overlapSub: true, group: 'seollal' });

  addHoliday(map, new Date(year, 2, 1, 12), '삼일절', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'samil',
  });

  // 근로자의 날: 연차 차단용으로 매년 포함. 2026년부터 관공서 대체공휴일 적용.
  addHoliday(map, new Date(year, 4, 1, 12), '근로자의 날', {
    weekendSub: year >= 2026 ? 'satSun' : 'none',
    overlapSub: year >= 2026,
    group: 'labor',
  });

  addHoliday(map, new Date(year, 4, 5, 12), '어린이날', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'children',
  });

  const buddha = lunarToSolar(year, 4, 8);
  addHoliday(map, buddha, '부처님오신날', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'buddha',
  });

  addHoliday(map, new Date(year, 5, 6, 12), '현충일', { weekendSub: 'none' });

  if (year >= 2026) {
    addHoliday(map, new Date(year, 6, 17, 12), '제헌절', {
      weekendSub: 'satSun',
      overlapSub: true,
      group: 'constitution',
    });
  }

  addHoliday(map, new Date(year, 7, 15, 12), '광복절', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'liberation',
  });

  addHoliday(map, new Date(year, 9, 3, 12), '개천절', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'foundation',
  });

  const chuseok = lunarToSolar(year, 8, 15);
  addHoliday(map, addDays(chuseok, -1), '추석 연휴', { weekendSub: 'sun', overlapSub: true, group: 'chuseok' });
  addHoliday(map, chuseok, '추석', { weekendSub: 'sun', overlapSub: true, group: 'chuseok' });
  addHoliday(map, addDays(chuseok, 1), '추석 연휴', { weekendSub: 'sun', overlapSub: true, group: 'chuseok' });

  addHoliday(map, new Date(year, 9, 9, 12), '한글날', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'hangul',
  });

  addHoliday(map, new Date(year, 11, 25, 12), '크리스마스', {
    weekendSub: 'satSun',
    overlapSub: true,
    group: 'christmas',
  });

  const occupied = new Set(map.keys());
  const pendingSubs = [];

  for (const group of ['seollal', 'chuseok']) {
    const days = [...map.entries()]
      .filter(([, info]) => info.groups.has(group))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    if (!days.length) continue;

    const hasSunday = days.some(([ymd]) => weekday(parseYmd(ymd)) === 0);
    const overlapOther = days.some(([, info]) => [...info.groups].some((g) => g !== group));

    if (hasSunday || overlapOther) {
      const last = parseYmd(days[days.length - 1][0]);
      pendingSubs.push({ after: last, names: lunarGroupSubNames(days, group) });
    }
  }

  for (const [ymd, info] of map.entries()) {
    const date = parseYmd(ymd);
    const day = weekday(date);
    if (info.groups.has('seollal') || info.groups.has('chuseok')) continue;

    let need = false;
    if (info.weekendSub === 'satSun' && (day === 0 || day === 6)) need = true;
    if (info.weekendSub === 'sun' && day === 0) need = true;
    if (info.overlapSub && day !== 0 && day !== 6 && (info.names.length > 1 || info.groups.size > 1)) {
      need = true;
    }

    if (need) {
      pendingSubs.push({ after: date, names: singleSubNames(info) });
    }
  }

  const subByAnchor = new Map();
  for (const item of pendingSubs) {
    const key = formatYmd(item.after);
    const prev = subByAnchor.get(key);
    if (prev) {
      prev.names = sortNames([...new Set([...prev.names, ...item.names])]);
    } else {
      subByAnchor.set(key, { after: item.after, names: [...item.names] });
    }
  }

  const sortedAnchors = [...subByAnchor.values()].sort((a, b) => a.after - b.after);
  for (const item of sortedAnchors) {
    let subDate = nextNonHoliday(item.after, occupied);
    let finalKey = formatYmd(subDate);
    if (occupied.has(finalKey)) {
      subDate = nextNonHoliday(subDate, occupied);
      finalKey = formatYmd(subDate);
    }
    occupied.add(finalKey);
    const label = substituteLabel(item.names);
    if (map.has(finalKey)) {
      const existing = map.get(finalKey);
      if (!existing.names.includes(label)) existing.names.push(label);
    } else {
      map.set(finalKey, {
        names: [label],
        weekendSub: 'none',
        overlapSub: false,
        groups: new Set(['substitute']),
      });
    }
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, info]) => ({ date, name: primaryName(info.names) }));
}

export function buildKrHolidays(asOf = new Date()) {
  const endYear = getHolidayEndYear(asOf);
  const byDate = new Map();

  for (let year = HOLIDAY_START_YEAR; year <= endYear; year += 1) {
    for (const item of generateKrHolidaysForYear(year)) {
      byDate.set(item.date, item.name);
    }
  }

  for (const extra of KR_EXTRA_HOLIDAYS) {
    const y = Number(extra.date.slice(0, 4));
    if (y < HOLIDAY_START_YEAR || y > endYear) continue;
    const prev = byDate.get(extra.date);
    byDate.set(extra.date, prev && prev !== extra.name ? `${prev}·${extra.name}` : extra.name);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, name]) => ({ date, name }));
}
