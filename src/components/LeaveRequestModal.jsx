import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import {
  calendarSpanDays,
  describeLeaveDates,
  leaveBlockedReason,
  listLeaveRequestDates,
  MAX_LEAVE_RANGE_DAYS,
} from '../utils/leaveRequestDates';

export function LeaveRequestModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  employeeId,
  initialDate,
  submitError,
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState('full');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const next = initialDate || format(new Date(), 'yyyy-MM-dd');
    setStartDate(next);
    setEndDate(next);
    setType('full');
    setReason('');
  }, [isOpen, initialDate]);

  const previewDates = useMemo(
    () => listLeaveRequestDates(startDate, type === 'half' ? startDate : endDate),
    [startDate, endDate, type]
  );
  const spanDays = calendarSpanDays(startDate, type === 'half' ? startDate : endDate);
  const rangeTooLong = type === 'full' && spanDays > MAX_LEAVE_RANGE_DAYS;
  const endBeforeStart = type === 'full' && endDate && startDate && endDate < startDate;
  const blockedStart = leaveBlockedReason(startDate);
  const blockedHalf = type === 'half' ? blockedStart : '';

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim() || !employeeId || isSubmitting) return;
    try {
      await onSubmit({
        employeeId,
        startDate,
        endDate: type === 'half' ? startDate : endDate,
        date: startDate,
        type,
        reason: reason.trim(),
      });
    } catch {
      // submitError is shown by the parent mutation
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">연차 신청</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]" aria-label="닫기">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="stripe-label">연차 유형</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'full', label: '연차 (1일 이상)' },
                { value: 'half', label: '반차 (0.5일)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setType(opt.value);
                    if (opt.value === 'half') setEndDate(startDate);
                  }}
                  className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-all ${
                    type === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-stripe-border text-stripe-muted hover:border-[#c1cad6]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={type === 'full' ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label className="stripe-label">{type === 'full' ? '시작일' : '사용 날짜'}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate(next);
                  if (type === 'half' || !endDate || endDate < next) setEndDate(next);
                }}
                required
                className="stripe-input"
              />
            </div>
            {type === 'full' && (
              <div>
                <label className="stripe-label">종료일</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="stripe-input"
                />
              </div>
            )}
          </div>

          {type === 'full' && (
            <p className="text-[13px] text-stripe-muted">
              {endBeforeStart
                ? '종료일은 시작일 이후여야 합니다.'
                : rangeTooLong
                  ? `한 번에 최대 ${MAX_LEAVE_RANGE_DAYS}일까지 신청할 수 있습니다.`
                  : previewDates.length
                    ? `${describeLeaveDates(previewDates)} 신청 · 주말·공휴일 제외`
                    : '선택한 기간에 신청할 평일이 없습니다. 주말·공휴일은 제외됩니다.'}
            </p>
          )}
          {type === 'half' && blockedHalf && (
            <p className="text-[13px] text-[#df1b41]">{blockedHalf}</p>
          )}

          <div>
            <label className="stripe-label">사유</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="연차 사용 사유를 입력해주세요"
              className="stripe-input resize-none"
            />
          </div>

          {submitError && (
            <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#df1b41]">
              {submitError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={
                isSubmitting ||
                !reason.trim() ||
                !employeeId ||
                !previewDates.length ||
                endBeforeStart ||
                rangeTooLong
              }
            >
              {isSubmitting
                ? '신청 중...'
                : type === 'half'
                  ? '반차 신청하기'
                  : `${previewDates.length || 0}일 신청하기`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
