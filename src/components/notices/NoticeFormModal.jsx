import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useNoticeTargets, useSaveNotice, useUploadNoticeFile } from '../../hooks/useNotices';
import { DOCUMENT_EXTENSIONS, DOCUMENT_MAX_BYTES } from '../../constants/personnel';

const ACCEPT = Object.keys(DOCUMENT_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',');
const MAX_MB = Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024);

/** 공지 쓰기·수정. 새 공지는 저장한 뒤 고른 첨부파일을 차례로 올립니다. */
export function NoticeFormModal({ notice, onClose, onSaved }) {
  const { data: targets = [] } = useNoticeTargets(true);
  const save = useSaveNotice();
  const upload = useUploadNoticeFile();
  const [form, setForm] = useState(() => ({
    workplaceCode: notice?.workplaceCode ?? null,
    title: notice?.title || '',
    body: notice?.body || '',
    pinned: Boolean(notice?.pinned),
    mustRead: Boolean(notice?.mustRead),
    resetReads: false,
  }));
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const busy = save.isPending || upload.isPending;
  const workplaceValue = form.workplaceCode ?? targets[0]?.value ?? '';

  function handleFiles(e) {
    const picked = [...(e.target.files || [])];
    const tooBig = picked.find((f) => f.size > DOCUMENT_MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}"은(는) ${MAX_MB}MB를 넘습니다.`);
      e.target.value = '';
      return;
    }
    setError('');
    setFiles(picked);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const saved = await save.mutateAsync({
        id: notice?.id,
        data: { ...form, workplaceCode: workplaceValue || null },
      });
      for (const file of files) {
        try {
          await upload.mutateAsync({ id: saved.id, file });
        } catch (err) {
          window.alert(`공지는 저장했지만 "${file.name}"을(를) 올리지 못했습니다: ${err.message}`);
        }
      }
      onSaved(saved);
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">{notice ? '공지 수정' : '공지 쓰기'}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="stripe-label">대상</label>
            <select
              className="stripe-input"
              value={workplaceValue}
              onChange={(e) => setForm({ ...form, workplaceCode: e.target.value })}
            >
              {targets.map((t) => (
                <option key={t.value || 'all'} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="stripe-label">제목</label>
            <input
              className="stripe-input"
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="stripe-label">내용</label>
            <textarea
              rows={12}
              className="stripe-input resize-y"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stripe-text">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
              상단 고정
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.mustRead}
                onChange={(e) => setForm({ ...form, mustRead: e.target.checked })}
              />
              필독 (직원이 확인 버튼을 누르고, 확인 현황을 볼 수 있음)
            </label>
            {notice?.mustRead && form.mustRead && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.resetReads}
                  onChange={(e) => setForm({ ...form, resetReads: e.target.checked })}
                />
                확인 기록을 지우고 다시 확인받기
              </label>
            )}
          </div>
          {!notice && (
            <div>
              <label className="stripe-label">첨부파일 (PDF·이미지·한글·워드·엑셀·ZIP, 파일당 {MAX_MB}MB 이하)</label>
              <input type="file" multiple accept={ACCEPT} className="stripe-input py-1.5" onChange={handleFiles} />
            </div>
          )}
          {error && <p className="text-sm text-[#df1b41]">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={busy || !targets.length}>
              {busy ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
