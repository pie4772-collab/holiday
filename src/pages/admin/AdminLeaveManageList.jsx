import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { useEmployees } from '../../hooks/useLeaveData';
import { formatDate } from '../../utils/leaveCalculations';

function phaseBadge(summary) {
  if (summary.isFirstYear) return <Badge variant="warning">첫해</Badge>;
  if (summary.isProratedTarget) return <Badge variant="purple">비례</Badge>;
  return <Badge variant="success">정규</Badge>;
}

function phaseKey(summary) {
  if (summary.isFirstYear) return 'first';
  if (summary.isProratedTarget) return 'prorated';
  return 'regular';
}

function sortValue(emp, key) {
  switch (key) {
    case 'name':
      return emp.name || '';
    case 'empNo':
      return emp.empNo || '';
    case 'workplace':
      return emp.workplace || '';
    case 'department':
      return emp.department || '';
    case 'position':
      return emp.position || '';
    case 'hireDate':
      return emp.hireDate || '';
    case 'accrued':
      return Number(emp.leaveSummary.accruedThisYear) || 0;
    case 'used':
      return Number(emp.leaveSummary.usedDays) || 0;
    case 'remaining':
      return Number(emp.leaveSummary.remaining) || 0;
    case 'status':
      return phaseKey(emp.leaveSummary);
    default:
      return '';
  }
}

