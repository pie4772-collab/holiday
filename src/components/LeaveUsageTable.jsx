import { formatLeaveType } from '../utils/leaveCalculations';
import { Badge } from './ui/Badge';

const STATUS = {
  pending: { label: '대기', variant: 'warning' },
  approved: { label: '승인', variant: 'success' },
  rejected: { label: '반려', variant: 'danger' },
};

const compactBadgeClass = 'whitespace-nowrap text-[11px] px-1.5 py-0 leading-5';

function daysLabel(usage) {
  if (typeof usage.days === 'number') return usage.days;
  return usage.type === 'half' ? 0.5 : 1;
}

export function LeaveUsageTable({ usages, isLoading }) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-0 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-11 border-b border-[#f0f3f7] last:border-0" />
        ))}
      </div>
    );
  }

  if (!usages?.length) {
    return (
      <div className="py-12 text-center text-sm text-stripe-muted">연차 사용 내역이 없습니다.</div>
    );
  }

  return (
    <>
      <div className="settlement-cards mobile-card-list">
        {usages.map((usage) => {
          const status = STATUS[usage.status] || STATUS.pending;
          return (
            <div key={usage.id} className="mobile-card-item">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono font-medium text-stripe-text">{usage.date}</p>
                  <p className="text-[13px] text-stripe-muted mt-0.5">{usage.reason || '사유 없음'}</p>
                  {usage.status === 'rejected' && usage.rejectReason && (
                    <p className="text-[12px] text-[#df1b41] mt-1">반려: {usage.rejectReason}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={usage.type === 'full' ? 'info' : 'warning'} className={compactBadgeClass}>
                    {formatLeaveType(usage.type)}
                  </Badge>
                  <Badge variant={status.variant} className={compactBadgeClass}>
                    {status.label}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-xs tabular-nums text-stripe-muted">차감 {daysLabel(usage)}일</p>
            </div>
          );
        })}
      </div>

      <div className="settlement-table stripe-table-fit-wrap">
        <table className="stripe-table stripe-table-fit w-full">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '50%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>사용일</th>
              <th>유형</th>
              <th className="text-right">일수</th>
              <th>상태</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody>
            {usages.map((usage) => {
              const status = STATUS[usage.status] || STATUS.pending;
              return (
                <tr key={usage.id}>
                  <td className="font-mono text-[13px] whitespace-nowrap">{usage.date}</td>
                  <td>
                    <Badge variant={usage.type === 'full' ? 'info' : 'warning'} className={compactBadgeClass}>
                      {formatLeaveType(usage.type)}
                    </Badge>
                  </td>
                  <td className="text-right tabular-nums font-medium">{daysLabel(usage)}</td>
                  <td>
                    <Badge variant={status.variant} className={compactBadgeClass}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="muted text-[13px]">
                    {usage.reason || '-'}
                    {usage.status === 'rejected' && usage.rejectReason ? ` · 반려: ${usage.rejectReason}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
