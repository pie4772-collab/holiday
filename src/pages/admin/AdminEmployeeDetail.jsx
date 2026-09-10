import { useParams, Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { LeaveHistoryTable } from '../../components/LeaveHistoryTable';
import { Timeline } from '../../components/Timeline';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useEmployee } from '../../hooks/useLeaveData';
import { formatDate, formatLeaveType } from '../../utils/leaveCalculations';

export function AdminEmployeeDetail() {
  const { id } = useParams();
  const { data: employee, isLoading, isError, refetch } = useEmployee(id);

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

  return (
    <div>
      <PageHeader
        title={employee.name}
        description={`${employee.department}${employee.position ? ` · ${employee.position}` : ''}${employee.empNo ? ` · 사번 ${employee.empNo}` : ''}${employee.workplace ? ` · ${employee.workplace}` : ''}`}
        backTo="/admin/leave-manage"
        backLabel="연차 관리"
        actions={
          <Link to={`/admin/leave-manage/${id}`}>
            <Button variant="primary" size="sm">
              <Settings className="h-3.5 w-3.5" />
              연차 수정
            </Button>
          </Link>
        }
      >
        <div className="flex gap-2 mt-3">
          <Badge variant="primary">{leaveSummary.displayYear}년 기준</Badge>
          <Badge variant={leaveSummary.isFirstYear ? 'warning' : leaveSummary.isProratedTarget ? 'purple' : 'success'}>
            {leaveSummary.isFirstYear
              ? '첫해 (월차)'
              : leaveSummary.isProratedTarget
                ? '비례 연차'
                : '정규 연차'}
          </Badge>
        </div>
      </PageHeader>

      <Panel className="mb-6">
        <PanelHeader title="기본 정보" />
        <PanelBody>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
            {[
              { label: '입사일', value: formatDate(employee.hireDate) },
              { label: '이메일', value: employee.email || '—' },
              {
                label: '현재 단계',
                value: leaveSummary.isFirstYear
                  ? '첫해 (월차)'
                  : leaveSummary.isProratedTarget
                    ? '비례 연차'
                    : '정규 연차',
              },
              { label: '잔여 연차', value: `${leaveSummary.remaining}일`, accent: true },
            ].map(({ label, value, accent }) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-stripe-muted">{label}</dt>
                <dd className={`mt-1 font-medium ${accent ? 'text-[#09825d] text-lg' : 'text-stripe-text'}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <LeaveSummaryCard
          title="월차 정산"
          value={
            leaveSummary.phase === 'first_year_monthly'
              ? settlement.totalMonths
              : settlement.settledThisYear
                ? settlement.settledDays
                : settlement.totalMonths
          }
          subtitle={
            leaveSummary.phase === 'first_year_monthly'
              ? `진행 중 (${settlement.totalMonths}/11)`
              : settlement.settledThisYear
                ? `${settlement.settledDate} · ${settlement.settledDays}일 차감`
                : settlement.settledDate
                  ? `${settlement.settledDate} 일사일 정산 완료`
                  : '일사일 정산'
          }
        />
        <LeaveSummaryCard
          title="정산 차감"
          value={leaveSummary.settledDeduction}
          subtitle={`${leaveSummary.displayYear}년`}
        />
        <LeaveSummaryCard
          title="비례 연차"
          value={leaveSummary.proratedLeave || 0}
          subtitle="15 × (남은일수/365)"
        />
        <LeaveSummaryCard
          title="정규 연차"
          value={leaveSummary.annualLeave || 0}
          subtitle="기본 15일 + 근속 가산"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Timeline hireDate={employee.hireDate} leaveSummary={leaveSummary} />

        <Panel>
          <PanelHeader title="연차 사용 내역" />
          <PanelBody noPadding>
            {employee.usages?.length === 0 ? (
              <p className="py-10 text-center text-sm text-stripe-muted">사용 내역이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#f0f3f7]">
                {employee.usages?.map((usage) => (
                  <div key={usage.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium font-mono text-stripe-text">{usage.date}</p>
                      <p className="text-xs text-stripe-muted mt-0.5">{usage.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={usage.type === 'full' ? 'info' : 'warning'}>
                        {formatLeaveType(usage.type)}
                      </Badge>
                      <Badge
                        variant={
                          usage.status === 'approved'
                            ? 'success'
                            : usage.status === 'rejected'
                              ? 'default'
                              : 'warning'
                        }
                      >
                        {usage.status === 'approved' ? '승인' : usage.status === 'rejected' ? '반려' : '대기'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel className="mb-5">
        <PanelHeader title={`${leaveSummary.displayYear}년 정산 이력`} />
        <PanelBody noPadding>
          {leaveSummary.settlements?.length === 0 ? (
            <p className="py-10 text-center text-sm text-stripe-muted">정산 이력이 없습니다.</p>
          ) : (
            <div className="divide-y divide-[#f0f3f7]">
              {leaveSummary.settlements?.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-stripe-text">{s.description}</p>
                    <p className="text-xs font-mono text-stripe-muted mt-0.5">{formatDate(s.date)}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-[#df1b41]">
                    −{s.settledDays}일
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={`${leaveSummary.displayYear}년 발생 로그`} />
        <LeaveHistoryTable logs={employee.accrualLogs} />
      </Panel>
    </div>
  );
}
