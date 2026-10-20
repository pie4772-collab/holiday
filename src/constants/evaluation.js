/** 입사 구분·수습·평가 일정 (서버·화면 공용) */

export const HIRE_TYPES = [
  { key: 'new', label: '신입', hint: '수습 3개월 → 수습평가, 입사 1년 평가' },
  { key: 'experienced', label: '경력', hint: '처음부터 정규직 → 3개월 평가' },
];

export const HIRE_TYPE_LABELS = Object.fromEntries(HIRE_TYPES.map((t) => [t.key, t.label]));

export const PROBATION_MONTHS = 3;

/** months: 입사일부터 이 기간이 끝나는 날이 평가 기한입니다. */
export const EVALUATION_KINDS = {
  probation: { label: '수습평가', months: PROBATION_MONTHS, hireType: 'new' },
  three_month: { label: '3개월 평가', months: 3, hireType: 'experienced' },
  one_year: { label: '입사 1년 평가', months: 12, hireType: 'new' },
};

export const PLAN_KINDS = {
  new: ['probation', 'one_year'],
  experienced: ['three_month'],
};

export const EVALUATION_ITEMS = [
  { key: 'performance', label: '업무 수행능력', hint: '맡은 업무를 정확하게, 기한 안에 처리한다' },
  { key: 'knowledge', label: '직무 지식·기술', hint: '업무에 필요한 지식과 기술을 갖추고 익힌다' },
  { key: 'attitude', label: '근무 태도·성실성', hint: '근태, 책임감, 규정 준수' },
  { key: 'teamwork', label: '협업·의사소통', hint: '동료와 협력하고 보고·소통이 원활하다' },
  { key: 'adaptability', label: '조직 적응·발전 가능성', hint: '회사 문화에 적응하고 성장 의지가 있다' },
];

export const SCORE_LABELS = { 1: '매우 미흡', 2: '미흡', 3: '보통', 4: '우수', 5: '매우 우수' };
export const MAX_ITEM_SCORE = 5;

export const GRADES = ['S', 'A', 'B', 'C', 'D'];

/** 항목 평균으로 추천 등급을 정합니다. 평가자가 바꿀 수 있습니다. */
export function suggestGrade(total, count) {
  if (!count) return '';
  const average = total / count;
  if (average >= 4.5) return 'S';
  if (average >= 3.5) return 'A';
  if (average >= 2.5) return 'B';
  if (average >= 1.5) return 'C';
  return 'D';
}

export const OUTCOMES = {
  regular: '정규직 전환',
  extend: '수습 연장',
  reject: '본채용 거부',
};

export const EVALUATION_STATUS_LABELS = {
  pending: '작성 대기',
  submitted: '확정 대기',
  confirmed: '확정',
  cancelled: '취소',
};

/** 기한 며칠 전부터 임박으로 보고 메일을 보낼지 */
export const REMINDER_DAYS = 14;

/** 입사 구분을 아직 정하지 않은 직원 중 평가 일정 화면에 안내할 범위(입사 후 일수) */
export const UNTYPED_WINDOW_DAYS = 365;

/** 기한이 이보다 오래 지난 평가는 새로 만들지 않습니다. */
export const STALE_DUE_DAYS = 365;

export function evaluationLabel(kind, round = 1) {
  const label = EVALUATION_KINDS[kind]?.label || kind;
  return round > 1 ? `${label} (${round}차)` : label;
}

function utc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key, days) {
  return isoDate(utc(key) + days * 86400000);
}

export function diffDays(a, b) {
  return Math.round((utc(a) - utc(b)) / 86400000);
}

/**
 * 입사일부터 months 개월이 끝나는 날(민법 기간 계산).
 * 대응하는 날의 전날이고, 대응하는 날이 없는 달이면 그 달 말일입니다.
 */
export function periodEnd(startDate, months) {
  const [y, m, d] = startDate.split('-').map(Number);
  const monthIndex = m - 1 + months;
  const year = y + Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (d > lastDay) return isoDate(Date.UTC(year, month, lastDay));
  return isoDate(Date.UTC(year, month, d) - 86400000);
}
