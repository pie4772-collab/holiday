import { formatLeaveType, formatDate } from '../utils/leaveCalculations';
import { Badge } from './ui/Badge';

const typeBadgeVariant = {
  first_year_monthly: 'warning',
  prorated: 'purple',
  annual: 'info',
  settlement: 'orange',
  adjustment: 'success',
};

const compactBadgeClass = 'whitespace-nowrap text-[11px] px-1.5 py-0 leading-5';

export function LeaveHistoryTable({ logs, isLoading }) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-0 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-11 border-b border-[#f0f3f7] last:border-0" />
        ))}
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <div className="py-12 text-center text-sm text-stripe-muted">
        연차 발생 내역이 없습니다.
      </div>
    );
  }

  return (
    <>
      <div className="settlement-cards mobile-card-list">
        {logs.map((log) => (
          <div key={log.id} className="mobile-card-item">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-mono font-medium text-stripe-text">{formatDate(log.date)}</p>
                <p className="text-[13px] text-stripe-muted mt-0.5">{log.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant={typeBadgeVariant[log.type] || 'default'} className={compactBadgeClass}>
                  {formatLeaveType(log.type)}
                </Badge>
                <p className="text-sm tabular-nums font-medium">
                  {log.type === 'settlement' ? log.amount : `+${log.amount}`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="settlement-table stripe-table-fit-wrap">
        <table className="stripe-table stripe-table-fit w-full">
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '54%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>발생일</th>
              <th>유형</th>
              <th className="text-right">일수</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="font-mono text-[13px] whitespace-nowrap">{formatDate(log.date)}</td>
                <td>
                  <Badge variant={typeBadgeVariant[log.type] || 'default'} className={compactBadgeClass}>
                    {formatLeaveType(log.type)}
                  </Badge>
                </td>
                <td className="text-right font-medium tabular-nums whitespace-nowrap">
                  {log.type === 'settlement' ? log.amount : `+${log.amount}`}
                </td>
                <td className="muted text-[13px]">{log.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
