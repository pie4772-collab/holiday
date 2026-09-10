import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { LeaveAccrualFormModal, LeaveUsageFormModal } from '../../components/admin/LeaveEditModals';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  useEmployee,
  useAdminAccruals,
  useAdminUsages,
  useCreateAccrual,
  useUpdateAccrual,
  useDeleteAccrual,
  useCreateUsage,
  useUpdateUsage,
  useDeleteUsage,
} from '../../hooks/useLeaveData';
import { formatDate, formatLeaveType } from '../../utils/leaveCalculations';

const typeBadgeVariant = {
  first_year_monthly: 'warning',
  prorated: 'purple',
  annual: 'info',
  adjustment: 'success',
  settlement: 'orange',
};

export function AdminLeaveManage() {
  const { id } = useParams();
  const { data: employee, isLoading, isError, refetch } = useEmployee(id);
  const { data: accruals, isLoading: accrualsLoading } = useAdminAccruals(id);
  const { data: usages, isLoading: usagesLoading } = useAdminUsages(id);

  const createAccrual = useCreateAccrual();
  const updateAccrual = useUpdateAccrual();
  const deleteAccrual = useDeleteAccrual();
  const createUsage = useCreateUsage();
  const updateUsage = useUpdateUsage();
  const deleteUsage = useDeleteUsage();

  const [accrualModal, setAccrualModal] = useState({ open: false, item: null });
  const [usageModal, setUsageModal] = useState({ open: false, item: null });
  const [message, setMessage] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !employee) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  const year = employee.leaveSummary.displayYear;

  function showMsg(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  }

  async function handleAccrualSubmit(data) {
    if (accrualModal.item) {
      await updateAccrual.mutateAsync({ id: accrualModal.item.id, employeeId: id, ...data });
      showMsg('연차 발생 내역이 수정되었습니다.');
    } else {
      await createAccrual.mutateAsync({ employeeId: id, ...data });
      showMsg('연차 발생 내역이 추가되었습니다.');
    }
    setAccrualModal({ open: false, item: null });
  }

  async function handleUsageSubmit(data) {
    if (usageModal.item) {
      await updateUsage.mutateAsync({ id: usageModal.item.id, employeeId: id, ...data });
      showMsg('연차 사용 내역이 수정되었습니다.');
    } else {
      await createUsage.mutateAsync({ employeeId: id, ...data });
      showMsg('연차 사용 내역이 추가되었습니다.');
    }
    setUsageModal({ open: false, item: null });
  }

  async function handleDeleteAccrual(item) {
    if (!confirm('이 연차 발생 내역을 삭제하시겠습니까?')) return;
    await deleteAccrual.mutateAsync({ id: item.id, employeeId: id });
    showMsg('연차 발생 내역이 삭제되었습니다.');
  }

  async function handleDeleteUsage(item) {
    if (!confirm('이 연차 사용 내역을 삭제하시겠습니까?')) return;
    await deleteUsage.mutateAsync({ id: item.id, employeeId: id });
    showMsg('연차 사용 내역이 삭제되었습니다.');
  }

  return (
    <div>
      <PageHeader
        title="연차 수정"
        description={`${employee.name} · ${year}년 · 잔여 ${employee.leaveSummary.remaining}일`}
        backTo="/admin/leave-manage"
        backLabel="연차 관리"
      />

      {message && (
        <div className="mb-6 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {message}
        </div>
      )}

      <Panel className="mb-5">
        <PanelHeader
          title={`${year}년 연차 발생`}
          actions={
            <Button size="sm" onClick={() => setAccrualModal({ open: true, item: null })}>
              <Plus className="h-3.5 w-3.5" />
              추가
            </Button>
          }
        />
        {accrualsLoading ? (
          <LoadingSpinner className="p-8" />
        ) : accruals?.length === 0 ? (
          <p className="py-10 text-center text-sm text-stripe-muted">발생 내역이 없습니다.</p>
        ) : (
          <div className="stripe-table-scroll">
            <table className="stripe-table w-full">
              <thead>
                <tr>
                  <th>발생일</th>
                  <th>유형</th>
                  <th className="text-right">일수</th>
                  <th>설명</th>
                  <th className="text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {accruals.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-[13px]">{formatDate(item.date)}</td>
                    <td>
                      <Badge variant={typeBadgeVariant[item.type] || 'default'}>
                        {formatLeaveType(item.type)}
                        {item.isManual && ' ·수동'}
                      </Badge>
                    </td>
                    <td className="text-right tabular-nums font-medium">
                      {item.amount > 0 ? `+${item.amount}` : item.amount}
                    </td>
                    <td className="muted text-[13px]">{item.description}</td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        {item.isManual ? (
                          <>
                            <button
                              onClick={() => setAccrualModal({ open: true, item })}
                              className="rounded p-1.5 text-stripe-muted hover:bg-[#f0f3f7] hover:text-primary-500"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAccrual(item)}
                              className="rounded p-1.5 text-stripe-muted hover:bg-[#fee2e2] hover:text-[#df1b41]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-stripe-muted">자동</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title={`${year}년 연차 사용`}
          actions={
            <Button size="sm" onClick={() => setUsageModal({ open: true, item: null })}>
              <Plus className="h-3.5 w-3.5" />
              추가
            </Button>
          }
        />
        {usagesLoading ? (
          <LoadingSpinner className="p-8" />
        ) : usages?.length === 0 ? (
          <p className="py-10 text-center text-sm text-stripe-muted">사용 내역이 없습니다.</p>
        ) : (
          <div className="stripe-table-scroll">
            <table className="stripe-table w-full">
              <thead>
                <tr>
                  <th>사용일</th>
                  <th>유형</th>
                  <th>사유</th>
                  <th className="text-center">상태</th>
                  <th className="text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {usages.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-[13px] font-medium">{item.date}</td>
                    <td>
                      <Badge variant={item.type === 'full' ? 'info' : 'warning'}>
                        {formatLeaveType(item.type)}
                      </Badge>
                    </td>
                    <td className="muted text-[13px]">{item.reason}</td>
                    <td className="text-center">
                      <Badge
                        variant={
                          item.status === 'approved'
                            ? 'success'
                            : item.status === 'rejected'
                              ? 'default'
                              : 'warning'
                        }
                      >
                        {item.status === 'approved' ? '승인' : item.status === 'rejected' ? '반려' : '대기'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setUsageModal({ open: true, item })}
                          className="rounded p-1.5 text-stripe-muted hover:bg-[#f0f3f7] hover:text-primary-500"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUsage(item)}
                          className="rounded p-1.5 text-stripe-muted hover:bg-[#fee2e2] hover:text-[#df1b41]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <LeaveAccrualFormModal
        isOpen={accrualModal.open}
        onClose={() => setAccrualModal({ open: false, item: null })}
        onSubmit={handleAccrualSubmit}
        isSubmitting={createAccrual.isPending || updateAccrual.isPending}
        initial={accrualModal.item}
        displayYear={year}
      />
      <LeaveUsageFormModal
        isOpen={usageModal.open}
        onClose={() => setUsageModal({ open: false, item: null })}
        onSubmit={handleUsageSubmit}
        isSubmitting={createUsage.isPending || updateUsage.isPending}
        initial={usageModal.item}
      />
    </div>
  );
}
