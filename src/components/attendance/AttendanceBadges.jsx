import { Badge } from '../ui/Badge';
import { ATTENDANCE_FLAG_MAP, WORK_TYPE_LABELS } from '../../constants/attendance';
import { isSpecialLeave, usageLabel } from '../../constants/leaveKinds';

/** 연차 외 휴가 날은 연차 대신 휴가 이름(경조휴가·공가(오전) 등)을 보여 줍니다. */
function flagLabel(flag, meta, leave) {
  if (!flag.startsWith('leave_') || !isSpecialLeave(leave?.leaveKind)) return meta.label;
  return usageLabel({ type: leave.kind, halfPeriod: leave.period, kind: leave.leaveKind });
}

const HIDDEN_WITH_OTHERS = new Set(['none', 'holiday']);

export function AttendanceFlags({ flags = [], leave, limit }) {
  const visible = flags.filter((flag) => flags.length === 1 || !HIDDEN_WITH_OTHERS.has(flag));
  const shown = limit ? visible.slice(0, limit) : visible;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((flag) => {
        const meta = ATTENDANCE_FLAG_MAP[flag] || { label: flag, variant: 'default' };
        const pending = leave?.status === 'pending' && flag.startsWith('leave_');
        return (
          <Badge key={flag} variant={meta.variant}>
            {flagLabel(flag, meta, leave)}
            {pending ? '(대기)' : ''}
          </Badge>
        );
      })}
    </span>
  );
}

/** site: 소속과 다른 사업장에서 기록했을 때 그 사업장 이름 */
export function WorkTypeLabel({ type, place, site }) {
  const remote = type && type !== 'office';
  if (!remote && !site) return null;
  return (
    <span className="text-[12px] text-[#6d28d9]">
      {remote ? WORK_TYPE_LABELS[type] || type : `${site} 사업장`}
      {remote && place ? ` · ${place}` : ''}
    </span>
  );
}
