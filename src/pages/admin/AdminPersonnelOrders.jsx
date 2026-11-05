import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, FilePlus } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { DOC_FORM_MAP, ORDER_TYPES } from '../../constants/approvalDocs';
import { usePersonnelOrders } from '../../hooks/useDocuments';
import { leaveApi } from '../../api/leaveApi';

const DRAFT_PATH = '/employee/documents/new?form=personnel_order';
const BACK_STATE = { backTo: '/admin/personnel-orders', backLabel: '인사명령 대장' };

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 같은 인사명령의 대상자 줄을 묶어 발령번호·발령일·구분·비고 칸을 한 번만 그립니다. */
function groupByDocument(items) {
  const groups = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.documentId === item.documentId) last.items.push(item);
    else groups.push({ documentId: item.documentId, items: [item] });
  }
  return groups;
}

/** 종이 결재로 먼저 쓴 발령번호 안내: { 2026: 14 } → "2026년 1~13호" */
function paperNumberNote(year) {
  const numberFrom = DOC_FORM_MAP.personnel_order?.numberFrom || {};
  const years = Object.entries(numberFrom)
    .filter(([y, from]) => Number(from) > 1 && (!year || Number(y) === Number(year)))
    .map(([y, from]) => `${y}년 ${Number(from) === 2 ? '1호' : `1~${Number(from) - 1}호`}`);
  return years.length ? `${years.join(', ')}는 종이 결재로 발령해 이 대장에 없습니다.` : '';
}

/** 인사명령 대장: 결재가 끝난 인사명령(전자결재)을 대상자별로 모아 봅니다. */
export function AdminPersonnelOrders() {
  const navigate = useNavigate();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [orderType, setOrderType] = useState('');
  const [q, setQ] = useState('');
  const filters = useMemo(
    () => Object.fromEntries(Object.entries({ year, orderType, q: q.trim() }).filter(([, v]) => v)),
    [year, orderType, q]
  );
  const { data = [], isLoading, isError, error, refetch } = usePersonnelOrders(filters);
  const [csvError, setCsvError] = useState('');
  const groups = useMemo(() => groupByDocument(data), [data]);
  const note = paperNumberNote(year);

  async function handleCsv() {
    setCsvError('');
    try {
      saveBlob(
        await leaveApi.downloadCsv(`/admin/personnel-orders/export?${new URLSearchParams(filters)}`),
        `인사명령대장_${year || '전체'}.csv`
      );
    } catch (err) {
      setCsvError(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="인사명령 대장"
        description="전자결재로 결재가 끝난 인사명령이 발령번호 순으로 자동 기록됩니다. 한 명령에 대상자가 여럿이면 한 사람씩 줄을 나눕니다."
        actions={
          <>
            <Button variant="secondary" onClick={handleCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button onClick={() => navigate(DRAFT_PATH)}>
              <FilePlus className="h-4 w-4" /> 인사명령 기안
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <select className="stripe-input" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">전체 연도</option>
          {[0, 1, 2].map((offset) => (
            <option key={offset} value={thisYear - offset}>
              {thisYear - offset}년
            </option>
          ))}
        </select>
        <select className="stripe-input" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
          <option value="">전체 발령 구분</option>
          {ORDER_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          className="stripe-input"
          placeholder="성명·발령번호·소속·직위·비고"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {csvError && <p className="mb-3 text-sm text-[#df1b41]">{csvError}</p>}

      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage message={error?.message} onRetry={() => refetch()} />
        ) : !data.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">조건에 맞는 인사명령이 없습니다.</p>
            {note && <p className="pb-4 text-center text-[13px] text-stripe-muted">{note}</p>}
          </PanelBody>
        ) : (
          <>
            <div className="border-b border-stripe-border px-5 py-2.5 text-[13px] text-stripe-muted">
              명령 {groups.length}건 · 대상자 {data.length}명{note && ` · ${note}`}
            </div>
            <div className="stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <thead>
                  <tr>
                    <th>발령번호</th>
                    <th>발령일</th>
                    <th>발령 구분</th>
                    <th>성명</th>
                    <th>직종</th>
                    <th>소속</th>
                    <th>직위</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) =>
                    group.items.map((item, index) => {
                      const first = index === 0;
                      const span = group.items.length;
                      return (
                        <tr key={item.key}>
                          {first && (
                            <>
                              <td rowSpan={span} className="whitespace-nowrap align-top">
                                <Link
                                  to={`/admin/documents/${item.documentId}`}
                                  state={BACK_STATE}
                                  className="font-medium text-stripe-text hover:text-primary-600"
                                >
                                  {item.orderNo || item.documentNo}
                                </Link>
                              </td>
                              <td rowSpan={span} className="whitespace-nowrap align-top font-mono text-[13px]">
                                {item.effectiveDate || '-'}
                              </td>
                              <td rowSpan={span} className="whitespace-nowrap align-top">
                                {item.orderType || '-'}
                              </td>
                            </>
                          )}
                          <td className="whitespace-nowrap">
                            {item.employeeId ? (
                              <Link to={`/admin/personnel/${item.employeeId}`} className="font-medium hover:text-primary-600">
                                {item.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{item.name}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">{item.jobType || '-'}</td>
                          <td>
                            {[item.workplace, item.department].filter(Boolean).join(' ') || '-'}
                          </td>
                          <td className="whitespace-nowrap">{item.position || '-'}</td>
                          {first && (
                            <td rowSpan={span} className="align-top text-[13px] text-stripe-muted">
                              {item.note || ''}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
