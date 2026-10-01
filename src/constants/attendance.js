/** 출퇴근 기록 유형. 사무실 외 유형은 허용 IP 밖에서도 장소를 입력하면 기록할 수 있습니다. */
export const WORK_TYPES = [
  { key: 'office', label: '사무실' },
  { key: 'outside', label: '외근' },
  { key: 'trip', label: '국내출장' },
  { key: 'overseas', label: '해외출장' },
];

export const WORK_TYPE_LABELS = Object.fromEntries(WORK_TYPES.map((t) => [t.key, t.label]));

/** 장소 입력이 필요한 유형 */
export const REMOTE_WORK_TYPES = ['outside', 'trip', 'overseas'];

/** 출장 유형 (집계에서 외근과 구분) */
export const TRIP_WORK_TYPES = ['trip', 'overseas'];

export const REMOTE_STATUS_LABELS = { pending: '확인 대기', approved: '확인됨', rejected: '반려' };

/** 하루의 경계. 이 시각 이전 퇴근은 전날 근무로, 출근은 이 시각부터 가능합니다. */
export const DAY_BOUNDARY_HOUR = 5;

export const NIGHT_START_MINUTES = 22 * 60;
export const NIGHT_END_MINUTES = 6 * 60;

export const PLACE_MAX_LENGTH = 100;

export const HALF_PERIODS = [
  { key: 'am', label: '오전' },
  { key: 'pm', label: '오후' },
];

export const HALF_PERIOD_LABELS = { am: '오전', pm: '오후' };

/** 판정 코드 → 화면 표시. 앞에 있을수록 대표 상태로 우선 표시합니다. */
export const ATTENDANCE_FLAGS = [
  { key: 'leave_full', label: '연차', variant: 'info' },
  { key: 'absent', label: '결근', variant: 'danger' },
  { key: 'missing_in', label: '출근 누락', variant: 'warning' },
  { key: 'missing_out', label: '퇴근 누락', variant: 'warning' },
  { key: 'late', label: '지각', variant: 'danger' },
  { key: 'early', label: '조퇴', variant: 'danger' },
  { key: 'not_yet', label: '미출근', variant: 'warning' },
  { key: 'remote_rejected', label: '외근·출장 반려', variant: 'danger' },
  { key: 'remote_pending', label: '외근·출장 확인 대기', variant: 'warning' },
  { key: 'working', label: '근무 중', variant: 'success' },
  { key: 'leave_am', label: '오전 반차', variant: 'info' },
  { key: 'leave_pm', label: '오후 반차', variant: 'info' },
  { key: 'leave_half', label: '반차', variant: 'info' },
  { key: 'holiday_work', label: '휴일 근무', variant: 'purple' },
  { key: 'trip', label: '출장', variant: 'purple' },
  { key: 'outside', label: '외근', variant: 'purple' },
  { key: 'overtime', label: '연장', variant: 'default' },
  { key: 'normal', label: '정상', variant: 'success' },
  { key: 'holiday', label: '휴일', variant: 'default' },
  { key: 'exempt', label: '판정 제외', variant: 'default' },
  { key: 'none', label: '-', variant: 'default' },
];

export const ATTENDANCE_FLAG_MAP = Object.fromEntries(ATTENDANCE_FLAGS.map((f) => [f.key, f]));

/** 기록 시각 표시. 근무일 다음날 새벽이면 '익일'을 붙입니다. */
export function formatClock(stamp, workDate) {
  if (!stamp) return '';
  const time = stamp.slice(11, 16);
  return workDate && stamp.slice(0, 10) > workDate ? `익일 ${time}` : time;
}

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (!value) return '-';
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
