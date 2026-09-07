import { Link } from 'react-router-dom';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { useEmployees } from '../../hooks/useLeaveData';
import { formatDate } from '../../utils/leaveCalculations';

export function AdminEmployeeList() {
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
        title="직원"
        description={`${year}년 기준 · ${employees?.length ?? 0}명`}
      />

      <Panel>
        {/* Mobile card list */}
        <div className="md:hidden mobile-card-list">
          {employees?.map((emp) => (
            <div key={emp.id} className="mobile-card-item">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                  <p className="text-xs text-stripe-muted mt-0.5">
                    {emp.empNo && <span className="font-mono mr-1.5">{emp.empNo}</span>}
                    {emp.workplace ? `${emp.workplace} · ` : ''}
                    {emp.department}
                  </p>
                  <p className="text-xs text-stripe-muted mt-0.5">
                    입사 {formatDate(emp.hireDate)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {emp.leaveSummary.isFirstYear ? (
                    <Badge variant="warning">첫해</Badge>
                  ) : emp.leaveSummary.isProratedTarget ? (
                    <Badge variant="purple">비례</Badge>
                  ) : (
                    <Badge variant="success">정규</Badge>
                  )}
                  <p className="text-sm tabular-nums mt-2">
                    <span className="text-stripe-muted text-xs">잔여 </span>
                    <span
                      className={`font-medium ${
                        emp.leaveSummary.remaining < 3 ? 'text-[#df1b41]' : 'text-[#09825d]'
                      }`}
                    >
                      {emp.leaveSummary.remaining}일
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-3 pt-3 border-t border-[#f0f3f7]">
                <Link
                  to={`/admin/employees/${emp.id}`}
                  className="flex-1 text-center text-[13px] font-medium text-primary-500 py-1.5 rounded-md bg-primary-50"
                >
                  상세
                </Link>
                <Link
                  to={`/admin/leave-manage/${emp.id}`}
                  className="flex-1 text-center text-[13px] text-stripe-muted py-1.5 rounded-md bg-[#f0f3f7]"
                >
                  연차 수정
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block stripe-table-scroll">
          <table className="stripe-table w-full">
            <thead>
              <tr>
                <th>이름</th>
                <th>사번</th>
                <th>사업장</th>
                <th>부서</th>
                <th>입사일</th>
                <th>상태</th>
                <th className="text-right">올해 발생</th>
                <th className="text-right">잔여</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {employees?.map((emp) => (
                <tr key={emp.id}>
                  <td className="font-medium">{emp.name}</td>
                  <td className="font-mono text-[13px] muted">{emp.empNo || '-'}</td>
                  <td className="muted">{emp.workplace || '-'}</td>
                  <td className="muted">{emp.department || '-'}</td>
                  <td className="font-mono text-[13px] muted">{formatDate(emp.hireDate)}</td>
                  <td>
                    {emp.leaveSummary.isFirstYear ? (
                      <Badge variant="warning">첫해</Badge>
                    ) : emp.leaveSummary.isProratedTarget ? (
                      <Badge variant="purple">비례</Badge>
                    ) : (
                      <Badge variant="success">정규</Badge>
                    )}
                  </td>
                  <td className="text-right tabular-nums font-medium">
                    {emp.leaveSummary.accruedThisYear}
                  </td>
                  <td className="text-right tabular-nums">
                    <span
                      className={`font-medium ${
                        emp.leaveSummary.remaining < 3 ? 'text-[#df1b41]' : 'text-[#09825d]'
                      }`}
                    >
                      {emp.leaveSummary.remaining}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link
                      to={`/admin/employees/${emp.id}`}
                      className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                    >
                      상세
                    </Link>
                    <span className="text-[#e3e8ee] mx-2">|</span>
                    <Link
                      to={`/admin/leave-manage/${emp.id}`}
                      className="text-[13px] text-stripe-muted hover:text-stripe-text"
                    >
                      수정
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
