import { CheckCircle } from 'lucide-react';
import { LeaveCalendar } from '../../components/LeaveCalendar';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { LeaveUsageList } from '../../components/LeaveUsageList';
import { useCurrentEmployee, useLeaveUsages } from '../../hooks/useLeaveData';
import { useAppStore } from '../../store/useAppStore';

export function EmployeeCalendar() {
  const { openRequestModal, lastRequestMessage } = useAppStore();
  const { data: employee, isLoading, isError, refetch } = useCurrentEmployee();
  const { data: usages } = useLeaveUsages(employee?.id);

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

  const calendarUsages = (usages || []).filter((u) => u.status !== 'rejected');
  const pendingUsages = usages?.filter((u) => u.status === 'pending') || [];
  const approvedUsages = usages?.filter((u) => u.status === 'approved') || [];

  return (
    <div>
      <PageHeader
        title="캘린더"
        description={`${employee.leaveSummary.displayYear}년 연차 사용 내역 · 평일을 누르면 그 날부터 신청할 수 있습니다`}
        actions={
          <Button size="sm" onClick={() => openRequestModal()}>
            연차 신청
          </Button>
        }
      />

      {lastRequestMessage && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d] max-w-lg">
          <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{lastRequestMessage}</span>
        </div>
      )}

      <div className="max-w-lg mb-6">
        <LeaveCalendar
          usages={calendarUsages}
          onDateClick={(dateStr) => openRequestModal(dateStr)}
          displayYear={employee.leaveSummary.displayYear}
        />
      </div>

      <Panel className="max-w-lg mb-6">
        <PanelHeader title="승인 대기" description={`${pendingUsages.length}건`} />
        <PanelBody noPadding>
          <LeaveUsageList usages={pendingUsages} emptyText="승인 대기 중인 신청이 없습니다." />
        </PanelBody>
      </Panel>

      {approvedUsages.length > 0 && (
        <Panel className="max-w-lg">
          <PanelHeader title="최근 사용 내역" />
          <PanelBody noPadding>
            <LeaveUsageList usages={approvedUsages.slice(0, 8)} />
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
