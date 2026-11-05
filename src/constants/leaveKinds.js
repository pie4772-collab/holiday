import { addDays, format, parseISO } from 'date-fns';
import { calendarSpanDays, MAX_LEAVE_RANGE_DAYS } from '../utils/leaveRequestDates.js';

/**
 * 휴가 종류. 연차 외 휴가는 연차 잔여에서 빼지 않고, 결재선·근태 연동은 연차와 같습니다.
 * maxRangeDays: 한 번에 고를 수 있는 기간(달력 일수). 신청은 그중 평일만 됩니다.
 */
export const LEAVE_KINDS = [
  { key: 'annual', label: '연차', half: true, maxRangeDays: MAX_LEAVE_RANGE_DAYS },
  {
    key: 'condolence',
    label: '경조휴가',
    half: false,
    maxRangeDays: MAX_LEAVE_RANGE_DAYS,
    guide: '회사 경조휴가 규정에 정한 일수만큼 신청하세요. 주말·공휴일은 빼고 신청됩니다.',
  },
  {
    key: 'official',
    label: '공가',
    half: true,
    maxRangeDays: MAX_LEAVE_RANGE_DAYS,
    guide: '예비군·민방위 훈련, 투표, 법원·관공서 출석 등 공적 업무에 필요한 시간입니다 (근로기준법 제10조).',
  },
  {
    key: 'maternity',
    label: '출산전후휴가',
    half: false,
    maxRangeDays: 120,
    guide:
      '출산 전후 합계 90일(다태아 120일)이며 출산 후 45일(다태아 60일) 이상이어야 합니다 (근로기준법 제74조). 기간은 주말·공휴일을 포함해 셉니다.',
  },
  {
    key: 'paternity',
    label: '배우자 출산휴가',
    half: false,
    maxRangeDays: 45,
    guide: '근로일 20일(유급)이며 출산일부터 120일 안에 3번까지 나눠 쓸 수 있습니다 (남녀고용평등법 제18조의2).',
  },
  {
    key: 'family_care',
    label: '가족돌봄휴가',
    half: false,
    maxRangeDays: MAX_LEAVE_RANGE_DAYS,
    guide: '가족의 질병·사고·노령, 자녀 양육으로 긴급히 돌봐야 할 때 연 10일까지 하루 단위로 씁니다 (무급, 남녀고용평등법 제22조의2).',
  },
];

export const LEAVE_KIND_MAP = Object.fromEntries(LEAVE_KINDS.map((kind) => [kind.key, kind]));
export const SPECIAL_LEAVE_KINDS = LEAVE_KINDS.filter((kind) => kind.key !== 'annual');

export const MATERNITY_LEAVE_DAYS = 90;
export const MATERNITY_LEAVE_MULTIPLE_DAYS = 120;
export const PATERNITY_LEAVE_DAYS = 20;
export const PATERNITY_LEAVE_WINDOW_DAYS = 120;
export const PATERNITY_LEAVE_SPLITS = 3;
export const FAMILY_CARE_LEAVE_DAYS = 10;

export function isSpecialLeave(kind) {
  return Boolean(kind) && kind !== 'annual';
}

export function leaveKindLabel(kind) {
  return LEAVE_KIND_MAP[kind]?.label || '연차';
}

/** 휴가 하루 표시 이름: 연차·오전 반차·공가·공가(오후) */
export function usageLabel(usage) {
  const half = usage?.type === 'half';
  const period = usage?.halfPeriod === 'am' ? '오전' : usage?.halfPeriod === 'pm' ? '오후' : '';
  if (isSpecialLeave(usage?.kind)) {
    const label = leaveKindLabel(usage.kind);
    return half ? `${label}(${period || '반일'})` : label;
  }
  if (half) return period ? `${period} 반차` : '반차';
  return '연차';
}

const shiftDate = (date, days) => format(addDays(parseISO(date), days), 'yyyy-MM-dd');
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * 법정 일수를 넘는지 알려 줍니다(신청은 막지 않음).
 * existing: 같은 직원의 다른 휴가(mapUsageRow 형태). 승인·대기만 셉니다.
 */
