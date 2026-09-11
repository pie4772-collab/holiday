import { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getHolidayName, isNonWorkingDay, isWeekendDate } from '../utils/workCalendar';

export function LeaveCalendar({ usages = [], onDateClick, displayYear }) {
  const initialMonth = displayYear
    ? new Date(displayYear, new Date().getMonth(), 1)
    : new Date();
  const [currentMonth, setCurrentMonth] = useState(initialMonth);

  function goPrevMonth() {
    const prev = subMonths(currentMonth, 1);
    if (displayYear && prev.getFullYear() < displayYear) return;
    setCurrentMonth(prev);
  }

  function goNextMonth() {
    const next = addMonths(currentMonth, 1);
    if (displayYear && next.getFullYear() > displayYear) return;
    setCurrentMonth(next);
  }

  const canGoPrev = !displayYear || subMonths(currentMonth, 1).getFullYear() >= displayYear;
  const canGoNext = !displayYear || addMonths(currentMonth, 1).getFullYear() <= displayYear;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const usageMap = usages.reduce((map, usage) => {
    const date = usage.date;
    if (!map[date]) map[date] = [];
    map[date].push(usage);
    return map;
  }, {});

  function getDayStyle(dateStr) {
    const dayUsages = usageMap[dateStr];
    if (!dayUsages?.length) return null;

    const pending = dayUsages.some((u) => u.status === 'pending');
    if (pending) return 'bg-[#fef3c7] text-[#b45309] ring-1 ring-[#fbbf24]';

    const hasFull = dayUsages.some((u) => u.type === 'full');
    const hasHalf = dayUsages.some((u) => u.type === 'half');

    if (hasFull) return 'bg-primary-500 text-white';
    if (hasHalf) return 'bg-[#fbbf24] text-white';
    return null;
  }

  return (
    <div className="stripe-panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-stripe-border">
        <button
          onClick={goPrevMonth}
          disabled={!canGoPrev}
          className="rounded-md p-1.5 hover:bg-[#f0f3f7] transition-colors disabled:opacity-30"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4 text-stripe-muted" />
        </button>
        <h3 className="text-sm font-semibold text-stripe-text">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h3>
        <button
          onClick={goNextMonth}
          disabled={!canGoNext}
          className="rounded-md p-1.5 hover:bg-[#f0f3f7] transition-colors disabled:opacity-30"
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4 text-stripe-muted" />
        </button>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div
              key={day}
              className={`text-center text-[11px] font-semibold uppercase tracking-wide py-2 ${
                i === 0 ? 'text-[#df1b41]' : i === 6 ? 'text-primary-500' : 'text-stripe-muted'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const style = getDayStyle(dateStr);
            const isToday = isSameDay(day, new Date());
            const holidayName = getHolidayName(dateStr);
            const weekend = isWeekendDate(day);
            const blocked = isNonWorkingDay(dateStr);
            const weekdayClass =
              getDay(day) === 0 || holidayName
                ? 'text-[#df1b41]'
                : getDay(day) === 6
                  ? 'text-primary-500'
                  : 'text-stripe-text';

            return (
              <button
                key={dateStr}
                onClick={() => {
                  if (blocked) return;
                  onDateClick?.(dateStr);
                }}
                disabled={!onDateClick || blocked}
                title={holidayName || (weekend ? (getDay(day) === 0 ? '일요일' : '토요일') : undefined)}
                className={`aspect-square flex flex-col items-center justify-center rounded-md text-sm transition-all
                  ${!isSameMonth(day, currentMonth) ? 'text-[#c1cad6]' : weekdayClass}
                  ${style || (holidayName && !usageMap[dateStr] ? 'bg-[#fef2f2]' : 'hover:bg-[#f6f9fc]')}
                  ${isToday ? 'ring-1 ring-primary-500 ring-offset-1' : ''}
                  ${onDateClick && !blocked ? 'cursor-pointer' : 'cursor-default'}
                  ${blocked && onDateClick ? 'opacity-70' : ''}
                `}
              >
                <span className="text-[13px] font-medium">{format(day, 'd')}</span>
                {usageMap[dateStr] ? (
                  <span className="text-[9px] mt-0.5 opacity-90">
                    {usageMap[dateStr].some((u) => u.status === 'pending')
                      ? '대기'
                      : usageMap[dateStr].map((u) => (u.type === 'half' ? '반' : '연')).join('')}
                  </span>
                ) : holidayName ? (
                  <span className="text-[8px] mt-0.5 text-[#df1b41] leading-tight px-0.5 truncate max-w-full">
                    휴일
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 px-5 py-3 border-t border-stripe-border bg-[#fafbfc]">
        <div className="flex items-center gap-2 text-xs text-stripe-muted">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary-500" />
          연차
        </div>
        <div className="flex items-center gap-2 text-xs text-stripe-muted">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#fbbf24]" />
          반차
        </div>
        <div className="flex items-center gap-2 text-xs text-stripe-muted">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#fef3c7] ring-1 ring-[#fbbf24]" />
          승인 대기
        </div>
        <div className="flex items-center gap-2 text-xs text-stripe-muted">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#fef2f2] ring-1 ring-[#fecaca]" />
          공휴일
        </div>
      </div>
    </div>
  );
}
