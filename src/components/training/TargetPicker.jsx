import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TARGET_TYPES } from '../../constants/training';

/**
 * 교육 대상 고르기: 전 직원 / 사업장 / 직원 선택.
 * value = { type, workplaceCode, employeeIds }
 */
export function TargetPicker({ targets, value, onChange, excludeIds = [] }) {
  const [query, setQuery] = useState('');
  const employees = useMemo(() => {
    const excluded = new Set(excludeIds);
    return (targets?.employees || []).filter((e) => !excluded.has(e.id));
  }, [targets, excludeIds]);
  const workplaces = targets?.workplaces || [];
  const selected = new Set(value.employeeIds || []);
  const term = query.trim().toLowerCase();
  const filtered = term
    ? employees.filter((e) =>
        [e.name, e.empNo, e.department, e.position, e.workplace].some((v) => String(v || '').toLowerCase().includes(term))
      )
    : employees;

  function setIds(ids) {
    onChange({ ...value, employeeIds: [...ids] });
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIds(next);
  }

  function selectFiltered(on) {
    const next = new Set(selected);
    for (const e of filtered) {
      if (on) next.add(e.id);
      else next.delete(e.id);
    }
    setIds(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stripe-text">
        {Object.entries(TARGET_TYPES).map(([type, label]) => (
          <label key={type} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="training-target"
              checked={value.type === type}
              onChange={() => onChange({ ...value, type, workplaceCode: value.workplaceCode || workplaces[0]?.code || '' })}
            />
            {label}
            {type === 'all' && <span className="text-[12px] text-stripe-muted">({employees.length}명)</span>}
          </label>
        ))}
      </div>

      {value.type === 'workplace' && (
        <select
          className="stripe-input"
          value={value.workplaceCode || ''}
          onChange={(e) => onChange({ ...value, workplaceCode: e.target.value })}
        >
          {workplaces.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name} ({w.count}명)
            </option>
          ))}
        </select>
      )}

      {value.type === 'employees' && (
        <div className="rounded-md border border-stripe-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-stripe-border p-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stripe-muted" />
              <input
                className="stripe-input stripe-input-search"
                placeholder="이름·사번·부서·직위·사업장 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="button" className="text-[12px] text-primary-600 hover:underline" onClick={() => selectFiltered(true)}>
              {term ? '검색 결과 모두 선택' : '모두 선택'}
            </button>
            <button type="button" className="text-[12px] text-stripe-muted hover:underline" onClick={() => selectFiltered(false)}>
              {term ? '검색 결과 선택 해제' : '모두 해제'}
            </button>
            <span className="ml-auto text-[12px] font-medium text-stripe-text">{selected.size}명 선택</span>
          </div>
          <ul className="max-h-64 divide-y divide-stripe-border overflow-y-auto">
            {filtered.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-[#f6f9fc]">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="font-medium text-stripe-text">{e.name}</span>
                  <span className="text-[12px] text-stripe-muted">
                    {e.empNo} · {e.workplace} · {e.department} · {e.position}
                  </span>
                </label>
              </li>
            ))}
            {!filtered.length && <li className="px-3 py-6 text-center text-sm text-stripe-muted">해당하는 직원이 없습니다.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}