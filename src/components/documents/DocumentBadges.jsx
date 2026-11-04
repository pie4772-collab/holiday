import { Badge } from '../ui/Badge';
import { DOC_STATUS_LABELS } from '../../constants/approvalDocs';

const STATUS_VARIANTS = { pending: 'info', approved: 'success', rejected: 'danger', withdrawn: 'default' };
const STEP_VARIANTS = { pending: 'warning', approved: 'success', rejected: 'danger', waiting: 'default', skipped: 'default' };

export function DocumentStatusBadge({ status, className = '' }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] || 'default'} className={className}>
      {DOC_STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function StepStatusBadge({ step }) {
  return <Badge variant={STEP_VARIANTS[step.status] || 'default'}>{step.statusLabel}</Badge>;
}
