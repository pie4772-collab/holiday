import { useMemo, useState } from 'react';
import { Download, Search, ScrollText } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { useLeaveApprovalHistory } from '../../hooks/useLeaveData';

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function actionBadgeVariant(action) {
  if (action === 'reject') return 'warning';
  if (action === 'approve' || action === 'auto_approve') return 'success';
  if (action === 'step_approve') return 'purple';
  return 'info';
}

function downloadCsv(items, year) {
  const rows = [
    [
      '처리일시',
      '구분',
      '결재단계',
      '신청자',
      '사번',
      '사업장',
      '부서',
      '직급',
      '사용일',
      '유형',
      '일수',
      '신청사유',
      '처리자',
      '처리자사번',
      '처리자직급',
      '비고',
      '신청ID',
    ],
  ];
  for (const item of items) {
    rows.push([
      item.createdAt,
      item.actionLabel,
      item.step || '',
      item.employeeName,
      item.employeeEmpNo,
      item.workplace,
      item.department,
      item.position,
      item.usageDate,
      item.usageType === 'half' ? '반차' : '연차',
      item.days,
      item.reason,
      item.actorName,
      item.actorEmpNo,
      item.actorPosition,
      item.note || '',
      item.leaveUsageId || '',
    ]);
  }
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `연차승인반려이력-${year || '전체'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminApprovalHistory() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [workplace, setWorkplace] = useState('');
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');

  const filters = useMemo(
    () => ({
      year: year || undefined,
      workplace: workplace || undefined,
      action: action || undefined,
      query: query.trim() || undefined,
    }),
    [year, workplace, action, query]
  );

  const { data, isLoading, isError, refetch } = useLeaveApprovalHistory(filters);
  const items = data?.items || [];
  const summary = data?.summary || { total: 0, submitted: 0, approved: 0, stepApproved: 0, rejected: 0 };
  const years = data?.years?.length ? data.years : [currentYear];
  const workplaces = data?.workplaces || [];
  const actions = data?.actions || [];

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError && !data) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="승인·반려 이력"
        description="연차 신청·단계승인·최종승인·반려 기록을 보관합니다. 근로감독 등 증빙용으로 CSV 내려받기가 가능합니다."
        actions={
          <Button variant="secondary" onClick={() => downloadCsv(items, year)}>
            <Download className="h-4 w-4" />
            CSV 받기
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
          <input
            className="stripe-input stripe-input-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="신청자, 사번, 처리자, 부서 검색"
          />
        </div>
        <select className="stripe-input" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">연도 전체</option>
          {years.map((item) => (
            <option key={item} value={String(item)}>
              {item}년
            </option>
          ))}
        </select>
        <select className="stripe-input" value={workplace} onChange={(e) => setWorkplace(e.target.value)}>
          <option value="">사업장 전체</option>
          {workplaces.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="stripe-input" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">구분 전체</option>
          {actions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <LeaveSummaryCard title="조회 건수" value={summary.total} unit="건" subtitle="필터 적용 결과" />
        <LeaveSummaryCard title="신청" value={summary.submitted} unit="건" />
        <LeaveSummaryCard title="단계승인" value={summary.stepApproved} unit="건" />
        <LeaveSummaryCard title="최종·본인승인" value={summary.approved} unit="건" highlight />
        <LeaveSummaryCard title="반려" value={summary.rejected} unit="건" />
      </div>

      <p className="text-[13px] text-stripe-muted mb-4 flex items-start gap-2">
        <ScrollText className="h-4 w-4 mt-0.5 shrink-0" />
        처리 시점의 신청자·처리자·사업장·사유를 스냅샷으로 남깁니다. 이후 인사정보가 바뀌어도 당시 기록은 유지됩니다.
      </p>

      <Panel>
        <div className="settlement-cards mobile-card-list">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-stripe-muted">조건에 맞는 이력이 없습니다.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="mobile-card-item">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-stripe-text">{item.employeeName}</p>
                    <p className="text-xs text-stripe-muted mt-0.5">
                      {item.employeeEmpNo && <span className="font-mono mr-1.5">{item.employeeEmpNo}</span>}
                      {[item.workplace, item.department, item.position].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge variant={actionBadgeVariant(item.action)}>{item.actionLabel}</Badge>
                </div>
                <p className="mt-2 text-sm font-mono">{item.usageDate}</p>
                <p className="mt-1 text-xs text-stripe-muted">
                  {item.usageType === 'half' ? '반차' : '연차'} {item.days}일
                  {item.step ? ` · ${item.step}` : ''}
                </p>
                {item.reason && <p className="mt-1 text-xs text-stripe-muted">사유: {item.reason}</p>}
                <p className="mt-2 text-xs text-stripe-muted">
                  처리 {item.createdAt}
                  {item.actorName ? ` · ${item.actorName}` : ''}
                  {item.note ? ` · ${item.note}` : ''}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="settlement-table stripe-table-fit-wrap">
          <table className="stripe-table stripe-table-fit w-full">
            <thead>
              <tr>
                <th>처리일시</th>
                <th>구분</th>
                <th>신청자</th>
                <th>사업장·부서</th>
                <th>사용일</th>
                <th>유형</th>
                <th>처리자</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-stripe-muted">
                    조건에 맞는 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-[12px] whitespace-nowrap">{item.createdAt}</td>
                    <td>
                      <Badge variant={actionBadgeVariant(item.action)}>{item.actionLabel}</Badge>
                      {item.step ? (
                        <span className="block text-[11px] text-stripe-muted mt-1">{item.step}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-medium">{item.employeeName}</span>
                      {item.employeeEmpNo ? (
                        <span className="block font-mono text-[12px] text-stripe-muted">{item.employeeEmpNo}</span>
                      ) : null}
                    </td>
                    <td className="muted whitespace-nowrap">
                      {[item.workplace, item.department].filter(Boolean).join(' · ') || '—'}
                      {item.position ? (
                        <span className="block text-[12px]">{item.position}</span>
                      ) : null}
                    </td>
                    <td className="font-mono text-[13px] whitespace-nowrap">{item.usageDate}</td>
                    <td className="whitespace-nowrap">
                      {item.usageType === 'half' ? '반차' : '연차'} {item.days}
                    </td>
                    <td className="whitespace-nowrap">
                      {item.actorName || '—'}
                      {item.actorEmpNo ? (
                        <span className="block font-mono text-[12px] text-stripe-muted">{item.actorEmpNo}</span>
                      ) : null}
                    </td>
                    <td className="muted text-[13px] max-w-[220px]">
                      {[item.reason, item.note].filter(Boolean).join(' / ') || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
