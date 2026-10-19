import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingSpinner } from '../LoadingSpinner';
import { leaveApi } from '../../api/leaveApi';
import { PROFILE_FIELDS, RECORD_CATEGORIES } from '../../constants/personnel';
import { usePersonnelCard, useSavePersonnelProfile, useSavePersonnelRecord } from '../../hooks/usePersonnel';

const RECORD_KEYS = ['organization', 'title', 'startDate', 'endDate', 'result', 'detail'];

function sameText(a, b) {
  return String(a || '').replace(/\s+/g, '') === String(b || '').replace(/\s+/g, '');
}

function initialProfileRows(suggested, current) {
  return PROFILE_FIELDS.filter((f) => suggested[f.key]).map((field) => {
    const now = current[field.key] || '';
    return {
      key: field.key,
      field,
      value: suggested[field.key],
      current: now,
      same: sameText(now, suggested[field.key]),
      checked: !now,
    };
  });
}

function initialRecordRows(suggested, existing) {
  return suggested.map((record, index) => {
    const duplicate = (existing[record.category] || []).some(
      (r) =>
        (sameText(r.title, record.title) || sameText(r.organization, record.organization)) &&
        (!record.startDate || r.startDate === record.startDate)
    );
    return { id: index, record: { ...record }, duplicate, checked: !duplicate, saved: false, error: '' };
  });
}

