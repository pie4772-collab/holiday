import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Paperclip, PenSquare } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { NoticeBadges } from '../../components/notices/NoticeBadges';
import { NoticeFormModal } from '../../components/notices/NoticeFormModal';
import { useNotices } from '../../hooks/useNotices';

export function EmployeeNotices() {
  const { data, isLoading, isError, error, refetch } = useNotices();
  const [writing, setWriting] = useState(false);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title="공지사항"
        description={`전체 ${data.total}건${data.unreadMustRead ? ` · 확인하지 않은 필독 ${data.unreadMustRead}건` : ''}`}
        actions={
          data.canCreate && (
            <Button onClick={() => setWriting(true)}>
              <PenSquare className="h-4 w-4" />
              공지 쓰기
            </Button>
          )
        }
      />
      <Panel>
        {data.notices.length === 0 ? (
          <p className="py-12 text-center text-sm text-stripe-muted">등록된 공지가 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>제목</th>
                  <th>대상</th>
                  <th>작성자</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {data.notices.map((notice) => (
                  <tr key={notice.id}>
                    <td>
                      <Link
                        to={`/employee/notices/${notice.id}`}
                        className="inline-flex flex-wrap items-center gap-2 text-stripe-text hover:text-primary-600"
                      >
                        <NoticeBadges notice={notice} />
                        <span className={notice.pinned ? 'font-medium' : ''}>{notice.title}</span>
                        {notice.fileCount > 0 && <Paperclip className="h-3.5 w-3.5 text-stripe-muted" />}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{notice.workplaceName}</td>
                    <td className="whitespace-nowrap">{notice.authorName || '-'}</td>
                    <td className="whitespace-nowrap font-mono text-[13px]">{notice.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {writing && (
        <NoticeFormModal
          onClose={() => setWriting(false)}
          onSaved={(saved) => {
            setWriting(false);
            navigate(`/employee/notices/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
