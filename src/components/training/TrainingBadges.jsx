import { Badge } from '../ui/Badge';
import { ASSIGNMENT_STATUS, TRAINING_REMINDER_DAYS } from '../../constants/training';

export function TrainingStatusBadge({ status }) {
  const meta = ASSIGNMENT_STATUS[status];
  return <Badge variant={meta?.variant || 'default'}>{meta?.label || status}</Badge>;
}

/** 수료 기한까지 남은 날짜. 끝났거나(수료·마감) 아직 여유가 많으면 흐리게 보여줍니다. */
export function TrainingDueBadge({ daysLeft, done = false }) {
  if (done) return null;
  if (daysLeft < 0) return <Badge variant="danger">{-daysLeft}일 지남</Badge>;
  if (daysLeft === 0) return <Badge variant="danger">오늘 마감</Badge>;
  if (daysLeft <= TRAINING_REMINDER_DAYS) return <Badge variant="orange">D-{daysLeft}</Badge>;
  return <span className="text-[12px] text-stripe-muted">D-{daysLeft}</span>;
}

export function ProgressBar({ percent, className = '' }) {
  const value = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-[#e3e8ee] ${className}`}>
      <div
        className={`h-full rounded-full ${value >= 100 ? 'bg-[#09825d]' : 'bg-primary-500'}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
