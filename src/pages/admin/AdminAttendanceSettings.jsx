import { useEffect, useState } from 'react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { AttendanceRules } from '../../components/attendance/AttendanceRules';
import { useAttendanceIpCheck, useAttendanceSettings, useSaveAttendanceSettings } from '../../hooks/useAttendance';

function toForm(settings) {
  return {
    sites: settings.sites.map((site) => ({ ...site, ipRanges: site.ipRanges.join('\n') })),
    startDate: settings.startDate || '',
    proxyHops: String(settings.proxyHops),
  };
}

function IpDiagnostics() {
  const { data, isFetching, error, refetch } = useAttendanceIpCheck();
  return (
    <Panel className="mb-5">
      <PanelHeader
        title="접속 IP 확인"
        description="이 화면을 연 PC에서 서버가 받은 주소입니다. 사무실에서 눌러 '판정 IP'가 회사 공인 IP로 나오는지 확인하세요."
        actions={
          <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '확인 중…' : '지금 확인'}
          </Button>
        }
      />
      {(data || error) && (
        <PanelBody>
          {error ? (
            <p className="text-sm text-[#df1b41]">{error.message}</p>
          ) : (
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
              <dt className="text-stripe-muted">판정 IP</dt>
              <dd className="font-mono font-semibold">{data.clientIp || '-'}</dd>
              <dt className="text-stripe-muted">소켓 주소</dt>
              <dd className="font-mono">{data.socketIp || '-'}</dd>
              <dt className="text-stripe-muted">X-Forwarded-For</dt>
              <dd className="font-mono break-all">{data.forwardedFor || '-'}</dd>
              <dt className="text-stripe-muted">X-Real-IP</dt>
              <dd className="font-mono">{data.realIp || '-'}</dd>
              <dt className="text-stripe-muted">프록시 단계</dt>
              <dd>{data.hops}</dd>
            </dl>
          )}
        </PanelBody>
      )}
    </Panel>
  );
}

export function AdminAttendanceSettings() {
  const { data, isLoading, isError, refetch } = useAttendanceSettings();
  const save = useSaveAttendanceSettings();
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (isLoading || (data && !form)) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage onRetry={() => refetch()} />;

  function updateSite(code, patch) {
    setForm((prev) => ({ ...prev, sites: prev.sites.map((s) => (s.code === code ? { ...s, ...patch } : s)) }));
  }

  async function handleSave() {
    setMessage('');
    try {
      const result = await save.mutateAsync({
        sites: form.sites.map((s) => ({ ...s, graceMinutes: Number(s.graceMinutes) })),
        startDate: form.startDate,
        proxyHops: Number(form.proxyHops),
      });
      setForm(toForm(result));
      setMessage('저장했습니다.');
    } catch {
      // 오류는 아래에 표시합니다
    }
  }

  return (
    <div>
      <PageHeader
        title="근태 설정"
        description="사업장별 근무시간·점심시간·인정 시간과 출퇴근을 허용할 회사 IP 대역을 관리합니다."
        actions={
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
        }
      />
      {save.error && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {save.error.message}
        </div>
      )}
      {message && !save.error && (
        <div className="mb-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#09825d]">{message}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        {form.sites.map((site) => (
          <Panel key={site.code}>
            <PanelHeader title={site.name} description={`사업장 코드 ${site.code}`} />
            <PanelBody className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['workStart', '출근'],
                  ['workEnd', '퇴근'],
                  ['lunchStart', '점심 시작'],
                  ['lunchEnd', '점심 종료'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="stripe-label">{label}</label>
                    <input
                      type="time"
                      value={site[key]}
                      onChange={(e) => updateSite(site.code, { [key]: e.target.value })}
                      className="stripe-input"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="stripe-label">인정 시간(분)</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={site.graceMinutes}
                  onChange={(e) => updateSite(site.code, { graceMinutes: e.target.value })}
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">허용 IP 대역 (한 줄에 하나, CIDR)</label>
                <textarea
                  rows={4}
                  value={site.ipRanges}
                  onChange={(e) => updateSite(site.code, { ipRanges: e.target.value })}
                  className="stripe-input font-mono text-[13px]"
                  placeholder="175.192.184.0/28"
                />
              </div>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <Panel className="mb-5">
        <PanelHeader title="판정 기준" />
        <PanelBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="stripe-label">결근 판정 시작일</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              className="stripe-input"
            />
            <p className="mt-1 text-[12px] text-stripe-muted">
              비워 두면 첫 출퇴근 기록일({data.effectiveStartDate || '아직 없음'})부터 결근을 판정합니다.
            </p>
          </div>
          <div>
            <label className="stripe-label">신뢰할 프록시 단계</label>
            <select
              value={form.proxyHops}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyHops: e.target.value }))}
              className="stripe-input"
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? '0 (프록시 없음 · 소켓 주소 사용)' : `${n}단계`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-stripe-muted">
              서버 앞단 프록시 수입니다. 아래 '접속 IP 확인'에서 판정 IP가 회사 공인 IP와 같아지는 값으로 맞추세요.
            </p>
          </div>
        </PanelBody>
      </Panel>

      <IpDiagnostics />
      <AttendanceRules site={form.sites[0]} />
    </div>
  );
}
