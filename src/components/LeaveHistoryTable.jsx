import { formatLeaveType, formatDate } from '../utils/leaveCalculations';
import { Badge } from './ui/Badge';

const typeBadgeVariant = {
  first_year_monthly: 'warning',
  prorated: 'purple',
  annual: 'info',
  settlement: 'orange',
  adjustment: 'success',
};

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
    <div className="stripe-table-scroll">
      <table className="stripe-table w-full">
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
              <td className="font-mono text-[13px]">{formatDate(log.date)}</td>
              <td>
                <Badge variant={typeBadgeVariant[log.type] || 'default'}>
                  {formatLeaveType(log.type)}
                </Badge>
              </td>
              <td className="text-right font-medium tabular-nums">
                {log.type === 'settlement' ? log.amount : `+${log.amount}`}
              </td>
              <td className="muted text-[13px]">{log.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
