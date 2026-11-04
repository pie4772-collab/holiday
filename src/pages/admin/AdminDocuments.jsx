import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { DocumentStatusBadge } from '../../components/documents/DocumentBadges';
import { DOC_FORMS, DOC_STATUS_LABELS } from '../../constants/approvalDocs';
import { useAdminDocuments } from '../../hooks/useDocuments';
import { leaveApi } from '../../api/leaveApi';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 전자결재 문서함: 전체 문서 검색, 대리 처리(문서 보기에서), CSV */
export function AdminDocuments() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [form, setForm] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const filters = useMemo(
    () => Object.fromEntries(Object.entries({ year, form, status, q: q.trim() }).filter(([, v]) => v)),
    [year, form, status, q]
  );
  const { data = [], isLoading, isError, error, refetch } = useAdminDocuments(filters);
  const [csvError, setCsvError] = useState('');

  async function handleCsv() {
    setCsvError('');
    try {
      saveBlob(await leaveApi.downloadCsv(`/admin/documents/export?${new URLSearchParams(filters)}`), `전자결재_${year || '전체'}.csv`);
    } catch (err) {
      setCsvError(err.message);
    }
  }

  const pending = data.filter((item) => item.status === 'pending').length;
  return (
    <div>
      <PageHeader
        title="전자결재 문서함"
        description="모든 전자결재 문서를 봅니다. 진행 중인 문서는 열어서 어느 단계든 대리로 승인·반려할 수 있고, 대리 처리는 결재란에 표시됩니다."
        actions={
          <Button variant="secondary" onClick={handleCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <select className="stripe-input" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">전체 연도</option>
          {[0, 1, 2].map((offset) => (
            <option key={offset} value={thisYear - offset}>
              {thisYear - offset}년
            </option>
          ))}
        </select>
        <select className="stripe-input" value={form} onChange={(e) => setForm(e.target.value)}>
          <option value="">전체 양식</option>
          {DOC_FORMS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <select className="stripe-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 상태</option>
          {Object.entries(DOC_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="stripe-input"
          placeholder="제목·기안자·문서번호"
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
            <p className="py-8 text-center text-sm text-stripe-muted">조건에 맞는 문서가 없습니다.</p>
          </PanelBody>
        ) : (
          <>
            <div className="border-b border-stripe-border px-5 py-2.5 text-[13px] text-stripe-muted">
              {data.length}건 · 진행 중 {pending}건
            </div>
            <div className="stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <thead>
                  <tr>
                    <th>문서</th>
                    <th>기안자</th>
                    <th>상태</th>
                    <th>문서번호</th>
                    <th>기안일</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/admin/documents/${item.id}`} className="font-medium text-stripe-text hover:text-primary-600">
                          {item.title}
                        </Link>
                        <div className="text-[12px] text-stripe-muted">
                          {item.formLabel}
                          {item.summary && ` · ${item.summary}`}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {item.drafter.name}
                        <div className="text-[12px] text-stripe-muted">{item.drafter.department}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        <DocumentStatusBadge status={item.status} />
                        {item.status === 'pending' && (
                          <div className="mt-0.5 text-[12px] text-stripe-muted">
                            {item.currentRole === '인사' ? '인사 확인' : item.currentRole} 대기
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap font-mono text-[13px]">{item.documentNo || '-'}</td>
                      <td className="whitespace-nowrap font-mono text-[13px]">{item.submittedAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
