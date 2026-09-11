import { CheckCircle, XCircle } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { usePendingApprovals, useDecideLeaveRequest } from '../../hooks/useLeaveData';

export function EmployeeApprovals() {
  const { data: requests, isLoading, isError, refetch } = usePendingApprovals();
  const decide = useDecideLeaveRequest();

  async function handleDecide(item, action) {
    const reason =
      action === 'reject' ? window.prompt('반려 사유를 입력하세요.', '') : '';
    if (action === 'reject' && reason == null) return;
    await decide.mutateAsync({ id: item.id, action, reason });
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
        title="연차 승인"
        description={`대기 ${requests?.length ?? 0}건 · 서울 팀장은 소관 임원 후 대표이사, 경영전략실은 지정 담당자`}
      />

      <Panel>
        {!requests?.length ? (
          <p className="py-12 text-center text-sm text-stripe-muted">승인 대기 중인 신청이 없습니다.</p>
        ) : (
          <>
            <div className="settlement-cards mobile-card-list">
              {requests.map((item) => (
                <div key={item.id} className="mobile-card-item">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-stripe-text">{item.employeeName}</p>
                      <p className="text-xs text-stripe-muted mt-0.5">
                        {item.workplace} · {item.department} · {item.position}
                      </p>
                      {item.approvalHint && (
                        <p className="text-xs text-primary-600 mt-1">{item.approvalHint}</p>
                      )}
                    </div>
                    <Badge variant={item.type === 'full' ? 'info' : 'warning'}>
                      {item.type === 'full' ? '연차' : '반차'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-mono text-stripe-text">{item.date}</p>
                  <p className="mt-1 text-xs text-stripe-muted">{item.reason}</p>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-[#f0f3f7]">
                    <Button
                      className="flex-1"
                      disabled={decide.isPending}
                      onClick={() => handleDecide(item, 'approve')}
                    >
                      승인
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      disabled={decide.isPending}
                      onClick={() => handleDecide(item, 'reject')}
                    >
                      반려
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="settlement-table stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>사업장 · 부서</th>
                    <th>사용일</th>
                    <th>유형</th>
                    <th>결재</th>
                    <th>사유</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium whitespace-nowrap">
                        {item.employeeName}
                        <span className="ml-2 font-mono text-xs text-stripe-muted">{item.empNo}</span>
                      </td>
                      <td className="muted whitespace-nowrap">
                        {item.workplace} · {item.department}
                      </td>
                      <td className="font-mono text-[13px] whitespace-nowrap">{item.date}</td>
                      <td>
                        <Badge variant={item.type === 'full' ? 'info' : 'warning'}>
                          {item.type === 'full' ? '연차' : '반차'}
                        </Badge>
                      </td>
                      <td className="text-[13px] text-primary-600 whitespace-nowrap">
                        {item.approvalHint || item.approvalStep || '-'}
                      </td>
                      <td className="muted text-[13px]">{item.reason}</td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => handleDecide(item, 'approve')}
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[#09825d] hover:text-[#0a6b4d]"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          승인
                        </button>
                        <span className="text-[#e3e8ee] mx-2">|</span>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => handleDecide(item, 'reject')}
                          className="inline-flex items-center gap-1 text-[13px] text-[#df1b41] hover:text-[#c91839]"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          반려
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
