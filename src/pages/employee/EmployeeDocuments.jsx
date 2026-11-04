import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DocumentStatusBadge } from '../../components/documents/DocumentBadges';
import { useDocumentBox } from '../../hooks/useDocuments';

const BOXES = [
  { key: 'todo', label: '결재할 문서', empty: '결재할 문서가 없습니다.' },
  { key: 'drafted', label: '내 기안', empty: '기안한 문서가 없습니다.' },
  { key: 'processed', label: '처리한 문서', empty: '결재한 문서가 없습니다.' },
  { key: 'refs', label: '참조 문서', empty: '참조로 받은 문서가 없습니다.' },
];

/** 전자결재: 결재할 문서·내 기안·처리한 문서·참조 문서 */
export function EmployeeDocuments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const box = BOXES.some((b) => b.key === params.get('box')) ? params.get('box') : 'todo';
  const { data, isLoading, isError, error, refetch } = useDocumentBox(box);
  const current = BOXES.find((b) => b.key === box);

  return (
    <div>
      <PageHeader
        title="전자결재"
        description="출장·경조금·교육 신청과 일반 기안을 올리고 결재합니다. 결재선은 연차와 같이 직위에 따라 정해집니다."
        actions={
          <Button onClick={() => navigate('/employee/documents/new')}>
            <Plus className="h-4 w-4" /> 새 기안
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-stripe-border">
        {BOXES.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setParams(b.key === 'todo' ? {} : { box: b.key }, { replace: true })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              box === b.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-stripe-muted hover:text-stripe-text'
            }`}
          >
            {b.label}
            {b.key === 'todo' && data?.todoCount > 0 && (
              <span className="ml-1.5 rounded-full bg-[#df1b41] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {data.todoCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage message={error?.message} onRetry={() => refetch()} />
        ) : !data.items.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">{current.empty}</p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>문서</th>
                  <th>기안자</th>
                  <th>상태</th>
                  <th>기안일</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        to={`/employee/documents/${item.id}`}
                        className="font-medium text-stripe-text hover:text-primary-600"
                      >
                        {item.title}
                      </Link>
                      {item.unread && (
                        <Badge variant="primary" className="ml-1.5">
                          새 문서
                        </Badge>
                      )}
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
                      <div className="mt-0.5 text-[12px] text-stripe-muted">
                        {item.status === 'pending' ? `${item.currentRole === '인사' ? '인사 확인' : item.currentRole} 대기` : item.documentNo}
                      </div>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[13px]">{item.submittedAt.slice(0, 10)}</td>
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
