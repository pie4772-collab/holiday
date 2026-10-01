import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { PLACE_MAX_LENGTH, REMOTE_WORK_TYPES, WORK_TYPES } from '../../constants/attendance';

function clock(stamp) {
  return stamp ? stamp.slice(11, 16) : '';
}

function TimeFields({ label, time, type, place, onChange }) {
  const remote = REMOTE_WORK_TYPES.includes(type);
  return (
    <div className="rounded-md border border-stripe-border p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="stripe-label">{label}</label>
          <input type="time" value={time} onChange={(e) => onChange({ time: e.target.value })} className="stripe-input" />
        </div>
        <div>
          <label className="stripe-label">유형</label>
          <select value={type} onChange={(e) => onChange({ type: e.target.value })} className="stripe-input">
            {WORK_TYPES.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {remote && (
        <input
          value={place}
          maxLength={PLACE_MAX_LENGTH}
          onChange={(e) => onChange({ place: e.target.value })}
          placeholder="외근·출장지"
          className="stripe-input"
        />
      )}
    </div>
  );
}

export function AttendanceCorrectionModal({ target, onClose, onSubmit, isSubmitting, error }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!target) return;
    const record = target.day.record;
    setForm({
      checkIn: clock(record?.checkInAt),
      checkInType: record?.checkInType || 'office',
      checkInPlace: record?.checkInPlace || '',
      checkOut: clock(record?.checkOutAt),
      checkOutType: record?.checkOutType || 'office',
      checkOutPlace: record?.checkOutPlace || '',
      note: record?.note || '',
      reason: '',
    });
  }, [target]);

  if (!target || !form) return null;

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(form);
  }

  const { employee, day } = target;
  const clearing = !form.checkIn && !form.checkOut;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">근태 정정</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]" aria-label="닫기">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-stripe-muted">
            <span className="font-medium text-stripe-text">{employee.name}</span>
            {employee.empNo && <span className="ml-1 font-mono text-xs">({employee.empNo})</span>}
            <span className="ml-1">· {day.date} ({day.weekday})</span>
          </p>
          <TimeFields
            label="출근"
            time={form.checkIn}
            type={form.checkInType}
            place={form.checkInPlace}
            onChange={(p) =>
              update({
                ...(p.time !== undefined ? { checkIn: p.time } : {}),
                ...(p.type !== undefined ? { checkInType: p.type } : {}),
                ...(p.place !== undefined ? { checkInPlace: p.place } : {}),
              })
            }
          />
          <TimeFields
            label="퇴근"
            time={form.checkOut}
            type={form.checkOutType}
            place={form.checkOutPlace}
            onChange={(p) =>
              update({
                ...(p.time !== undefined ? { checkOut: p.time } : {}),
                ...(p.type !== undefined ? { checkOutType: p.type } : {}),
                ...(p.place !== undefined ? { checkOutPlace: p.place } : {}),
              })
            }
          />
          <p className="text-[12px] text-stripe-muted">
            05:00 이전 퇴근 시각은 다음날 새벽으로 저장합니다. 출근·퇴근을 모두 비우면 그날 기록을 지웁니다.
          </p>
          <div>
            <label className="stripe-label">메모</label>
            <input value={form.note} onChange={(e) => update({ note: e.target.value })} maxLength={500} className="stripe-input" />
          </div>
          <div>
            <label className="stripe-label">정정 사유 (필수)</label>
            <textarea
              value={form.reason}
              onChange={(e) => update({ reason: e.target.value })}
              rows={2}
              maxLength={500}
              required
              placeholder="예: 휴대폰 미지참으로 출근 미기록, 본인 확인"
              className="stripe-input resize-none"
            />
          </div>
          {error && (
            <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#df1b41]">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" variant={clearing ? 'danger' : 'primary'} disabled={isSubmitting || form.reason.trim().length < 2}>
              {isSubmitting ? '저장 중…' : clearing ? '기록 삭제' : '정정 저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
