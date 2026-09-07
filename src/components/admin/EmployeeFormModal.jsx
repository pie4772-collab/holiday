import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { DEFAULT_POSITION, POSITIONS } from '../../constants/hr';

const emptyForm = {
  empNo: '',
  name: '',
  hireDate: new Date().toISOString().slice(0, 10),
  workplace: '',
  department: '',
  jobType: '사무직',
  position: DEFAULT_POSITION,
  concurrentDept: '',
  concurrentPosition: '',
  email: '',
  notes: '',
  isAdmin: false,
};

export function EmployeeFormModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  initial,
  mode = 'create',
}) {
  const [form, setForm] = useState(emptyForm);
  const [terminatedDate, setTerminatedDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setForm({
          empNo: initial.empNo || '',
          name: initial.name || '',
          hireDate: initial.hireDate || '',
          workplace: initial.workplace || '',
          department: initial.department || '',
          jobType: initial.jobType || '사무직',
          position: POSITIONS.includes(initial.position) ? initial.position : DEFAULT_POSITION,
          concurrentDept: initial.concurrentDept || '',
          concurrentPosition: POSITIONS.includes(initial.concurrentPosition)
            ? initial.concurrentPosition
            : '',
          email: initial.email || '',
          notes: initial.notes || '',
          isAdmin: Boolean(initial.isAdmin),
        });
      } else {
        setForm(emptyForm);
      }
      setTerminatedDate(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const isTerminate = mode === 'terminate';
  const title =
    mode === 'create' ? '입사 등록' : mode === 'terminate' ? '퇴사 처리' : '직원 정보 수정';

  function handleSubmit(e) {
    e.preventDefault();
    if (isTerminate) {
      onSubmit({ terminatedDate });
    } else {
      onSubmit(form);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>

        {isTerminate ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-sm text-stripe-muted">
              <span className="font-medium text-stripe-text">{initial?.name}</span>
              {initial?.empNo && (
                <span className="ml-1 font-mono text-xs">({initial.empNo})</span>
              )}
              님을 퇴사 처리합니다.
            </p>
            <div>
              <label className="stripe-label">퇴사일</label>
              <input
                type="date"
                value={terminatedDate}
                onChange={(e) => setTerminatedDate(e.target.value)}
                required
                className="stripe-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" variant="danger" disabled={isSubmitting}>
                {isSubmitting ? '처리 중…' : '퇴사 처리'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">이름 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">사번</label>
                <input
                  type="text"
                  value={form.empNo}
                  onChange={(e) => setForm({ ...form, empNo: e.target.value })}
                  placeholder="예: 2024001"
                  className="stripe-input font-mono"
                />
              </div>
            </div>
            <div>
              <label className="stripe-label">입사일 *</label>
              <input
                type="date"
                value={form.hireDate}
                onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                required
                className="stripe-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">사업장</label>
                <input
                  type="text"
                  value={form.workplace}
                  onChange={(e) => setForm({ ...form, workplace: e.target.value })}
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">직종</label>
                <input
                  type="text"
                  value={form.jobType}
                  onChange={(e) => setForm({ ...form, jobType: e.target.value })}
                  className="stripe-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">부서</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">직급</label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="stripe-input"
                >
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">겸직부서</label>
                <input
                  type="text"
                  value={form.concurrentDept}
                  onChange={(e) => setForm({ ...form, concurrentDept: e.target.value })}
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">겸직직급</label>
                <select
                  value={form.concurrentPosition}
                  onChange={(e) => setForm({ ...form, concurrentPosition: e.target.value })}
                  className="stripe-input"
                >
                  <option value="">없음</option>
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="stripe-label">이메일</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="stripe-input"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-stripe-text cursor-pointer">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
                className="rounded border-stripe-border"
              />
              관리자 권한 부여
            </label>
            <div>
              <label className="stripe-label">비고</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="stripe-input resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '저장 중…' : mode === 'create' ? '등록' : '저장'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
