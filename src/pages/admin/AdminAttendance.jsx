import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Download, Lock, Pencil, Search, Unlock } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { AttendanceFlags, WorkTypeLabel } from '../../components/attendance/AttendanceBadges';
import { AttendanceCorrectionModal } from '../../components/attendance/AttendanceCorrectionModal';
import {
  useAttendanceClosing,
  useAttendanceDaily,
  useAttendanceMonthly,
  useCorrectAttendance,
} from '../../hooks/useAttendance';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import { hasPermission, isScopedPermission } from '../../utils/access';
import { leaveApi } from '../../api/leaveApi';
import { ATTENDANCE_FLAG_MAP, formatClock, formatMinutes } from '../../constants/attendance';

const DAILY_FILTERS = ['late', 'early', 'absent', 'not_yet', 'missing_out', 'missing_in', 'leave_full', 'trip', 'outside', 'holiday_work'];

function useFilters(rows) {
  const [query, setQuery] = useState('');
  const [workplace, setWorkplace] = useState('');
  const workplaces = useMemo(
    () => [...new Set((rows || []).map((r) => r.workplace).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [rows]
  );
  const filter = (row) => {
    if (workplace && row.workplace !== workplace) return false;
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return [row.name, row.empNo, row.department, row.position].filter(Boolean).join(' ').toLowerCase().includes(keyword);
  };
  const controls = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
        <input
          className="stripe-input stripe-input-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름, 사번, 부서 검색"
        />
      </div>
      <select className="stripe-input" value={workplace} onChange={(e) => setWorkplace(e.target.value)}>
        <option value="">사업장 전체</option>
        {workplaces.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </>
  );
  return { filter, controls };
}

function DailyView({ canEdit }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [flag, setFlag] = useState('');
  const [editing, setEditing] = useState(null);
  const { data, isLoading, isError, refetch } = useAttendanceDaily(date);
  const correct = useCorrectAttendance();
  const { filter, controls } = useFilters(data?.rows);

  const rows = (data?.rows || []).filter((row) => filter(row) && (!flag || row.evaluation.flags.includes(flag)));

  async function handleCorrect(form) {
    await correct.mutateAsync({ employeeId: editing.employee.employeeId, date: editing.day.date, data: form });
    setEditing(null);
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="date" className="stripe-input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        {controls}
      </div>
      {data && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFlag('')}
            className={`rounded-full border px-3 py-1 text-[12px] ${!flag ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stripe-border text-stripe-muted'}`}
          >
            전체 {data.rows.length}
          </button>
          {DAILY_FILTERS.filter((key) => data.counts[key]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFlag(flag === key ? '' : key)}
              className={`rounded-full border px-3 py-1 text-[12px] ${flag === key ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stripe-border text-stripe-muted'}`}
            >
              {ATTENDANCE_FLAG_MAP[key].label} {data.counts[key]}
            </button>
          ))}
          {data.holidayName && <Badge variant="danger">{data.holidayName}</Badge>}
          {data.closed && <Badge variant="default">마감됨</Badge>}
        </div>
      )}
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-stripe-muted">해당하는 직원이 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>사업장·부서</th>
                  <th>출근</th>
                  <th>퇴근</th>
                  <th>상태</th>
                  <th className="text-right">근무</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td className="whitespace-nowrap">
                      <Link
                        to={`/admin/attendance/${row.employeeId}?month=${date.slice(0, 7)}`}
                        className="font-medium text-stripe-text hover:text-primary-600"
                      >
                        {row.name}
                      </Link>
                      <span className="ml-1 text-[12px] text-stripe-muted">{row.position}</span>
                    </td>
                    <td className="muted whitespace-nowrap text-[13px]">
                      {row.workplace} · {row.department}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="tabular-nums">{formatClock(row.record?.checkInAt, row.date) || '-'}</span>
                      {row.record?.checkInIp && (
                        <span className="ml-1 font-mono text-[11px] text-stripe-muted">{row.record.checkInIp}</span>
                      )}
                      <div>
                        <WorkTypeLabel type={row.record?.checkInType} place={row.record?.checkInPlace} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="tabular-nums">{formatClock(row.record?.checkOutAt, row.date) || '-'}</span>
                      <div>
                        <WorkTypeLabel type={row.record?.checkOutType} place={row.record?.checkOutPlace} />
                      </div>
                    </td>
                    <td>
                      <AttendanceFlags flags={row.evaluation.flags} leave={row.leave} />
                      {row.record?.corrected && <span className="ml-1 text-[11px] text-stripe-muted">정정됨</span>}
                    </td>
                    <td className="text-right tabular-nums text-[13px]">{formatMinutes(row.evaluation.workMinutes)}</td>
                    <td className="text-right">
                      {canEdit && !data.closed && (
                        <button
                          type="button"
                          onClick={() => {
                            correct.reset();
                            setEditing({ employee: row, day: row });
                          }}
                          className="rounded p-1 text-stripe-muted hover:bg-[#f0f3f7] hover:text-stripe-text"
                          aria-label="정정"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <AttendanceCorrectionModal
        target={editing}
        onClose={() => setEditing(null)}
        onSubmit={(form) => handleCorrect(form).catch(() => {})}
        isSubmitting={correct.isPending}
        error={correct.error?.message}
      />
    </>
  );
}

