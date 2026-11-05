import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  ORDER_COMPANY_TITLE,
  ORDER_ENTRIES_MAX,
  ORDER_ENTRY_FIELDS,
  ORDER_TYPES,
  orderDateText,
} from '../../constants/approvalDocs';
import { sheetInput } from './documentFormat';
import { SignBlock } from './SignBlock';

const SHEET_FONT = { fontFamily: "'Batang', '바탕', serif" };

const emptyEntry = () => Object.fromEntries([['employeeId', null], ...ORDER_ENTRY_FIELDS.map(([key]) => [key, ''])]);

/** 결재란 첫 칸(기안자)은 종이 양식처럼 "담당" 으로 적습니다. */
function orderSigners(signers) {
  const [first, ...rest] = signers.approval;
  return { approval: first ? [{ ...first, position: '담당' }, ...rest] : [], agreement: signers.agreement };
}

/** 대상자를 직원 목록에서 찾아 현재 소속으로 채운 줄을 더합니다. */
function EntryAdder({ people, disabled, onAdd }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return people
      .filter((p) => [p.name, p.department, p.position, p.empNo].some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [people, query]);

  function add(person) {
    onAdd({
      employeeId: person.id,
      name: person.name,
      jobType: person.jobType || '',
      workplace: person.workplace || '',
      department: person.department || '',
      position: person.jobRank || person.position || '',
    });
    setQuery('');
  }

  return (
    <div className="flex gap-2 font-sans">
      <div className="relative flex-1">
        <input
          className="stripe-input"
          value={query}
          disabled={disabled}
          placeholder={disabled ? `${ORDER_ENTRIES_MAX}명까지 입력할 수 있습니다` : '대상자 추가 — 이름·부서로 찾기 (현재 소속이 채워집니다)'}
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
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAdd(emptyEntry())}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-stripe-border px-3 text-[13px] text-stripe-text hover:bg-[#f6f9fc] disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> 직접 입력
      </button>
    </div>
  );
}

/**
 * 인사명령 종이 양식: 회사명 / 발령번호·결재란 / ■ 발령 구분 / 대상자 표(성명·직종·소속·직위) / - 발령일부.
 * onChange 를 주면 기안 화면처럼 칸을 입력할 수 있습니다 (people: 대상자 찾기용 직원 목록).
 */
export function PersonnelOrderSheet({ signers, orderNo, body = {}, onChange, people = [], className = '' }) {
  const editing = Boolean(onChange);
  const entries = body.entries || [];
  const set = (patch) => onChange({ ...body, ...patch });
  const setEntry = (index, patch) => set({ entries: entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
  const shown = orderSigners(signers);
  const cellInput = `${sheetInput} text-center`;

  return (
    <div className={`bg-white px-12 py-10 text-[15px] text-[#111] ${className}`} style={SHEET_FONT}>
      <h1 className="mb-10 text-center text-[30px] tracking-[0.12em]">{ORDER_COMPANY_TITLE}</h1>
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-8 pt-2">
          <div>{orderNo}</div>
          <div className="flex items-center gap-2">
            <span>■</span>
            {editing ? (
              <select
                className={`${sheetInput} !w-40`}
                value={body.orderType || ''}
                onChange={(e) => set({ orderType: e.target.value })}
                aria-label="발령 구분"
              >
                <option value="">발령 구분 선택</option>
                {ORDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            ) : (
              <span>{body.orderType}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <SignBlock title="결재" signers={shown.approval} />
          <SignBlock title="합의" signers={shown.agreement} />
        </div>
      </div>

      <table className="mt-8 w-full border-collapse">
        <tbody>
          {entries.map((entry, index) =>
            editing ? (
              <tr key={index}>
                <td className="w-[18%] border border-black p-1.5">
                  <input className={cellInput} value={entry.name} maxLength={50} placeholder="성명" onChange={(e) => setEntry(index, { name: e.target.value })} />
                </td>
                <td className="w-[16%] border border-black p-1.5">
                  <input className={cellInput} value={entry.jobType} maxLength={30} placeholder="직종" onChange={(e) => setEntry(index, { jobType: e.target.value })} />
                </td>
                <td className="border border-black p-1.5">
                  <div className="flex gap-1.5">
                    <input className={cellInput} value={entry.workplace} maxLength={50} placeholder="사업장" onChange={(e) => setEntry(index, { workplace: e.target.value })} />
                    <input className={cellInput} value={entry.department} maxLength={50} placeholder="부서" onChange={(e) => setEntry(index, { department: e.target.value })} />
                    <input className={cellInput} value={entry.position} maxLength={50} placeholder="직위" onChange={(e) => setEntry(index, { position: e.target.value })} />
                  </div>
                </td>
                <td className="w-8 border border-black text-center">
                  <button
                    type="button"
                    className="rounded p-1 text-stripe-muted hover:bg-[#fee2e2] hover:text-[#df1b41]"
                    onClick={() => set({ entries: entries.filter((_, i) => i !== index) })}
                    aria-label={`${entry.name || '대상자'} 빼기`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={index}>
                <td className="w-[22%] border border-black px-3 py-4 text-center">{entry.name}</td>
                <td className="w-[20%] border border-black px-3 py-4 text-center">{entry.jobType}</td>
                <td className="border border-black px-8 py-4">
                  <div className="flex items-center gap-20">
                    <span className="whitespace-pre">{[entry.workplace, entry.department].filter(Boolean).join('   ')}</span>
                    <span>{entry.position}</span>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      {editing && (
        <div className="mt-2">
          <EntryAdder
            people={people}
            disabled={entries.length >= ORDER_ENTRIES_MAX}
            onAdd={(entry) => set({ entries: [...entries, entry] })}
          />
        </div>
      )}

      <div className="mt-8 flex items-center gap-2">
        <span>-</span>
        {editing ? (
          <>
            <div className="w-44 shrink-0">
              <input
                type="date"
                className={sheetInput}
                value={body.effectiveDate || ''}
                onChange={(e) => set({ effectiveDate: e.target.value })}
                aria-label="발령일"
              />
            </div>
            <span className="whitespace-nowrap">{orderDateText(body.effectiveDate) || '발령일을 고르세요'}</span>
          </>
        ) : (
          <span>{orderDateText(body.effectiveDate)}</span>
        )}
      </div>

      {editing ? (
        <textarea
          className={`${sheetInput} mt-6 min-h-[80px]`}
          maxLength={2000}
          value={body.content || ''}
          placeholder="비고 (선택)"
          onChange={(e) => set({ content: e.target.value })}
        />
      ) : (
        body.content && <p className="mt-6 whitespace-pre-line">{body.content}</p>
      )}
    </div>
  );
}
