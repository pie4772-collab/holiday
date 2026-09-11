import { useMemo, useState } from 'react';
import { Download, Save } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { OrdinaryWageCsvActions } from '../../components/OrdinaryWageCsvActions';
import {
  useLeaveSettlement,
  useSaveLeaveSettlement,
  useUpdateOrdinaryWage,
} from '../../hooks/useLeaveData';

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

function formatWon(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
}

function downloadCsv(settlement, workplaceFilter) {
  const groups = workplaceFilter
    ? settlement.workplaces.filter((group) => group.workplace === workplaceFilter)
    : settlement.workplaces;
  const rows = [
    [
      '기준연월',
      '기준일',
      '사업장',
      '사번',
      '이름',
      '입사일',
      '부서',
      '직급',
      '상태',
      '잔여일',
      '초과이월',
      '월통상임금',
      '일급',
      '부채금액',
    ],
  ];

  for (const group of groups) {
    for (const emp of group.employees) {
      rows.push([
        `${settlement.year}-${String(settlement.month).padStart(2, '0')}`,
        settlement.asOfDate,
        emp.workplace,
        emp.empNo,
        emp.name,
        emp.hireDate || '',
        emp.department,
        emp.position,
        emp.status,
        emp.remaining,
        emp.overusedDays || 0,
        emp.ordinaryWage ?? '',
        emp.dailyRate ?? '',
        emp.allowance ?? '',
      ]);
    }
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = workplaceFilter ? `-${workplaceFilter}` : '';
  link.href = url;
  link.download = `IFRS연차부채-${settlement.year}${String(settlement.month).padStart(2, '0')}${suffix}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminLeaveSettlement() {
  const initial = previousMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [workplace, setWorkplace] = useState('all');
  const [draftWages, setDraftWages] = useState({});
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { data: settlement, isLoading, isError, refetch } = useLeaveSettlement(year, month);
  const saveSettlement = useSaveLeaveSettlement();
  const updateWage = useUpdateOrdinaryWage();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  const visibleGroups = useMemo(() => {
    if (!settlement) return [];
    if (workplace === 'all') return settlement.workplaces;
    return settlement.workplaces.filter((group) => group.workplace === workplace);
  }, [settlement, workplace]);

  const visibleTotals = useMemo(() => {
    return visibleGroups.reduce(
      (acc, group) => ({
        employeeCount: acc.employeeCount + group.employeeCount,
        remaining: Math.round((acc.remaining + group.remaining) * 10) / 10,
        allowance: acc.allowance + group.allowance,
        wageMissingCount: acc.wageMissingCount + group.wageMissingCount,
      }),
      { employeeCount: 0, remaining: 0, allowance: 0, wageMissingCount: 0 }
    );
  }, [visibleGroups]);

  function wageValue(emp) {
    if (Object.prototype.hasOwnProperty.call(draftWages, emp.id)) return draftWages[emp.id];
    return emp.ordinaryWage == null ? '' : String(emp.ordinaryWage);
  }

  async function handleSaveWage(emp) {
    const raw = wageValue(emp);
    const ordinaryWage = raw === '' ? null : Number(String(raw).replace(/,/g, ''));
    if (raw !== '' && (!Number.isFinite(ordinaryWage) || ordinaryWage < 0)) {
      setMessage('통상임금은 0 이상의 숫자로 입력해주세요.');
      return;
    }
    await updateWage.mutateAsync({ id: emp.id, ordinaryWage });
    setDraftWages((prev) => {
      const next = { ...prev };
      delete next[emp.id];
      return next;
    });
    setMessage(`${emp.name} 통상임금을 저장했습니다.`);
    setTimeout(() => setMessage(''), 3000);
  }

  if (isLoading && !settlement) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError && !settlement) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="IFRS 연차부채"
        description={`${settlement.asOfDate} 말일 기준 · ${settlement.formula}`}
        actions={
          <>
            <OrdinaryWageCsvActions
              onMessage={(text) => {
                setErrorMessage('');
                setMessage(text);
              }}
              onError={(text) => {
                setMessage('');
                setErrorMessage(text);
              }}
            />
            <Button
              variant="secondary"
              onClick={() => downloadCsv(settlement, workplace === 'all' ? '' : workplace)}
            >
              <Download className="h-4 w-4" />
              CSV 받기
            </Button>
            <Button
              disabled={saveSettlement.isPending}
              onClick={() => saveSettlement.mutate({ year, month })}
            >
              <Save className="h-4 w-4" />
              {saveSettlement.isPending ? '저장 중…' : '월말 확정'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm w-full sm:w-auto">
          <span className="stripe-label">연도</span>
          <select className="stripe-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}년
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm w-full sm:w-auto">
          <span className="stripe-label">월</span>
          <select className="stripe-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((item) => (
              <option key={item} value={item}>
                {item}월
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm w-full sm:w-auto sm:min-w-[160px]">
          <span className="stripe-label">사업장</span>
          <select className="stripe-input" value={workplace} onChange={(e) => setWorkplace(e.target.value)}>
            <option value="all">전체 사업장</option>
            {settlement.workplaces.map((group) => (
              <option key={group.workplace} value={group.workplace}>
                {group.workplace}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {message}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {errorMessage}
        </div>
      )}
      {settlement.saved && (
        <div className="mb-4 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {settlement.year}년 {settlement.month}월 IFRS 연차부채를 {settlement.saved.generatedAt}에 확정했습니다.
        </div>
      )}
      {(saveSettlement.isError || updateWage.isError) && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {saveSettlement.error?.message || updateWage.error?.message || '요청에 실패했습니다.'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <LeaveSummaryCard title="대상 인원" value={visibleTotals.employeeCount} unit="명" subtitle="월말 재직 + 당월 퇴사" />
        <LeaveSummaryCard title="잔여 합계" value={visibleTotals.remaining} subtitle="월말 미사용(음수는 0)" />
        <LeaveSummaryCard
          title="부채 합계"
          value={visibleTotals.allowance.toLocaleString('ko-KR')}
          unit="원"
          subtitle="일급 × max(0, 잔여)"
          highlight
        />
        <LeaveSummaryCard
          title="통상임금 미입력"
          value={visibleTotals.wageMissingCount}
          unit="명"
          subtitle="부채 계산 전 입력 필요"
        />
      </div>

      <p className="text-[13px] text-stripe-muted mb-6">
        {settlement.note} 통상임금은 양식을 내려받아 사번 기준으로 업로드할 수 있습니다.
      </p>

      {visibleGroups.map((group) => (
        <Panel key={group.workplace} className="mb-6">
          <PanelHeader
            title={group.workplace}
            description={`${group.employeeCount}명 · 잔여 ${group.remaining}일 · 수당 ${formatWon(group.allowance)}`}
            actions={<Badge variant="primary">{formatWon(group.allowance)}</Badge>}
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
                        입사 {emp.hireDate || '—'} · {emp.department} · 잔여 {emp.remaining}일
                      </p>
                    </div>
                    <Badge variant={emp.wageMissing ? 'warning' : 'success'}>
                      {emp.wageMissing ? '미입력' : formatWon(emp.allowance)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="stripe-input flex-1"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="월 통상임금"
                      value={wageValue(emp)}
                      onChange={(e) =>
                        setDraftWages((prev) => ({ ...prev, [emp.id]: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={updateWage.isPending}
                      onClick={() => handleSaveWage(emp)}
                    >
                      저장
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="settlement-table stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <colgroup>
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>사번</th>
                    <th>입사일</th>
                    <th>부서</th>
                    <th>상태</th>
                    <th className="text-right">잔여</th>
                    <th className="text-right">초과이월</th>
                    <th>월 통상임금</th>
                    <th className="text-right">일급</th>
                    <th className="text-right">부채금액</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {group.employees.map((emp) => (
                    <tr key={emp.id}>
                      <td className="font-medium whitespace-nowrap">{emp.name}</td>
                      <td className="font-mono text-[13px]">{emp.empNo || '-'}</td>
                      <td className="font-mono text-[13px] whitespace-nowrap">{emp.hireDate || '—'}</td>
                      <td className="muted whitespace-nowrap">{emp.department}</td>
                      <td>
                        <Badge variant={emp.status === '재직' ? 'success' : 'warning'}>{emp.status}</Badge>
                      </td>
                      <td className="tabular-nums text-right">{emp.remaining}</td>
                      <td className="tabular-nums text-right muted whitespace-nowrap">
                        {emp.overusedDays ? emp.overusedDays : '—'}
                      </td>
                      <td>
                        <input
                          className="stripe-input font-mono text-[12px]"
                          type="number"
                          min="0"
                          step="1"
                          value={wageValue(emp)}
                          onChange={(e) =>
                            setDraftWages((prev) => ({ ...prev, [emp.id]: e.target.value }))
                          }
                          placeholder="원"
                        />
                      </td>
                      <td className="tabular-nums text-right muted whitespace-nowrap">
                        {emp.dailyRate == null ? '—' : formatWon(emp.dailyRate)}
                      </td>
                      <td className="tabular-nums text-right font-medium whitespace-nowrap">
                        {emp.allowance == null ? '—' : formatWon(emp.allowance)}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                          disabled={updateWage.isPending}
                          onClick={() => handleSaveWage(emp)}
                        >
                          저장
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}
