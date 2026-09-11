import { useMemo } from 'react';
import { LeaveHistoryTable } from '../../components/LeaveHistoryTable';
import { LeaveUsageTable } from '../../components/LeaveUsageTable';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { useCurrentEmployee, useLeaveHistory, useLeaveUsages } from '../../hooks/useLeaveData';

const HIDE_SETTLEMENTS_THROUGH_YEAR = 2026;

export function EmployeeLeaveHistory() {
  const { data: employee, isLoading: empLoading, isError: empError, refetch } = useCurrentEmployee();
  const { data: logs, isLoading: logsLoading } = useLeaveHistory(employee?.id);
  const { data: usages, isLoading: usagesLoading } = useLeaveUsages(employee?.id);
  const sortedUsages = useMemo(
    () => [...(usages || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [usages]
  );
  const visibleLogs = useMemo(
    () =>
      (logs || []).filter((log) => {
        if (log.type !== 'settlement') return true;
        return Number(String(log.date).slice(0, 4)) > HIDE_SETTLEMENTS_THROUGH_YEAR;
      }),
    [logs]
  );

  if (empLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (empError || !employee) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  const year = employee.leaveSummary.displayYear;
  const summary = employee.leaveSummary;

  return (
    <div>
      <PageHeader
        title="연차 사용현황"
        description={`${year}년 발생·사용 내역을 한곳에서 확인합니다`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <LeaveSummaryCard
          title="잔여 연차"
          value={summary.remaining}
          subtitle={summary.scheduledDays ? `사용일 지난 뒤 차감 · 예정 ${summary.scheduledDays}일` : `${year}년 기준`}
          highlight
        />
        <LeaveSummaryCard title="올해 발생" value={summary.accruedThisYear} subtitle={`${year}년 발생 합계`} />
        <LeaveSummaryCard title="올해 사용" value={summary.usedDays} subtitle="사용일이 지난 승인 건" />
      </div>

      <Panel className="mb-5">
        <PanelHeader
          title={`${year}년 사용 내역`}
          description={`${sortedUsages.length}건`}
        />
        <LeaveUsageTable usages={sortedUsages} isLoading={usagesLoading} />
      </Panel>

      <Panel>
        <PanelHeader
          title={`${year}년 발생 내역`}
          actions={
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="warning">첫해 월차</Badge>
              <Badge variant="purple">비례 연차</Badge>
              <Badge variant="info">정규 연차</Badge>
              <Badge variant="orange">연차 정산</Badge>
            </div>
          }
        />
        <LeaveHistoryTable logs={visibleLogs} isLoading={logsLoading} />
      </Panel>
    </div>
  );
}
