import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

/** 이름·부서로 찾아 여러 명을 고릅니다. value: 직원 id 배열 */
export function PeoplePicker({ people = [], value = [], onChange, max = 20, excludeId, placeholder = '이름·부서로 찾기' }) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return value.map((id) => byId.get(String(id))).filter(Boolean);
  }, [people, value]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(value.map(String));
    return people
      .filter((p) => p.id !== String(excludeId) && !chosen.has(p.id))
      .filter((p) => [p.name, p.department, p.position, p.empNo].some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [people, value, query, excludeId]);

  function add(person) {
    if (value.length >= max) return;
    onChange([...value.map(String), person.id]);
    setQuery('');
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
            >
              {p.name}
              <span className="font-normal text-primary-700/70">{p.department}</span>
              <button
                type="button"
                onClick={() => onChange(value.map(String).filter((id) => id !== p.id))}
                className="rounded-full p-0.5 hover:bg-primary-100"
                aria-label={`${p.name} 빼기`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          className="stripe-input"
          value={query}
          placeholder={value.length >= max ? `${max}명까지 지정할 수 있습니다` : placeholder}
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
  );
}
