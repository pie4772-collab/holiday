export const ROLE_LABELS = {
  system_admin: '시스템관리자',
  hr: '인사담당',
  payroll: '급여담당',
  site_admin: '사업장관리자',
  dept_head: '부서장',
};

/** 관리자가 지정하는 역할(부서장은 직급으로 자동 판정) */
export const ASSIGNABLE_ROLES = ['system_admin', 'hr', 'payroll', 'site_admin'];

export const ROLE_DESCRIPTIONS = {
  system_admin: '전체 기능·역할 지정·메일 서버',
  hr: '사원 명부·인사기록카드·연차·근태·결재 라인·보고서 (연차 결재 관리자)',
  payroll: 'IFRS 연차부채·연차 정산·통상임금·근태 조회',
  site_admin: '본인 사업장의 연차 관리·명부·인사기록카드 조회·근태 조회/정정·이력·보고서',
};

export const ROLE_BADGE_VARIANTS = {
  system_admin: 'purple',
  hr: 'info',
  payroll: 'orange',
  site_admin: 'primary',
  dept_head: 'default',
};

export function hasPermission(employee, permission) {
  return Boolean(employee?.permissions?.includes(permission));
}

export function isScopedPermission(employee, permission) {
  return Boolean(employee?.scopedPermissions?.includes(permission));
}

export function canAccessAdmin(employee) {
  return Boolean(employee?.canAccessAdmin);
}
