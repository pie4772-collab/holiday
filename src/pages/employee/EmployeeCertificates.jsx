import { useState } from 'react';
import { FilePlus, Printer, X } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { TrainingModal } from '../../components/training/TrainingModal';
import { CertificateRequestFields } from '../../components/certificates/CertificateRequestFields';
import { CertificatePrinter } from '../../components/certificates/CertificatePrintSheet';
import {
  CERT_REQUEST_STATUS_BADGE,
  CERT_TYPES,
  REQUESTABLE_CERT_TYPES,
  initialCertRequest,
} from '../../constants/certificates';
import { leaveApi } from '../../api/leaveApi';
import { useCancelCertificateRequest, useMyCertificates, useRequestCertificate } from '../../hooks/useCertificates';

function RequestModal({ profile, onClose }) {
  const request = useRequestCertificate();
  const [value, setValue] = useState(() => initialCertRequest('employment'));
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await request.mutateAsync(value);
      onClose();
    } catch (err) {
      setError(err.message || '신청하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title="증명서 발급 신청" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-4 p-5">
          <p className="rounded-md bg-[#f6f9fc] px-3 py-2 text-[13px] text-stripe-muted">
            신청하면 소속 사업장 인사담당에게 접수되고, 관리팀 내부 결재를 거쳐 발급됩니다. 발급되면 메일로 알려 드리며 아래
            발급 내역에서 인쇄할 수 있습니다.
          </p>
          <CertificateRequestFields value={value} onChange={setValue} types={REQUESTABLE_CERT_TYPES} profile={profile} />
          {error && <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#df1b41]">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-stripe-border px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={request.isPending}>
            <FilePlus className="h-4 w-4" /> {request.isPending ? '신청 중…' : '신청'}
          </Button>
        </div>
      </form>
    </TrainingModal>
  );
}

function RequestList({ requests }) {
  const cancel = useCancelCertificateRequest();
  const [error, setError] = useState('');

  async function cancelRequest(req) {
    if (!window.confirm(`${req.typeLabel} 신청을 취소할까요?`)) return;
    setError('');
    try {
      await cancel.mutateAsync(req.id);
    } catch (err) {
      setError(err.message || '취소하지 못했습니다.');
    }
  }

  return (
    <Panel className="mb-6">
      <PanelHeader title="신청 내역" description="인사담당이 접수해 내부 결재를 마치면 발급 내역에 나타납니다." />
      {error && <p className="mx-5 mt-3 rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#df1b41]">{error}</p>}
      <div className="stripe-table-fit-wrap">
        <table className="stripe-table stripe-table-fit w-full">
          <thead>
            <tr>
              <th>신청 일시</th>
              <th>종류</th>
              <th>용도</th>
              <th>상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td className="whitespace-nowrap text-[13px]">{req.requestedAt.slice(0, 16)}</td>
                <td className="whitespace-nowrap">{req.typeLabel}</td>
                <td>
                  {req.request.purpose}
                  {req.request.submitTo && <div className="text-[12px] text-stripe-muted">{req.request.submitTo}</div>}
                </td>
                <td className="whitespace-nowrap">
                  <Badge variant={CERT_REQUEST_STATUS_BADGE[req.status]}>{req.statusLabel}</Badge>
                  {req.status === 'issued' && req.certNo && (
                    <div className="mt-0.5 font-mono text-[12px] text-stripe-muted">{req.certNo}</div>
                  )}
                  {req.status === 'rejected' && req.rejectReason && (
                    <div className="mt-0.5 max-w-[16rem] text-[12px] text-[#df1b41]">{req.rejectReason}</div>
                  )}
                  {req.status === 'processing' && req.handlerName && (
                    <div className="mt-0.5 text-[12px] text-stripe-muted">담당 {req.handlerName}</div>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  {req.status === 'requested' && (
                    <Button size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => cancelRequest(req)}>
                      <X className="h-3.5 w-3.5" /> 신청 취소
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** 내 증명서: 재직·경력증명서 신청(사업장 인사담당 접수 → 관리팀 내부 결재 → 발급), 발급 내역과 다시 인쇄 */
export function EmployeeCertificates() {
  const { data, isLoading, isError, error, refetch } = useMyCertificates();
  const [requesting, setRequesting] = useState(false);
  const [printing, setPrinting] = useState(null);
  const [printError, setPrintError] = useState('');

  async function print(id) {
    setPrintError('');
    try {
      setPrinting(await leaveApi.getCertificate(id));
    } catch (err) {
      setPrintError(err.message || '증명서를 불러오지 못했습니다.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title="증명서"
        description="재직증명서·경력증명서를 신청하면 사업장 인사담당이 관리팀 내부 결재를 거쳐 발급합니다. 증명서 아래쪽의 발급번호·확인 코드로 제출처가 진위를 확인할 수 있습니다."
        actions={
          data.profile.isActive && (
            <Button onClick={() => setRequesting(true)}>
              <FilePlus className="h-4 w-4" /> 증명서 신청
            </Button>
          )
        }
      />

      {data.requests.length > 0 && <RequestList requests={data.requests} />}

      {printError && <p className="mb-4 rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#df1b41]">{printError}</p>}
      <Panel>
        <PanelHeader title="발급 내역" />
        {!data.certificates.length ? (
          <PanelBody>
            <p className="py-6 text-center text-sm text-stripe-muted">발급받은 증명서가 없습니다.</p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>발급번호</th>
                  <th>종류</th>
                  <th>용도</th>
                  <th>발급</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.certificates.map((cert) => (
                  <tr key={cert.id}>
                    <td className="whitespace-nowrap font-mono text-[13px]">{cert.certNo}</td>
                    <td className="whitespace-nowrap">
                      {CERT_TYPES[cert.certType]?.label}
                      {cert.status === 'revoked' && (
                        <Badge variant="danger" className="ml-1.5">
                          취소
                        </Badge>
                      )}
                    </td>
                    <td>
                      {cert.purpose}
                      {cert.submitTo && <div className="text-[12px] text-stripe-muted">{cert.submitTo}</div>}
                    </td>
                    <td className="whitespace-nowrap text-[13px]">
                      {cert.issuedAt.slice(0, 16)}
                      <div className="text-[12px] text-stripe-muted">{cert.channelLabel}</div>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {cert.status === 'issued' ? (
                        <Button size="sm" variant="secondary" onClick={() => print(cert.id)}>
                          <Printer className="h-3.5 w-3.5" /> 인쇄
                        </Button>
                      ) : (
                        <span className="text-[12px] text-stripe-muted" title={cert.revokeReason}>
                          {cert.revokeReason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {requesting && <RequestModal profile={data.profile} onClose={() => setRequesting(false)} />}
      {printing && <CertificatePrinter key={printing.id} cert={printing} onDone={() => setPrinting(null)} />}
    </div>
  );
}
