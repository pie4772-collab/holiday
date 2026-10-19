import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { LoadingSpinner } from '../LoadingSpinner';
import { leaveApi } from '../../api/leaveApi';
import { usePersonnelDocuments } from '../../hooks/usePersonnel';
import { openProtectedFile } from '../../utils/fileDownload';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];

function useDocumentUrl(doc) {
  const blob = useQuery({
    queryKey: ['personnel-document-blob', doc?.id],
    queryFn: () => leaveApi.downloadPersonnelDocument(doc.id),
    enabled: Boolean(doc?.previewable),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob.data) return undefined;
    const next = URL.createObjectURL(blob.data);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [blob.data]);
  return { url, isLoading: blob.isLoading, error: blob.error };
}

/** 100% = 보기 칸 폭에 맞춤. 90°·270° 회전이면 돌린 모양의 폭을 칸에 맞춥니다. */
function ImageView({ url, alt, zoom, rotation }) {
  const boxRef = useRef(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [natural, setNatural] = useState(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const sideways = rotation % 180 !== 0;
  const fitWidth = Math.max(0, boxWidth - 24) * (zoom / 100);
  const ratio = natural ? natural.h / natural.w : 1.414;
  const imgWidth = sideways ? fitWidth / ratio : fitWidth;
  const imgHeight = imgWidth * ratio;
  const frame = sideways ? { width: imgHeight, height: imgWidth } : { width: imgWidth, height: imgHeight };

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-auto">
      <div className="p-3" style={{ width: Math.max(boxWidth, frame.width + 24) }}>
        <div className="relative mx-auto" style={frame}>
          <img
            src={url}
            alt={alt}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute left-1/2 top-1/2 max-w-none bg-white shadow-lg"
            style={{
              width: imgWidth,
              height: imgHeight,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ToolButton({ title, onClick, disabled, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-stripe-muted hover:bg-[#f0f3f7] hover:text-stripe-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * 인사기록카드 옆에 띄우는 증명서류 보기. PDF 는 브라우저 PDF 보기로, 이미지는 확대·회전해서 봅니다.
 * docId 를 넘기면 그 서류를 엽니다(목록에서 "보기"를 누른 경우).
 */
export function DocumentViewer({ employeeId, docId, onSelect, onClose, className = '' }) {
  const { data: documents = [], isLoading: listLoading } = usePersonnelDocuments(employeeId);
  const fallback = documents.find((d) => d.previewable) || documents[0];
  const doc = documents.find((d) => d.id === docId) || fallback;
  const { url, isLoading, error } = useDocumentUrl(doc);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const isPdf = doc?.extension === 'pdf';
  const isImage = doc?.previewable && !isPdf;

  function select(id) {
    setZoom(100);
    setRotation(0);
    onSelect(id);
  }

  function zoomBy(step) {
    const index = ZOOM_STEPS.indexOf(zoom) + step;
    if (index >= 0 && index < ZOOM_STEPS.length) setZoom(ZOOM_STEPS[index]);
  }

  async function download() {
    try {
      await openProtectedFile(() => leaveApi.downloadPersonnelDocument(doc.id), doc.fileName, false);
    } catch (err) {
      window.alert(err.message || '내려받지 못했습니다.');
    }
  }

  return (
    <div className={`stripe-panel flex flex-col overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-stripe-border px-3 py-2">
        <select
          className="stripe-input py-1 flex-1 min-w-[160px] max-w-full"
          value={doc?.id || ''}
          disabled={!documents.length}
          onChange={(e) => select(e.target.value)}
        >
          {!documents.length && <option value="">등록된 증명서류 없음</option>}
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.docType} · {d.fileName}
            </option>
          ))}
        </select>
        {isImage && (
          <>
            <ToolButton title="축소" onClick={() => zoomBy(-1)} disabled={zoom === ZOOM_STEPS[0]}>
              <ZoomOut className="h-4 w-4" />
            </ToolButton>
            <button
              type="button"
              title="원래 크기(폭 맞춤)"
              onClick={() => setZoom(100)}
              className="min-w-[44px] rounded-md px-1 py-1 text-[12px] font-mono text-stripe-muted hover:bg-[#f0f3f7]"
            >
              {zoom}%
            </button>
            <ToolButton title="확대" onClick={() => zoomBy(1)} disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
              <ZoomIn className="h-4 w-4" />
            </ToolButton>
            <ToolButton title="오른쪽으로 회전" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw className="h-4 w-4" />
            </ToolButton>
          </>
        )}
        {url && (
          <ToolButton title="새 창에서 보기" onClick={() => window.open(url, '_blank')}>
            <ExternalLink className="h-4 w-4" />
          </ToolButton>
        )}
        {doc && (
          <ToolButton title="내려받기" onClick={download}>
            <Download className="h-4 w-4" />
          </ToolButton>
        )}
        <ToolButton title="서류 보기 닫기" onClick={onClose}>
          <X className="h-4 w-4" />
        </ToolButton>
      </div>

      <div className="relative flex-1 min-h-0 bg-[#525659]">
        {listLoading || isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <LoadingSpinner />
          </div>
        ) : !doc ? (
          <p className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-sm text-stripe-muted">
            등록된 증명서류가 없습니다. 증명서류 탭에서 먼저 올려 주세요.
          </p>
        ) : !doc.previewable ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center text-sm text-stripe-muted">
            <p>{doc.extension.toUpperCase()} 파일은 화면에서 미리 볼 수 없습니다. 내려받아 열어 주세요.</p>
          </div>
        ) : error ? (
          <p className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-sm text-[#df1b41]">
            {error.message || '서류를 불러오지 못했습니다.'}
          </p>
        ) : isPdf && url ? (
          <iframe key={url} title={doc.fileName} src={`${url}#view=FitH`} className="absolute inset-0 h-full w-full border-0" />
        ) : isImage && url ? (
          <ImageView key={url} url={url} alt={doc.fileName} zoom={zoom} rotation={rotation} />
        ) : null}
      </div>
    </div>
  );
}
