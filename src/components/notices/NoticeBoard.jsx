import { Link } from 'react-router-dom';
import { AlertCircle, Megaphone, Paperclip } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel';
import { LoadingSpinner } from '../LoadingSpinner';
import { useNotices } from '../../hooks/useNotices';
import { NoticeBadges } from './NoticeBadges';

const HOME_LIMIT = 6;

/** 홈 화면 상단의 사내 공지 */
export function NoticeBoard() {
  const { data, isLoading, isError } = useNotices(HOME_LIMIT);
  const notices = data?.notices || [];

  return (
    <Panel className="mb-8">
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary-500" />
            사내 공지
          </span>
        }
        description={data ? `전체 ${data.total}건` : undefined}
        actions={
          <Link to="/employee/notices" className="text-sm text-primary-600 hover:text-primary-700">
            전체 보기
          </Link>
        }
      />
      {data?.unreadMustRead > 0 && (
        <div className="flex items-center gap-2 border-b border-stripe-border bg-[#fff8eb] px-5 py-2.5 text-[13px] text-[#9a5b00]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          확인하지 않은 필독 공지가 {data.unreadMustRead}건 있습니다. 공지를 열어 확인 버튼을 눌러주세요.
        </div>
      )}
      {isLoading ? (
        <div className="py-8 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-stripe-muted">공지를 불러오지 못했습니다.</p>
      ) : notices.length === 0 ? (
        <p className="py-8 text-center text-sm text-stripe-muted">등록된 공지가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[#f0f3f7]">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link
                to={`/employee/notices/${notice.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[#f6f9fc] transition-colors"
              >
                <NoticeBadges notice={notice} />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${notice.pinned ? 'font-medium text-stripe-text' : 'text-stripe-text'}`}
                >
                  {notice.title}
                </span>
                {notice.fileCount > 0 && <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-stripe-muted" />}
                <span className="flex-shrink-0 font-mono text-[12px] text-stripe-muted">{notice.createdAt.slice(0, 10)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
