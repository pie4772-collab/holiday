import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { CertificateRequestFields } from './CertificateRequestFields';
import { CERT_TYPE_KEYS, LEGAL_CLAIM_YEARS, certTypeAllowed, initialCertRequest } from '../../constants/certificates';
import { useCertificateTargets } from '../../hooks/useCertificates';

function TargetSummary({ name, detail, retired, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-stripe-border px-3 py-2 text-sm">
      <span>
        <strong>{name}</strong>
        <span className="ml-1.5 text-stripe-muted">{detail}</span>
        {retired && (
          <Badge variant="default" className="ml-1.5">
            {retired}
          </Badge>
        )}
      </span>
      {onChange && (
        <button type="button" className="text-[13px] text-primary-600 hover:underline" onClick={onChange}>
          바꾸기
        </button>
      )}
    </div>
  );
}

/**
 * 증명서 발급 품의 본문: 대상 직원(퇴직자 포함)·증명서 종류·기재 항목·용도.
 * request 가 있으면 직원 신청을 그대로 받아 대상자·종류를 고정합니다.
 */
export function CertificateIssueFields({ value, onChange, request = null }) {
  const targets = useCertificateTargets(!request);
  const [query, setQuery] = useState('');
  const target = request ? null : targets.data?.find((t) => t.id === String(value.employeeId || '')) || null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (targets.data || [])
      .filter((t) => [t.name, t.empNo, t.department].some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 10);
  }, [targets.data, query]);

  function pick(t) {
    setQuery('');
    onChange({ ...initialCertRequest(t.isActive ? 'employment' : 'retirement', t.isActive), employeeId: t.id });
  }

  if (request) {
    return (
      <div className="space-y-4">
        <div>
          <label className="stripe-label">신청자</label>
          <TargetSummary
            name={request.employeeName}
            detail={[request.workplace, request.department, request.position].filter(Boolean).join(' · ')}
            retired={request.profile.isActive ? '' : '퇴직'}
          />
          <p className="mt-1 text-[12px] text-stripe-muted">
            {request.requestedAt.slice(0, 16)} 직원 신청 · 신청 내용을 확인하고 필요하면 고쳐서 올리세요.
          </p>
        </div>
        <CertificateRequestFields
          value={value}
          onChange={onChange}
          types={[request.certType]}
          profile={request.profile}
          showSealOption
        />
      </div>
    );
  }

  const types = target ? CERT_TYPE_KEYS.filter((type) => certTypeAllowed(type, target.isActive)) : [];
  return (
    <div className="space-y-4">
      <div>
        <label className="stripe-label">발급 대상 (퇴직자 포함)</label>
        {target ? (
          <TargetSummary
            name={target.name}
            detail={[target.empNo, target.department, target.position].filter(Boolean).join(' · ')}
            retired={target.isActive ? '' : `퇴직 ${target.terminatedDate || ''}`.trim()}
            onChange={() => onChange({ ...value, employeeId: '' })}
          />
        ) : (
          <div>
            <input
              className="stripe-input"
              placeholder={targets.isLoading ? '직원 목록을 불러오는 중…' : '이름·사번·부서로 찾기'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <ul className="mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-stripe-border bg-white py-1 shadow-sm">
                {matches.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => pick(t)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#f6f9fc]"
                    >
                      <span className="font-medium">
                        {t.name}
                        {!t.isActive && <span className="ml-1.5 text-[12px] font-normal text-[#b45309]">퇴직</span>}
                      </span>
                      <span className="truncate text-xs text-stripe-muted">
                        {[t.empNo, t.department, t.position].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {target?.beyondLegalPeriod && (
        <p className="flex items-start gap-1.5 rounded-md bg-[#fef3c7] px-3 py-2 text-[13px] text-[#b45309]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          퇴직 후 {LEGAL_CLAIM_YEARS}년이 지나 법정 발급 의무 기간(근로기준법 시행령 제19조)은 지났습니다. 회사 판단으로 발급할 수 있습니다.
        </p>
      )}
      {target && (
        <CertificateRequestFields
          value={value}
          onChange={onChange}
          types={types}
          profile={{ isActive: target.isActive, hasBirthDate: target.hasBirthDate, hasAddress: target.hasAddress }}
          showSealOption
        />
      )}
    </div>
  );
}
