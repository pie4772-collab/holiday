/** 입사 서류 전자 작성. 서버와 화면이 같은 양식 정의·문구·계산을 씁니다. */

export const ONBOARDING_FORMS = [
  { kind: 'contract', label: '근로계약서', docType: '근로계약서', seal: true },
  { kind: 'wage', label: '임금결정통지서', docType: '임금결정통지서', seal: true },
  { kind: 'pledge', label: '서약서(입사자용)', docType: '서약서', seal: false },
  { kind: 'ethics', label: '윤리서약서', docType: '윤리서약서', seal: false },
];

export const ONBOARDING_KINDS = ONBOARDING_FORMS.map((f) => f.kind);

export function onboardingForm(kind) {
  return ONBOARDING_FORMS.find((f) => f.kind === kind) || null;
}

export const ONBOARDING_STATUS = {
  requested: { label: '작성 대기', variant: 'warning' },
  signed: { label: '작성 완료', variant: 'success' },
  cancelled: { label: '요청 취소', variant: 'default' },
};

export const INSURANCES = [
  { key: 'employment', label: '고용보험' },
  { key: 'accident', label: '산재보험' },
  { key: 'pension', label: '국민연금' },
  { key: 'health', label: '건강보험' },
];

export const DEFAULT_WAGE_TERMS = [
  '월급여 : 기본급, 연장수당, 제수당(교통비.직책.직무.근속.가족.자격)로 구성',
  '상여금 : 기본급의 25%를 매월 지급',
  '임금지급일 : 매월 25일(휴일의 경우에는 전일 지급)',
  '지급방법 : 근로자 명의 예금통장에 입금',
  '지급기준 : 급여(신입-3개월이하 80%, 3개월초과 100%, 경력-100%) 상여(신입- 〃 20%, 〃 25%, 경력-100%)',
].join('\n');

export const DEFAULT_PROBATION =
  '신입 3개월(경력자 해당無) 수습 기간 중 평가를 통해 업무 적격성 판단 후 근로계약이 종료될 수 있다.';

export const CONTRACT_LEAVE_CLAUSE = ['연차유급휴가', '연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함'];

/** 사회보험(9조) 다음에 오는 10~12조입니다. */
export const CONTRACT_CLOSING_CLAUSES = [
  [
    '근로계약서 교부',
    '사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)',
  ],
  [
    '근로계약, 취업규칙 등의 성실한 이행의무',
    '사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함.',
  ],
  ['기타', '이 계약에 정함이 없는 사항은 근로기준법령에 의함'],
];

export const PLEDGE_TEXT = {
  intro: '본인이 귀사에 채용되어 근무함에 있어서 하기 사항을 준수할 것을 서약합니다.',
  items: [
    '귀사의 제 규칙과 명령시달 등을 준수함은 물론 상사의 업무상 지시에 순종하겠음.',
    '회사 업무에 전력을 경주하여 소관 업무를 성실히 수행함은 물론 고의 또는 태만으로 명령 취지에 위배됨이 없도록 하겠음.',
    '귀사의 기밀사항 또는 고객의 기밀사항은 그 대소를 막론하고 외부에 누설하지 아니하겠음.',
    '업무를 진행함에 있어 고객과의 신의를 지키며, 비윤리적인 행동을 하지 않으며, 투명한 업무진행으로 책임을 다하겠음.',
    '직원 상호간에 인격을 존중하며, 예의와 우애를 지켜 귀사 직원으로서 명예를 손상 케함이 없도록 하겠음.',
  ],
  closing:
    '이상과 같이 서약하며 만일 서약 사항을 위반하여 회사에 손해를 끼치거나, 사내 질서를 어지럽혔다면 징계처벌은 물론 해당 손해액을 지체 없이 변상하겠습니다.',
};

export const ETHICS_TEXT = {
  intro:
    '본인은 직무를 수행함에 있어 고객에게는 정직하고, 협력회사에 대해서는 공정한 거래를 통해 상호발전을 추구하며, 경쟁사와는 정정당당하게 경쟁하여 주주와 사회에 책임과 의무를 다하기 위하여 다음 사항을 준수할 것을 서약합니다.',
  items: [
    '업무를 수행함에 있어서 윤리규범을 준수하며, 어떠한 불공정 거래 및 부정·비리 행위도 하지 않겠습니다.',
    '업무수행 과정에서 윤리규범에 반하는 행위를 강요 받거나 부당한 행위를 인지하였을 경우에는 이를 회사에 즉시 보고하며, 회사의 지침에 따르겠습니다.',
    '윤리강령을 위반한 경우 해당 행위에 대한 책임을 지겠습니다.',
    '업무를 진행함에 있어 고객과의 신의를 지키며, 투명한 업무진행으로 책임을 다하겠습니다.',
  ],
  closing: '상기 내용을 숙지하며, 회사의 윤리규범을 성실히 수행할 것을 서약합니다.',
};

/** 양식마다 동의 체크 문구입니다. */
export const ONBOARDING_AGREEMENTS = {
  contract: '위 근로계약 내용을 읽고 이해했으며, 이에 동의하여 서명합니다.',
  wage: '위 임금 결정 내용을 확인했습니다.',
  pledge: '위 서약 사항을 읽고 이해했으며, 준수할 것을 서약합니다.',
  ethics: '위 윤리규범 준수 사항을 읽고 이해했으며, 성실히 지킬 것을 서약합니다.',
};

/** 양식마다 입사자가 직접 적는 칸입니다. */
export const EMPLOYEE_INPUTS = {
  contract: ['address', 'phone'],
  wage: [],
  pledge: ['address'],
  ethics: [],
};

export const EMPLOYEE_INPUT_LABELS = { address: '주소', phone: '연락처' };

export function kstToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export function toAmount(value) {
  const n = Number(String(value ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 월상여 기본값: 기본급의 25%, 10원 미만 버림. */
export function defaultMonthlyBonus(basePay) {
  return Math.floor((toAmount(basePay) * 0.25) / 10) * 10;
}

export function wageTotals({ basePay, allowance, monthlyBonus }) {
  const monthly = toAmount(basePay) + toAmount(allowance);
  const salaryYear = monthly * 12;
  const bonusYear = toAmount(monthlyBonus) * 12;
  return { monthly, salaryYear, bonusYear, annual: salaryYear + bonusYear };
}

/** 회계 연도(3월~이듬해 2월) 기준 적용기간 기본값. */
export function defaultWagePeriod(dateKey) {
  const [y, m] = String(dateKey || '').split('-').map(Number);
  if (!y) return '';
  const start = m >= 3 ? y : y - 1;
  const yy = (n) => String(n).slice(2);
  return `${yy(start)}' 3월 ~ ${yy(start + 1)}' 2월(1년)`;
}
