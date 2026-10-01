import { Badge } from '../ui/Badge';
import { ATTENDANCE_FLAG_MAP, WORK_TYPE_LABELS } from '../../constants/attendance';

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
            {meta.label}
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
