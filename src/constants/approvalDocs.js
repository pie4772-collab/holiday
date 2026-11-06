/** 전자결재 양식·상태 (서버·화면 공용) */

export const DOC_STATUS_LABELS = { pending: '진행 중', approved: '완료', rejected: '반려', withdrawn: '회수' };
export const STEP_STATUS_LABELS = { waiting: '대기', pending: '결재 대기', approved: '승인', rejected: '반려', skipped: '건너뜀' };
const AGREEMENT_STATUS_LABELS = { ...STEP_STATUS_LABELS, pending: '합의 대기', approved: '합의', rejected: '반대' };

const RECEIVE_STATUS_LABELS = { ...STEP_STATUS_LABELS, pending: '수신 대기', approved: '수신', rejected: '반려' };

/** 결재선 단계 종류. 합의는 결재 전에 관련 부서의 동의를 받는 단계로, 반대하면 문서가 반려됩니다. */
export const STEP_KINDS = { approval: '결재', agreement: '합의' };

/** 마지막에 붙는 인사 확인 단계(이전 문서). 시스템관리자·인사담당(is_admin)이 처리합니다. */
export const HR_STEP = '인사';

/**
 * 이전 방식(인사담당 고정 수신) 문서의 첫 단계. 합의란에 "인사 수신"으로 표시합니다.
 * 기안자 사업장의 인사담당이 처리하고, 수신하면서 지정한 결재·합의 단계가 뒤에 붙습니다. 새 문서에는 만들지 않습니다.
 */
export const RECEIVE_STEP = '인사 수신';

/** staged 양식의 결재선: 결재자를 지정한 순서대로 먼저, 합의자는 그 뒤에 지정한 순서대로 */
export function approvalsFirst(line) {
  return [...line.filter((item) => item.kind !== 'agreement'), ...line.filter((item) => item.kind === 'agreement')];
}

export function stepStatusLabel(kind, status, role) {
  if (role === RECEIVE_STEP) return RECEIVE_STATUS_LABELS[status] || status;
  return (kind === 'agreement' ? AGREEMENT_STATUS_LABELS : STEP_STATUS_LABELS)[status] || status;
}
export const MAX_REFS = 20;
export const MAX_LINE = 10;
export const TITLE_MAX = 200;

/* ───────────── 인사명령 ───────────── */

export const ORDER_TYPES = ['입사', '퇴사', '승진', '전보', '직위 변경', '겸직', '휴직', '복직', '기타'];
export const ORDER_ENTRIES_MAX = 30;
/** 인사명령 종이 양식 맨 위의 회사명 */
export const ORDER_COMPANY_TITLE = '동양철관주식회사';
/** 대상자 줄의 칸: [키, 이름, 최대 글자 수] */
export const ORDER_ENTRY_FIELDS = [
  ['name', '성명', 50],
  ['jobType', '직종', 30],
  ['workplace', '사업장', 50],
  ['department', '부서', 50],
  ['position', '직위', 50],
];

/** 인사명령 제목: 인사명령 (입사) 김민석 외 1명 */
export function orderTitle(body = {}) {
  const entries = body.entries || [];
  const names = entries.length ? `${entries[0].name}${entries.length > 1 ? ` 외 ${entries.length - 1}명` : ''}` : '';
  return [`인사명령${body.orderType ? ` (${body.orderType})` : ''}`, names].filter(Boolean).join(' ');
}

/** 발령번호: 문서번호 인사-2026-0013 → "인사 26 - 13호" */
export function orderNoText(documentNo) {
  const m = /^(.+)-(\d{4})-(\d+)$/.exec(documentNo || '');
  return m ? `${m[1]} ${m[2].slice(2)} - ${Number(m[3])}호` : '';
}

/** 발령일: 2026-11-01 → "26' 11/1부" */
export function orderDateText(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  return m ? `${m[1].slice(2)}' ${Number(m[2])}/${Number(m[3])}부` : '';
}

/**
 * line: select 기안자가 결재자·합의자를 지정(지정한 순서대로),
 *       staged 기안자가 결재자·합의자를 지정하고 결재가 모두 끝난 뒤 합의 — 합의자는 합의하며 다음 결재선을 붙일 수 있음,
 *       none 결재선 없음
 * hr: 지정한 결재선 뒤에 인사 확인 단계를 붙입니다.
 * permission: 이 권한이 있는 사람만 기안 (내부 결재 양식)
 * selfApproval: 결재선을 비우면 기안자 본인 결재로 바로 완료합니다.
 * retired: 새로 기안할 수 없고 이전 문서 보기에만 씁니다.
 * sheetTitle: 문서 양식 맨 위 제목 (없으면 "양식 이름 + 서")
 * fields.type: text, textarea, date, amount(원), select, richtext(서식 있는 본문, 서버에서 허용 태그만 남김),
 *              orderEntries(인사명령 대상자 줄: 성명·직종·사업장·부서·직위)
 * layout: order 면 인사명령 종이 양식(회사명·발령번호·결재란·발령 구분·대상자 표·발령일)으로 그립니다.
 * numberFrom: { 연도: 첫 번호 } — 종이 결재로 이미 쓴 번호 다음부터 매길 때
 */
