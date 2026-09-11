import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Save, Search } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LeaveSummaryCard } from '../../components/LeaveSummaryCard';
import { OrdinaryWageCsvActions } from '../../components/OrdinaryWageCsvActions';
import {
  useLeaveEventSettlement,
  useSaveLeaveEventSettlement,
  useUpdateOrdinaryWage,
} from '../../hooks/useLeaveData';
function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatWon(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
}

function eventBadgeVariant(type) {
  if (type === 'resignation') return 'warning';
  if (type === 'first_year') return 'info';
  if (type === 'prorated') return 'purple';
  return 'success';
}

function statusBadgeVariant(emp) {
  if (emp.isUpcoming) return 'info';
  if (emp.inPayrollWindow || emp.statusLabel === '급여일 대기') return 'warning';
  return 'success';
}

const compactBadgeClass = 'whitespace-nowrap text-[11px] px-1.5 py-0 leading-5';

function matchesEventTypeFilter(emp, eventTypeFilter) {
  if (!eventTypeFilter || eventTypeFilter === 'all') return true;
  if (eventTypeFilter === 'fiscal_annual') {
    return emp.eventType === 'fiscal_annual' || emp.eventType === 'prorated';
  }
  return emp.eventType === eventTypeFilter;
}

function matchesNameOrEmpNo(emp, query) {
  const keyword = String(query || '').trim().toLowerCase();
  if (!keyword) return true;
  return [emp.name, emp.empNo]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keyword));
}

function sortValue(emp, key) {
  switch (key) {
    case 'name':
      return emp.name || '';
    case 'empNo':
      return emp.empNo || '';
    case 'hireDate':
      return emp.hireDate || '';
    case 'eventDate':
      return emp.eventDate || '';
    case 'eventType':
      return emp.eventTypeLabel || '';
    case 'status':
      return emp.statusLabel || '';
    case 'settledDays':
      return Number(emp.settledDays) || 0;
    case 'overusedDays':
      return Number(emp.overusedDays) || 0;
    case 'ordinaryWage':
      return Number(emp.ordinaryWage) || 0;
    case 'dailyRate':
      return Number(emp.dailyRate) || 0;
    case 'allowance':
      return Number(emp.allowance) || 0;
    default:
      return '';
  }
}

function compareEmployees(a, b, sort) {
  const va = sortValue(a, sort.key);
  const vb = sortValue(b, sort.key);
  const cmp =
    typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'ko', { numeric: true });
  return sort.dir === 'desc' ? -cmp : cmp;
}

