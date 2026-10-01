import { useState } from 'react';
import { format } from 'date-fns';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { AttendanceTodayCard } from '../../components/attendance/AttendanceTodayCard';
import { AttendanceMonthTable, AttendanceSummary } from '../../components/attendance/AttendanceMonthTable';
import { AttendanceRules } from '../../components/attendance/AttendanceRules';
import { useMyAttendanceMonth } from '../../hooks/useAttendance';

export function EmployeeAttendance() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const { data, isLoading, isError, refetch } = useMyAttendanceMonth(month);

  return (
    <div>
      <PageHeader title="출퇴근" description="회사 네트워크에서 출근·퇴근 버튼을 눌러 기록합니다." />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-5 mb-6">
        <AttendanceTodayCard />
        <AttendanceRules site={data?.site} />
      </div>

      <Panel>
        <PanelHeader
          title="월별 근태"
          description={data?.closed ? '마감된 달입니다. 수정이 필요하면 인사담당자에게 요청하세요.' : '잘못된 기록은 인사담당자에게 정정을 요청하세요.'}
          actions={
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="stripe-input py-1.5"
            />
          }
        />
        {isLoading ? (
          <PanelBody className="flex justify-center py-10">
            <LoadingSpinner />
          </PanelBody>
        ) : isError ? (
          <PanelBody>
            <ErrorMessage onRetry={() => refetch()} />
          </PanelBody>
        ) : (
          <>
            <PanelBody>
              <AttendanceSummary summary={data.summary} />
            </PanelBody>
            <AttendanceMonthTable days={data.days} />
          </>
        )}
      </Panel>
    </div>
  );
}
