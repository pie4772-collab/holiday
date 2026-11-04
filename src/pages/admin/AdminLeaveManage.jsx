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
import { SortButton } from '../../components/ui/SortButton';
import { useTableSort } from '../../hooks/useTableSort';
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

const USAGE_STATUS_LABEL = { approved: '승인', rejected: '반려', pending: '대기' };

function accrualSortValue(item, key) {
  if (key === 'type') return formatLeaveType(item.type);
  if (key === 'amount') return Number(item.amount);
  return item[key];
}

function usageSortValue(item, key) {
  if (key === 'type') return formatLeaveType(item.type);
  if (key === 'status') return USAGE_STATUS_LABEL[item.status] || '대기';
  return item[key];
}

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
  const [error, setError] = useState('');
  const accrualSort = useTableSort(accruals, accrualSortValue);
  const usageSort = useTableSort(usages, usageSortValue);

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
  const terminatedDate = employee.terminatedDate || null;
  const locked = Boolean(employee.resignation?.settled);
  const dateLimits = terminatedDate ? { minDate: `${year}-01-01`, maxDate: terminatedDate } : {};

  function showMsg(text) {
    setError('');
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  }

  function openAccrual(item = null) {
    setError('');
    setAccrualModal({ open: true, item });
  }

  function openUsage(item = null) {
    setError('');
    setUsageModal({ open: true, item });
  }

  async function run(action) {
    try {
      await action();
    } catch (e) {
      setError(e.message || '저장하지 못했습니다.');
    }
  }

  function handleAccrualSubmit(data) {
    return run(async () => {
      if (accrualModal.item) {
        await updateAccrual.mutateAsync({ id: accrualModal.item.id, employeeId: id, ...data });
        showMsg('연차 발생 내역이 수정되었습니다.');
      } else {
        await createAccrual.mutateAsync({ employeeId: id, ...data });
        showMsg('연차 발생 내역이 추가되었습니다.');
      }
      setAccrualModal({ open: false, item: null });
    });
  }

  function handleUsageSubmit(data) {
    return run(async () => {
      if (usageModal.item) {
        await updateUsage.mutateAsync({ id: usageModal.item.id, employeeId: id, ...data });
        showMsg('연차 사용 내역이 수정되었습니다.');
      } else {
        await createUsage.mutateAsync({ employeeId: id, ...data });
        showMsg('연차 사용 내역이 추가되었습니다.');
      }
      setUsageModal({ open: false, item: null });
      await refetch();
    });
  }

  function handleDeleteAccrual(item) {
    if (!confirm('이 연차 발생 내역을 삭제하시겠습니까?')) return;
    return run(async () => {
      await deleteAccrual.mutateAsync({ id: item.id, employeeId: id });
      showMsg('연차 발생 내역이 삭제되었습니다.');
    });
  }

  function handleDeleteUsage(item) {
    if (!confirm('이 연차 사용 내역을 삭제하시겠습니까?')) return;
    return run(async () => {
      await deleteUsage.mutateAsync({ id: item.id, employeeId: id });
      showMsg('연차 사용 내역이 삭제되었습니다.');
      await refetch();
    });
  }

  return (
    <div>
      <PageHeader
        title={locked ? '연차 내역' : '연차 수정'}
        description={`${employee.name}${terminatedDate ? ' (퇴사)' : ''} · ${year}년 · ${
          terminatedDate ? '퇴사일 기준 ' : ''
        }잔여 ${employee.leaveSummary.remaining}일`}
        backTo="/admin/leave-manage"
        backLabel="연차 관리"
      />

      {terminatedDate && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            locked
              ? 'border-stripe-border bg-[#f6f9fc] text-stripe-muted'
              : 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
          }`}
        >
          {locked
            ? `${terminatedDate} 퇴사 · ${year}년 연차 정산에서 퇴사 정산을 확정(${employee.resignation.settledAt})해 수정할 수 없습니다.`
            : `${terminatedDate} 퇴사 · 퇴사 정산 확정 전이라 발생·사용 내역을 고칠 수 있습니다. 잔여는 퇴사일 기준이며, 날짜는 퇴사일까지만 넣을 수 있습니다. 고친 뒤 연차 정산에서 퇴사 정산을 확정하세요.`}
        </div>
      )}

      {message && (
        <div className="mb-6 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {error}
        </div>
      )}

      <Panel className="mb-5">
        <PanelHeader
          title={`${year}년 연차 발생`}
          actions={
            !locked && (
              <Button size="sm" onClick={() => openAccrual()}>
                <Plus className="h-3.5 w-3.5" />
                추가
              </Button>
            )
          }
        />
        {accrualsLoading ? (
          <LoadingSpinner className="p-8" />
        ) : accruals?.length === 0 ? (
          <p className="py-10 text-center text-sm text-stripe-muted">발생 내역이 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th><SortButton label="발생일" column="date" {...accrualSort} /></th>
                  <th><SortButton label="유형" column="type" {...accrualSort} /></th>
                  <th className="text-right"><SortButton label="일수" column="amount" {...accrualSort} /></th>
                  <th><SortButton label="설명" column="description" {...accrualSort} /></th>
                  <th className="text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {accrualSort.sorted.map((item) => (
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
                        {item.isManual && locked ? (
                          <span className="text-xs text-stripe-muted">수동</span>
                        ) : item.isManual ? (
                          <>
                            <button
                              onClick={() => openAccrual(item)}
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
            !locked && (
              <Button size="sm" onClick={() => openUsage()}>
                <Plus className="h-3.5 w-3.5" />
                추가
              </Button>
            )
          }
        />
        {usagesLoading ? (
          <LoadingSpinner className="p-8" />
        ) : usages?.length === 0 ? (
          <p className="py-10 text-center text-sm text-stripe-muted">사용 내역이 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th><SortButton label="사용일" column="date" {...usageSort} /></th>
                  <th><SortButton label="유형" column="type" {...usageSort} /></th>
                  <th><SortButton label="사유" column="reason" {...usageSort} /></th>
                  <th className="text-center"><SortButton label="상태" column="status" {...usageSort} /></th>
                  {!locked && <th className="text-center">관리</th>}
                </tr>
              </thead>
              <tbody>
                {usageSort.sorted.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-[13px] font-medium">{item.date}</td>
                    <td>
                      <Badge variant={item.type === 'full' ? 'info' : 'warning'}>
                        {formatLeaveType(item.type, item.halfPeriod)}
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
                    {!locked && (
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openUsage(item)}
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
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <LeaveAccrualFormModal
        isOpen={accrualModal.open}
        onClose={() => {
          setError('');
          setAccrualModal({ open: false, item: null });
        }}
        onSubmit={handleAccrualSubmit}
        isSubmitting={createAccrual.isPending || updateAccrual.isPending}
        initial={accrualModal.item}
        displayYear={year}
        error={accrualModal.open ? error : ''}
        {...dateLimits}
      />
      <LeaveUsageFormModal
        isOpen={usageModal.open}
        onClose={() => {
          setError('');
          setUsageModal({ open: false, item: null });
        }}
        onSubmit={handleUsageSubmit}
        isSubmitting={createUsage.isPending || updateUsage.isPending}
        initial={usageModal.item}
        error={usageModal.open ? error : ''}
        {...dateLimits}
      />
    </div>
  );
}