export function specialLeaveWarnings({ kind, startDate, endDate, dates = [], halfDay = false, existing = [] }) {
  if (!isSpecialLeave(kind) || !dates.length) return [];
  const same = existing.filter((u) => u.kind === kind && (u.status === 'approved' || u.status === 'pending'));
  const first = dates[0];
  const last = dates[dates.length - 1];
  const warnings = [];

  if (kind === 'maternity') {
    const from = startDate || first;
    const earlier = same
      .map((u) => u.date)
      .filter((d) => d >= shiftDate(from, -MATERNITY_LEAVE_MULTIPLE_DAYS) && d < from)
      .sort();
    const span = calendarSpanDays(earlier[0] || from, endDate || last);
    if (span > MATERNITY_LEAVE_DAYS) {
      warnings.push(
        `출산전후휴가는 ${MATERNITY_LEAVE_DAYS}일(다태아 ${MATERNITY_LEAVE_MULTIPLE_DAYS}일)까지입니다. ${
          earlier.length ? '앞선 신청을 합친 ' : ''
        }기간이 ${span}일입니다.`
      );
    }
  }

  if (kind === 'paternity') {
    const windowStart = shiftDate(first, -PATERNITY_LEAVE_WINDOW_DAYS);
    const recent = same.filter((u) => u.date >= windowStart && u.date <= last);
    const total = round1(recent.reduce((sum, u) => sum + (Number(u.days) || 0), 0) + dates.length);
    if (total > PATERNITY_LEAVE_DAYS) {
      warnings.push(`배우자 출산휴가는 ${PATERNITY_LEAVE_DAYS}일까지입니다. 최근 ${PATERNITY_LEAVE_WINDOW_DAYS}일 동안 ${total}일이 됩니다.`);
    }
    const splits = new Set(recent.map((u) => u.requestGroup || u.id)).size + 1;
    if (splits > PATERNITY_LEAVE_SPLITS) {
      warnings.push(`배우자 출산휴가는 ${PATERNITY_LEAVE_SPLITS}번까지 나눠 쓸 수 있습니다. 이번이 ${splits}번째입니다.`);
    }
  }

  if (kind === 'family_care') {
    const perDay = halfDay ? 0.5 : 1;
    for (const year of [...new Set(dates.map((d) => d.slice(0, 4)))]) {
      const used = same.filter((u) => u.date.slice(0, 4) === year).reduce((sum, u) => sum + (Number(u.days) || 0), 0);
      const total = round1(used + dates.filter((d) => d.slice(0, 4) === year).length * perDay);
      if (total > FAMILY_CARE_LEAVE_DAYS) {
        warnings.push(`가족돌봄휴가는 연 ${FAMILY_CARE_LEAVE_DAYS}일까지입니다. ${year}년 ${total}일이 됩니다.`);
      }
    }
  }

  return warnings;
}

/**
 * 같은 신청(request_group)으로 넣은 날들을 한 건으로 묶습니다. 상태·결재 단계가 같은 날끼리만 묶습니다.
 * 반환: [{ key, items, first, dates, days }] (items 는 날짜순)
 */
export function groupLeaveUsages(usages = [], { byStep = false } = {}) {
  const groups = new Map();
  for (const usage of usages) {
    const key = usage.requestGroup
      ? `${usage.requestGroup}|${usage.status}${byStep ? `|${usage.approvalStep || ''}` : ''}`
      : `single|${usage.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(usage);
  }
  return [...groups.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return {
      key,
      items: sorted,
      first: sorted[0],
      dates: sorted.map((u) => u.date),
      days: round1(sorted.reduce((sum, u) => sum + (Number(u.days) || 0), 0)),
    };
  });
}

/** 묶은 신청의 날짜 표시: 2026-11-10 또는 2026-11-10 ~ 2026-11-14 (5일) */
export function describeGroupDates(group) {
  const { dates, days } = group;
  if (dates.length <= 1) return dates[0] || '';
  return `${dates[0]} ~ ${dates[dates.length - 1]} (${days}일)`;
}
