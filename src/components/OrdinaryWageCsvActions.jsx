import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from './ui/Button';
import { leaveApi } from '../api/leaveApi';
import { useUploadOrdinaryWages } from '../hooks/useLeaveData';
import { parseOrdinaryWageCsv } from '../utils/ordinaryWageCsv';

export function OrdinaryWageCsvActions({ onMessage, onError }) {
  const fileRef = useRef(null);
  const uploadWages = useUploadOrdinaryWages();
  const [busy, setBusy] = useState(false);

  async function handleDownloadTemplate() {
    try {
      setBusy(true);
      const blob = await leaveApi.downloadOrdinaryWageTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '통상임금업로드양식.csv';
      link.click();
      URL.revokeObjectURL(url);
      onMessage?.('통상임금 업로드 양식을 내려받았습니다. 사번·월통상임금만 채운 뒤 업로드하세요.');
    } catch (error) {
      onError?.(error.message || '양식 다운로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setBusy(true);
      const text = await file.text();
      const rows = parseOrdinaryWageCsv(text);
      const result = await uploadWages.mutateAsync(rows);
      const parts = [`통상임금 ${result.updatedCount}명 반영`];
      if (result.missingCount) parts.push(`미존재 사번 ${result.missingCount}`);
      if (result.errorCount) parts.push(`오류 ${result.errorCount}`);
      if (result.skippedCount) parts.push(`건너뜀 ${result.skippedCount}`);
      onMessage?.(parts.join(' · '));
      if (result.missing?.length) {
        const sample = result.missing
          .slice(0, 5)
          .map((item) => item.empNo)
          .join(', ');
        onError?.(
          `없는 사번: ${sample}${result.missing.length > 5 ? ` 외 ${result.missing.length - 5}건` : ''}`
        );
      } else if (result.errors?.length) {
        onError?.(result.errors[0].reason);
      }
    } catch (error) {
      onError?.(error.message || '업로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy || uploadWages.isPending}
        onClick={handleDownloadTemplate}
      >
        <Download className="h-4 w-4" />
        통상임금 양식
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || uploadWages.isPending}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {uploadWages.isPending ? '업로드 중…' : '통상임금 업로드'}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
