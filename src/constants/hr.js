export const POSITIONS = ['팀원', '팀장', '공장장', '이사', '상무', '전무', '임원', '대표이사'];
export const DEFAULT_POSITION = '팀원';
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
