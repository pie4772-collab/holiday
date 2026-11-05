import { RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { useRefreshStorageUsage, useStorageUsage } from '../../hooks/useEmployeeRoster';

const WARN_RATIO = 0.7;
const DANGER_RATIO = 0.85;

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function toMb(bytes) {
  return ((Number(bytes) || 0) / 1024 ** 2).toFixed(1);
}

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

function usageLevel(ratio) {
  if (ratio >= DANGER_RATIO) {
    return {
      bar: 'bg-[#df1b41]',
      box: 'border-[#fecaca] bg-[#fef2f2] text-[#df1b41]',
      text: '저장공간이 거의 찼습니다. 가득 차면 연차 신청·출퇴근 기록까지 저장되지 않을 수 있으니 오래된 첨부를 정리하거나 상위 요금제로 바꾸세요.',
    };
  }
  if (ratio >= WARN_RATIO) {
    return {
      bar: 'bg-[#f59e0b]',
      box: 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]',
      text: '저장공간을 70% 넘게 쓰고 있습니다. 첨부 파일이 늘어나는 속도를 보고 요금제 변경을 미리 검토하세요.',
    };
  }
  return {
    bar: 'bg-primary-500',
    box: 'border-[#d7f7c2] bg-[#f6fef9] text-[#09825d]',
    text: '저장공간에 여유가 있습니다.',
  };
}

