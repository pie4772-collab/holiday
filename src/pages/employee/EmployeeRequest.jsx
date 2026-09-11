import { FilePlus, CheckCircle } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { LeaveUsageList } from '../../components/LeaveUsageList';
import { useCurrentEmployee, useLeaveUsages } from '../../hooks/useLeaveData';
import { useAppStore } from '../../store/useAppStore';

export function EmployeeRequest() {
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

  const pending = usages?.filter((u) => u.status === 'pending') || [];
  const recent = (usages || [])
    .filter((u) => u.status !== 'pending')
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="연차 신청"
        description="시작일과 종료일을 선택하면 그 사이 평일만 한 번에 신청합니다. 주말·공휴일은 제외됩니다."
      />

      {lastRequestMessage && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{lastRequestMessage}</span>
        </div>
      )}

      <Panel className="max-w-md mb-6">
        <PanelBody>
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50">
              <FilePlus className="h-6 w-6 text-primary-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stripe-text">연차 신청하기</h2>
              <p className="text-sm text-stripe-muted mt-1">
                잔여{' '}
                <span className="font-semibold text-stripe-text tabular-nums">
                  {employee.leaveSummary.remaining}일
                </span>
                <span className="text-stripe-muted/70"> · {employee.leaveSummary.displayYear}년</span>
              </p>
              <p className="text-[13px] text-stripe-muted mt-2">
                예: 1일부터 3일까지 → 한 번에 신청됩니다. 잔여는 사용일이 지난 뒤에 차감됩니다.
              </p>
            </div>
            <Button className="w-full" onClick={() => openRequestModal()}>
              신청하기
            </Button>
          </div>

          <div className="mt-6 pt-5 border-t border-stripe-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stripe-muted mb-3">
              안내
            </p>
            <ul className="space-y-2 text-[13px] text-stripe-muted">
              <li>연속 연차는 시작일~종료일의 평일만 신청됩니다 (주말·공휴일 제외)</li>
              <li>반차는 평일 하루만 신청할 수 있습니다</li>
              <li>신청·승인 직후에는 잔여가 줄지 않고, 사용일이 지난 뒤에 차감됩니다</li>
              <li>팀원 신청은 팀장 승인, 경영전략실은 박지은 승인</li>
            </ul>
          </div>
        </PanelBody>
      </Panel>

      <Panel className="max-w-md mb-6">
        <PanelHeader title="승인 대기" description={`${pending.length}건`} />
        <PanelBody noPadding>
          <LeaveUsageList usages={pending} emptyText="승인 대기 중인 신청이 없습니다." />
        </PanelBody>
      </Panel>

      {recent.length > 0 && (
        <Panel className="max-w-md">
          <PanelHeader title="최근 처리" description={`${recent.length}건`} />
          <PanelBody noPadding>
            <LeaveUsageList usages={recent} />
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
