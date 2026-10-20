/** 입사 구분·수습·평가 일정 (서버·화면 공용) */

export const HIRE_TYPES = [
  { key: 'new', label: '신입', hint: '수습 3개월 → 수습평가, 입사 1년 평가' },
  { key: 'experienced', label: '경력', hint: '처음부터 정규직 → 3개월 평가' },
];

export const HIRE_TYPE_LABELS = Object.fromEntries(HIRE_TYPES.map((t) => [t.key, t.label]));

export const PROBATION_MONTHS = 3;

export const COMPANY_NAME = 'KBI동양철관';

/** months: 입사일부터 이 기간이 끝나는 날이 평가 기한입니다. formTitle: 평가서 제목 */
export const EVALUATION_KINDS = {
  probation: { label: '수습평가', months: PROBATION_MONTHS, hireType: 'new', formTitle: '수습기간 근무평가서' },
  three_month: { label: '3개월 평가', months: 3, hireType: 'experienced', formTitle: '입사 3개월 근무평가서' },
  one_year: { label: '입사 1년 평가', months: 12, hireType: 'new', formTitle: '입사 1년 근무평가서' },
};

export const PLAN_KINDS = {
  new: ['probation', 'one_year'],
  experienced: ['three_month'],
};

/** 근무평가서 양식의 평가항목 (분야별 1~5점, 20개 항목 100점 만점) */
export const EVALUATION_GROUPS = [
  {
    key: 'attitude',
    label: '근무태도',
    items: [
      { key: 'attendance', label: '근태상황', question: '결근 및 지각, 조퇴 등에 따른 근태는 어떠한가?' },
      { key: 'initiative', label: '적극성', question: '배우려는 열의가 있으며, 매사에 적극적인가?' },
      { key: 'cooperation', label: '협조성', question: '타 부서와의 업무 공유와 협업이 잘 이뤄지는가?' },
      { key: 'responsibility', label: '책임감', question: '업무를 책임감 있고 정확하게 수행하는가?' },
      { key: 'compliance', label: '준법성', question: '규칙을 준수하며 사내 질서유지를 위해 노력하는가?' },
    ],
  },
  {
    key: 'ability',
    label: '직무능력',
    items: [
      { key: 'judgment', label: '이해판단력', question: '회사의 방침이나 상사의 지시를 정확히 이해하고 수행하는가?' },
      { key: 'knowledge', label: '직무지식', question: '직무수행에 필요한 전문지식과 대처능력을 보유하고 있는가?' },
      { key: 'execution', label: '수행능력', question: '업무나 지시사항을 정확히 이해하고, 만족한 결과를 도출하는가?' },
      { key: 'communication', label: '소통능력', question: '의사 또는 목적을 정확하고 논리적으로 표현하는가?' },
      { key: 'development', label: '자기개발', question: '업무 및 개인의 능력향상을 위해 노력하고 있는가?' },
      { key: 'drive', label: '업무추진력', question: '문제의 핵심을 정확히 이해하고 효율적으로 대응하는가?' },
      { key: 'workAttitude', label: '업무태도', question: '지시받은 업무를 성실하고 신속하게 처리하는가?' },
      { key: 'loyalty', label: '애사심', question: '회사시설(소모품 포함)을 아끼고 환경개선에 적극적인가?' },
    ],
  },
  {
    key: 'performance',
    label: '근무실적',
    items: [
      { key: 'deadline', label: '업무기한', question: '담당 및 수명업무를 기한 내 처리하는가?' },
      { key: 'completeness', label: '업무완성도', question: '담당업무를 수행함에 있어 그 내용이 정확하고 효과가 있는가?' },
      { key: 'goal', label: '목표달성도', question: '업무목표를 정확히 이해하고 달성하기 위해 노력하는가?' },
    ],
  },
  {
    key: 'etc',
    label: '기타',
    items: [
      { key: 'adaptability', label: '적응력', question: '업무가 적성에 맞고 조직에 잘 적응하고 있는가?' },
      { key: 'sincerity', label: '성실성', question: '주어진 역할에 성실한 자세로 수행하는가?' },
      { key: 'perseverance', label: '인내심', question: '끈기를 가지고 감정기복 없이 업무를 수행하는가?' },
      { key: 'potential', label: '가능성', question: '평가기간 내 업무수행 능력이 향상되었는가?' },
    ],
  },
];

export const EVALUATION_ITEMS = EVALUATION_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.key, groupLabel: group.label }))
);

export const SCORE_LABELS = { 1: '매우 미흡', 2: '미흡', 3: '보통', 4: '우수', 5: '매우 우수' };
export const MAX_ITEM_SCORE = 5;
export const MAX_TOTAL_SCORE = EVALUATION_ITEMS.length * MAX_ITEM_SCORE;

/** 최종 평가 점수가 이 점수 이상이면 정식 채용, 미만이면 수습 연장 또는 계약 종료 */
export const PASS_SCORE = 75;

export const OUTCOMES = {
  regular: '정식 채용',
  extend: '수습 연장',
  reject: '계약 종료',
};

/** 수습평가 점수로 고를 수 있는 결과 */
export function allowedOutcomes(total) {
  return total >= PASS_SCORE ? ['regular'] : ['extend', 'reject'];
}

export const EVALUATION_STATUS_LABELS = {
  pending: '작성 대기',
  reviewing: '임원 의견 대기',
  submitted: '확정 대기',
  confirmed: '확정',
  cancelled: '취소',
};

/** 진행 중으로 보는 상태 */
export const OPEN_STATUSES = ['pending', 'reviewing', 'submitted'];

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

export function documentNumber(id, createdAt) {
  return `평가-${String(createdAt || '').slice(0, 4)}-${String(id).padStart(4, '0')}`;
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
