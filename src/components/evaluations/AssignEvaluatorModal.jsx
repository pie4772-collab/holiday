import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAssignEvaluator, useEvaluationCandidates } from '../../hooks/useEvaluations';
import { EXECUTIVE_POSITIONS, LEAD_POSITIONS } from '../../constants/hr';

const REVIEWER_POSITIONS = [...EXECUTIVE_POSITIONS, '대표이사'];

function PersonPicker({ label, candidates, suggested, suggestedLabel, value, onChange, disabled, hint }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? candidates.filter((c) => [c.name, c.empNo, c.department, c.position].some((v) => v.toLowerCase().includes(q)))
      : candidates;
    return list.slice(0, 200);
  }, [candidates, query]);
  const selected = candidates.find((c) => c.id === value);

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-stripe-text">{label}</p>
      {hint && <p className="text-[12px] text-stripe-muted">{hint}</p>}
      {suggested.length > 0 && !disabled && (
        <div>
          <p className="stripe-label">{suggestedLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.id)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  value === c.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stripe-border hover:bg-[#f6f9fc]'
                }`}
              >
                {c.name} {c.position}
              </button>
            ))}
          </div>
        </div>
      )}
      {!disabled && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
            <input
              className="stripe-input stripe-input-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, 사번, 부서"
            />
          </div>
          <select className="stripe-input" size={5} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">지정 안 함</option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.department || '-'} · {c.position}
              </option>
            ))}
          </select>
        </>
      )}
      <p className="text-[13px] text-stripe-text">
        {selected ? (
          <>
            선택: <span className="font-medium">{selected.name}</span> {selected.position} ({selected.workplace} · {selected.department})
          </>
        ) : (
          <span className="text-stripe-muted">지정 안 함</span>
        )}
      </p>
    </div>
  );
}

/** 평가자(팀장)·임원 지정과 기한 조정. 같은 부서 팀장과 같은 사업장 임원을 추천합니다. */
export function AssignEvaluatorModal({ item, onClose, onDone }) {
  const { data: candidates = [] } = useEvaluationCandidates();
  const assign = useAssignEvaluator();
  const [evaluatorId, setEvaluatorId] = useState(item.evaluatorId || '');
  const [reviewerId, setReviewerId] = useState(item.reviewerId || '');
  const [dueDate, setDueDate] = useState(item.dueDate);
  const [error, setError] = useState('');

  const others = useMemo(() => candidates.filter((c) => c.id !== item.employee.id), [candidates, item.employee.id]);
  const leads = useMemo(
    () =>
      others.filter(
        (c) => LEAD_POSITIONS.includes(c.position) && c.department === item.employee.department && c.workplace === item.employee.workplace
      ),
    [others, item.employee]
  );
  const executives = useMemo(
    () =>
      others
        .filter((c) => REVIEWER_POSITIONS.includes(c.position))
        .sort((a, b) => Number(b.workplace === item.employee.workplace) - Number(a.workplace === item.employee.workplace))
        .slice(0, 8),
    [others, item.employee.workplace]
  );
  const evaluatorLocked = item.status !== 'pending';
  const reviewerLocked = item.status === 'submitted';
  const name = (id) => candidates.find((c) => c.id === id)?.name || '';

  async function handleSubmit() {
    setError('');
    if (evaluatorId && evaluatorId === reviewerId) {
      setError('평가자(팀장)와 임원은 다른 사람으로 지정하세요.');
      return;
    }
    try {
      await assign.mutateAsync({ id: item.id, data: { evaluatorId, reviewerId, dueDate } });
      const parts = [evaluatorId ? `평가자 ${name(evaluatorId)}` : '평가자 미지정', reviewerId ? `임원 ${name(reviewerId)}` : '임원 미지정'];
      onDone?.(`${item.employee.name} ${item.label}: ${parts.join(', ')}(으)로 저장했습니다.`);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-start justify-between border-b border-stripe-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-stripe-text">평가자·임원 지정</h2>
            <p className="mt-0.5 text-[13px] text-stripe-muted">
              {item.employee.name} · {item.employee.department} · {item.label}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <PersonPicker
            label="평가자 (팀장)"
            hint={evaluatorLocked ? '팀장이 제출한 평가라 바꿀 수 없습니다. 바꾸려면 먼저 반려하세요.' : '점수와 평가의견(팀장)을 작성합니다.'}
            candidates={others}
            suggested={leads}
            suggestedLabel="같은 부서 팀장"
            value={evaluatorId}
            onChange={setEvaluatorId}
            disabled={evaluatorLocked}
          />
          <PersonPicker
            label="임원"
            hint={
              reviewerLocked
                ? '임원 의견까지 받은 평가라 바꿀 수 없습니다.'
                : '팀장이 제출하면 평가의견(임원)을 작성합니다. 지정하지 않으면 인사담당이 확정할 때 대신 입력합니다.'
            }
            candidates={others}
            suggested={executives}
            suggestedLabel="임원"
            value={reviewerId}
            onChange={setReviewerId}
            disabled={reviewerLocked}
          />
          <div className="max-w-xs">
            <label className="stripe-label">평가 기한</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="stripe-input" />
          </div>
          <p className="text-[12px] text-stripe-muted">
            지정하면 평가자에게 메일로 알립니다. 기한 2주 전에는 평가자와 인사담당에게 한 번 더 알리고, 팀장이 제출하면 임원에게 의견을 요청합니다.
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
