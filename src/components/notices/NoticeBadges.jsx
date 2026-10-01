import { Pin } from 'lucide-react';
import { Badge } from '../ui/Badge';

/** 공지 제목 앞뒤에 붙는 고정·필독·대상·미확인 표시 */
export function NoticeBadges({ notice }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {notice.pinned && <Pin className="h-3.5 w-3.5 text-primary-500" aria-label="상단 고정" />}
      {notice.mustRead && <Badge variant="warning">필독</Badge>}
      {notice.workplaceCode && <Badge variant="default">{notice.workplaceName}</Badge>}
      {notice.mustRead && !notice.readAt && <Badge variant="danger">미확인</Badge>}
    </span>
  );
}
