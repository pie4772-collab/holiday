import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ban, Download, FileSignature, Printer, Settings2, Trash2, Upload, XCircle } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { TrainingModal } from '../../components/training/TrainingModal';
import { CertificatePrinter } from '../../components/certificates/CertificatePrintSheet';
import {
  CERT_ITEMS,
  CERT_REQUEST_STATUS_BADGE,
  CERT_REQUEST_STATUS_LABELS,
  CERT_TYPES,
  CERT_TYPE_KEYS,
  SEAL_MAX_BYTES,
  VERIFY_PATH,
} from '../../constants/certificates';
import { leaveApi } from '../../api/leaveApi';
import {
  useCertificateRegister,
  useCertificateRequests,
  useCertificateSettings,
  useRejectCertificateRequest,
  useRevokeCertificate,
  useSaveCertificateSettings,
} from '../../hooks/useCertificates';

const ISSUE_DRAFT_PATH = '/employee/documents/new?form=certificate_issue';
const ITEM_LABELS = Object.fromEntries(CERT_ITEMS.map((item) => [item.key, item.label]));

function ModalFooter({ onClose, busy, disabled = false, submitLabel, icon }) {
  return (
    <div className="flex justify-end gap-2 border-t border-stripe-border px-5 py-3">
      <Button type="button" variant="secondary" onClick={onClose}>
        취소
      </Button>
      <Button type="submit" disabled={busy || disabled}>
        {icon}
        {busy ? '처리 중…' : submitLabel}
      </Button>
    </div>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#df1b41]">{message}</p>;
}

function RejectRequestModal({ request, onClose }) {
  const reject = useRejectCertificateRequest();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await reject.mutateAsync({ id: request.id, reason });
      onClose();
    } catch (err) {
      setError(err.message || '반려하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title={`신청 반려 · ${request.employeeName} ${request.typeLabel}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-3 p-5">
          <p className="text-sm text-stripe-muted">반려하면 신청한 직원에게 사유와 함께 메일로 알립니다.</p>
          <div>
            <label className="stripe-label">
              반려 사유<span className="ml-0.5 text-[#df1b41]">*</span>
            </label>
            <input className="stripe-input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <FormError message={error} />
        </div>
        <ModalFooter onClose={onClose} busy={reject.isPending} submitLabel="반려" icon={<XCircle className="h-4 w-4" />} />
      </form>
    </TrainingModal>
  );
}

/** 직원 신청 접수함: 사업장 인사담당이 내부 결재(발급 품의)를 올리거나 반려합니다. */
function RequestInbox() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [scope, setScope] = useState('mine');
  const filters = useMemo(() => ({ status, scope }), [status, scope]);
  const { data = [], isLoading, isError, error, refetch } = useCertificateRequests(filters);
  const [rejecting, setRejecting] = useState(null);

  return (
    <>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <select className="stripe-input" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="mine">내 사업장 신청</option>
          <option value="all">전체 사업장</option>
        </select>
        <select className="stripe-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">처리 중 (접수 대기·결재 중)</option>
          <option value="all">전체 상태</option>
          {Object.entries(CERT_REQUEST_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage message={error?.message} onRetry={() => refetch()} />
        ) : !data.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">조건에 맞는 신청이 없습니다.</p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>신청 일시</th>
                  <th>신청자</th>
                  <th>종류</th>
                  <th>용도 · 기재 항목</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((req) => (
                  <tr key={req.id}>
                    <td className="whitespace-nowrap text-[13px]">{req.requestedAt.slice(0, 16)}</td>
                    <td className="whitespace-nowrap">
                      {req.employeeName}
                      <div className="text-[12px] text-stripe-muted">
                        {[req.workplace, req.department, req.position].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{req.typeLabel}</td>
                    <td>
                      {req.request.purpose}
                      {req.request.submitTo && ` · ${req.request.submitTo}`}
                      <div className="text-[12px] text-stripe-muted">
                        {['성명', '재직기간', ...(req.request.items || []).map((key) => ITEM_LABELS[key] || key)].join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge variant={CERT_REQUEST_STATUS_BADGE[req.status]}>{req.statusLabel}</Badge>
                      {req.documentId && (
                        <Link
                          to={`/employee/documents/${req.documentId}`}
                          className="mt-0.5 block text-[12px] text-primary-600 hover:underline"
                        >
                          {req.documentNo || '발급 품의'} 보기
                        </Link>
                      )}
                      {req.certNo && <div className="font-mono text-[12px] text-stripe-muted">{req.certNo}</div>}
                      {req.handlerName && req.status !== 'requested' && (
                        <div className="text-[12px] text-stripe-muted">담당 {req.handlerName}</div>
                      )}
                      {req.rejectReason && <div className="max-w-[14rem] text-[12px] text-[#df1b41]">{req.rejectReason}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {req.status === 'requested' && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => navigate(`${ISSUE_DRAFT_PATH}&request=${req.id}`)}>
                            <FileSignature className="h-3.5 w-3.5" /> 발급 품의
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(req)}>
                            반려
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {rejecting && <RejectRequestModal request={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}

function RevokeModal({ cert, onClose }) {
  const revoke = useRevokeCertificate();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await revoke.mutateAsync({ id: cert.id, reason });
      onClose();
    } catch (err) {
      setError(err.message || '취소하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title={`발급 취소 · 제 ${cert.certNo} 호`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-3 p-5">
          <p className="text-sm text-stripe-muted">
            {cert.employeeName}의 {cert.typeLabel}를 취소합니다. 취소한 증명서는 다시 인쇄할 수 없고 진위 확인에서 "취소"로 나옵니다.
          </p>
          <div>
            <label className="stripe-label">
              취소 사유<span className="ml-0.5 text-[#df1b41]">*</span>
            </label>
            <input className="stripe-input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <FormError message={error} />
        </div>
        <ModalFooter onClose={onClose} busy={revoke.isPending} submitLabel="발급 취소" icon={<Ban className="h-4 w-4" />} />
      </form>
    </TrainingModal>
  );
}

function SettingsModal({ onClose }) {
  const settings = useCertificateSettings();
  const save = useSaveCertificateSettings();
  const [value, setValue] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings.data && !value) setValue(settings.data);
  }, [settings.data, value]);

  function set(patch) {
    setValue((prev) => ({ ...prev, ...patch }));
  }

  function handleSeal(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('직인 이미지는 PNG 또는 JPG 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > SEAL_MAX_BYTES) {
      setError(`직인 이미지는 ${Math.round(SEAL_MAX_BYTES / 1024)}KB 이하로 올려 주세요.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError('');
      set({ sealImage: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await save.mutateAsync(value);
      onClose();
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title="증명서 설정" onClose={onClose}>
      {!value ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="stripe-label">회사명</label>
                <input className="stripe-input" maxLength={100} value={value.companyName} onChange={(e) => set({ companyName: e.target.value })} />
              </div>
              <div>
                <label className="stripe-label">대표자</label>
                <input
                  className="stripe-input"
                  maxLength={50}
                  value={value.ceoName}
                  placeholder={value.ceoNameDefault ? `비우면 ${value.ceoNameDefault} (결재 라인 대표이사)` : '대표이사 이름'}
                  onChange={(e) => set({ ceoName: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="stripe-label">회사 주소</label>
                <input className="stripe-input" maxLength={200} value={value.address} onChange={(e) => set({ address: e.target.value })} />
              </div>
              <div>
                <label className="stripe-label">대표 연락처</label>
                <input className="stripe-input" maxLength={50} value={value.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="stripe-label">직인 이미지</label>
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-stripe-border bg-[#f6f9fc]">
                  {value.sealImage ? (
                    <img src={value.sealImage} alt="직인" className="max-h-20 max-w-20 object-contain" />
                  ) : (
                    <span className="text-[12px] text-stripe-muted">없음</span>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-stripe-border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-[#f6f9fc]">
                    <Upload className="h-3.5 w-3.5" /> 이미지 올리기
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleSeal} />
                  </label>
                  {value.sealImage && (
                    <button
                      type="button"
                      onClick={() => set({ sealImage: '' })}
                      className="flex items-center gap-1 text-xs text-[#df1b41] hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 지우기
                    </button>
                  )}
                  <p className="text-[12px] text-stripe-muted">배경이 투명한 PNG, {Math.round(SEAL_MAX_BYTES / 1024)}KB 이하</p>
                </div>
              </div>
            </div>
            <FormError message={error} />
          </div>
          <ModalFooter onClose={onClose} busy={save.isPending} submitLabel="저장" />
        </form>
      )}
    </TrainingModal>
  );
}

const TABS = [
  { key: 'requests', label: '신청 접수' },
  { key: 'register', label: '발급대장' },
];

/** 증명서: 직원 신청 접수 → 관리팀 내부 결재(발급 품의) → 발급, 인사담당 임의 품의, 발급대장·취소·설정 */
export function AdminCertificates() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('requests');
  const [modal, setModal] = useState(null);

  return (
    <div>
      <PageHeader
        title="증명서 발급"
        description={`직원이 신청한 재직·경력증명서를 접수해 관리팀 내부 결재(증명서 발급 품의)로 발급합니다. 퇴직자 등 신청 없이 발급할 때도 "발급 품의 작성"으로 올리고, 결재자 없이 본인 결재로 바로 발급할 수도 있습니다. 제출처는 ${window.location.origin}${VERIFY_PATH} 에서 진위를 확인할 수 있습니다.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('settings')}>
              <Settings2 className="h-4 w-4" /> 설정
            </Button>
            <Button onClick={() => navigate(ISSUE_DRAFT_PATH)}>
              <FileSignature className="h-4 w-4" /> 발급 품의 작성
            </Button>
          </>
        }
      />
      <div className="mb-4 flex gap-1 border-b border-stripe-border">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === item.key ? 'border-primary-500 text-primary-700' : 'border-transparent text-stripe-muted hover:text-stripe-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'requests' ? <RequestInbox /> : <CertificateRegister />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
    </div>
  );
}

/** 발급대장: 인쇄·발급 취소·CSV */
function CertificateRegister() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const filters = useMemo(
    () => Object.fromEntries(Object.entries({ year, type, status, q: q.trim() }).filter(([, v]) => v)),
    [year, type, status, q]
  );
  const { data = [], isLoading, isError, error, refetch } = useCertificateRegister(filters);
  const [modal, setModal] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [message, setMessage] = useState('');

  async function print(id) {
    setMessage('');
    try {
      setPrinting(await leaveApi.getCertificate(id));
    } catch (err) {
      setMessage(err.message || '증명서를 불러오지 못했습니다.');
    }
  }

  async function handleCsv() {
    setMessage('');
    try {
      const blob = await leaveApi.downloadCsv(`/admin/certificates/export?${new URLSearchParams(filters)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `증명서_발급대장_${year || '전체'}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <select className="stripe-input" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">전체 연도</option>
          {[0, 1, 2].map((offset) => (
            <option key={offset} value={thisYear - offset}>
              {thisYear - offset}년
            </option>
          ))}
        </select>
        <select className="stripe-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">전체 종류</option>
          {CERT_TYPE_KEYS.map((key) => (
            <option key={key} value={key}>
              {CERT_TYPES[key].label}
            </option>
          ))}
        </select>
        <select className="stripe-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">전체 상태</option>
          <option value="issued">발급</option>
          <option value="revoked">취소</option>
        </select>
        <input className="stripe-input" placeholder="성명·사번·발급번호·용도" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="secondary" onClick={handleCsv}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>
      {message && <p className="mb-3 text-sm text-[#df1b41]">{message}</p>}

      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage message={error?.message} onRetry={() => refetch()} />
        ) : !data.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">조건에 맞는 발급 내역이 없습니다.</p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>발급번호</th>
                  <th>종류</th>
                  <th>성명</th>
                  <th>용도</th>
                  <th>발급</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((cert) => (
                  <tr key={cert.id}>
                    <td className="whitespace-nowrap font-mono text-[13px]">{cert.certNo}</td>
                    <td className="whitespace-nowrap">{cert.typeLabel}</td>
                    <td className="whitespace-nowrap">
                      {cert.employeeName}
                      <div className="text-[12px] text-stripe-muted">
                        {cert.empNo}
                        {cert.employeeActive === false && ' · 퇴직'}
                      </div>
                    </td>
                    <td>
                      {cert.purpose}
                      {cert.submitTo && <div className="text-[12px] text-stripe-muted">{cert.submitTo}</div>}
                    </td>
                    <td className="whitespace-nowrap text-[13px]">
                      {cert.issuedAt.slice(0, 16)}
                      <div className="text-[12px] text-stripe-muted">
                        {cert.channelLabel}
                        {cert.issuedByName && ` · ${cert.issuedByName}`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {cert.status === 'issued' ? (
                        <Badge variant="success">발급</Badge>
                      ) : (
                        <>
                          <Badge variant="danger">취소</Badge>
                          <div className="mt-0.5 max-w-[12rem] truncate text-[12px] text-stripe-muted" title={cert.revokeReason}>
                            {cert.revokeReason}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {cert.status === 'issued' && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => print(cert.id)}>
                            <Printer className="h-3.5 w-3.5" /> 인쇄
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setModal({ kind: 'revoke', cert })}>
                            취소
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modal?.kind === 'revoke' && <RevokeModal cert={modal.cert} onClose={() => setModal(null)} />}
      {printing && <CertificatePrinter key={printing.id} cert={printing} onDone={() => setPrinting(null)} />}
    </div>
  );
}
