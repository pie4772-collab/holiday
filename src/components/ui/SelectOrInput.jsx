import { useEffect, useState } from 'react';

const CUSTOM_VALUE = '__custom__';

/**
 * 드롭다운에서 선택하고, 목록에 없으면 "직접 입력"으로 전환하는 입력 필드.
 */
export function SelectOrInput({
  value,
  onChange,
  options = [],
  placeholder = '선택',
  emptyLabel,
  required = false,
  allowCustom = true,
  customLabel = '직접 입력…',
  className = '',
}) {
  const normalized = value ?? '';
  const inList = options.includes(normalized);
  const [custom, setCustom] = useState(Boolean(normalized) && !inList);

  useEffect(() => {
    if (normalized && !options.includes(normalized)) setCustom(true);
  }, [normalized, options]);

  if (custom && allowCustom) {
    return (
      <div className="flex gap-1.5">
        <input
          type="text"
          value={normalized}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder="직접 입력"
          className={`stripe-input flex-1 min-w-0 ${className}`}
          autoFocus
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCustom(false);
              if (!options.includes(normalized)) onChange('');
            }}
            className="shrink-0 rounded-md border border-stripe-border px-2 text-xs text-stripe-muted hover:bg-[#f0f3f7]"
          >
            목록
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={inList ? normalized : ''}
      onChange={(e) => {
        if (e.target.value === CUSTOM_VALUE) {
          setCustom(true);
          onChange('');
          return;
        }
        onChange(e.target.value);
      }}
      required={required}
      className={`stripe-input ${className}`}
    >
      <option value="">{emptyLabel ?? placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      {allowCustom && <option value={CUSTOM_VALUE}>{customLabel}</option>}
    </select>
  );
}
