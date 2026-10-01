import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { AttendanceMonthTable, AttendanceSummary } from '../../components/attendance/AttendanceMonthTable';
import { AttendanceCorrectionModal } from '../../components/attendance/AttendanceCorrectionModal';
import { useCorrectAttendance, useEmployeeAttendance } from '../../hooks/useAttendance';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import { hasPermission } from '../../utils/access';
import { WORK_TYPE_LABELS } from '../../constants/attendance';

const LOG_LABELS = {
  check_in: '출근',
  check_out: '퇴근',
  check_out_again: '퇴근 재기록',
  correct: '정정',
  delete: '기록 삭제',
  remote_approve: '외근·출장 확인',
  remote_reject: '외근·출장 반려',
};

function describeTimes(times) {
  if (!times) return '없음';
  const part = (at, type, place) =>
    at ? `${at.slice(11, 16)}${type && type !== 'office' ? `(${WORK_TYPE_LABELS[type]}${place ? ` ${place}` : ''})` : ''}` : '-';
  return `${part(times.checkInAt, times.checkInType, times.checkInPlace)} ~ ${part(times.checkOutAt, times.checkOutType, times.checkOutPlace)}`;
}

export function AdminAttendanceEmployee() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month') || format(new Date(), 'yyyy-MM');
  const { data, isLoading, isError, refetch } = useEmployeeAttendance(id, month);
  const { data: currentEmployee } = useCurrentEmployee();
  const correct = useCorrectAttendance();
  const [editing, setEditing] = useState(null);
  const canEdit = hasPermission(currentEmployee, 'attendance.edit') && data && !data.closed;
  const today = format(new Date(), 'yyyy-MM-dd');

  async function handleCorrect(form) {
    await correct.mutateAsync({ employeeId: id, date: editing.day.date, data: form });
    setEditing(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError || !data) return <ErrorMessage onRetry={() => refetch()} />;

  const { employee, site } = data;

  return (
    <div>
      <PageHeader
        title={`${employee.name} 근태`}
        description={`${employee.workplace} · ${employee.department} · ${employee.position}${site ? ` · 근무 ${site.workStart}~${site.workEnd}` : ''}`}
        backTo="/admin/attendance"
        backLabel="근태 현황"
        actions={
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setSearchParams({ month: e.target.value })}
            className="stripe-input"
          />
        }
      >
        {data.closed && (
          <div className="mt-2">
            <Badge variant="default">마감된 달 · 정정하려면 마감을 해제하세요</Badge>
          </div>
        )}
      </PageHeader>

      <Panel className="mb-5">
        <PanelBody>
          <AttendanceSummary summary={data.summary} />
        </PanelBody>
        <AttendanceMonthTable
          days={data.days}
          onEdit={
            canEdit
              ? (day) => {
                  correct.reset();
                  setEditing({ employee, day });
                }
              : undefined
          }
          canEditDay={(day) => day.date <= today}
        />
      </Panel>

      <Panel>
        <PanelHeader title="기록·정정 이력" description="출퇴근 버튼 기록과 관리자 정정이 모두 남습니다." />
        {data.logs?.length ? (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>시각</th>
                  <th>근무일</th>
                  <th>구분</th>
                  <th>내용</th>
                  <th>처리자</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-mono text-[12px] whitespace-nowrap">{log.occurredAt}</td>
                    <td className="font-mono text-[12px] whitespace-nowrap">{log.workDate}</td>
                    <td className="whitespace-nowrap">{LOG_LABELS[log.action] || log.action}</td>
                    <td className="text-[13px]">
                      {log.action.startsWith('remote_') ? (
                        <span className="text-stripe-muted">{log.reason ? `사유: ${log.reason}` : '-'}</span>
                      ) : log.detail ? (
                        <>
                          {describeTimes(log.detail.before)} → {describeTimes(log.detail.after)}
                          {log.reason && <span className="block text-stripe-muted">사유: {log.reason}</span>}
                        </>
                      ) : (
                        <>
                          {log.type && log.type !== 'office' ? `${WORK_TYPE_LABELS[log.type]} ${log.place || ''}` : '사무실'}
                          {log.ip && <span className="ml-1 font-mono text-[11px] text-stripe-muted">{log.ip}</span>}
                        </>
                      )}
                    </td>
                    <td className="muted whitespace-nowrap">{log.actorName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-stripe-muted">이 달의 기록이 없습니다.</p>
        )}
      </Panel>

      <AttendanceCorrectionModal
        target={editing}
        onClose={() => setEditing(null)}
        onSubmit={(form) => handleCorrect(form).catch(() => {})}
        isSubmitting={correct.isPending}
        error={correct.error?.message}
      />
    </div>
  );
}
