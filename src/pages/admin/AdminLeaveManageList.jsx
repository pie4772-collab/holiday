import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { useEmployees } from '../../hooks/useLeaveData';
import { formatDate } from '../../utils/leaveCalculations';

export function AdminLeaveManageList() {
  const { data: employees, isLoading, isError, refetch } = useEmployees();

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

  const year = employees?.[0]?.leaveSummary?.displayYear ?? new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title="연차 관리"
        description={`${year}년 기준 · 직원별 발생·사용 내역 수정`}
      />

      <Panel>
        <div className="divide-y divide-[#f0f3f7]">
          {employees?.map((emp) => (
            <Link
              key={emp.id}
              to={`/admin/leave-manage/${emp.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-[#f6f9fc] transition-colors group"
            >
              <div>
                <p className="text-sm font-medium text-stripe-text">
                  {emp.name}
                  {emp.empNo && (
                    <span className="ml-2 font-mono text-xs text-stripe-muted">{emp.empNo}</span>
                  )}
                </p>
                <p className="text-xs text-stripe-muted mt-0.5">
                  {emp.workplace ? `${emp.workplace} · ` : ''}
                  {emp.department} · 입사 {formatDate(emp.hireDate)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  <p className="text-stripe-muted">
                    잔여{' '}
                    <span className="font-medium tabular-nums text-[#09825d]">
                      {emp.leaveSummary.remaining}일
                    </span>
                  </p>
                  <p className="text-xs text-stripe-muted/80 mt-0.5 tabular-nums">
                    발생 {emp.leaveSummary.accruedThisYear} · 사용 {emp.leaveSummary.usedDays}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#c1cad6] group-hover:text-primary-500" />
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
