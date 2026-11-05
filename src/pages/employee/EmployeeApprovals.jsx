import { useMemo } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { SortButton } from '../../components/ui/SortButton';
import { leaveBadgeVariant } from '../../components/LeaveUsageList';
import { usePendingApprovals, useDecideLeaveRequest } from '../../hooks/useLeaveData';
import { useTableSort } from '../../hooks/useTableSort';
import { describeGroupDates, groupLeaveUsages, usageLabel } from '../../constants/leaveKinds';

function requestSortValue(group, key) {
  const item = group.first;
  switch (key) {
    case 'employeeName':
      return item.employeeName;
    case 'workplace':
      return `${item.workplace || ''} ${item.department || ''}`.trim();
    case 'date':
      return item.date;
    case 'type':
      return usageLabel(item);
    case 'approval':
      return item.approvalHint || item.approvalStep || '';
    case 'reason':
      return item.reason;
    default:
      return item[key];
  }
}

export function EmployeeApprovals() {
  const { data: requests, isLoading, isError, refetch } = usePendingApprovals();
  const decide = useDecideLeaveRequest();
  const groups = useMemo(() => groupLeaveUsages(requests || [], { byStep: true }), [requests]);
  const { sorted, sort, onSort } = useTableSort(groups, requestSortValue, { key: 'date', dir: 'asc' });

  async function handleDecide(group, action) {
    const item = group.first;
    const many = group.items.length > 1;
    const reason =
      action === 'reject'
        ? window.prompt(`반려 사유를 입력하세요.${many ? ` (${group.items.length}일 모두 반려)` : ''}`, '')
        : '';
    if (action === 'reject' && reason == null) return;
    await decide.mutateAsync({ id: item.id, action, reason, group: many });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="연차·휴가 승인"
        description={`대기 ${groups.length}건 · 여러 날 신청은 한 번에 승인·반려됩니다 · 서울 팀장은 소관 임원 후 대표이사, 경영전략실은 지정 담당자`}
      />

      <Panel>
        {!groups.length ? (
          <p className="py-12 text-center text-sm text-stripe-muted">승인 대기 중인 신청이 없습니다.</p>
        ) : (
          <>
            <div className="settlement-cards mobile-card-list">
              {sorted.map((group) => {
                const item = group.first;
                return (
                  <div key={group.key} className="mobile-card-item">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-stripe-text">{item.employeeName}</p>
                        <p className="text-xs text-stripe-muted mt-0.5">
                          {item.workplace} · {item.department} · {item.position}
                        </p>
                        {item.approvalHint && <p className="text-xs text-primary-600 mt-1">{item.approvalHint}</p>}
                      </div>
                      <Badge variant={leaveBadgeVariant(item)}>{usageLabel(item)}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-mono text-stripe-text">{describeGroupDates(group)}</p>
                    <p className="mt-1 text-xs text-stripe-muted">{item.reason}</p>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#f0f3f7]">
                      <Button className="flex-1" disabled={decide.isPending} onClick={() => handleDecide(group, 'approve')}>
                        승인
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={decide.isPending}
                        onClick={() => handleDecide(group, 'reject')}
                      >
                        반려
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="settlement-table stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <thead>
                  <tr>
                    <th><SortButton label="이름" column="employeeName" sort={sort} onSort={onSort} /></th>
                    <th><SortButton label="사업장 · 부서" column="workplace" sort={sort} onSort={onSort} /></th>
                    <th><SortButton label="사용일" column="date" sort={sort} onSort={onSort} /></th>
                    <th><SortButton label="유형" column="type" sort={sort} onSort={onSort} /></th>
                    <th><SortButton label="결재" column="approval" sort={sort} onSort={onSort} /></th>
                    <th><SortButton label="사유" column="reason" sort={sort} onSort={onSort} /></th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((group) => {
                    const item = group.first;
                    return (
                      <tr key={group.key}>
                        <td className="font-medium whitespace-nowrap">
                          {item.employeeName}
                          <span className="ml-2 font-mono text-xs text-stripe-muted">{item.empNo}</span>
                        </td>
                        <td className="muted whitespace-nowrap">
                          {item.workplace} · {item.department}
                        </td>
                        <td className="font-mono text-[13px] whitespace-nowrap">{describeGroupDates(group)}</td>
                        <td>
                          <Badge variant={leaveBadgeVariant(item)}>{usageLabel(item)}</Badge>
                        </td>
                        <td className="text-[13px] text-primary-600 whitespace-nowrap">
                          {item.approvalHint || item.approvalStep || '-'}
                        </td>
                        <td className="muted text-[13px]">{item.reason}</td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() => handleDecide(group, 'approve')}
                            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#09825d] hover:text-[#0a6b4d]"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            승인
                          </button>
                          <span className="text-[#e3e8ee] mx-2">|</span>
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() => handleDecide(group, 'reject')}
                            className="inline-flex items-center gap-1 text-[13px] text-[#df1b41] hover:text-[#c91839]"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            반려
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
