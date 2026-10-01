import { useRef, useState } from 'react';
import { Download, Eye, Lock, Trash2, Upload } from 'lucide-react';
import { Panel, PanelBody, PanelHeader } from '../ui/Panel';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../LoadingSpinner';
import { leaveApi } from '../../api/leaveApi';
import { DOCUMENT_EXTENSIONS, DOCUMENT_MAX_BYTES, DOCUMENT_TYPES } from '../../constants/personnel';
import {
  useDeletePersonnelDocument,
  usePersonnelDocuments,
  useUploadPersonnelDocument,
} from '../../hooks/usePersonnel';

const ACCEPT = Object.keys(DOCUMENT_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',');
const MAX_MB = Math.round(DOCUMENT_MAX_BYTES / 1024 / 1024);

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function UploadForm({ employeeId, onMessage }) {
  const upload = useUploadPersonnelDocument();
  const fileRef = useRef(null);
  const [docType, setDocType] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  function handleFile(e) {
    const picked = e.target.files?.[0] || null;
    setError('');
    if (picked && picked.size > DOCUMENT_MAX_BYTES) {
      setError(`파일은 ${MAX_MB}MB 이하만 올릴 수 있습니다.`);
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!docType) return setError('서류 종류를 선택하세요.');
    if (!file) return setError('파일을 선택하세요.');
    try {
      await upload.mutateAsync({ employeeId, file, docType, notes: notes.trim() });
      onMessage(`${docType} "${file.name}"을(를) 올렸습니다.`);
      setDocType('');
      setNotes('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err.message || '올리지 못했습니다.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr_auto] gap-3 items-end">
      <div>
        <label className="stripe-label">서류 종류</label>
        <select className="stripe-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="">선택</option>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="stripe-label">파일 (PDF·이미지·한글·워드·엑셀·ZIP, {MAX_MB}MB 이하)</label>
        <input ref={fileRef} type="file" accept={ACCEPT} className="stripe-input py-1.5" onChange={handleFile} />
      </div>
      <div>
        <label className="stripe-label">메모 (선택)</label>
        <input className="stripe-input" value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" disabled={upload.isPending}>
        <Upload className="h-4 w-4" />
        {upload.isPending ? '올리는 중…' : '올리기'}
      </Button>
      {error && <p className="sm:col-span-4 text-sm text-[#df1b41]">{error}</p>}
    </form>
  );
}

/** 입사 증명서류. 인사기록카드 조회 권한이 있는 관리자 화면에서만 씁니다. */
export function PersonnelDocuments({ employeeId, editable }) {
  const { data: documents = [], isLoading, isError, error } = usePersonnelDocuments(employeeId);
  const remove = useDeletePersonnelDocument();
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function handleOpen(doc, preview) {
    const win = preview ? window.open('', '_blank') : null;
    setBusyId(doc.id);
    try {
      const blob = await leaveApi.downloadPersonnelDocument(doc.id);
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.fileName;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      win?.close();
      window.alert(err.message || '파일을 열지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`${doc.docType} "${doc.fileName}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await remove.mutateAsync({ employeeId, docId: doc.id });
      setMessage(`"${doc.fileName}"을(를) 삭제했습니다.`);
    } catch (err) {
      window.alert(err.message || '삭제하지 못했습니다.');
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="증명서류"
        description={
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" />
            관리자만 볼 수 있으며 암호화해 보관합니다 · {documents.length}건
          </span>
        }
      />
      {editable && (
        <PanelBody className="border-b border-stripe-border">
          <UploadForm employeeId={employeeId} onMessage={setMessage} />
          {message && <p className="mt-2 text-sm text-stripe-muted">{message}</p>}
        </PanelBody>
      )}
      {isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-[#df1b41]">{error?.message || '목록을 불러오지 못했습니다.'}</p>
      ) : documents.length === 0 ? (
        <p className="py-10 text-center text-sm text-stripe-muted">등록된 증명서류가 없습니다.</p>
      ) : (
        <div className="stripe-table-fit-wrap">
          <table className="stripe-table stripe-table-fit w-full">
            <thead>
              <tr>
                <th>종류</th>
                <th>파일</th>
                <th>크기</th>
                <th>메모</th>
                <th>올린 사람</th>
                <th>올린 날짜</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className="whitespace-nowrap">{doc.docType}</td>
                  <td className="break-all max-w-[260px]">{doc.fileName}</td>
                  <td className="whitespace-nowrap font-mono text-[13px]">{formatSize(doc.sizeBytes)}</td>
                  <td className="whitespace-pre-wrap break-words max-w-[200px]">
                    {doc.notes || <span className="muted">-</span>}
                  </td>
                  <td className="whitespace-nowrap">{doc.uploadedBy || '-'}</td>
                  <td className="whitespace-nowrap font-mono text-[13px]">{String(doc.createdAt).slice(0, 10)}</td>
                  <td className="text-right whitespace-nowrap">
                    {doc.previewable && (
                      <button
                        className="p-1 text-stripe-muted hover:text-primary-500 disabled:opacity-40"
                        title="보기"
                        disabled={busyId === doc.id}
                        onClick={() => handleOpen(doc, true)}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      className="p-1 text-stripe-muted hover:text-primary-500 disabled:opacity-40"
                      title="내려받기"
                      disabled={busyId === doc.id}
                      onClick={() => handleOpen(doc, false)}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {editable && (
                      <button
                        className="p-1 text-stripe-muted hover:text-[#df1b41]"
                        title="삭제"
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
