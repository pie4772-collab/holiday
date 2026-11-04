/** 전자결재 양식·상태 (서버·화면 공용) */

export const DOC_STATUS_LABELS = { pending: '진행 중', approved: '완료', rejected: '반려', withdrawn: '회수' };
export const STEP_STATUS_LABELS = { waiting: '대기', pending: '결재 대기', approved: '승인', rejected: '반려', skipped: '건너뜀' };
const AGREEMENT_STATUS_LABELS = { ...STEP_STATUS_LABELS, pending: '합의 대기', approved: '합의', rejected: '반대' };

/** 결재선 단계 종류. 합의는 결재 전에 관련 부서의 동의를 받는 단계로, 반대하면 문서가 반려됩니다. */
export const STEP_KINDS = { approval: '결재', agreement: '합의' };

export function stepStatusLabel(kind, status) {
  return (kind === 'agreement' ? AGREEMENT_STATUS_LABELS : STEP_STATUS_LABELS)[status] || status;
}

/** 마지막에 붙는 인사 확인 단계. 시스템관리자·인사담당(is_admin)이 처리합니다. */
export const HR_STEP = '인사';
export const MAX_REFS = 20;
export const MAX_LINE = 10;
export const TITLE_MAX = 200;

/**
 * line: select 기안자가 결재자·합의자를 지정, none 결재선 없음
 * hr: 지정한 결재선 뒤에 인사 확인 단계를 붙입니다.
 * permission: 이 권한이 있는 사람만 기안 (내부 결재 양식)
 * retired: 새로 기안할 수 없고 이전 문서 보기에만 씁니다.
 * sheetTitle: 문서 양식 맨 위 제목 (없으면 "양식 이름 + 서")
 * fields.type: text, textarea, date, amount(원), select, richtext(서식 있는 본문, 서버에서 허용 태그만 남김)
 */
export const DOC_FORMS = [
  {
    key: 'general',
    label: '일반 기안',
    prefix: '기안',
    line: 'select',
    hr: false,
    sheetTitle: '기안',
    description: '품의·보고 등 정해진 양식이 없는 문서',
    fields: [{ key: 'content', label: '내용', type: 'richtext', required: true, max: 200000 }],
  },
  {
    key: 'business_trip',
    label: '출장 신청',
    prefix: '출장',
    line: 'select',
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
    line: 'select',
    hr: true,
    description: '경조사 발생 시 경조금 지급 신청 (인사 확인)',
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
    line: 'select',
    hr: true,
    description: '외부 교육·세미나 참가 신청 (인사 확인)',
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
    line: 'select',
    hr: false,
    permission: 'certificates.manage',
    sheetTitle: '증명서 발급 품의',
    description: '인사담당이 증명서 발급을 관리팀 내부 결재로 올립니다 (최종 승인되면 자동 발급)',
    fields: [],
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
  const line = form.line === 'select' ? '지정한 결재·합의' : '';
  return [line, form.hr ? '인사 확인' : ''].filter(Boolean).join(' → ');
}

export function formatAmount(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString('ko-KR')}원` : String(value);
}