export function AdminStorage() {
  const { data, isLoading, isError, refetch } = useStorageUsage();
  const refresh = useRefreshStorageUsage();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  const level = usageLevel(data.usedRatio);
  const percent = Math.min(100, data.usedRatio * 100);
  const attachmentOriginal = data.attachments.reduce((sum, item) => sum + item.originalBytes, 0);
  const attachmentStored = data.attachments.reduce((sum, item) => sum + item.storedBytes, 0);
  const attachmentCount = data.attachments.reduce((sum, item) => sum + item.count, 0);
  const isPostgres = data.database.dialect === 'postgres';
  const segments = [
    ...(isPostgres ? [{ label: 'DB', bytes: data.database.sizeBytes, className: 'bg-primary-500' }] : []),
    { label: '앱 파일', bytes: data.appFiles.sizeBytes, className: 'bg-[#94a3b8]' },
    { label: '데이터 폴더', bytes: data.userData.sizeBytes, className: 'bg-[#f59e0b]' },
  ].filter((s) => s.bytes > 0);

  return (
    <div>
      <PageHeader
        title="저장공간"
        description="DB 용량과 첨부 파일 합계를 보여 줍니다. 첨부 파일은 DB 안에 암호화해 저장하므로 DB 용량에 포함됩니다."
        actions={
          <Button variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
            {refresh.isPending ? '다시 계산 중…' : '다시 계산'}
          </Button>
        }
      />

      {refresh.isError && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {refresh.error?.message || '다시 계산하지 못했습니다.'}
        </div>
      )}

      <Panel className="mb-6">
        <PanelHeader
          title="전체 사용량 (추정)"
          description={`Cafe24 공간 한도 ${formatBytes(data.quotaBytes)} 기준 · 확인 ${formatTime(data.checkedAt)}`}
        />
        <PanelBody className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold text-stripe-text tabular-nums">{formatBytes(data.totalBytes)}</span>
            <span className="text-sm text-stripe-muted tabular-nums">
              {percent.toFixed(1)}% · 남은 공간 {formatBytes(Math.max(0, data.quotaBytes - data.totalBytes))}
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#f0f3f7]">
            {segments.map((s) => (
              <div
                key={s.label}
                className={s.className}
                style={{ width: `${Math.min(100, (s.bytes / data.quotaBytes) * 100)}%` }}
                title={`${s.label} ${formatBytes(s.bytes)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-stripe-muted">
            {segments.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${s.className}`} />
                {s.label} {formatBytes(s.bytes)}
              </span>
            ))}
          </div>
          <div className={`rounded-md border px-4 py-3 text-sm ${level.box}`}>{level.text}</div>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <LeaveSummaryCard
          title="DB 용량"
          value={toMb(data.database.sizeBytes)}
          unit="MB"
          subtitle={isPostgres ? 'PostgreSQL · 첨부 파일 포함' : 'SQLite 파일 · 첨부 파일 포함'}
          highlight
        />
        <LeaveSummaryCard
          title="첨부 파일 합계"
          value={toMb(attachmentOriginal)}
          unit="MB"
          subtitle={`${attachmentCount.toLocaleString()}개 · DB 저장 크기 ${formatBytes(attachmentStored)}`}
        />
        <LeaveSummaryCard
          title="앱 파일"
          value={toMb(data.appFiles.sizeBytes)}
          unit="MB"
          subtitle={`프로그램·라이브러리 ${data.appFiles.fileCount.toLocaleString()}개 파일`}
        />
        <LeaveSummaryCard
          title="데이터 폴더"
          value={toMb(data.userData.sizeBytes)}
          unit="MB"
          subtitle="암호화 키·이전용 SQLite 파일 등"
        />
      </div>

      <Panel className="mb-6">
        <PanelHeader
          title="첨부 파일"
          description="원본 크기는 올린 파일 크기, DB 저장 크기는 암호화·문자 변환 후 실제로 차지하는 크기입니다(약 1.33배)."
        />
        <PanelBody noPadding>
          <table className="stripe-table w-full">
            <thead>
              <tr>
                <th>구분</th>
                <th className="text-right">파일 수</th>
                <th className="text-right">원본 크기</th>
                <th className="text-right">DB 저장 크기</th>
              </tr>
            </thead>
            <tbody>
              {data.attachments.map((item) => (
                <tr key={item.key}>
                  <td>{item.label}</td>
                  <td className="text-right tabular-nums">{item.count.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{formatBytes(item.originalBytes)}</td>
                  <td className="text-right tabular-nums">{formatBytes(item.storedBytes)}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td>합계</td>
                <td className="text-right tabular-nums">{attachmentCount.toLocaleString()}</td>
                <td className="text-right tabular-nums">{formatBytes(attachmentOriginal)}</td>
                <td className="text-right tabular-nums">{formatBytes(attachmentStored)}</td>
              </tr>
            </tbody>
          </table>
        </PanelBody>
      </Panel>

      <Panel className="mb-6">
        <PanelHeader title="용량이 큰 테이블" description="인덱스를 포함한 크기 순서입니다." />
        <PanelBody noPadding>
          {data.database.tables.length ? (
            <table className="stripe-table w-full">
              <thead>
                <tr>
                  <th>테이블</th>
                  <th>내용</th>
                  {isPostgres && <th className="text-right">행 수(추정)</th>}
                  <th className="text-right">크기</th>
                </tr>
              </thead>
              <tbody>
                {data.database.tables.map((table) => (
                  <tr key={table.name}>
                    <td className="font-mono text-[13px]">{table.name}</td>
                    <td className="muted">{table.label || '-'}</td>
                    {isPostgres && <td className="text-right tabular-nums">{(table.rows ?? 0).toLocaleString()}</td>}
                    <td className="text-right tabular-nums">{formatBytes(table.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-stripe-muted">이 DB에서는 테이블별 크기를 알 수 없습니다.</p>
          )}
        </PanelBody>
      </Panel>

      <ul className="space-y-1 text-[13px] text-stripe-muted">
        <li>· 전체 사용량은 이 앱이 계산한 추정치입니다. 정확한 사용량은 Cafe24 웹콘솔에서 확인하세요.</li>
        <li>· 앱 파일 크기는 계산이 무거워 10분 동안 이전 결과를 씁니다. 바로 다시 세려면 "다시 계산"을 누르세요.</li>
        <li>· 백업 파일은 Cafe24가 따로 보관하므로 여기 포함되지 않습니다.</li>
      </ul>
    </div>
  );
}
