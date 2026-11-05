export const POSITIONS = ['팀원', '팀장', '공장장', '이사', '상무', '전무', '임원', '대표이사'];
export const DEFAULT_POSITION = '팀원';
export const JOB_TYPES = ['사무직', '생산직'];

/** 임원 직위. 급호가 없습니다. */
export const EXECUTIVE_RANKS = ['사장', '부사장', '전무', '상무', '이사'];

/** 직위(호칭). 결재 체인에 쓰는 직급(팀원·팀장·임원)과 별개로 인사 기록에만 씁니다. 높은 순서입니다. */
export const JOB_RANKS = [...EXECUTIVE_RANKS, '부장', '차장', '과장', '대리', '사원'];

export function hasPayGrade(rank) {
  return !EXECUTIVE_RANKS.includes(rank);
}

/** 급호의 급. 직위마다 정해져 있고 사원은 학력에 따라 3·4·5급으로 나뉩니다. 높은 순서입니다. */
export const PAY_GRADES = [
  { key: '1급갑', rank: '부장', label: '1급갑' },
  { key: '1급을', rank: '차장', label: '1급을' },
  { key: '2급갑', rank: '과장', label: '2급갑' },
  { key: '2급을', rank: '대리', label: '2급을' },
  { key: '3급', rank: '사원', label: '3급 (대졸)' },
  { key: '4급', rank: '사원', label: '4급 (전문대졸)' },
  { key: '5급', rank: '사원', label: '5급 (고졸)' },
];
export const PAY_STEP_MAX = 14;

export function gradesForRank(rank) {
  return rank ? PAY_GRADES.filter((grade) => grade.rank === rank) : PAY_GRADES;
}

/** '1급갑', 7 → '1급갑07', '3급', 5 → '3급05' */
export function payGradeText(grade, step) {
  if (!grade || !step) return '';
  return `${grade}${String(step).padStart(2, '0')}`;
}

export function rankGradeText(employee) {
  return [employee?.jobRank, payGradeText(employee?.payGrade, employee?.payStep)].filter(Boolean).join(' · ');
}
export const LEAVE_REASON_PRESETS = ['개인 사유', '병원 진료', '가족 행사', '경조사', '휴식', '자녀 돌봄', '공가'];
export const ACCRUAL_DESCRIPTION_PRESETS = ['관리자 수동 조정', '전년도 이월', '포상 휴가', '연차 정산 차감', '오류 정정'];
export const DEFAULT_PASSWORD = '123456';
export const INITIAL_ADMIN_NAMES = ['이재용', '박지은', '이규형', '김춘태', '김남은', '최윤경'];

/** 공장장 결재 단계에서 승인 가능한 직급 (공장장·임원급) */
export const EXECUTIVE_POSITIONS = ['공장장', '이사', '상무', '전무', '임원'];
export const LEAD_POSITIONS = ['팀장'];

/** 연차 발생·지급 대상에서 제외 (임원) */
export const LEAVE_EXEMPT_POSITIONS = ['이사', '상무', '전무', '대표이사', '임원'];

/** 결재 체인상 임원 티어 */
export const OFFICER_POSITIONS = ['이사', '상무', '전무', '임원'];

export const STRATEGY_DEPT_CODE = '19';
export const SEOUL_WORKPLACE_CODE = '1';
export const STRATEGY_APPROVER_EMP_NO = '2023117';

export function isLeaveExemptPosition(position) {
  return LEAVE_EXEMPT_POSITIONS.includes(String(position || '').trim());
}

export function isOfficerPosition(position) {
  return OFFICER_POSITIONS.includes(String(position || '').trim());
}

export const APPROVAL_SEAT_DEFAULTS = [
  {
    seatKey: 'management',
    title: '관리임원',
    stepRole: '임원',
    sortOrder: 1,
    departments: ['재경팀', '관리팀', '구매팀'],
  },
  {
    seatKey: 'export',
    title: '수출임원',
    stepRole: '임원',
    sortOrder: 2,
    departments: ['수출1팀', '수출2팀'],
  },
  {
    seatKey: 'sales',
    title: '영업임원',
    stepRole: '임원',
    sortOrder: 3,
    departments: ['영업1팀', '영업2팀'],
  },
  {
    seatKey: 'ceo',
    title: '대표이사',
    stepRole: '대표이사',
    sortOrder: 10,
    departments: [],
  },
  {
    seatKey: 'strategy',
    title: '경영전략실 담당',
    stepRole: '담당',
    sortOrder: 20,
    departments: ['경영전략실'],
    employeeEmpNo: STRATEGY_APPROVER_EMP_NO,
  },
];
