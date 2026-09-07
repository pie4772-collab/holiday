import { useState } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { Button } from './ui/Button';

export function LeaveRequestModal({ isOpen, onClose, onSubmit, isSubmitting, employeeId }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState('full');
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) return;
    onSubmit({ employeeId, date, type, reason: reason.trim() });
    setReason('');
    setType('full');
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
            <label className="stripe-label">사용 날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="stripe-input"
            />
          </div>

          <div>
            <label className="stripe-label">연차 유형</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'full', label: '연차 (1일)' },
                { value: 'half', label: '반차 (0.5일)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
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

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || !reason.trim()}>
              {isSubmitting ? '신청 중...' : '신청하기'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