export const DOC_FORMS = [
  {
    key: 'general',
    label: '일반 기안',
    prefix: '기안',
    line: 'staged',
    hr: false,
    sheetTitle: '기안',
    description: '품의·보고 등 정해진 양식이 없는 문서',
    fields: [{ key: 'content', label: '내용', type: 'richtext', required: true, max: 200000 }],
  },
  {
    key: 'business_trip',
    label: '출장 신청',
    prefix: '출장',
    line: 'staged',
    hr: false,
    description: '국내·해외 출장 계획과 예상 경비',
    fields: [
      { key: 'destination', label: '출장지', type: 'text', required: true, max: 100 },
      { key: 'startDate', label: '시작일', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date', required: true },
      { key: 'purpose', label: '목적', type: 'textarea', required: true, max: 2000 },
      { key: 'companions', label: '동행자', type: 'text', max: 200 },
      { key: 'expense', label: '예상 경비(원)', type: 'amount' },
    ],
  },
  {
    key: 'condolence',
    label: '경조금 신청',
    prefix: '경조',
    line: 'staged',
    hr: false,
    description: '경조사 발생 시 경조금 지급 신청',
    fields: [
      {
        key: 'eventType',
        label: '경조 구분',
        type: 'select',
        required: true,
        options: [
          '본인 결혼',
          '자녀 결혼',
          '형제자매 결혼',
          '자녀 출생',
          '부모 회갑·칠순',
          '본인·배우자 부모 사망',
          '배우자 사망',
          '자녀 사망',
          '조부모·외조부모 사망',
          '형제자매 사망',
          '기타',
        ],
      },
      { key: 'relation', label: '대상자 관계', type: 'text', required: true, max: 50 },
      { key: 'targetName', label: '대상자 성명', type: 'text', required: true, max: 50 },
      { key: 'eventDate', label: '경조일', type: 'date', required: true },
      { key: 'content', label: '내용', type: 'textarea', max: 2000 },
    ],
  },
  {
    key: 'training_request',
    label: '교육 신청',
    prefix: '교육',
    line: 'staged',
    hr: false,
    description: '외부 교육·세미나 참가 신청',
    fields: [
      { key: 'courseName', label: '교육명', type: 'text', required: true, max: 200 },
      { key: 'institution', label: '교육기관', type: 'text', required: true, max: 100 },
      { key: 'startDate', label: '시작일', type: 'date', required: true },
      { key: 'endDate', label: '종료일', type: 'date', required: true },
      { key: 'cost', label: '교육비(원)', type: 'amount' },
      { key: 'purpose', label: '목적', type: 'textarea', required: true, max: 2000 },
    ],
  },
  {
    key: 'certificate_issue',
    label: '증명서 발급 품의',
    prefix: '발급',
    line: 'staged',
    hr: false,
    permission: 'certificates.manage',
    selfApproval: true,
    sheetTitle: '증명서 발급 품의',
    description: '인사담당이 증명서 발급을 관리팀 내부 결재로 올립니다 (최종 승인되면 자동 발급, 결재자 없이 본인 결재도 가능)',
    fields: [],
  },
  {
    key: 'personnel_order',
    label: '인사명령',
    prefix: '인사',
    line: 'staged',
    hr: false,
    permission: 'employees.manage',
    layout: 'order',
    numberFrom: { 2026: 14 },
    sheetTitle: '인사명령',
    description: '입사·승진·전보 등 인사 발령. 결재가 끝나면 발령번호(인사 연도 - 번호호)가 매겨집니다.',
    fields: [
      { key: 'orderType', label: '발령 구분', type: 'select', required: true, options: ORDER_TYPES },
      { key: 'entries', label: '발령 대상', type: 'orderEntries', required: true, max: ORDER_ENTRIES_MAX },
      { key: 'effectiveDate', label: '발령일', type: 'date', required: true },
      { key: 'content', label: '비고', type: 'textarea', max: 2000 },
    ],
  },
  {
    key: 'certificate',
    label: '증명서 발급 신청(이전)',
    prefix: '증명',
    line: 'none',
    hr: true,
    retired: true,
    description: '이전 방식의 직원 증명서 신청. 지금은 "증명서" 메뉴에서 신청합니다.',
    fields: [],
  },
];

export const DOC_FORM_MAP = Object.fromEntries(DOC_FORMS.map((form) => [form.key, form]));

export function formLabel(key) {
  return DOC_FORM_MAP[key]?.label || key;
}

/** 문서 양식의 회사명 칸 */
export const COMPANY_LEGAL_NAME = 'KBI동양철관(주)';

export function sheetTitle(form) {
  if (!form) return '문서';
  return form.sheetTitle || `${form.label}서`;
}

/** 결재선 규칙 설명 (양식 선택 화면) */
export function formLineText(form) {
  if (form.line === 'staged') return '지정한 결재 → 합의 (합의자가 다음 결재선 지정 가능)';
  const line = form.line === 'select' ? '지정한 결재·합의' : '';
  return [line, form.hr ? '인사 확인' : ''].filter(Boolean).join(' → ');
}

export function formatAmount(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString('ko-KR')}원` : String(value);
}
