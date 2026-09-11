import { useMemo, useState } from 'react';
import { Download, Save } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { useLeaveReport, useSaveLeaveReport } from '../../hooks/useLeaveData';

function previousMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(report, workplaceFilter) {
  const groups = workplaceFilter
    ? report.workplaces.filter((group) => group.workplace === workplaceFilter)
    : report.workplaces;
  const rows = [
    [
      '기준연월',
      '기준일',
      '사업장',
      '사번',
      '이름',
      '부서',
      '직급',
      '입사일',
      '상태',
      '발생',
      '월중사용',
      '누적사용',
      '잔여(IFRS)',
      '당월 승인대기',
    ],
  ];

  for (const group of groups) {
    for (const emp of group.employees) {
      rows.push([
        `${report.year}-${String(report.month).padStart(2, '0')}`,
        report.asOfDate,
        emp.workplace,
        emp.empNo,
        emp.name,
        emp.department,
        emp.position,
        emp.hireDate,
        emp.status,
        emp.accrued,
        emp.usedInMonth,
        emp.usedToDate,
        emp.remaining,
        emp.pendingInMonth,
      ]);
    }
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = workplaceFilter ? `-${workplaceFilter}` : '';
  link.href = url;
  link.download = `연차보고서-${report.year}${String(report.month).padStart(2, '0')}${suffix}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminLeaveReport() {
  const initial = previousMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [workplace, setWorkplace] = useState('all');
  const { data: report, isLoading, isError, refetch } = useLeaveReport(year, month);
  const saveReport = useSaveLeaveReport();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  const visibleGroups = useMemo(() => {
    if (!report) return [];
    if (workplace === 'all') return report.workplaces;
    return report.workplaces.filter((group) => group.workplace === workplace);
  }, [report, workplace]);

  const visibleTotals = useMemo(() => {
    return visibleGroups.reduce(
      (acc, group) => ({
        employeeCount: acc.employeeCount + group.employeeCount,
        accrued: Math.round((acc.accrued + group.accrued) * 10) / 10,
        usedInMonth: Math.round((acc.usedInMonth + group.usedInMonth) * 10) / 10,
        remaining: Math.round((acc.remaining + group.remaining) * 10) / 10,
      }),
      { employeeCount: 0, accrued: 0, usedInMonth: 0, remaining: 0 }
    );
  }, [visibleGroups]);

  if (isLoading && !report) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError && !report) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="월말 연차 보고서"
        description={`${report.asOfDate} 말일 기준 · ${report.standard} 미사용 연차 자료`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => downloadCsv(report, workplace === 'all' ? '' : workplace)}
            >
              <Download className="h-4 w-4" />
              CSV 받기
            </Button>
            <Button
              disabled={saveReport.isPending}
              onClick={() => saveReport.mutate({ year, month })}
            >
              <Save className="h-4 w-4" />
              {saveReport.isPending ? '저장 중…' : '월말 확정'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm w-full sm:w-auto">
          <span className="stripe-label">연도</span>
          <select
            className="stripe-input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}년
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm w-full sm:w-auto">
          <span className="stripe-label">월</span>
          <select
            className="stripe-input"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((item) => (
              <option key={item} value={item}>
                {item}월
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm w-full sm:w-auto sm:min-w-[160px]">
          <span className="stripe-label">사업장</span>
          <select
            className="stripe-input"
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value)}
          >
            <option value="all">전체 사업장</option>
            {report.workplaces.map((group) => (
              <option key={group.workplace} value={group.workplace}>
                {group.workplace}
              </option>
            ))}
          </select>
        </label>
      </div>

      {report.saved && (
        <div className="mb-6 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {report.year}년 {report.month}월 보고서를 {report.saved.generatedAt}에 확정했습니다.
        </div>
      )}
      {saveReport.isError && (
        <div className="mb-6 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {saveReport.error?.message || '확정 저장에 실패했습니다.'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <LeaveSummaryCard title="대상 인원" value={visibleTotals.employeeCount} unit="명" subtitle="월말 재직 + 당월 퇴사" />
        <LeaveSummaryCard title="발생 합계" value={visibleTotals.accrued} subtitle="월말 기준 발생" />
        <LeaveSummaryCard title="당월 사용" value={visibleTotals.usedInMonth} subtitle="해당 월 사용일" />
        <LeaveSummaryCard
          title="미사용 잔여"
          value={visibleTotals.remaining}
          subtitle="IFRS 부채 산정 기초(일수)"
          highlight
        />
      </div>

      <p className="text-[13px] text-stripe-muted mb-6">
        {report.note} 잔여는 말일 사용분을 포함한 월말 잔여입니다. 금액(일급 × 잔여)은 회계에서 적용합니다.
      </p>

      {visibleGroups.length === 0 ? (
        <Panel>
          <p className="py-12 text-center text-sm text-stripe-muted">해당 조건의 보고 대상이 없습니다.</p>
        </Panel>
      ) : (
        visibleGroups.map((group) => (
        <Panel key={group.workplace} className="mb-6">
          <PanelHeader
            title={group.workplace}
            description={`${group.employeeCount}명 · 잔여 ${group.remaining}일 · 당월 사용 ${group.usedInMonth}일`}
            actions={<Badge variant="primary">{group.remaining}일</Badge>}
          />
          <PanelBody noPadding>
            <div className="settlement-cards mobile-card-list">
              {group.employees.map((emp) => (
                <div key={emp.id} className="mobile-card-item">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                      <p className="text-xs text-stripe-muted mt-0.5">
                        {emp.empNo && <span className="font-mono mr-1.5">{emp.empNo}</span>}
                        입사 {emp.hireDate || '—'} · {emp.department} · {emp.position}
                        {emp.pendingInMonth ? ` · 승인대기 ${emp.pendingInMonth}일` : ''}
                      </p>
                    </div>
                    <Badge
                      variant={emp.status === '재직' ? 'success' : 'warning'}
                      className="whitespace-nowrap text-[11px] px-1.5 py-0 leading-5"
                    >
                      {emp.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                    <div>
                      <p className="mobile-card-label">발생</p>
                      <p className="text-sm tabular-nums">{emp.accrued}</p>
                    </div>
                    <div>
                      <p className="mobile-card-label">당월</p>
                      <p className="text-sm tabular-nums">{emp.usedInMonth}</p>
                    </div>
                    <div>
                      <p className="mobile-card-label">누적</p>
                      <p className="text-sm tabular-nums">{emp.usedToDate}</p>
                    </div>
                    <div>
                      <p className="mobile-card-label">잔여</p>
                      <p className="text-sm tabular-nums font-medium text-[#09825d]">{emp.remaining}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="settlement-table stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <colgroup>
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>사번</th>
                    <th>입사일</th>
                    <th>부서</th>
                    <th>직급</th>
                    <th>상태</th>
                    <th className="text-right">발생</th>
                    <th className="text-right">당월사용</th>
                    <th className="text-right">누적사용</th>
                    <th className="text-right">잔여</th>
                    <th className="text-right">승인대기</th>
                  </tr>
                </thead>
                <tbody>
                  {group.employees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="font-medium whitespace-nowrap">{emp.name}</td>
                      <td className="font-mono text-[13px]">{emp.empNo || '-'}</td>
                      <td className="font-mono text-[13px] whitespace-nowrap">{emp.hireDate || '—'}</td>
                      <td className="muted whitespace-nowrap">{emp.department}</td>
                      <td className="muted whitespace-nowrap">{emp.position}</td>
                      <td>
                        <Badge
                          variant={emp.status === '재직' ? 'success' : 'warning'}
                          className="whitespace-nowrap text-[11px] px-1.5 py-0 leading-5"
                        >
                          {emp.status}
                        </Badge>
                      </td>
                      <td className="tabular-nums text-right">{emp.accrued}</td>
                      <td className="tabular-nums text-right">{emp.usedInMonth}</td>
                      <td className="tabular-nums text-right muted">{emp.usedToDate}</td>
                      <td className="tabular-nums text-right font-medium text-[#09825d]">{emp.remaining}</td>
                      <td className="tabular-nums text-right muted">
                        {emp.pendingInMonth ? emp.pendingInMonth : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelBody>
        </Panel>
        ))
      )}
    </div>
  );
}
