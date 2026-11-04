import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { BrandMark } from '../components/BrandLockup';
import { Button } from '../components/ui/Button';
import { leaveApi } from '../api/leaveApi';

/** 로그인 없이 쓰는 증명서 진위 확인. 발급번호와 확인 코드가 모두 맞아야 결과를 보여 줍니다. */
export function VerifyCertificatePage() {
  const [params] = useSearchParams();
  const [no, setNo] = useState(params.get('no') || '');
  const [code, setCode] = useState(params.get('code') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      setResult(await leaveApi.verifyCertificate(no, code));
    } catch (err) {
      setError(err.message || '확인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const revoked = result?.status === 'revoked';
  return (
    <div className="flex min-h-screen items-center justify-center bg-stripe-bg px-4 py-8">
      <div className="stripe-panel w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 border-b border-stripe-border bg-[#fafbfc] px-6 py-5">
          <BrandMark className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold text-stripe-text">증명서 진위 확인</h1>
            <p className="text-[13px] text-stripe-muted">KBI 동양철관이 발급한 증명서인지 확인합니다.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div>
            <label className="stripe-label" htmlFor="verify-no">
              발급번호
            </label>
            <input
              id="verify-no"
              className="stripe-input font-mono"
              placeholder="예: 2026-0001"
              value={no}
              onChange={(e) => setNo(e.target.value)}
            />
          </div>
          <div>
            <label className="stripe-label" htmlFor="verify-code">
              확인 코드 (8자리)
            </label>
            <input
              id="verify-code"
              className="stripe-input font-mono uppercase tracking-widest"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="mt-1 text-[12px] text-stripe-muted">증명서 아래쪽에 적힌 발급번호와 확인 코드를 넣으세요.</p>
          </div>
          <Button type="submit" className="w-full" disabled={busy || !no.trim() || !code.trim()}>
            <ShieldCheck className="h-4 w-4" /> {busy ? '확인 중…' : '확인'}
          </Button>
        </form>

        {error && (
          <div className="mx-6 mb-6 flex items-start gap-2 rounded-md bg-[#fee2e2] px-4 py-3 text-sm text-[#df1b41]">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {result && (
          <div
            className={`mx-6 mb-6 rounded-md px-4 py-3 text-sm ${
              revoked ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#f0fdf4] text-[#166534]'
            }`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {revoked ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {revoked ? `발급 후 취소된 증명서입니다 (취소일 ${result.revokedAt}).` : '정상 발급된 증명서입니다.'}
            </p>
            <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-y-1 text-[13px]">
              <dt className="opacity-70">발급번호</dt>
              <dd className="font-mono">{result.certNo}</dd>
              <dt className="opacity-70">종류</dt>
              <dd>{result.typeLabel}</dd>
              <dt className="opacity-70">성명</dt>
              <dd>{result.maskedName}</dd>
              <dt className="opacity-70">발급일</dt>
              <dd>{result.issueDate}</dd>
              <dt className="opacity-70">발급 회사</dt>
              <dd>{result.companyName}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
