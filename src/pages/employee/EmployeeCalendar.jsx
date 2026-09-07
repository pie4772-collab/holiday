import { LeaveCalendar } from '../../components/LeaveCalendar';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useCurrentEmployee, useLeaveUsages } from '../../hooks/useLeaveData';
import { useAppStore } from '../../store/useAppStore';

export function EmployeeCalendar() {
  const { openRequestModal } = useAppStore();
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

  const approvedUsages = usages?.filter((u) => u.status === 'approved') || [];

  return (
    <div>
      <PageHeader
        title="캘린더"
        description={`${employee.leaveSummary.displayYear}년 연차 사용 내역`}
        actions={
          <Button size="sm" onClick={openRequestModal}>
            연차 신청
          </Button>
        }
      />

      <div className="max-w-lg mb-6">
        <LeaveCalendar
          usages={approvedUsages}
          onDateClick={() => openRequestModal()}
          displayYear={employee.leaveSummary.displayYear}
        />
      </div>

      {approvedUsages.length > 0 && (
        <Panel className="max-w-lg">
          <PanelHeader title="최근 사용 내역" />
          <PanelBody noPadding>
            <div className="divide-y divide-[#f0f3f7]">
              {approvedUsages.slice(0, 5).map((usage) => (
                <div
                  key={usage.id}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <span className="font-mono text-stripe-text">{usage.date}</span>
                  <Badge variant={usage.type === 'full' ? 'info' : 'warning'}>
                    {usage.type === 'full' ? '연차' : '반차'}
                  </Badge>
                  <span className="text-stripe-muted truncate max-w-[160px] text-[13px]">
                    {usage.reason}
                  </span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
