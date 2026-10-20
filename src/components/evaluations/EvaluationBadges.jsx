import { Badge } from '../ui/Badge';
import { EVALUATION_STATUS_LABELS, OUTCOMES, REMINDER_DAYS } from '../../constants/evaluation';

const STATUS_VARIANTS = { pending: 'warning', submitted: 'info', confirmed: 'success', cancelled: 'default' };
const OUTCOME_VARIANTS = { regular: 'success', extend: 'orange', reject: 'danger' };

export function EvaluationStatusBadge({ status }) {
  return <Badge variant={STATUS_VARIANTS[status] || 'default'}>{EVALUATION_STATUS_LABELS[status] || status}</Badge>;
}

export function OutcomeBadge({ outcome }) {
  if (!OUTCOMES[outcome]) return null;
  return <Badge variant={OUTCOME_VARIANTS[outcome]}>{OUTCOMES[outcome]}</Badge>;
}

/** 작성 대기인 평가의 남은 날짜 */
export function DueBadge({ item }) {
  if (item.status !== 'pending') return null;
  const days = item.daysLeft;
  if (days < 0) return <Badge variant="danger">{-days}일 지남</Badge>;
  if (days === 0) return <Badge variant="danger">오늘 마감</Badge>;
  if (days <= REMINDER_DAYS) return <Badge variant="orange">D-{days}</Badge>;
  return <span className="text-[12px] text-stripe-muted">D-{days}</span>;
}
