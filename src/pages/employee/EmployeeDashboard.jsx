import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { Timeline } from '../../components/Timeline';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrentEmployee, useLeaveUsages } from '../../hooks/useLeaveData';
import { formatDate } from '../../utils/leaveCalculations';
import { LeaveUsageList } from '../../components/LeaveUsageList';
import { useAppStore } from '../../store/useAppStore';

export function EmployeeDashboard() {
  const { lastRequestMessage } = useAppStore();
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

  const { leaveSummary } = employee;
  const settlement = leaveSummary.firstYearMonthlySettlement;
  const year = leaveSummary.displayYear;
  const pendingUsages = usages?.filter((u) => u.status === 'pending') || [];

  return (
    <div>
      {lastRequestMessage && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{lastRequestMessage}</span>
        </div>
      )}

      <PageHeader
        title={`안녕하세요, ${employee.name}님`}
        description={`${employee.department} · 입사일 ${formatDate(employee.hireDate)}`}
      >
        <div className="flex gap-2 mt-3">
          <Badge variant="primary">{year}년 기준</Badge>
          {leaveSummary.isFirstYear && <Badge variant="warning">첫해 근무 중</Badge>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <LeaveSummaryCard
          title="잔여 연차"
          value={leaveSummary.remaining}
          subtitle={`${year}년 · 발생 ${leaveSummary.totalGranted} − 사용 ${leaveSummary.usedDays} − 정산 ${leaveSummary.settledDeduction}`}
          highlight
        />
        <LeaveSummaryCard
          title="올해 발생"
          value={leaveSummary.accruedThisYear}
          subtitle={
            leaveSummary.phase === 'first_year_monthly'
              ? `${year}년 월차 ${leaveSummary.accruedThisYear}개`
              : leaveSummary.phase === 'prorated'
                ? `${year}년 비례 ${leaveSummary.proratedLeave}일`
                : `${year}년 정규 ${leaveSummary.annualLeave}일`
          }
        />
        <LeaveSummaryCard
          title="월차 정산"
          value={
            leaveSummary.phase === 'first_year_monthly'
              ? settlement.totalMonths
              : settlement.settledThisYear
                ? settlement.settledDays
                : 0
          }
          subtitle={
            leaveSummary.phase === 'first_year_monthly'
              ? `현재 ${settlement.totalMonths}개월차 (최대 11)`
              : settlement.settledThisYear
                ? `${settlement.settledDate} 일사일 · ${settlement.settledDays}일 차감`
                : settlement.settledDate
                  ? `${settlement.settledDate} 일사일 정산 완료`
                  : '일사일(입사 1주년) 정산'
          }
        />
        <LeaveSummaryCard
          title="정산 차감"
          value={leaveSummary.settledDeduction}
          subtitle={`${year}년 정산 차감 합계`}
        />
        <LeaveSummaryCard
          title="사용 연차"
          value={leaveSummary.usedDays}
          subtitle={`${year}년 올해 사용`}
        />
      </div>

      {pendingUsages.length > 0 && (
        <Panel className="mb-8">
          <PanelHeader
            title="승인 대기 중인 신청"
            description={`${pendingUsages.length}건 · 승인되면 잔여 연차에서 차감됩니다`}
            actions={
              <Link to="/employee/request" className="text-sm text-primary-600 hover:text-primary-700">
                신청 내역
              </Link>
            }
          />
          <PanelBody noPadding>
            <LeaveUsageList usages={pendingUsages} />
          </PanelBody>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Timeline hireDate={employee.hireDate} leaveSummary={leaveSummary} />

        <Panel>
          <PanelHeader title="연차 규칙" description="회사 연차 정책 안내" />
          <PanelBody noPadding>
            <div className="divide-y divide-[#f0f3f7]">
              {[
                {
                  n: '1',
                  title: '첫해 월차',
                  body: '입사 후 매월 1개 (최대 11개), 일사일(입사 1주년)에 정산·잔여 차감',
                },
                {
                  n: '2',
                  title: '비례 연차',
                  body: '일사일 도달 시 발생, 회계기준일(1/1)에 정산·잔여 차감',
                },
                {
                  n: '3',
                  title: '정규 연차',
                  body: '매 회계기준일(1/1) 발생, 다음 회계기준일에 정산·잔여 차감',
                },
                {
                  n: '=',
                  title: '잔여 연차',
                  body: '올해 발생 − 올해 사용 − 올해 정산 차감',
                },
              ].map((rule) => (
                <div key={rule.n} className="flex gap-4 px-5 py-4">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-[#f0f3f7] text-[11px] font-semibold text-stripe-muted">
                    {rule.n}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-stripe-text">{rule.title}</p>
                    <p className="text-[13px] text-stripe-muted mt-0.5 leading-relaxed">{rule.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
