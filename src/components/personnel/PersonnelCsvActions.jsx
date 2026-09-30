import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { leaveApi } from '../../api/leaveApi';
import { useImportPersonnel } from '../../hooks/usePersonnel';
import { parseCsv } from '../../utils/ordinaryWageCsv';

const TYPES = {
  profiles: { label: '기본정보·병역', filename: '인사기록_기본정보.csv' },
  records: { label: '이력', filename: '인사기록_이력.csv' },
};

/** 인사기록 CSV 내려받기(현재 데이터 = 양식)·올리기 */
export function PersonnelCsvActions({ onMessage, onError }) {
  const fileRef = useRef(null);
  const [pendingType, setPendingType] = useState('profiles');
  const [busy, setBusy] = useState(false);
  const importPersonnel = useImportPersonnel();

  async function handleDownload(type) {
    try {
      setBusy(true);
      const blob = await leaveApi.downloadPersonnelCsv(type);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = TYPES[type].filename;
      link.click();
      URL.revokeObjectURL(url);
      onMessage?.(`${TYPES[type].label} CSV를 내려받았습니다. 내용을 고친 뒤 같은 파일을 올리면 반영됩니다.`);
    } catch (error) {
      onError?.(error.message || '내려받기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function pickFile(type) {
    setPendingType(type);
    fileRef.current?.click();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const label = TYPES[pendingType].label;
    try {
      setBusy(true);
      const table = parseCsv(await file.text());
      const result = await importPersonnel.mutateAsync({ type: pendingType, table });
      const parts = [`${label} 반영 완료`];
      if (result.inserted) parts.push(`추가 ${result.inserted}건`);
      if (result.updated) parts.push(`수정 ${result.updated}건`);
      if (result.skipped) parts.push(`이미 있어 건너뜀 ${result.skipped}건`);
      onMessage?.(parts.join(' · '));
    } catch (error) {
      const errors = error.data?.errors || [];
      const detail = errors
        .slice(0, 5)
        .map((item) => `${item.line}행: ${item.message}`)
        .join('\n');
      onError?.(
        [error.message || '업로드에 실패했습니다.', detail, errors.length > 5 ? `외 ${errors.length - 5}건` : '']
          .filter(Boolean)
          .join('\n')
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || importPersonnel.isPending;

  return (
    <div>
      {Object.entries(TYPES).map(([type, { label }]) => (
        <span key={type} className="inline-flex gap-2">
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => handleDownload(type)}>
            <Download className="h-4 w-4" />
            {label} 내려받기
          </Button>
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => pickFile(type)}>
            <Upload className="h-4 w-4" />
            {label} 올리기
          </Button>
        </span>
      ))}
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
    </div>
  );
}