function SortButton({ label, column, sort, onSort, className = '' }) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 text-inherit font-inherit ${className}`}
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

export function AdminLeaveManageList() {
  const { data: employees, isLoading, isError, refetch } = useEmployees();
  const [query, setQuery] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });

  const workplaces = useMemo(() => {
    return [...new Set((employees || []).map((emp) => emp.workplace).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ko')
    );
  }, [employees]);

  const departments = useMemo(() => {
    return [
      ...new Set(
        (employees || [])
          .filter((emp) => !workplace || emp.workplace === workplace)
          .map((emp) => emp.department)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [employees, workplace]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = (employees || []).filter((emp) => {
      if (workplace && emp.workplace !== workplace) return false;
      if (department && emp.department !== department) return false;
      if (status && phaseKey(emp.leaveSummary) !== status) return false;
      if (!keyword) return true;
      const haystack = [emp.name, emp.empNo, emp.workplace, emp.department, emp.position]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });

    return [...rows].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'ko', { numeric: true });
      return sort.dir === 'desc' ? -cmp : cmp;
    });
  }, [employees, query, workplace, department, status, sort]);

  function handleSort(column) {
    setSort((prev) =>
      prev.key === column ? { key: column, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: column, dir: 'asc' }
    );
  }

  function handleWorkplace(value) {
    setWorkplace(value);
    setDepartment('');
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  const year = employees?.[0]?.leaveSummary?.displayYear ?? new Date().getFullYear();
  const total = employees?.length ?? 0;

  return (
    <div>
      <PageHeader
        title="연차 관리"
        description={`${year}년 기준 · ${filtered.length}명${filtered.length !== total ? ` / ${total}명` : ''} · 직원별 발생·사용 내역 수정`}
      />

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
          <input
            className="stripe-input stripe-input-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 사번, 부서 검색"
          />
        </div>
        <select className="stripe-input" value={workplace} onChange={(e) => handleWorkplace(e.target.value)}>
          <option value="">사업장 전체</option>
          {workplaces.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="stripe-input" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">부서 전체</option>
          {departments.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="stripe-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">상태 전체</option>
          <option value="first">첫해</option>
          <option value="prorated">비례</option>
          <option value="regular">정규</option>
        </select>
      </div>

      <Panel>
        <div className="mobile-only mobile-card-list">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-stripe-muted">검색 결과가 없습니다.</p>
          ) : (
            filtered.map((emp) => (
              <div key={emp.id} className="mobile-card-item">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stripe-text">{emp.name}</p>
                    <p className="text-xs text-stripe-muted mt-0.5">
                      {emp.empNo && <span className="font-mono mr-1.5">{emp.empNo}</span>}
                      {emp.workplace ? `${emp.workplace} · ` : ''}
                      {emp.department}
                    </p>
                    <p className="text-xs text-stripe-muted mt-0.5">입사 {formatDate(emp.hireDate)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {phaseBadge(emp.leaveSummary)}
                    <p className="text-sm tabular-nums mt-2">
                      <span className="text-stripe-muted text-xs">잔여 </span>
                      <span
                        className={`font-medium ${
                          emp.leaveSummary.remaining < 3 ? 'text-[#df1b41]' : 'text-[#09825d]'
                        }`}
                      >
                        {emp.leaveSummary.remaining}일
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-3 pt-3 border-t border-[#f0f3f7]">
                  <Link
                    to={`/admin/employees/${emp.id}`}
                    className="flex-1 text-center text-[13px] font-medium text-primary-500 py-1.5 rounded-md bg-primary-50"
                  >
                    상세
                  </Link>
                  <Link
                    to={`/admin/leave-manage/${emp.id}`}
                    className="flex-1 text-center text-[13px] text-stripe-muted py-1.5 rounded-md bg-[#f0f3f7]"
                  >
                    연차 수정
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="desktop-only stripe-table-scroll">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-stripe-muted">검색 결과가 없습니다.</p>
          ) : (
            <table className="stripe-table w-full">
              <thead>
                <tr>
                  <th>
                    <SortButton label="이름" column="name" sort={sort} onSort={handleSort} />
                  </th>
                  <th>
                    <SortButton label="사번" column="empNo" sort={sort} onSort={handleSort} />
                  </th>
                  <th>
                    <SortButton label="사업장" column="workplace" sort={sort} onSort={handleSort} />
                  </th>
                  <th>
                    <SortButton label="부서" column="department" sort={sort} onSort={handleSort} />
                  </th>
                  <th>
                    <SortButton label="직급" column="position" sort={sort} onSort={handleSort} />
                  </th>
                  <th>
                    <SortButton label="입사일" column="hireDate" sort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-right">
                    <SortButton label="발생" column="accrued" sort={sort} onSort={handleSort} className="ml-auto" />
                  </th>
                  <th className="text-right">
                    <SortButton label="사용" column="used" sort={sort} onSort={handleSort} className="ml-auto" />
                  </th>
                  <th className="text-right">
                    <SortButton label="잔여" column="remaining" sort={sort} onSort={handleSort} className="ml-auto" />
                  </th>
                  <th>
                    <SortButton label="상태" column="status" sort={sort} onSort={handleSort} />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id}>
                    <td className="font-medium whitespace-nowrap">{emp.name}</td>
                    <td className="font-mono text-[13px] muted whitespace-nowrap">{emp.empNo || '-'}</td>
                    <td className="muted whitespace-nowrap">{emp.workplace || '-'}</td>
                    <td className="muted whitespace-nowrap">{emp.department || '-'}</td>
                    <td className="muted whitespace-nowrap">{emp.position || '-'}</td>
                    <td className="font-mono text-[13px] muted whitespace-nowrap">{formatDate(emp.hireDate)}</td>
                    <td className="tabular-nums text-right whitespace-nowrap">{emp.leaveSummary.accruedThisYear}</td>
                    <td className="tabular-nums text-right muted whitespace-nowrap">{emp.leaveSummary.usedDays}</td>
                    <td className="tabular-nums text-right whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          emp.leaveSummary.remaining < 3 ? 'text-[#df1b41]' : 'text-[#09825d]'
                        }`}
                      >
                        {emp.leaveSummary.remaining}
                      </span>
                    </td>
                    <td>{phaseBadge(emp.leaveSummary)}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        to={`/admin/leave-manage/${emp.id}`}
                        className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                      >
                        수정
                      </Link>
                      <span className="text-[#e3e8ee] mx-2">|</span>
                      <Link
                        to={`/admin/employees/${emp.id}`}
                        className="text-[13px] text-stripe-muted hover:text-stripe-text"
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