function SortButton({ label, column, sort, onSort, className = '' }) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 text-inherit font-inherit whitespace-nowrap ${className}`}
    >
      {label}
      {active ? (
        sort.dir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

function downloadCsv(settlement, workplaceFilter, eventTypeFilter, query = '') {
  const groups =
    workplaceFilter && workplaceFilter !== 'all'
      ? settlement.workplaces.filter((group) => group.workplace === workplaceFilter)
      : settlement.workplaces;
  const rows = [
    [
      '기준연도',
      '정산일',
      '정산유형',
      '상태',
      '사업장',
      '사번',
      '이름',
      '부서',
      '직급',
      '입사일',
      '퇴사일',
      '정산일수',
      '초과이월',
      '월통상임금',
      '일급',
      '연차수당',
      '설명',
    ],
  ];

  for (const group of groups) {
    for (const emp of group.employees) {
      if (eventTypeFilter !== 'all' && !matchesEventTypeFilter(emp, eventTypeFilter)) continue;
      if (!matchesNameOrEmpNo(emp, query)) continue;
      rows.push([
        settlement.year,
        emp.eventDate,
        emp.eventTypeLabel,
        emp.statusLabel || (emp.isUpcoming ? '도래 예정' : '도래'),
        emp.workplace,
        emp.empNo,
        emp.name,
        emp.department,
        emp.position,
        emp.hireDate,
        emp.terminatedDate || '',
        emp.settledDays,
        emp.overusedDays || 0,
        emp.ordinaryWage ?? '',
        emp.dailyRate ?? '',
        emp.allowance ?? '',
        emp.description,
      ]);
    }
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `연차정산-${settlement.year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminLeaveEventSettlement() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [workplace, setWorkplace] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'eventDate', dir: 'asc' });
  const [draftWages, setDraftWages] = useState({});
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { data: settlement, isLoading, isError, refetch } = useLeaveEventSettlement(year);
  const saveSettlement = useSaveLeaveEventSettlement();
  const updateWage = useUpdateOrdinaryWage();

  const years = useMemo(() => {
    if (settlement?.availableYears?.length) return settlement.availableYears;
    const current = new Date().getFullYear();
    return [current - 5, current - 4, current - 3, current - 2, current - 1, current, current + 1, current + 2];
  }, [settlement]);

  const visibleGroups = useMemo(() => {
    if (!settlement) return [];
    const groups =
      workplace === 'all'
        ? settlement.workplaces
        : settlement.workplaces.filter((group) => group.workplace === workplace);

    return groups
      .map((group) => {
        const employees = group.employees
          .filter((emp) => matchesEventTypeFilter(emp, eventType) && matchesNameOrEmpNo(emp, query))
          .sort((a, b) => compareEmployees(a, b, sort));
        const settledDays = employees.reduce((sum, emp) => sum + emp.settledDays, 0);
        const allowance = employees.reduce((sum, emp) => sum + (emp.allowance || 0), 0);
        const wageMissingCount = employees.filter((emp) => emp.wageMissing).length;
        return {
          ...group,
          employees,
          eventCount: employees.length,
          settledDays: Math.round(settledDays * 10) / 10,
          allowance: Math.round(allowance),
          wageMissingCount,
        };
      })
      .filter((group) => group.eventCount > 0);
  }, [settlement, workplace, eventType, query, sort]);

  const workplaceOptions = settlement?.workplaceOptions?.length
    ? settlement.workplaceOptions
    : settlement?.workplaces || [];

  const visibleTotals = useMemo(() => {
    return visibleGroups.reduce(
      (acc, group) => ({
        eventCount: acc.eventCount + group.eventCount,
        employeeCount: acc.employeeCount + new Set(group.employees.map((e) => e.employeeId)).size,
        settledDays: Math.round((acc.settledDays + group.settledDays) * 10) / 10,
        allowance: acc.allowance + group.allowance,
        wageMissingCount: acc.wageMissingCount + group.wageMissingCount,
      }),
      { eventCount: 0, employeeCount: 0, settledDays: 0, allowance: 0, wageMissingCount: 0 }
    );
  }, [visibleGroups]);

  function wageValue(emp) {
    if (Object.prototype.hasOwnProperty.call(draftWages, emp.employeeId)) {
      return draftWages[emp.employeeId];
    }
    return emp.ordinaryWage == null ? '' : String(emp.ordinaryWage);
  }

  async function handleSaveWage(emp) {
    const raw = wageValue(emp);
    const ordinaryWage = raw === '' ? null : Number(String(raw).replace(/,/g, ''));
    if (raw !== '' && (!Number.isFinite(ordinaryWage) || ordinaryWage < 0)) {
      setMessage('통상임금은 0 이상의 숫자로 입력해주세요.');
      return;
    }
    await updateWage.mutateAsync({ id: emp.employeeId, ordinaryWage });
    setDraftWages((prev) => {
      const next = { ...prev };
      delete next[emp.employeeId];
      return next;
    });
    setMessage(`${emp.name} 통상임금을 저장했습니다.`);
    setTimeout(() => setMessage(''), 3000);
  }

  function handleSort(column) {
    setSort((prev) =>
      prev.key === column ? { key: column, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: column, dir: 'asc' }
    );
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

  if (!settlement) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="연차 정산"
        description={`${settlement.year}년 도래 정산(미래 포함) · ${settlement.formula}`}
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
              onClick={() => downloadCsv(settlement, workplace, eventType, query)}
            >
              <Download className="h-4 w-4" />
              CSV 받기
            </Button>
            <Button
              disabled={saveSettlement.isPending}
              onClick={() => saveSettlement.mutate({ year })}
            >
              <Save className="h-4 w-4" />
              {saveSettlement.isPending ? '저장 중…' : '정산 확정'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm w-full min-w-0 sm:min-w-[220px] sm:flex-1">
          <span className="stripe-label">이름 / 사번</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
            <input
              className="stripe-input stripe-input-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 또는 사번 검색"
            />
          </div>
        </label>
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
        <label className="text-sm w-full sm:w-auto sm:min-w-[160px]">
          <span className="stripe-label">사업장</span>
          <select className="stripe-input" value={workplace} onChange={(e) => setWorkplace(e.target.value)}>
            <option value="all">전체 사업장</option>
            {workplaceOptions.map((group) => (
              <option key={group.workplace} value={group.workplace}>
                {group.workplace}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm w-full sm:w-auto sm:min-w-[160px]">
          <span className="stripe-label">정산 유형</span>
          <select className="stripe-input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="all">전체</option>
            {settlement.eventTypes
              .filter((item) => item.value !== 'prorated')
              .map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
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
          {settlement.year}년 연차 정산을 {settlement.saved.generatedAt}에 확정했습니다.
        </div>
      )}
      {(saveSettlement.isError || updateWage.isError) && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {saveSettlement.error?.message || updateWage.error?.message || '요청에 실패했습니다.'}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <LeaveSummaryCard title="정산 건수" value={visibleTotals.eventCount} unit="건" subtitle={`${visibleTotals.employeeCount}명`} />
        <LeaveSummaryCard title="정산일수" value={visibleTotals.settledDays} subtitle="전기 잔여 합 (부여일 아님)" />
        <LeaveSummaryCard
          title="수당 합계"
          value={visibleTotals.allowance.toLocaleString('ko-KR')}
          unit="원"
          subtitle="일급 × 전기 잔여"
          highlight
        />
        <LeaveSummaryCard
          title="통상임금 미입력"
          value={visibleTotals.wageMissingCount}
          unit="건"
          subtitle="수당 계산 전 입력 필요"
        />
      </div>

      <p className="text-[13px] text-stripe-muted mb-6">
        {settlement.note} 통상임금은 양식을 내려받아 사번 기준으로 업로드할 수 있습니다.
      </p>

      {visibleGroups.length === 0 ? (
        <Panel>
          <p className="py-12 text-center text-sm text-stripe-muted">해당 조건의 정산 대상이 없습니다.</p>
        </Panel>
      ) : (
        visibleGroups.map((group) => (
          <Panel key={group.workplace} className="mb-6">
            <PanelHeader
              title={group.workplace}
              description={`${group.eventCount}건 · 정산 ${group.settledDays}일 · 수당 ${formatWon(group.allowance)}`}
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
                          입사 {emp.hireDate || '—'} · {emp.eventDate} · 지급 {emp.settledDays}일
                          {emp.overusedDays ? ` · 초과이월 ${emp.overusedDays}일` : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={eventBadgeVariant(emp.eventType)} className={compactBadgeClass}>
                          {emp.eventTypeLabel}
                        </Badge>
                        <Badge variant={statusBadgeVariant(emp)} className={compactBadgeClass}>
                          {emp.statusLabel || (emp.isUpcoming ? '도래 예정' : '도래')}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-stripe-muted mt-2">{emp.description}</p>
                    <div className="mt-3 flex gap-2">
                      <input
                        className="stripe-input flex-1"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="월 통상임금"
                        value={wageValue(emp)}
                        onChange={(e) =>
                          setDraftWages((prev) => ({ ...prev, [emp.employeeId]: e.target.value }))
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
                    <p className="text-sm tabular-nums mt-2 text-right font-medium">
                      {emp.wageMissing ? '미입력' : formatWon(emp.allowance)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="settlement-table stripe-table-fit-wrap">
                <table className="stripe-table stripe-table-fit w-full">
                  <colgroup>
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '4%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <SortButton label="이름" column="name" sort={sort} onSort={handleSort} />
                      </th>
                      <th>
                        <SortButton label="사번" column="empNo" sort={sort} onSort={handleSort} />
                      </th>
                      <th>
                        <SortButton label="입사일" column="hireDate" sort={sort} onSort={handleSort} />
                      </th>
                      <th className="whitespace-nowrap">
                        <SortButton label="정산일" column="eventDate" sort={sort} onSort={handleSort} />
                      </th>
                      <th className="whitespace-nowrap">
                        <SortButton label="유형" column="eventType" sort={sort} onSort={handleSort} />
                      </th>
                      <th className="whitespace-nowrap">
                        <SortButton label="상태" column="status" sort={sort} onSort={handleSort} />
                      </th>
                      <th className="text-right whitespace-nowrap">
                        <SortButton
                          label="정산일수"
                          column="settledDays"
                          sort={sort}
                          onSort={handleSort}
                          className="ml-auto"
                        />
                      </th>
                      <th className="text-right whitespace-nowrap">
                        <SortButton
                          label="초과이월"
                          column="overusedDays"
                          sort={sort}
                          onSort={handleSort}
                          className="ml-auto"
                        />
                      </th>
                      <th>
                        <SortButton label="월 통상임금" column="ordinaryWage" sort={sort} onSort={handleSort} />
                      </th>
                      <th className="text-right">
                        <SortButton label="일급" column="dailyRate" sort={sort} onSort={handleSort} className="ml-auto" />
                      </th>
                      <th className="text-right">
                        <SortButton label="연차수당" column="allowance" sort={sort} onSort={handleSort} className="ml-auto" />
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {group.employees.map((emp) => (
                      <tr key={emp.id}>
                        <td className="font-medium whitespace-nowrap">{emp.name}</td>
                        <td className="font-mono text-[13px]">{emp.empNo || '-'}</td>
                        <td className="font-mono text-[13px] whitespace-nowrap">{emp.hireDate || '—'}</td>
                        <td className="font-mono text-[13px] whitespace-nowrap">{emp.eventDate}</td>
                        <td className="whitespace-nowrap">
                          <Badge variant={eventBadgeVariant(emp.eventType)} className={compactBadgeClass}>
                            {emp.eventTypeLabel}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap">
                          <Badge variant={statusBadgeVariant(emp)} className={compactBadgeClass}>
                            {emp.statusLabel || (emp.isUpcoming ? '도래 예정' : '도래')}
                          </Badge>
                        </td>
                        <td className="tabular-nums text-right">{emp.settledDays}</td>
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
                              setDraftWages((prev) => ({ ...prev, [emp.employeeId]: e.target.value }))
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
        ))
      )}
    </div>
  );
}
