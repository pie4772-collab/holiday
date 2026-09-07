import { Badge } from './ui/Badge';

const STATUS = {
  pending: { label: '승인 대기', variant: 'warning' },
  approved: { label: '승인됨', variant: 'success' },
  rejected: { label: '반려', variant: 'danger' },
};

export function LeaveUsageList({ usages = [], emptyText = '신청 내역이 없습니다.' }) {
  if (!usages.length) {
    return <p className="px-5 py-8 text-sm text-stripe-muted text-center">{emptyText}</p>;
  }

  return (
    <div className="divide-y divide-[#f0f3f7]">
      {usages.map((usage) => {
        const status = STATUS[usage.status] || STATUS.pending;
        return (
          <div key={usage.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-mono text-stripe-text">{usage.date}</p>
              <p className="text-[13px] text-stripe-muted mt-0.5 truncate">
                {usage.reason || '사유 없음'}
              </p>
              {usage.status === 'rejected' && usage.rejectReason && (
                <p className="text-[12px] text-[#df1b41] mt-1">반려: {usage.rejectReason}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant={usage.type === 'full' ? 'info' : 'warning'}>
                {usage.type === 'full' ? '연차' : '반차'}
              </Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
