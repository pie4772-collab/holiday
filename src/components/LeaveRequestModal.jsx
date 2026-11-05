import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/Button';
import { LEAVE_REASON_PRESETS } from '../constants/hr';
import { HALF_PERIODS } from '../constants/attendance';
import { LEAVE_KINDS, LEAVE_KIND_MAP, isSpecialLeave, specialLeaveWarnings } from '../constants/leaveKinds';
import { useSpecialLeaves } from '../hooks/useLeaveData';
import { calendarSpanDays, describeLeaveDates, leaveBlockedReason, listLeaveRequestDates } from '../utils/leaveRequestDates';

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
  const [kind, setKind] = useState('annual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState('full');
  const [halfPeriod, setHalfPeriod] = useState('');
  const [reason, setReason] = useState('');
  const { data: specialLeaves } = useSpecialLeaves(isOpen ? employeeId : null);

  useEffect(() => {
    if (!isOpen) return;
    const next = initialDate || format(new Date(), 'yyyy-MM-dd');
    setKind('annual');
    setStartDate(next);
    setEndDate(next);
    setType('full');
    setHalfPeriod('');
    setReason('');
  }, [isOpen, initialDate]);

  const kindMeta = LEAVE_KIND_MAP[kind];
  const special = isSpecialLeave(kind);
  const kindLabel = kindMeta.label;
  const lastDate = type === 'half' ? startDate : endDate;

  const previewDates = useMemo(
    () => listLeaveRequestDates(startDate, lastDate, { maxDays: kindMeta.maxRangeDays }),
    [startDate, lastDate, kindMeta.maxRangeDays]
  );
  const warnings = useMemo(
    () =>
      specialLeaveWarnings({
        kind,
        startDate,
        endDate: lastDate,
        dates: previewDates,
        halfDay: type === 'half',
        existing: specialLeaves || [],
      }),
    [kind, startDate, lastDate, previewDates, type, specialLeaves]
  );
  const spanDays = calendarSpanDays(startDate, lastDate);
  const rangeTooLong = type === 'full' && spanDays > kindMeta.maxRangeDays;
  const endBeforeStart = type === 'full' && endDate && startDate && endDate < startDate;
  const blockedStart = leaveBlockedReason(startDate);
  const blockedHalf = type === 'half' ? blockedStart : '';
  const reasonRequired = !special;

  if (!isOpen) return null;

  function changeKind(next) {
    setKind(next);
    if (!LEAVE_KIND_MAP[next].half && type === 'half') {
      setType('full');
      setHalfPeriod('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if ((reasonRequired && !reason.trim()) || !employeeId || isSubmitting) return;
    if (type === 'half' && !halfPeriod) return;
    try {
      await onSubmit({
        employeeId,
        kind,
        startDate,
        endDate: lastDate,
        date: startDate,
        type,
        ...(type === 'half' ? { halfPeriod } : {}),
        reason: reason.trim(),
      });
    } catch {
      // submitError is shown by the parent mutation
    }
  }

  const typeOptions = special
    ? [
        { value: 'full', label: `${kindLabel} (하루 단위)` },
        { value: 'half', label: `${kindLabel} (반일)` },
      ]
    : [
        { value: 'full', label: '연차 (1일 이상)' },
        { value: 'half', label: '반차 (0.5일)' },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">휴가 신청</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]" aria-label="닫기">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="stripe-label">휴가 종류</label>
            <select value={kind} onChange={(e) => changeKind(e.target.value)} className="stripe-input">
              {LEAVE_KINDS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.key === 'annual' ? '' : ' (연차에서 빠지지 않음)'}
                </option>
              ))}
            </select>
            {special && <p className="mt-1.5 text-[12px] leading-relaxed text-stripe-muted">{kindMeta.guide}</p>}
          </div>

          {kindMeta.half && (
            <div>
              <label className="stripe-label">{special ? '사용 단위' : '연차 유형'}</label>
              <div className="grid grid-cols-2 gap-2">
                {typeOptions.map((opt) => (
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
          )}

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
                  ? `${kindLabel}는 한 번에 최대 ${kindMeta.maxRangeDays}일까지 신청할 수 있습니다.`
                  : previewDates.length
                    ? `${describeLeaveDates(previewDates)} 신청 · 주말·공휴일 제외${
                        kind === 'maternity' ? ` · 기간 ${spanDays}일` : ''
                      }`
                    : '선택한 기간에 신청할 평일이 없습니다. 주말·공휴일은 제외됩니다.'}
            </p>
          )}
          {type === 'half' && blockedHalf && <p className="text-[13px] text-[#df1b41]">{blockedHalf}</p>}

          {type === 'half' && (
            <div>
              <label className="stripe-label">{special ? '시간대' : '반차 시간대'}</label>
              <div className="grid grid-cols-2 gap-2">
                {HALF_PERIODS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setHalfPeriod(opt.key)}
                    className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-all ${
                      halfPeriod === opt.key
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-stripe-border text-stripe-muted hover:border-[#c1cad6]'
                    }`}
                  >
                    {opt.label} {special ? '' : '반차'}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-stripe-muted">
                점심시간을 기준으로 나눕니다. 오전은 점심시간 이후 출근, 오후는 점심시간 전에 퇴근합니다.
              </p>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#b45309] space-y-1">
              {warnings.map((text) => (
                <p key={text} className="flex gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{text}</span>
                </p>
              ))}
              <p className="text-[12px] text-[#b45309]/80">신청은 할 수 있지만 법정 일수를 확인해 주세요.</p>
            </div>
          )}

          <div>
            <label className="stripe-label">사유{special ? ' (선택)' : ''}</label>
            {!special && (
              <select
                value={LEAVE_REASON_PRESETS.includes(reason) ? reason : ''}
                onChange={(e) => e.target.value && setReason(e.target.value)}
                className="stripe-input mb-2"
              >
                <option value="">자주 쓰는 사유 선택 (직접 입력 가능)</option>
                {LEAVE_REASON_PRESETS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            )}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={reasonRequired}
              rows={3}
              placeholder={
                special
                  ? kind === 'condolence'
                    ? '예: 부친상, 본인 결혼'
                    : kind === 'official'
                      ? '예: 예비군 훈련'
                      : '필요하면 적어 주세요'
                  : '연차 사용 사유를 입력해주세요'
              }
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
                (reasonRequired && !reason.trim()) ||
                !employeeId ||
                (type === 'half' && !halfPeriod) ||
                !previewDates.length ||
                endBeforeStart ||
                rangeTooLong
              }
            >
              {isSubmitting
                ? '신청 중...'
                : type === 'half'
                  ? `${halfPeriod === 'am' ? '오전 ' : halfPeriod === 'pm' ? '오후 ' : ''}${special ? kindLabel : '반차'} 신청하기`
                  : `${special ? `${kindLabel} ` : ''}${previewDates.length || 0}일 신청하기`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
