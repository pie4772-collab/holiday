/** 증명서 종류·기재 항목 (서버·화면 공용) */

/** for: active 재직자만, terminated 퇴직자만, any 모두 */
export const CERT_TYPES = {
  employment: { label: '재직증명서', heading: '재 직 증 명 서', for: 'active' },
  career: { label: '경력증명서', heading: '경 력 증 명 서', for: 'any' },
  retirement: { label: '퇴직증명서', heading: '퇴 직 증 명 서', for: 'terminated' },
};

export const CERT_TYPE_KEYS = Object.keys(CERT_TYPES);

/**
 * 근로기준법 제39조: 근로자가 요구한 사항만 적습니다. 성명·재직기간은 항상 적습니다.
 * input: 직접 입력하는 항목, terminatedOnly: 퇴직자만
 */
export const CERT_ITEMS = [
  { key: 'birthDate', label: '생년월일', defaultOn: true },
  { key: 'address', label: '주소', defaultOn: false },
  { key: 'department', label: '소속', defaultOn: true },
  { key: 'position', label: '직위', defaultOn: true },
  { key: 'duty', label: '담당업무', defaultOn: false, input: true, max: 200 },
  { key: 'retireReason', label: '퇴직사유', defaultOn: false, input: true, max: 100, terminatedOnly: true },
];

export const CERT_ITEM_KEYS = CERT_ITEMS.map((item) => item.key);

/** approval 직원 신청 → 내부 결재, admin 인사담당 직접 품의 → 내부 결재, self 이전 방식(직원 바로 발급) */
export const CERT_CHANNEL_LABELS = { approval: '직원 신청', admin: '인사 품의', self: '직원 직접 발급(이전)' };
export const CERT_STATUS_LABELS = { issued: '발급', revoked: '취소' };

/** 직원이 신청할 수 있는 증명서. 퇴직증명서는 퇴직자가 로그인할 수 없어 인사담당이 품의로 발급합니다. */
export const REQUESTABLE_CERT_TYPES = ['employment', 'career'];
export const CERT_REQUEST_STATUS_LABELS = {
  requested: '접수 대기',
  processing: '내부 결재 중',
  issued: '발급 완료',
  rejected: '반려',
  cancelled: '신청 취소',
};
export const CERT_REQUEST_STATUS_BADGE = {
  requested: 'warning',
  processing: 'info',
  issued: 'success',
  rejected: 'danger',
  cancelled: 'default',
};

export const CERT_PURPOSE_PRESETS = ['금융기관 제출용', '관공서 제출용', '비자 발급용', '어린이집·학교 제출용', '이직·입사 제출용', '개인 보관용'];

export const SEAL_MAX_BYTES = 300 * 1024;
export const VERIFY_PATH = '/verify';

/** 시행령 제19조: 퇴직 후 3년 안에 청구한 경우가 법정 발급 대상입니다. */
export const LEGAL_CLAIM_YEARS = 3;

export function certTypeAllowed(type, isActive) {
  const rule = CERT_TYPES[type]?.for;
  if (!rule) return false;
  if (rule === 'active') return Boolean(isActive);
  if (rule === 'terminated') return !isActive;
  return true;
}

export function defaultCertItems(isActive) {
  return CERT_ITEMS.filter((item) => item.defaultOn && (!item.terminatedOnly || !isActive)).map((item) => item.key);
}

/** 신청 화면의 초기값. */
export function initialCertRequest(certType, isActive = true) {
  return { certType, items: defaultCertItems(isActive), duty: '', retireReason: '', purpose: '', submitTo: '', showSeal: true };
}

export function certStatement(type, isActive) {
  if (type === 'employment') return '위와 같이 재직하고 있음을 증명합니다.';
  if (type === 'retirement') return '위와 같이 근무하다 퇴직하였음을 증명합니다.';
  return isActive ? '위와 같이 근무하고 있음을 증명합니다.' : '위와 같이 근무하였음을 증명합니다.';
}

export function certNumberText(certNo) {
  return certNo ? `제 ${certNo} 호` : '';
}

/** 진위 확인 화면에 보여 줄 성명: 홍길동 → 홍*동, 홍길 → 홍* */
export function maskName(name) {
  const chars = [...String(name || '').trim()];
  if (chars.length <= 1) return chars.join('');
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/** 입사일~종료일의 근속을 "N년 N개월"로 적습니다(종료일 포함). */
export function serviceLength(start, end) {
  if (!start || !end) return '';
  const [sy, sm, sd] = start.split('-').map(Number);
  const last = new Date(Date.UTC(...end.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))));
  last.setUTCDate(last.getUTCDate() + 1);
  let months = (last.getUTCFullYear() - sy) * 12 + (last.getUTCMonth() + 1 - sm);
  if (last.getUTCDate() < sd) months -= 1;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years && !rest) return '1개월 미만';
  return [years ? `${years}년` : '', rest ? `${rest}개월` : ''].filter(Boolean).join(' ');
}
