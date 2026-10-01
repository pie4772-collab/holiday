import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, LogOut, MapPin, Wifi, WifiOff } from 'lucide-react';
import { Panel, PanelBody, PanelHeader } from '../ui/Panel';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../LoadingSpinner';
import { AttendanceFlags, WorkTypeLabel } from './AttendanceBadges';
import { useAttendanceToday, useCheckAttendance } from '../../hooks/useAttendance';
import { PLACE_MAX_LENGTH, REMOTE_WORK_TYPES, WORK_TYPES, formatClock } from '../../constants/attendance';

function TimeBox({ label, stamp, workDate, type, place, site }) {
  return (
    <div className="rounded-md border border-stripe-border px-3 py-2.5">
      <p className="text-[12px] text-stripe-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-stripe-text">
        {stamp ? formatClock(stamp, workDate) : '--:--'}
      </p>
      <WorkTypeLabel type={type} place={place} site={site} />
    </div>
  );
}

export function AttendanceTodayCard({ showLink = false }) {
  const { data: today, isLoading, isError, refetch } = useAttendanceToday();
  const mutation = useCheckAttendance();
  const [type, setType] = useState('office');
  const [place, setPlace] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (today && !today.ipAllowed && type === 'office') setType('outside');
  }, [today, type]);

  if (isLoading) {
    return (
      <Panel>
        <PanelBody className="flex justify-center py-10">
          <LoadingSpinner />
        </PanelBody>
      </Panel>
    );
  }
  if (isError || !today) {
    return (
      <Panel>
        <PanelBody className="text-sm text-stripe-muted">
          출퇴근 정보를 불러오지 못했습니다.{' '}
          <button type="button" className="text-primary-600" onClick={() => refetch()}>
            다시 시도
          </button>
        </PanelBody>
      </Panel>
    );
  }

  const remote = REMOTE_WORK_TYPES.includes(type);
  const needsPlace = remote && !place.trim();

  async function submit(action) {
    setMessage('');
    try {
      await mutation.mutateAsync({ action, data: { type, place: remote ? place.trim() : '' } });
      setMessage(action === 'in' ? '출근을 기록했습니다.' : '퇴근을 기록했습니다.');
    } catch (error) {
      if (error.data?.code === 'IP_NOT_ALLOWED') setType('outside');
      setMessage('');
    }
  }

  const site = today.site;
  const evaluation = today.evaluation;
  const error = mutation.error?.message;

  return (
    <Panel>
      <PanelHeader
        title="오늘 출퇴근"
        description={`${today.workDate} (${today.weekday})${site ? ` · ${site.name} ${evaluation.scheduledStart || site.workStart}~${evaluation.scheduledEnd || site.workEnd}` : ''}`}
        actions={
          showLink ? (
            <Link to="/employee/attendance" className="text-sm text-primary-600 hover:text-primary-700">
              근태 내역
            </Link>
          ) : null
        }
      />
      <PanelBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <AttendanceFlags flags={evaluation.flags} leave={today.leave} />
          <span
            className={`inline-flex items-center gap-1 text-[12px] ${today.ipAllowed ? 'text-[#09825d]' : 'text-[#b45309]'}`}
          >
            {today.ipAllowed ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {today.ipAllowed ? `${today.ipSiteName} 사무실 네트워크` : '회사 네트워크 아님'}
            <span className="font-mono text-stripe-muted">({today.ip || '알 수 없음'})</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TimeBox
            label="출근"
            stamp={today.record?.checkInAt}
            workDate={today.workDate}
            type={today.record?.checkInType}
            place={today.record?.checkInPlace}
            site={today.evaluation?.crossSite?.in}
          />
          <TimeBox
            label="퇴근"
            stamp={today.record?.checkOutAt}
            workDate={today.workDate}
            type={today.record?.checkOutType}
            place={today.record?.checkOutPlace}
            site={today.evaluation?.crossSite?.out}
          />
        </div>

        {(today.checkIn.allowed || today.checkOut.allowed) && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {WORK_TYPES.map((opt) => {
                const disabled = opt.key === 'office' && !today.ipAllowed;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setType(opt.key)}
                    className={`rounded-md border px-2 py-2 text-[13px] font-medium transition-all disabled:opacity-40 ${
                      type === opt.key
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-stripe-border text-stripe-muted hover:border-[#c1cad6]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {remote && (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stripe-muted" />
                <input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  maxLength={PLACE_MAX_LENGTH}
                  placeholder={type === 'overseas' ? '출장 국가·도시 (예: 베트남 하노이)' : '방문지·출장지 (예: ○○건설 현장)'}
                  className="stripe-input pl-9"
                />
              </div>
            )}
            {!today.ipAllowed && (
              <p className="text-[12px] text-stripe-muted">
                회사 네트워크가 아니면 외근·출장으로만 기록할 수 있고 장소를 입력해야 합니다.
              </p>
            )}
            {remote && today.remoteReview?.required && (
              <p className="text-[12px] text-[#b45309]">
                외근·출장은 {today.remoteReview.reviewer} 확인 후 인정되며, 확인 전에는 지각·조퇴로 표시될 수 있습니다.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            disabled={!today.checkIn.allowed || mutation.isPending || needsPlace}
            onClick={() => submit('in')}
          >
            <LogIn className="h-4 w-4" />
            출근
          </Button>
          <Button
            size="lg"
            variant="secondary"
            disabled={!today.checkOut.allowed || mutation.isPending || needsPlace}
            onClick={() => submit('out')}
          >
            <LogOut className="h-4 w-4" />
            {today.record?.checkOutAt ? '퇴근 다시 기록' : '퇴근'}
          </Button>
        </div>

        {today.record?.remoteStatus && (
          <p className={`text-[13px] ${today.record.remoteStatus === 'rejected' ? 'text-[#df1b41]' : 'text-stripe-muted'}`}>
            {today.record.remoteStatus === 'pending' && `외근·출장 기록이 ${today.remoteReview?.reviewer || '상급자'} 확인을 기다리고 있습니다.`}
            {today.record.remoteStatus === 'approved' && '외근·출장이 확인되어 지각·조퇴 판정에서 제외됩니다.'}
            {today.record.remoteStatus === 'rejected' &&
              `외근·출장이 반려되었습니다${today.record.remoteRejectReason ? `: ${today.record.remoteRejectReason}` : ''}.`}
          </p>
        )}
        {!today.checkIn.allowed && !today.record?.checkInAt && today.checkIn.reason && (
          <p className="text-[13px] text-stripe-muted">{today.checkIn.reason}</p>
        )}
        {!today.checkOut.allowed && today.checkOut.reason && today.checkOut.reason !== today.checkIn.reason && (
          <p className="text-[13px] text-stripe-muted">{today.checkOut.reason}</p>
        )}
        {error && (
          <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#df1b41]">{error}</div>
        )}
        {message && !error && (
          <div className="rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-3 py-2 text-sm text-[#09825d]">{message}</div>
        )}
      </PanelBody>
    </Panel>
  );
}
