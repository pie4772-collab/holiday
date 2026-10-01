import { Pencil } from 'lucide-react';
import { AttendanceFlags, WorkTypeLabel } from './AttendanceBadges';
import { formatClock, formatMinutes } from '../../constants/attendance';

export function AttendanceSummary({ summary }) {
  if (!summary) return null;
  const items = [
    { label: '근무일', value: `${summary.scheduledDays}일` },
    { label: '출근일', value: `${summary.attendedDays}일` },
    { label: '지각', value: summary.late, warn: summary.late > 0 },
    { label: '조퇴', value: summary.early, warn: summary.early > 0 },
    { label: '결근', value: summary.absent, warn: summary.absent > 0 },
    { label: '기록 누락', value: summary.missingIn + summary.missingOut, warn: summary.missingIn + summary.missingOut > 0 },
    { label: '연차', value: `${summary.leaveDays}일` },
    {
      label: '출장·외근',
      value: summary.remotePending ? `${summary.tripDays + summary.outsideDays} (대기 ${summary.remotePending})` : summary.tripDays + summary.outsideDays,
    },
    { label: '근무시간', value: formatMinutes(summary.workMinutes) },
    { label: '연장', value: formatMinutes(summary.overtimeMinutes) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-stripe-border px-3 py-2">
          <p className="text-[12px] text-stripe-muted">{item.label}</p>
          <p className={`text-sm font-semibold tabular-nums ${item.warn ? 'text-[#df1b41]' : 'text-stripe-text'}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AttendanceMonthTable({ days = [], onEdit, canEditDay }) {
  return (
    <div className="overflow-x-auto">
      <table className="stripe-table">
        <thead>
          <tr>
            <th>날짜</th>
            <th>출근</th>
            <th>퇴근</th>
            <th>상태</th>
            <th className="text-right">근무</th>
            <th className="text-right">연장</th>
            {onEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const weekend = day.weekday === '토' || day.weekday === '일' || !day.evaluation.isWorkingDay;
            return (
              <tr key={day.date}>
                <td className="whitespace-nowrap">
                  <span className={`font-mono text-[13px] ${weekend ? 'text-[#df1b41]' : ''}`}>
                    {day.date.slice(5)} ({day.weekday})
                  </span>
                  {day.evaluation.holidayName && !['토요일', '일요일'].includes(day.evaluation.holidayName) && (
                    <span className="ml-1 text-[11px] text-[#df1b41]">{day.evaluation.holidayName}</span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <span className="tabular-nums">{formatClock(day.record?.checkInAt, day.date) || '-'}</span>
                  <div>
                    <WorkTypeLabel
                      type={day.record?.checkInType}
                      place={day.record?.checkInPlace}
                      site={day.evaluation?.crossSite?.in}
                    />
                  </div>
                </td>
                <td className="whitespace-nowrap">
                  <span className="tabular-nums">{formatClock(day.record?.checkOutAt, day.date) || '-'}</span>
                  <div>
                    <WorkTypeLabel
                      type={day.record?.checkOutType}
                      place={day.record?.checkOutPlace}
                      site={day.evaluation?.crossSite?.out}
                    />
                  </div>
                </td>
                <td>
                  <AttendanceFlags flags={day.evaluation.flags} leave={day.leave} />
                  {day.record?.corrected && <span className="ml-1 text-[11px] text-stripe-muted">정정됨</span>}
                </td>
                <td className="text-right tabular-nums text-[13px]">{formatMinutes(day.evaluation.workMinutes)}</td>
                <td className="text-right tabular-nums text-[13px]">{formatMinutes(day.evaluation.overtimeMinutes)}</td>
                {onEdit && (
                  <td className="text-right">
                    {(!canEditDay || canEditDay(day)) && (
                      <button
                        type="button"
                        onClick={() => onEdit(day)}
                        className="rounded p-1 text-stripe-muted hover:bg-[#f0f3f7] hover:text-stripe-text"
                        aria-label="정정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
