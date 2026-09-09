import { Link } from 'react-router-dom';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { useEmployees } from '../../hooks/useLeaveData';
import { formatDate } from '../../utils/leaveCalculations';

function phaseBadge(summary) {
  if (summary.isFirstYear) return <Badge variant="warning">첫해</Badge>;
  if (summary.isProratedTarget) return <Badge variant="purple">비례</Badge>;
  return <Badge variant="success">정규</Badge>;
}

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
        description={`${year}년 기준 · ${employees?.length ?? 0}명 · 직원별 발생·사용 내역 수정`}
      />

      <Panel>
        <div className="mobile-only mobile-card-list">
          {employees?.map((emp) => (
            <div key={emp.id} className="mobile-card-item">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                  <p className="text-xs font-mono text-stripe-muted mt-0.5">{emp.empNo || '-'}</p>
                </div>
                {phaseBadge(emp.leaveSummary)}
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-stripe-muted">사업장 · 부서</span>
                  <span className="text-stripe-text">
                    {[emp.workplace, emp.department].filter(Boolean).join(' · ') || '-'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stripe-muted">직급</span>
                  <span className="text-stripe-text">{emp.position || '-'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stripe-muted">입사일</span>
                  <span className="font-mono text-stripe-text">{formatDate(emp.hireDate)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stripe-muted">발생 · 사용 · 잔여</span>
                  <span className="tabular-nums text-stripe-text">
                    {emp.leaveSummary.accruedThisYear} · {emp.leaveSummary.usedDays} ·{' '}
                    <span
                      className={
                        emp.leaveSummary.remaining < 3 ? 'text-[#df1b41] font-medium' : 'text-[#09825d] font-medium'
                      }
                    >
                      {emp.leaveSummary.remaining}
                    </span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-[#f0f3f7]">
                <Link
                  to={`/admin/leave-manage/${emp.id}`}
                  className="flex-1 text-center text-[13px] font-medium text-primary-500 py-2 rounded-md bg-primary-50"
                >
                  수정
                </Link>
                <Link
                  to={`/admin/employees/${emp.id}`}
                  className="flex-1 text-center text-[13px] text-stripe-muted py-2 rounded-md bg-[#f0f3f7]"
                >
                  상세
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="desktop-only stripe-table-scroll">
          <table className="stripe-table w-full">
            <thead>
              <tr>
                <th>이름</th>
                <th>사번</th>
                <th>사업장</th>
                <th>부서</th>
                <th>직급</th>
                <th>입사일</th>
                <th>발생</th>
                <th>사용</th>
                <th>잔여</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {employees?.map((emp) => (
                <tr key={emp.id}>
                  <td className="font-medium whitespace-nowrap">{emp.name}</td>
                  <td className="font-mono text-[13px] muted whitespace-nowrap">{emp.empNo || '-'}</td>
                  <td className="muted whitespace-nowrap">{emp.workplace || '-'}</td>
                  <td className="muted whitespace-nowrap">{emp.department || '-'}</td>
                  <td className="muted whitespace-nowrap">{emp.position || '-'}</td>
                  <td className="font-mono text-[13px] muted whitespace-nowrap">{formatDate(emp.hireDate)}</td>
                  <td className="tabular-nums whitespace-nowrap">{emp.leaveSummary.accruedThisYear}</td>
                  <td className="tabular-nums muted whitespace-nowrap">{emp.leaveSummary.usedDays}</td>
                  <td className="tabular-nums whitespace-nowrap">
                    <span
                      className={`font-medium ${
                        emp.leaveSummary.remaining < 3 ? 'text-[#df1b41]' : 'text-[#09825d]'
                      }`}
                    >
                      {emp.leaveSummary.remaining}
                    </span>
                  </td>
                  <td>{phaseBadge(emp.leaveSummary)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link
                      to={`/admin/leave-manage/${emp.id}`}
                      className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                    >
                      수정
                    </Link>
                    <span className="text-[#e3e8ee] mx-2">|</span>
                    <Link
                      to={`/admin/employees/${emp.id}`}
                      className="text-[13px] text-stripe-muted hover:text-stripe-text"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
