import { AlertTriangle } from 'lucide-react';
import { CERT_ITEMS, CERT_PURPOSE_PRESETS, CERT_TYPES } from '../../constants/certificates';

/**
 * 증명서 종류·기재 항목·용도 입력. 근로기준법 제39조에 따라 고른 항목만 증명서에 적습니다.
 * profile: { isActive, hasBirthDate, hasAddress } — 비어 있는 인사기록 항목을 미리 알립니다.
 */
export function CertificateRequestFields({ value, onChange, types, profile = {}, showSealOption = false }) {
  const isActive = profile.isActive !== false;
  const items = CERT_ITEMS.filter((item) => !item.terminatedOnly || !isActive);
  const selected = value.items || [];
  const missing = {
    birthDate: profile.hasBirthDate === false,
    address: profile.hasAddress === false,
  };

  function set(patch) {
    onChange({ ...value, ...patch });
  }

  function toggle(key) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    set({ items: next });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="stripe-label">증명서 종류</label>
        {types.length === 1 ? (
          <p className="text-sm font-medium text-stripe-text">{CERT_TYPES[types[0]].label}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {types.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set({ certType: type })}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  value.certType === type
                    ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
                    : 'border-stripe-border bg-white text-stripe-text hover:bg-[#f6f9fc]'
                }`}
              >
                {CERT_TYPES[type].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="stripe-label">기재 항목</label>
        <p className="mb-2 text-[12px] text-stripe-muted">
          성명과 재직기간은 항상 적습니다. 그 밖에는 고른 항목만 적습니다(근로기준법 제39조).
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.key}>
              <label className="flex items-center gap-2 text-sm text-stripe-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-500"
                  checked={selected.includes(item.key)}
                  onChange={() => toggle(item.key)}
                />
                {item.label}
              </label>
              {missing[item.key] && selected.includes(item.key) && (
                <p className="mt-1 flex items-start gap-1 text-[12px] text-[#b45309]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  인사기록카드에 {item.label}이(가) 없어 발급되지 않습니다. 항목을 빼거나 먼저 등록하세요.
                </p>
              )}
              {item.input && selected.includes(item.key) && (
                <input
                  className="stripe-input mt-1.5"
                  maxLength={item.max}
                  placeholder={item.key === 'duty' ? '예: 설비 보전, 회계·자금 관리' : '예: 개인 사정, 계약기간 만료'}
                  value={value[item.key] || ''}
                  onChange={(e) => set({ [item.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="stripe-label">
            용도<span className="ml-0.5 text-[#df1b41]">*</span>
          </label>
          <input
            className="stripe-input"
            list="cert-purpose-presets"
            maxLength={100}
            value={value.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
            placeholder="예: 금융기관 제출용"
          />
          <datalist id="cert-purpose-presets">
            {CERT_PURPOSE_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="stripe-label">제출처</label>
          <input
            className="stripe-input"
            maxLength={100}
            value={value.submitTo}
            onChange={(e) => set({ submitTo: e.target.value })}
            placeholder="선택"
          />
        </div>
      </div>

      {showSealOption && (
        <label className="flex items-center gap-2 text-sm text-stripe-text">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary-500"
            checked={value.showSeal}
            onChange={(e) => set({ showSeal: e.target.checked })}
          />
          직인 이미지 넣기
        </label>
      )}
    </div>
  );
}
