import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, FileBadge, Inbox, Printer, RotateCcw, Undo2, X } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DocumentStatusBadge, StepStatusBadge } from '../../components/documents/DocumentBadges';
import { DocumentPrintSheet } from '../../components/documents/DocumentPrintSheet';
import { DocumentSheetView } from '../../components/documents/DraftSheet';
import { ApprovalLineEditor } from '../../components/documents/ApprovalLineEditor';
import { stepBoxLabel } from '../../components/documents/documentFormat';
import {
  useApproveDocument,
  useDocument,
  useDocumentPeople,
  useReceiveDocument,
  useRejectDocument,
  useWithdrawDocument,
} from '../../hooks/useDocuments';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import { MAX_LINE, RECEIVE_STEP, STEP_KINDS } from '../../constants/approvalDocs';

/** 인사 수신: 내용을 확인하고 결재선을 지정해 넘기거나, 반려합니다. */
function ReceivePanel({ doc }) {
  const people = useDocumentPeople();
  const receive = useReceiveDocument();
  const reject = useRejectDocument();
  const [line, setLine] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const busy = receive.isPending || reject.isPending;

  async function submit() {
    setError('');
    try {
      if (rejecting) await reject.mutateAsync({ id: doc.id, reason: note });
      else await receive.mutateAsync({ id: doc.id, line, comment: note });
      setRejecting(false);
      setNote('');
      setLine([]);
    } catch (err) {
      setError(err.message || '처리하지 못했습니다.');
    }
  }

  return (
    <Panel className="mb-6 border-primary-200" overflowVisible>
      <PanelHeader
        title="인사 수신할 차례입니다"
        description={
          doc.permissions.proxy
            ? '이 문서의 수신 담당이 아니므로 인사담당 대리 처리로 기록됩니다.'
            : '결재·합의할 사람을 위에서부터 차례로 지정하고 수신하면 첫 지정자에게 메일이 갑니다. 마지막은 결재자여야 합니다.'
        }
      />
      <PanelBody className="space-y-3">
        {!rejecting && (
          <ApprovalLineEditor
            people={people.data || []}
            value={line}
            onChange={setLine}
            max={MAX_LINE}
            excludeId={doc.drafter.id}
            head={{ badge: '기안', label: doc.drafter.name }}
          />
        )}
        <div>
          <label className="stripe-label">
            {rejecting ? '반려 사유' : '의견 (선택)'}
            {rejecting && <span className="ml-0.5 text-[#df1b41]">*</span>}
          </label>
          <textarea className="stripe-input min-h-[64px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="text-sm text-[#df1b41]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {rejecting ? (
            <>
              <Button variant="secondary" onClick={() => setRejecting(false)} disabled={busy}>
                취소
              </Button>
              <Button variant="danger" onClick={submit} disabled={busy}>
                반려하기
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
                <X className="h-4 w-4" /> 반려
              </Button>
              <Button onClick={submit} disabled={busy || !line.length}>
                <Inbox className="h-4 w-4" /> {receive.isPending ? '처리 중…' : '수신하고 결재선 지정'}
              </Button>
            </>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

function DecisionPanel({ doc, me }) {
  const approve = useApproveDocument();
  const reject = useRejectDocument();
  const people = useDocumentPeople(doc.permissions.addLine);
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState('');
  const [nextLine, setNextLine] = useState([]);
  const [error, setError] = useState('');
  const busy = approve.isPending || reject.isPending;

  async function submit() {
    setError('');
    try {
      if (mode === 'reject') await reject.mutateAsync({ id: doc.id, reason: note });
      else await approve.mutateAsync({ id: doc.id, comment: note, line: nextLine.length ? nextLine : undefined });
      setMode(null);
      setNote('');
      setNextLine([]);
    } catch (err) {
      setError(err.message || '처리하지 못했습니다.');
    }
  }

  const current = doc.steps.find((step) => step.current);
  const agreement = current?.kind === 'agreement';
  const words = agreement
    ? { action: '합의', approve: '합의', reject: '반대', rejectReason: '반대 사유' }
    : { action: '결재', approve: '승인', reject: '반려', rejectReason: '반려 사유' };
  return (
    <Panel className="mb-6 border-primary-200" overflowVisible>
      <PanelHeader
        title={`${words.action}할 차례입니다 · ${current ? stepBoxLabel(current) : ''}${current?.assignee ? ` ${current.assignee}` : ''}`}
        description={
          doc.permissions.proxy
            ? '결재선에 지정된 사람이 아니므로 인사담당 대리 처리로 기록됩니다.'
            : doc.permissions.addLine
              ? '합의하면서 다음 결재선을 지정할 수 있습니다. 반대하면 문서가 반려됩니다.'
              : agreement
              ? '합의하면 다음 결재자에게 넘어가고 메일이 갑니다. 반대하면 문서가 반려됩니다.'
              : '승인하면 다음 결재자에게 넘어가고 메일이 갑니다. 마지막 단계면 문서번호가 매겨집니다.'
        }
      />
      <PanelBody className="space-y-3">
        {mode === 'approve' && doc.permissions.addLine && (
          <div>
            <p className="stripe-label">다음 결재선 (선택)</p>
            <p className="mb-2 text-[12px] text-stripe-muted">
              지정하면 내 합의 바로 다음에 차례로 처리됩니다. 결재자가 먼저, 합의자는 그 뒤입니다. 지정하지 않으면 남은 결재선대로
              진행하고, 남은 사람이 없으면 문서가 완료됩니다.
            </p>
            <ApprovalLineEditor
              people={people.data || []}
              value={nextLine}
              onChange={setNextLine}
              max={MAX_LINE}
              excludeId={[doc.drafter.id, me?.id].filter(Boolean)}
              head={{ badge: '합의', label: me?.name || '본인' }}
              approvalFirst
            />
          </div>
        )}
        {mode && (
          <div>
            <label className="stripe-label">
              {mode === 'reject' ? words.rejectReason : '의견 (선택)'}
              {mode === 'reject' && <span className="ml-0.5 text-[#df1b41]">*</span>}
            </label>
            <textarea
              className="stripe-input min-h-[80px]"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </div>
        )}
        {error && <p className="text-sm text-[#df1b41]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {mode ? (
            <>
              <Button variant="secondary" onClick={() => setMode(null)} disabled={busy}>
                취소
              </Button>
              <Button variant={mode === 'reject' ? 'danger' : 'primary'} onClick={submit} disabled={busy}>
                {mode === 'reject' ? `${words.reject}하기` : `${words.approve}하기`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setMode('reject')}>
                <X className="h-4 w-4" /> {words.reject}
              </Button>
              <Button onClick={() => setMode('approve')}>
                <Check className="h-4 w-4" /> {words.approve}
              </Button>
            </>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

/** 전자결재 문서 보기. 관리자 문서함(/admin/documents/:id)에서도 씁니다. */
export function EmployeeDocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromAdmin = location.pathname.startsWith('/admin');
  const { data: doc, isLoading, isError, error, refetch } = useDocument(id);
  const { data: me } = useCurrentEmployee();
  const withdraw = useWithdrawDocument();
  const [actionError, setActionError] = useState('');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  async function handleWithdraw() {
    if (!window.confirm('이 문서를 회수할까요? 회수한 문서는 다시 기안할 수 있습니다.')) return;
    setActionError('');
    try {
      await withdraw.mutateAsync(doc.id);
    } catch (err) {
      setActionError(err.message || '회수하지 못했습니다.');
    }
  }

  return (
    <div>
      <PageHeader
        title={doc.title}
        backTo={location.state?.backTo || (fromAdmin ? '/admin/documents' : '/employee/documents')}
        backLabel={location.state?.backLabel || (fromAdmin ? '전자결재 문서함' : '전자결재')}
        actions={
          <>
            {doc.permissions.withdraw && (
              <Button variant="secondary" onClick={handleWithdraw} disabled={withdraw.isPending}>
                <Undo2 className="h-4 w-4" /> 회수
              </Button>
            )}
            {doc.permissions.resubmit && (
              <Button variant="secondary" onClick={() => navigate(`/employee/documents/new?source=${doc.id}`)}>
                <RotateCcw className="h-4 w-4" /> 다시 기안
              </Button>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> 인쇄
            </Button>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DocumentStatusBadge status={doc.status} />
          <span className="text-sm text-stripe-muted">{doc.formLabel}</span>
          {doc.documentNo && <span className="font-mono text-sm text-stripe-text">{doc.documentNo}</span>}
        </div>
      </PageHeader>

      {actionError && <p className="mb-4 rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#df1b41]">{actionError}</p>}
      {doc.permissions.approve && <DecisionPanel doc={doc} me={me} />}
      {doc.permissions.receive && <ReceivePanel doc={doc} />}

      {doc.certificate && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">
          <span className="flex items-center gap-2">
            <FileBadge className="h-4 w-4" /> 증명서가 발급되었습니다 (제 {doc.certificate.certNo} 호
            {doc.certificate.status === 'revoked' ? ', 취소됨' : ''}).
          </span>
          <Link
            to={fromAdmin || doc.formKey === 'certificate_issue' ? '/admin/certificates' : '/employee/certificates'}
            className="font-medium underline-offset-2 hover:underline"
          >
            증명서 보기
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="overflow-x-auto rounded-md border border-stripe-border bg-white p-4">
            <DocumentSheetView doc={doc} className="min-w-[720px]" />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px] text-stripe-muted">
            <span>
              기안 {doc.submittedAt.slice(0, 16)}
              {doc.completedAt && ` · ${doc.status === 'approved' ? '완료' : '종료'} ${doc.completedAt.slice(0, 16)}`}
            </span>
            {doc.sourceId && (
              <Link to={`${fromAdmin ? '/admin' : '/employee'}/documents/${doc.sourceId}`} className="text-primary-600 hover:underline">
                반려·회수된 원래 문서 보기
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="결재 진행" />
            <PanelBody className="py-2">
              {!doc.steps.length && <p className="py-3 text-sm text-stripe-muted">결재선 없이 기안과 함께 완료된 문서입니다.</p>}
              <ol className="space-y-0">
                {doc.steps.map((step) => (
                  <li key={step.order} className={`border-b border-stripe-border py-3 last:border-0 ${step.current ? 'bg-primary-50/40' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-stripe-text">
                        {step.order}.{' '}
                        <Badge variant={step.kind === 'agreement' ? 'warning' : 'primary'} className="mr-1">
                          {step.role === RECEIVE_STEP ? '수신' : STEP_KINDS[step.kind]}
                        </Badge>
                        {step.assigneeId ? (
                          <>
                            {step.assignee}
                            <span className="ml-1 font-normal text-stripe-muted">
                              {[step.assigneeDepartment, step.label].filter(Boolean).join(' · ')}
                            </span>
                          </>
                        ) : (
                          <>
                            {stepBoxLabel(step)}
                            {step.assignee && !step.actorName && (
                              <span className="ml-1 font-normal text-stripe-muted">({step.assignee})</span>
                            )}
                          </>
                        )}
                      </div>
                      <StepStatusBadge step={step} />
                    </div>
                    {step.actorName && (
                      <div className="mt-1 text-[13px] text-stripe-muted">
                        {step.actorName}
                        {step.actorPosition && ` ${step.actorPosition}`} · {step.actedAt?.slice(0, 16)}
                        {step.proxy && (
                          <Badge variant="orange" className="ml-1.5">
                            대리
                          </Badge>
                        )}
                      </div>
                    )}
                    {step.comment && (
                      <p className="mt-1.5 whitespace-pre-line rounded bg-[#f6f9fc] px-2.5 py-1.5 text-[13px] text-stripe-text">
                        {step.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </PanelBody>
          </Panel>

          {doc.refs.length > 0 && (
            <Panel>
              <PanelHeader title="참조" />
              <PanelBody className="py-2">
                <ul>
                  {doc.refs.map((ref) => (
                    <li key={ref.id} className="flex items-center justify-between border-b border-stripe-border py-2 text-sm last:border-0">
                      <span>
                        {ref.name}
                        <span className="ml-1.5 text-[12px] text-stripe-muted">{ref.department}</span>
                      </span>
                      <span className="text-[12px] text-stripe-muted">{ref.readAt ? `읽음 ${ref.readAt.slice(5, 16)}` : '읽지 않음'}</span>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>

      <DocumentPrintSheet doc={doc} />
    </div>
  );
}