function MonthlyView({ canManage }) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const { data, isLoading, isError, refetch } = useAttendanceMonthly(month);
  const closing = useAttendanceClosing();
  const [message, setMessage] = useState('');
  const { filter, controls } = useFilters(data?.rows);
  const rows = (data?.rows || []).filter(filter);

  async function download() {
    setMessage('');
    try {
      const blob = await leaveApi.downloadAttendanceCsv(month);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `근태_${month}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleClosing() {
    setMessage('');
    const close = !data.closed;
    const ok = window.confirm(
      close
        ? `${month} 근태를 마감할까요? 마감 후에는 출퇴근 기록과 정정을 할 수 없습니다.`
        : `${month} 근태 마감을 해제할까요?`
    );
    if (!ok) return;
    try {
      await closing.mutateAsync({ month, close });
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="month" className="stripe-input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        {controls}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {data && (
          <span className="text-sm text-stripe-muted">
            근무일 {data.workingDays}일 · {rows.length}명
            {data.closed ? ` · ${data.closedAt?.slice(0, 16)} 마감` : ''}
            {!data.startDate ? ' · 아직 출퇴근 기록이 없어 결근을 판정하지 않습니다' : data.startDate > `${month}-01` ? ` · 결근 판정은 ${data.startDate}부터` : ''}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={download}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          {canManage && data && (
            <Button variant={data.closed ? 'secondary' : 'primary'} size="sm" onClick={toggleClosing} disabled={closing.isPending}>
              {data.closed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {data.closed ? '마감 해제' : '월 마감'}
            </Button>
          )}
        </div>
      </div>
      {message && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">{message}</div>
      )}
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage onRetry={() => refetch()} />
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>사업장·부서</th>
                  <th className="text-right">출근일</th>
                  <th className="text-right">지각</th>
                  <th className="text-right">조퇴</th>
                  <th className="text-right">결근</th>
                  <th className="text-right">누락</th>
                  <th className="text-right">연차</th>
                  <th className="text-right">출장·외근</th>
                  <th className="text-right">휴일근무</th>
                  <th className="text-right">근무시간</th>
                  <th className="text-right">연장</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const s = row.summary;
                  const warn = (n) => (n > 0 ? 'text-[#df1b41] font-medium' : 'muted');
                  return (
                    <tr key={row.employeeId}>
                      <td className="whitespace-nowrap">
                        <Link
                          to={`/admin/attendance/${row.employeeId}?month=${month}`}
                          className="font-medium text-stripe-text hover:text-primary-600"
                        >
                          {row.name}
                        </Link>
                        <span className="ml-1 text-[12px] text-stripe-muted">{row.position}</span>
                      </td>
                      <td className="muted whitespace-nowrap text-[13px]">
                        {row.workplace} · {row.department}
                      </td>
                      <td className="text-right tabular-nums">
                        {s.attendedDays}/{s.scheduledDays}
                      </td>
                      <td className={`text-right tabular-nums ${warn(s.late)}`}>{s.late}</td>
                      <td className={`text-right tabular-nums ${warn(s.early)}`}>{s.early}</td>
                      <td className={`text-right tabular-nums ${warn(s.absent)}`}>{s.absent}</td>
                      <td className={`text-right tabular-nums ${warn(s.missingIn + s.missingOut)}`}>{s.missingIn + s.missingOut}</td>
                      <td className="text-right tabular-nums">{s.leaveDays}</td>
                      <td className="text-right tabular-nums">{s.tripDays + s.outsideDays}</td>
                      <td className="text-right tabular-nums">{s.holidayWorkDays}</td>
                      <td className="text-right tabular-nums text-[13px]">{formatMinutes(s.workMinutes)}</td>
                      <td className="text-right tabular-nums text-[13px]">{formatMinutes(s.overtimeMinutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export function AdminAttendance() {
  const { data: currentEmployee } = useCurrentEmployee();
  const [tab, setTab] = useState('daily');
  const scoped = isScopedPermission(currentEmployee, 'attendance.view');
  const canEdit = hasPermission(currentEmployee, 'attendance.edit');
  const canManage = hasPermission(currentEmployee, 'attendance.manage');

  return (
    <div>
      <PageHeader
        title="근태 현황"
        description={`${scoped ? '담당 사업장 · ' : ''}출퇴근 기록과 지각·조퇴·결근 판정. 판정은 연차·설정 변경에 따라 다시 계산됩니다.`}
      />
      <div className="mb-4 inline-flex rounded-md border border-stripe-border p-0.5">
        {[
          { key: 'daily', label: '일별 현황' },
          { key: 'monthly', label: '월별 집계' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded px-4 py-1.5 text-sm font-medium ${tab === item.key ? 'bg-primary-50 text-primary-700' : 'text-stripe-muted'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'daily' ? <DailyView canEdit={canEdit} /> : <MonthlyView canManage={canManage} />}
    </div>
  );
}
