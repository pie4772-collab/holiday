import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Download, Eye, Pencil, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { NoticeBadges } from '../../components/notices/NoticeBadges';
import { NoticeFormModal } from '../../components/notices/NoticeFormModal';
import { leaveApi } from '../../api/leaveApi';
import { DOCUMENT_EXTENSIONS } from '../../constants/personnel';
import {
  useConfirmNoticeRead,
  useDeleteNotice,
  useDeleteNoticeFile,
  useNotice,
  useNoticeReads,
  useUploadNoticeFile,
} from '../../hooks/useNotices';
import { formatFileSize, openProtectedFile } from '../../utils/fileDownload';

const ACCEPT = Object.keys(DOCUMENT_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',');

function ReadStatus({ noticeId }) {
  const { data, isLoading } = useNoticeReads(noticeId, true);
  const [showRead, setShowRead] = useState(false);
  if (isLoading || !data) return null;
  const list = showRead ? data.read : data.unread;
  return (
    <Panel className="mt-5">
      <PanelHeader
        title="필독 확인 현황"
        description={`대상 ${data.total}명 중 ${data.readCount}명 확인`}
        actions={
          <div className="flex rounded-md border border-stripe-border p-0.5 text-[12px]">
            {[
              [false, `미확인 ${data.unread.length}`],
              [true, `확인 ${data.read.length}`],
            ].map(([value, label]) => (
              <button
                key={label}
                onClick={() => setShowRead(value)}
                className={`rounded px-2 py-1 ${showRead === value ? 'bg-[#f0f3f7] text-stripe-text' : 'text-stripe-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-stripe-muted">{showRead ? '확인한 직원이 없습니다.' : '모두 확인했습니다.'}</p>
      ) : (
        <div className="stripe-table-fit-wrap max-h-80 overflow-y-auto">
          <table className="stripe-table stripe-table-fit w-full">
            <thead>
              <tr>
                <th>이름</th>
                <th>부서</th>
                <th>직급</th>
                {showRead && <th>확인 시각</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.employeeId}>
                  <td>{p.name}</td>
                  <td>{p.department || '-'}</td>
                  <td>{p.position || '-'}</td>
                  {showRead && <td className="font-mono text-[13px]">{p.readAt}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function EmployeeNoticeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: notice, isLoading, isError, error, refetch } = useNotice(id);
  const confirm = useConfirmNoticeRead();
  const remove = useDeleteNotice();
  const upload = useUploadNoticeFile();
  const removeFile = useDeleteNoticeFile();
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  async function run(action, fallback) {
    try {
      await action();
    } catch (err) {
      window.alert(err.message || fallback);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`"${notice.title}" 공지를 삭제할까요? 첨부파일과 확인 기록도 함께 지워집니다.`)) return;
    await run(async () => {
      await remove.mutateAsync(notice.id);
      navigate('/employee/notices');
    }, '삭제하지 못했습니다.');
  }

  async function handleUpload(e) {
    const files = [...(e.target.files || [])];
    for (const file of files) await run(() => upload.mutateAsync({ id: notice.id, file }), `"${file.name}"을(를) 올리지 못했습니다.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div>
      <PageHeader
        title={notice.title}
        backTo="/employee/notices"
        backLabel="공지사항"
        actions={
          notice.canEdit && (
            <div>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                수정
              </Button>
              <Button variant="secondary" onClick={handleDelete} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" />
                삭제
              </Button>
            </div>
          )
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-stripe-muted">
          <NoticeBadges notice={notice} />
          <span>{notice.workplaceName}</span>
          <span>·</span>
          <span>{notice.authorName || '-'}</span>
          <span>·</span>
          <span className="font-mono">{notice.createdAt}</span>
          {notice.updatedAt !== notice.createdAt && <span>(수정 {notice.updatedAt})</span>}
        </div>
      </PageHeader>

      <Panel>
        <PanelBody>
          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-stripe-text">{notice.body}</div>
        </PanelBody>
        {(notice.files.length > 0 || notice.canEdit) && (
          <PanelBody className="border-t border-stripe-border">
            <p className="mb-2 text-[12px] font-medium text-stripe-muted">첨부파일 {notice.files.length}개</p>
            <ul className="space-y-1">
              {notice.files.map((file) => (
                <li key={file.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                  <span className="font-mono text-[12px] text-stripe-muted">{formatFileSize(file.sizeBytes)}</span>
                  {file.previewable && (
                    <button
                      className="p-1 text-stripe-muted hover:text-primary-500"
                      title="보기"
                      onClick={() =>
                        run(() => openProtectedFile(() => leaveApi.downloadNoticeFile(file.id), file.fileName, true), '파일을 열지 못했습니다.')
                      }
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    className="p-1 text-stripe-muted hover:text-primary-500"
                    title="내려받기"
                    onClick={() =>
                      run(() => openProtectedFile(() => leaveApi.downloadNoticeFile(file.id), file.fileName, false), '파일을 받지 못했습니다.')
                    }
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {notice.canEdit && (
                    <button
                      className="p-1 text-stripe-muted hover:text-[#df1b41]"
                      title="삭제"
                      onClick={() => {
                        if (window.confirm(`"${file.fileName}"을(를) 삭제할까요?`)) {
                          run(() => removeFile.mutateAsync(file.id), '삭제하지 못했습니다.');
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {notice.canEdit && (
              <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
                <Upload className="h-4 w-4" />
                {upload.isPending ? '올리는 중…' : '첨부파일 추가'}
                <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handleUpload} />
              </label>
            )}
          </PanelBody>
        )}
        {notice.mustRead && (
          <PanelBody className="border-t border-stripe-border">
            {notice.readAt ? (
              <p className="inline-flex items-center gap-2 text-sm text-[#09825d]">
                <CheckCircle className="h-4 w-4" />
                {notice.readAt}에 확인했습니다.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-stripe-text">필독 공지입니다. 내용을 읽은 뒤 확인 버튼을 눌러주세요.</p>
                <Button onClick={() => run(() => confirm.mutateAsync(notice.id), '확인하지 못했습니다.')} disabled={confirm.isPending}>
                  <CheckCircle className="h-4 w-4" />
                  확인했습니다
                </Button>
              </div>
            )}
          </PanelBody>
        )}
      </Panel>

      {notice.canEdit && notice.mustRead && <ReadStatus noticeId={notice.id} />}

      {editing && (
        <NoticeFormModal notice={notice} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
    </div>
  );
}
