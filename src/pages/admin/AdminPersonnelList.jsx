import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { PersonnelCsvActions } from '../../components/personnel/PersonnelCsvActions';
import { useEmployeeRoster } from '../../hooks/useEmployeeRoster';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import { hasPermission, isScopedPermission } from '../../utils/access';
import { RECORD_CATEGORIES, RECORD_CSV_LABELS } from '../../constants/personnel';

const CSV_FIELD_ORDER = ['startDate', 'endDate', 'title', 'organization', 'result', 'detail'];

function CsvGuide() {
  return (
    <Panel className="mb-5">
      <PanelHeader
        title="CSV 올리기 안내"
        description="내려받은 파일이 곧 양식입니다. 한 줄이라도 오류가 있으면 아무것도 반영하지 않고 오류 행을 알려 드립니다."
      />
      <PanelBody>
        <ul className="text-sm text-stripe-text space-y-1 mb-4 list-disc pl-5">
          <li>기본정보·병역: 사번 기준으로 덮어씁니다. 머리글에서 뺀 열은 바뀌지 않습니다.</li>
          <li>이력: ID가 있는 행은 그 이력을 고치고, ID가 빈 행은 새로 추가합니다. 똑같은 이력은 건너뜁니다.</li>
          <li>날짜는 2024-03-02, 2024.3.2, 20240302 모두 됩니다. 이력은 2024-03처럼 연월만 써도 됩니다.</li>
        </ul>
        <div className="stripe-table-fit-wrap">
          <table className="stripe-table stripe-table-fit w-full">
            <thead>
              <tr>
                <th>구분</th>
                {CSV_FIELD_ORDER.map((key) => (
                  <th key={key}>{RECORD_CSV_LABELS[key]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECORD_CATEGORIES.map((category) => (
                <tr key={category.key}>
                  <td className="font-medium whitespace-nowrap">{category.label}</td>
                  {CSV_FIELD_ORDER.map((key) => (
                    <td key={key} className="muted whitespace-nowrap">
                      {category.fields[key] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function AdminPersonnelList() {
  const { data: roster, isLoading, isError, refetch } = useEmployeeRoster(true);
  const { data: currentEmployee } = useCurrentEmployee();
  const canEdit = hasPermission(currentEmployee, 'records.edit');
  const scoped = isScopedPermission(currentEmployee, 'records.view');
  const [query, setQuery] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [status, setStatus] = useState('active');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const workplaces = useMemo(
    () => [...new Set((roster || []).map((e) => e.workplace).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [roster]
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (roster || []).filter((emp) => {
      if (workplace && emp.workplace !== workplace) return false;
      if (status === 'active' && !emp.isActive) return false;
      if (status === 'inactive' && emp.isActive) return false;
      if (!keyword) return true;
      return [emp.name, emp.empNo, emp.department, emp.position].filter(Boolean).join(' ').toLowerCase().includes(keyword);
    });
  }, [roster, query, workplace, status]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title="인사기록카드"
        description={`${scoped ? '담당 사업장 · ' : ''}${filtered.length}명`}
        actions={
          canEdit && (
            <PersonnelCsvActions
              onMessage={(text) => {
                setErrorMessage('');
                setMessage(text);
              }}
              onError={(text) => {
                setMessage('');
                setErrorMessage(text);
              }}
            />
          )
        }
      >
        {canEdit && (
          <button
            type="button"
            className="mt-2 text-xs text-primary-500 hover:text-primary-600"
            onClick={() => setShowGuide((v) => !v)}
          >
            {showGuide ? 'CSV 안내 닫기' : 'CSV 올리기 안내 보기'}
          </button>
        )}
      </PageHeader>

      {message && (
        <div className="mb-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#09825d]">{message}</div>
      )}
      {errorMessage && (
        <div className="mb-4 whitespace-pre-line rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {errorMessage}
        </div>
      )}
      {canEdit && showGuide && <CsvGuide />}

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
          <input
            className="stripe-input stripe-input-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 사번, 부서 검색"
          />
        </div>
        <select className="stripe-input" value={workplace} onChange={(e) => setWorkplace(e.target.value)}>
          <option value="">사업장 전체</option>
          {workplaces.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="stripe-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">상태 전체</option>
          <option value="active">재직</option>
          <option value="inactive">퇴사</option>
        </select>
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-stripe-muted">검색 결과가 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>사번</th>
                  <th>사업장</th>
                  <th>부서</th>
                  <th>직급</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className={!emp.isActive ? 'opacity-60' : ''}>
                    <td className="font-medium whitespace-nowrap">{emp.name}</td>
                    <td className="font-mono text-[13px] muted whitespace-nowrap">{emp.empNo || '-'}</td>
                    <td className="muted whitespace-nowrap">{emp.workplace || '-'}</td>
                    <td className="muted whitespace-nowrap">{emp.department || '-'}</td>
                    <td className="muted whitespace-nowrap">{emp.position || '-'}</td>
                    <td>{emp.isActive ? <Badge variant="success">재직</Badge> : <Badge variant="default">퇴사</Badge>}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        to={`/admin/personnel/${emp.id}`}
                        className="text-[13px] font-medium text-primary-500 hover:text-primary-600"
                      >
                        인사카드
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
