import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { STEP_KINDS } from '../../constants/approvalDocs';

const KIND_STYLES = {
  approval: 'bg-primary-50 text-primary-700',
  agreement: 'bg-[#fef3c7] text-[#b45309]',
};

/**
 * 결재선 지정. value: [{ employeeId, kind: 'approval' | 'agreement' }] — 위에서부터 차례로 처리합니다.
 * hrStep 이면 끝에 고정된 인사 확인 단계를 보여 줍니다.
 */
export function ApprovalLineEditor({ people = [], value = [], onChange, max = 10, excludeId, hrStep = false }) {
  const [query, setQuery] = useState('');
  const [addKind, setAddKind] = useState('approval');
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(value.map((item) => String(item.employeeId)));
    return people
      .filter((p) => p.id !== String(excludeId) && !chosen.has(p.id))
      .filter((p) => [p.name, p.department, p.position, p.empNo].some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [people, value, query, excludeId]);

  function add(person) {
    if (value.length >= max) return;
    onChange([...value, { employeeId: person.id, kind: addKind }]);
    setQuery('');
  }

  function update(index, patch) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function move(index, delta) {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <ol className="divide-y divide-stripe-border rounded-md border border-stripe-border">
        <li className="flex items-center gap-3 bg-[#f6f9fc] px-3 py-2 text-sm text-stripe-muted">
          <span className="w-5 text-center text-xs">-</span>
          <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-white">기안</span>
          <span>본인</span>
        </li>
        {value.map((item, index) => {
          const person = byId.get(String(item.employeeId));
          return (
            <li key={item.employeeId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-5 text-center text-xs text-stripe-muted">{index + 1}</span>
              <select
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold border-0 ${KIND_STYLES[item.kind]}`}
                value={item.kind}
                onChange={(e) => update(index, { kind: e.target.value })}
                aria-label="단계 종류"
              >
                {Object.entries(STEP_KINDS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-stripe-text">{person?.name || '(퇴사·없는 직원)'}</span>
                {person && (
                  <span className="ml-1.5 text-[12px] text-stripe-muted">
                    {[person.department, person.position].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="rounded p-1 text-stripe-muted hover:bg-[#f6f9fc] disabled:opacity-30"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="위로"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-stripe-muted hover:bg-[#f6f9fc] disabled:opacity-30"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="아래로"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-stripe-muted hover:bg-[#fee2e2] hover:text-[#df1b41]"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  aria-label={`${person?.name || ''} 빼기`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          );
        })}
        {hrStep && (
          <li className="flex items-center gap-3 bg-[#f6f9fc] px-3 py-2 text-sm text-stripe-muted">
            <span className="w-5 text-center text-xs">{value.length + 1}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_STYLES.approval}`}>결재</span>
            <span>인사 확인 (인사담당, 자동으로 붙음)</span>
          </li>
        )}
      </ol>

      <div className="flex gap-2">
        <div className="inline-flex shrink-0 rounded-md border border-stripe-border p-0.5" role="group" aria-label="추가할 단계">
          {Object.entries(STEP_KINDS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAddKind(key)}
              className={`rounded px-3 py-1 text-[13px] font-medium ${
                addKind === key ? KIND_STYLES[key] : 'text-stripe-muted hover:text-stripe-text'
              }`}
            >
              {label}자
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <input
            className="stripe-input"
            value={query}
            placeholder={value.length >= max ? `${max}명까지 지정할 수 있습니다` : `${STEP_KINDS[addKind]}자 추가 — 이름·부서로 찾기`}
            disabled={value.length >= max}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (matches[0]) add(matches[0]);
              }
            }}
          />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-stripe-border bg-white py-1 shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#f6f9fc]"
                  >
                    <span className="font-medium text-stripe-text">{p.name}</span>
                    <span className="truncate text-xs text-stripe-muted">
                      {[p.workplace, p.department, p.position].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
