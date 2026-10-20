import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAssignEvaluator, useEvaluationCandidates } from '../../hooks/useEvaluations';
import { LEAD_POSITIONS } from '../../constants/hr';

/** 평가자 지정과 기한 조정. 같은 부서 팀장을 추천합니다. */
export function AssignEvaluatorModal({ item, onClose, onDone }) {
  const { data: candidates = [] } = useEvaluationCandidates();
  const assign = useAssignEvaluator();
  const [evaluatorId, setEvaluatorId] = useState(item.evaluatorId || '');
  const [dueDate, setDueDate] = useState(item.dueDate);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const others = useMemo(() => candidates.filter((c) => c.id !== item.employee.id), [candidates, item.employee.id]);
  const suggested = useMemo(
    () =>
      others.filter(
        (c) =>
          LEAD_POSITIONS.includes(c.position) &&
          c.department === item.employee.department &&
          c.workplace === item.employee.workplace
      ),
    [others, item.employee]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? others.filter((c) => [c.name, c.empNo, c.department, c.position].some((v) => v.toLowerCase().includes(q)))
      : others;
    return list.slice(0, 200);
  }, [others, query]);
  const selected = candidates.find((c) => c.id === evaluatorId);

  async function handleSubmit() {
    setError('');
    try {
      await assign.mutateAsync({ id: item.id, data: { evaluatorId, dueDate } });
      onDone?.(
        evaluatorId
          ? `${item.employee.name} ${item.label} 평가자를 ${selected?.name || ''}(으)로 지정했습니다.`
          : `${item.employee.name} ${item.label} 평가자 지정을 해제했습니다.`
      );
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-start justify-between border-b border-stripe-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-stripe-text">평가자 지정</h2>
            <p className="mt-0.5 text-[13px] text-stripe-muted">
              {item.employee.name} · {item.employee.department} · {item.label}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {suggested.length > 0 && (
            <div>
              <p className="stripe-label">같은 부서 팀장</p>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEvaluatorId(c.id)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      evaluatorId === c.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stripe-border hover:bg-[#f6f9fc]'
                    }`}
                  >
                    {c.name} {c.position}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="stripe-label">평가자 찾기</label>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
              <input
                className="stripe-input stripe-input-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름, 사번, 부서"
              />
            </div>
            <select className="stripe-input" size={6} value={evaluatorId} onChange={(e) => setEvaluatorId(e.target.value)}>
              <option value="">지정 안 함</option>
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.department || '-'} · {c.position}
                </option>
              ))}
            </select>
            {selected && (
              <p className="mt-1 text-[13px] text-stripe-text">
                선택: <span className="font-medium">{selected.name}</span> {selected.position} ({selected.workplace} · {selected.department})
              </p>
            )}
          </div>
          <div className="max-w-xs">
            <label className="stripe-label">평가 기한</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="stripe-input" />
          </div>
          <p className="text-[12px] text-stripe-muted">
            지정하면 평가자에게 메일로 알립니다. 기한 2주 전에는 평가자와 인사담당에게 한 번 더 알립니다.
          </p>
          {error && <p className="text-sm text-[#df1b41]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button disabled={assign.isPending || !dueDate} onClick={handleSubmit}>
              저장
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
