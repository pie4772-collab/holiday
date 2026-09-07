import { LeaveHistoryTable } from '../../components/LeaveHistoryTable';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { useCurrentEmployee, useLeaveHistory } from '../../hooks/useLeaveData';

export function EmployeeLeaveHistory() {
  const { data: employee, isLoading: empLoading, isError: empError, refetch } = useCurrentEmployee();
  const { data: logs, isLoading: logsLoading } = useLeaveHistory(employee?.id);

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

  return (
    <div>
      <PageHeader
        title="발생 내역"
        description={`${employee.leaveSummary.displayYear}년 발생·정산 내역`}
      />

      <Panel>
        <PanelHeader
          title="유형 안내"
          actions={
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="warning">첫해 월차</Badge>
              <Badge variant="purple">비례 연차</Badge>
              <Badge variant="info">정규 연차</Badge>
              <Badge variant="orange">연차 정산</Badge>
            </div>
          }
        />
        <LeaveHistoryTable logs={logs} isLoading={logsLoading} />
      </Panel>
    </div>
  );
}
