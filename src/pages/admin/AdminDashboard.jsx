import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { useAdminStats, useEmployees } from '../../hooks/useLeaveData';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function AdminDashboard() {
  const { data: stats, isLoading, isError, refetch } = useAdminStats();
  const { data: employees } = useEmployees();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !stats) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  const firstYearEmployees = employees?.filter((e) => e.leaveSummary.isFirstYear) || [];
  const proratedEmployees = employees?.filter((e) => e.leaveSummary.isProratedTarget) || [];

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`전체 ${stats.totalEmployees}명 · ${stats.displayYear}년 기준 연차 현황`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <LeaveSummaryCard
          title="총 부여"
          value={stats.totalGranted}
          unit="일"
          subtitle={`${stats.displayYear}년 부여 합계`}
          highlight
        />
        <LeaveSummaryCard
          title="총 사용"
          value={stats.totalUsed}
          unit="일"
          subtitle={`${stats.displayYear}년 사용 합계`}
        />
        <LeaveSummaryCard
          title="평균 사용율"
          value={stats.averageUsageRate}
          unit="%"
          subtitle="사용 ÷ 부여"
        />
        <LeaveSummaryCard
          title="평균 사용"
          value={stats.averageUsed}
          unit="일"
          subtitle="1인당 평균 사용"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <LeaveSummaryCard
          title="평균 잔여"
          value={stats.averageRemaining}
          subtitle={`${stats.displayYear}년 전체 직원 평균`}
        />
        <LeaveSummaryCard
          title="이번 달 사용"
          value={stats.monthlyUsage}
          subtitle={`${new Date().getMonth() + 1}월 연차 사용 합계`}
        />
        <LeaveSummaryCard
          title="첫해 직원"
          value={stats.firstYearEmployeeCount}
          unit="명"
          subtitle="월차 발생 대상"
        />
        <LeaveSummaryCard
          title="비례 연차"
          value={stats.proratedTargetCount}
          unit="명"
          subtitle="1년 도달 ~ 회계연도 전"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <PanelHeader
            title="첫해 직원"
            description={`${firstYearEmployees.length}명`}
          />
          <PanelBody noPadding>
            {firstYearEmployees.length === 0 ? (
              <p className="px-5 py-8 text-sm text-stripe-muted text-center">해당 직원이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#f0f3f7]">
                {firstYearEmployees.map((emp) => (
                  <Link
                    key={emp.id}
                    to={`/admin/employees/${emp.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-[#f6f9fc] transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                      <p className="text-xs text-stripe-muted mt-0.5">{emp.department}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums text-stripe-muted">
                        월차 {emp.leaveSummary.firstYearMonthlySettlement.totalMonths}개
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#c1cad6] group-hover:text-primary-500" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="비례 연차 대상"
            description={`${proratedEmployees.length}명`}
          />
          <PanelBody noPadding>
            {proratedEmployees.length === 0 ? (
              <p className="px-5 py-8 text-sm text-stripe-muted text-center">해당 직원이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#f0f3f7]">
                {proratedEmployees.map((emp) => (
                  <Link
                    key={emp.id}
                    to={`/admin/employees/${emp.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-[#f6f9fc] transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                      <p className="text-xs text-stripe-muted mt-0.5">{emp.department}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums text-stripe-muted">
                        {emp.leaveSummary.proratedLeave}일
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#c1cad6] group-hover:text-primary-500" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