function ProfileTable({ rows, setRows }) {
  if (!rows.length) return <p className="text-sm text-stripe-muted">찾은 기본정보·병역 항목이 없습니다.</p>;
  const update = (key, patch) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <table className="stripe-table w-full">
      <thead>
        <tr>
          <th className="w-8" />
          <th>항목</th>
          <th>읽은 값</th>
          <th>현재 값</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={row.same ? 'opacity-50' : ''}>
            <td>
              <input
                type="checkbox"
                disabled={row.same}
                checked={row.checked && !row.same}
                onChange={(e) => update(row.key, { checked: e.target.checked })}
              />
            </td>
            <td className="whitespace-nowrap">{row.field.label}</td>
            <td className="min-w-[180px]">
              {row.field.options ? (
                <select
                  className="stripe-input py-1"
                  value={row.value}
                  onChange={(e) => update(row.key, { value: e.target.value, checked: true })}
                >
                  {row.field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={`stripe-input py-1 ${row.field.type === 'date' ? 'font-mono' : ''}`}
                  value={row.value}
                  onChange={(e) => update(row.key, { value: e.target.value, checked: true })}
                />
              )}
            </td>
            <td className="text-sm text-stripe-muted break-words max-w-[180px]">
              {row.same ? '같음' : row.current || '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecordList({ rows, setRows }) {
  if (!rows.length) return <p className="text-sm text-stripe-muted">찾은 학력·경력·자격 항목이 없습니다.</p>;
  const update = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const category = RECORD_CATEGORIES.find((c) => c.key === row.record.category);
        const keys = RECORD_KEYS.filter((k) => category.fields[k]);
        return (
          <div key={row.id} className={`rounded-md border border-stripe-border p-3 ${row.saved ? 'bg-[#f6fef9]' : ''}`}>
            <label className="flex items-center gap-2 mb-2 text-sm">
              <input
                type="checkbox"
                disabled={row.saved}
                checked={row.checked && !row.saved}
                onChange={(e) => update(row.id, { checked: e.target.checked })}
              />
              <Badge variant="primary">{category.label}</Badge>
              {row.duplicate && <Badge variant="warning">비슷한 이력이 이미 있음</Badge>}
              {row.saved && <Badge variant="success">반영함</Badge>}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {keys.map((key) => (
                <div key={key}>
                  <label className="text-[11px] text-stripe-muted">{category.fields[key]}</label>
                  <input
                    className={`stripe-input py-1 ${key.endsWith('Date') ? 'font-mono' : ''}`}
                    placeholder={key.endsWith('Date') ? 'YYYY-MM-DD' : undefined}
                    disabled={row.saved}
                    value={row.record[key] || ''}
                    onChange={(e) => update(row.id, { record: { ...row.record, [key]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
            {row.error && <p className="mt-1 text-sm text-[#df1b41]">{row.error}</p>}
          </div>
        );
      })}
    </div>
  );
}

function OcrResult({ employeeId, result, card, onClose, onDone }) {
  const saveProfile = useSavePersonnelProfile();
  const saveRecord = useSavePersonnelRecord();
  const [profileRows, setProfileRows] = useState(() => initialProfileRows(result.profile, card.profile));
  const [recordRows, setRecordRows] = useState(() => initialRecordRows(result.records, card.records));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pickedProfile = profileRows.filter((r) => r.checked && !r.same);
  const pickedRecords = recordRows.filter((r) => r.checked && !r.saved);
  const total = pickedProfile.length + pickedRecords.length;

  async function handleApply() {
    setError('');
    setBusy(true);
    let profileSaved = 0;
    let recordsSaved = 0;
    try {
      if (pickedProfile.length) {
        await saveProfile.mutateAsync({
          employeeId,
          data: Object.fromEntries(pickedProfile.map((r) => [r.key, r.value])),
        });
        profileSaved = pickedProfile.length;
        setProfileRows((rows) => rows.map((r) => (r.checked && !r.same ? { ...r, same: true, current: r.value } : r)));
      }
    } catch (err) {
      setError(`기본정보·병역을 저장하지 못했습니다: ${err.message}`);
      setBusy(false);
      return;
    }
    let next = recordRows;
    for (const row of pickedRecords) {
      try {
        await saveRecord.mutateAsync({ employeeId, data: row.record });
        recordsSaved += 1;
        next = next.map((r) => (r.id === row.id ? { ...r, saved: true, error: '' } : r));
      } catch (err) {
        next = next.map((r) => (r.id === row.id ? { ...r, error: err.message || '저장하지 못했습니다.' } : r));
      }
      setRecordRows(next);
    }
    setBusy(false);
    const failed = pickedRecords.length - recordsSaved;
    if (failed) {
      setError(`이력 ${failed}건은 저장하지 못했습니다. 빨간 글씨를 확인해 고친 뒤 다시 반영하세요.`);
      return;
    }
    onDone(`인사기록카드에 반영했습니다 (기본정보·병역 ${profileSaved}항목, 이력 ${recordsSaved}건).`);
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stripe-text mb-2">
            읽은 글자 <span className="font-normal text-stripe-muted">· {result.pages}쪽 · 인식 정확도 {result.confidence}%</span>
          </h3>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-stripe-border bg-[#f6f9fc] p-3 text-[13px] leading-relaxed max-h-[60vh] overflow-y-auto">
            {result.text.trim() || '(읽은 글자가 없습니다)'}
          </pre>
          <p className="mt-2 text-[11px] text-stripe-muted">
            주민등록번호 뒷자리는 가려서 보여 줍니다. 읽은 글자는 저장하지 않습니다.
          </p>
        </div>
        <div className="min-w-0 space-y-5">
          {result.warnings.length > 0 && (
            <div className="rounded-md bg-[#fef3c7] px-3 py-2 text-sm text-[#b45309] space-y-1">
              {result.warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
          <section>
            <h3 className="text-sm font-semibold text-stripe-text mb-2">기본정보·병역 후보</h3>
            <ProfileTable rows={profileRows} setRows={setProfileRows} />
          </section>
          <section>
            <h3 className="text-sm font-semibold text-stripe-text mb-2">이력 후보</h3>
            <RecordList rows={recordRows} setRows={setRecordRows} />
          </section>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stripe-border px-5 py-3">
        <p className="mr-auto text-[12px] text-stripe-muted">
          자동으로 읽은 값은 틀릴 수 있습니다. 원본과 대조해 고친 뒤 체크한 항목만 반영됩니다.
        </p>
        {error && <p className="w-full text-sm text-[#df1b41] text-right">{error}</p>}
        <Button type="button" variant="secondary" onClick={onClose}>
          닫기
        </Button>
        <Button type="button" disabled={busy || !total} onClick={handleApply}>
          {busy ? '반영 중…' : `선택한 항목 반영 (${total})`}
        </Button>
      </div>
    </>
  );
}

/** 스캔 증명서류 글자 읽기 → 인사기록카드 입력 후보 확인·반영 */
export function DocumentOcrModal({ employeeId, doc, onClose, onDone }) {
  const ocr = useQuery({
    queryKey: ['personnel-ocr', doc.id],
    queryFn: () => leaveApi.readPersonnelDocument(doc.id),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const cardQuery = usePersonnelCard(employeeId);
  const loading = ocr.isLoading || cardQuery.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={loading ? undefined : onClose} />
      <div className="relative w-full sm:max-w-6xl stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[94vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">
            내용 읽기 · {doc.docType} <span className="font-normal text-stripe-muted break-all">{doc.fileName}</span>
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-sm text-stripe-muted">
            <LoadingSpinner />
            글자를 읽는 중입니다. 한 쪽에 5~20초쯤 걸립니다.
          </div>
        ) : ocr.isError || cardQuery.isError ? (
          <div className="py-12 px-5 text-center space-y-4">
            <p className="text-sm text-[#df1b41]">{(ocr.error || cardQuery.error)?.message || '읽지 못했습니다.'}</p>
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
          </div>
        ) : (
          <OcrResult employeeId={employeeId} result={ocr.data} card={cardQuery.data} onClose={onClose} onDone={onDone} />
        )}
      </div>
    </div>
  );
}
