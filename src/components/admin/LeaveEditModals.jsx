import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { formatLeaveType } from '../../utils/leaveCalculations';
import { leaveBlockedReason } from '../../utils/leaveRequestDates';
import { Button } from '../ui/Button';

const ACCRUAL_TYPES = [
  { value: 'first_year_monthly', label: '첫해 월차' },
  { value: 'prorated', label: '비례 연차' },
  { value: 'annual', label: '정규 연차' },
  { value: 'adjustment', label: '수동 조정' },
];

const emptyForm = {
  type: 'annual',
  amount: 1,
  date: new Date().toISOString().slice(0, 10),
  description: '',
};

export function LeaveAccrualFormModal({ isOpen, onClose, onSubmit, isSubmitting, initial, displayYear }) {
  const [form, setForm] = useState(initial || emptyForm);

  useEffect(() => {
    if (isOpen) setForm(initial || emptyForm);
  }, [isOpen, initial]);

  if (!isOpen) return null;

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      ...form,
      amount: Number(form.amount),
      description: form.description || `${displayYear}년 ${formatLeaveType(form.type)}`,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">
            {initial ? '연차 발생 수정' : '연차 발생 추가'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="stripe-label">유형</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="stripe-input"
            >
              {ACCRUAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="stripe-label">발생일</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="stripe-input"
            />
          </div>
          <div>
            <label className="stripe-label">일수</label>
            <input
              type="number"
              step="0.5"
              min="-30"
              max="30"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
              className="stripe-input"
            />
          </div>
          <div>
            <label className="stripe-label">설명</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="관리자 수동 입력"
              className="stripe-input"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function todayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function LeaveUsageFormModal({ isOpen, onClose, onSubmit, isSubmitting, initial }) {
  const defaultForm = { date: todayLocalIsoDate(), type: 'full', reason: '', status: 'approved' };
  const [form, setForm] = useState(initial || defaultForm);

  useEffect(() => {
    if (isOpen) {
      setForm(
        initial
          ? {
              date: initial.date,
              type: initial.type || 'full',
              reason: initial.reason || '',
              status: initial.status || 'approved',
            }
          : { date: todayLocalIsoDate(), type: 'full', reason: '', status: 'approved' }
      );
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const blocked = leaveBlockedReason(form.date);

  function handleSubmit(e) {
    e.preventDefault();
    if (blocked) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">
            {initial ? '연차 사용 수정' : '연차 사용 추가'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="stripe-label">사용일</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="stripe-input"
            />
            {blocked && <p className="mt-1 text-[13px] text-[#df1b41]">{blocked}</p>}
          </div>
          <div>
            <label className="stripe-label">유형</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'full', label: '연차 (1일)' },
                { value: 'half', label: '반차 (0.5일)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, type: opt.value })}
                  className={`rounded-md border px-3 py-2.5 text-sm font-medium ${
                    form.type === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-stripe-border text-stripe-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="stripe-label">사유</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
              className="stripe-input"
            />
          </div>
          <div>
            <label className="stripe-label">상태</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="stripe-input"
            >
              <option value="approved">승인</option>
              <option value="pending">대기</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || Boolean(blocked)}>
              {isSubmitting ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
