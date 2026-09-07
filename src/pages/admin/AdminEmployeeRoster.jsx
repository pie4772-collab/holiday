import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmployeeFormModal } from '../../components/admin/EmployeeFormModal';
import {
  useEmployeeRoster,
  useCreateEmployee,
  useUpdateEmployee,
  useTerminateEmployee,
  useReactivateEmployee,
} from '../../hooks/useEmployeeRoster';
import { formatDate } from '../../utils/leaveCalculations';

export function AdminEmployeeRoster() {
  const [includeInactive, setIncludeInactive] = useState(true);
  const [modal, setModal] = useState(null);

  const { data: roster, isLoading, isError, refetch } = useEmployeeRoster(includeInactive);
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const terminateEmployee = useTerminateEmployee();
  const reactivateEmployee = useReactivateEmployee();

  const activeCount = roster?.filter((e) => e.isActive).length ?? 0;
  const inactiveCount = roster?.filter((e) => !e.isActive).length ?? 0;

  async function handleSubmit(data) {
    if (modal?.mode === 'create') {
      await createEmployee.mutateAsync(data);
    } else if (modal?.mode === 'edit') {
      await updateEmployee.mutateAsync({ id: modal.employee.id, ...data });
    } else if (modal?.mode === 'terminate') {
      await terminateEmployee.mutateAsync({ id: modal.employee.id, terminatedDate: data.terminatedDate });
    }
    setModal(null);
  }

  async function handleReactivate(emp) {
    if (!window.confirm(`${emp.name}님을 재직 처리하시겠습니까?`)) return;
    await reactivateEmployee.mutateAsync({ id: emp.id });
  }

  const isSubmitting =
    createEmployee.isPending ||
    updateEmployee.isPending ||
    terminateEmployee.isPending ||
    reactivateEmployee.isPending;

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
        title="사원 명부"
        description={`재직 ${activeCount}명${inactiveCount > 0 ? ` · 퇴사 ${inactiveCount}명` : ''}`}
        actions={
          <Button onClick={() => setModal({ mode: 'create' })}>
            <UserPlus className="h-4 w-4" />
            입사 등록
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-stripe-muted cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-stripe-border"
          />
          퇴사자 포함
        </label>
      </div>

      <Panel>
        {/* Mobile card list */}
        <div className="md:hidden mobile-card-list">
          {roster?.map((emp) => (
            <div key={emp.id} className={`mobile-card-item ${!emp.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                  <p className="text-xs font-mono text-stripe-muted mt-0.5">{emp.empNo || '-'}</p>
                </div>
                {emp.isActive ? (
                  <Badge variant="success">재직</Badge>
                ) : (
                  <Badge variant="default">퇴사</Badge>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-stripe-muted">부서 · 직급</span>
                  <span className="text-stripe-text">{emp.department} · {emp.position}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stripe-muted">입사일</span>
                  <span className="font-mono text-stripe-text">{formatDate(emp.hireDate)}</span>
                </div>
                {emp.terminatedDate && (
                  <div className="flex justify-between text-xs">
                    <span className="text-stripe-muted">퇴사일</span>
                    <span className="font-mono text-stripe-text">{formatDate(emp.terminatedDate)}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-[#f0f3f7]">
                {emp.isActive ? (
                  <>
                    <button
                      onClick={() => setModal({ mode: 'edit', employee: emp })}
                      className="flex-1 text-[13px] font-medium text-primary-500 py-2 rounded-md bg-primary-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setModal({ mode: 'terminate', employee: emp })}
                      className="flex-1 text-[13px] text-[#df1b41] py-2 rounded-md bg-[#fee2e2]"
                    >
                      퇴사
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleReactivate(emp)}
                    className="flex-1 text-[13px] font-medium text-primary-500 py-2 rounded-md bg-primary-50"
                    disabled={reactivateEmployee.isPending}
                  >
                    재직 처리
                  </button>
                )}
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
                <th>부서</th>
                <th>직급</th>
                <th>입사일</th>
                <th>퇴사일</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster?.map((emp) => (
                <tr key={emp.id} className={!emp.isActive ? 'opacity-60' : ''}>
                  <td className="font-medium">{emp.name}</td>
                  <td className="font-mono text-[13px] muted">{emp.empNo || '-'}</td>
                  <td className="muted">{emp.department}</td>
                  <td className="muted">{emp.position}</td>
                  <td className="font-mono text-[13px] muted">{formatDate(emp.hireDate)}</td>
                  <td className="font-mono text-[13px] muted">
                    {emp.terminatedDate ? formatDate(emp.terminatedDate) : '-'}
                  </td>
                  <td>
                    {emp.isActive ? (
                      <Badge variant="success">재직</Badge>
                    ) : (
                      <Badge variant="default">퇴사</Badge>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {emp.isActive ? (
                      <>
                        <button
                          onClick={() => setModal({ mode: 'edit', employee: emp })}
                          className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                        >
                          수정
                        </button>
                        <span className="text-[#e3e8ee] mx-2">|</span>
                        <button
                          onClick={() => setModal({ mode: 'terminate', employee: emp })}
                          className="text-[13px] text-[#df1b41] hover:text-[#c91839]"
                        >
                          퇴사
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReactivate(emp)}
                        className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                        disabled={reactivateEmployee.isPending}
                      >
                        재직 처리
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <EmployeeFormModal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initial={modal?.employee}
        mode={modal?.mode || 'create'}
      />
    </div>
  );
}
