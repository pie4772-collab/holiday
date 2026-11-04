import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Send } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { PeoplePicker } from '../../components/documents/PeoplePicker';
import { ApprovalLineEditor } from '../../components/documents/ApprovalLineEditor';
import { RichTextEditor } from '../../components/documents/RichTextEditor';
import { DraftSheet, SheetFields, SheetRow } from '../../components/documents/DraftSheet';
import { PersonnelOrderSheet } from '../../components/documents/PersonnelOrderSheet';
import { plainToHtml, sheetInput, signersFromDraft } from '../../components/documents/documentFormat';
import { CertificateIssueFields } from '../../components/certificates/CertificateIssueFields';
import { CERT_TYPES, initialCertRequest } from '../../constants/certificates';
import { hasPermission } from '../../utils/access';
import {
  DOC_FORMS,
  DOC_FORM_MAP,
  MAX_LINE,
  MAX_REFS,
  TITLE_MAX,
  approvalsFirst,
  formLineText,
  sheetTitle,
} from '../../constants/approvalDocs';
import {
  useCreateDocument,
  useDocument,
  useDocumentLineSuggestion,
  useDocumentPeople,
} from '../../hooks/useDocuments';
import { useCertificateRequest, useCertificateTargets } from '../../hooks/useCertificates';
import { useCurrentEmployee } from '../../hooks/useLeaveData';

function canDraft(form, me) {
  return !form.retired && (!form.permission || hasPermission(me, form.permission));
}

function FormPicker({ me, onPick }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DOC_FORMS.filter((form) => canDraft(form, me)).map((form) => (
        <button
          key={form.key}
          type="button"
          onClick={() => onPick(form.key)}
          className="stripe-panel flex items-center justify-between gap-3 p-4 text-left transition-colors hover:border-primary-300"
        >
          <div>
            <div className="font-semibold text-stripe-text">{form.label}</div>
            <div className="mt-0.5 text-[13px] text-stripe-muted">{form.description}</div>
            <div className="mt-1.5 text-[12px] text-primary-600">결재: {formLineText(form)}</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-stripe-muted" />
        </button>
      ))}
    </div>
  );
}

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * 새 기안. ?form=양식 으로 바로 열고, ?source=문서 로 반려·회수 문서를 다시 기안합니다.
 * 증명서 발급 품의는 ?request=신청 으로 직원 신청을 받아 엽니다.
 */
export function EmployeeDocumentNew() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sourceId = params.get('source');
  const source = useDocument(sourceId);
  const formKey = DOC_FORM_MAP[params.get('form')] ? params.get('form') : source.data?.formKey || null;
  const form = formKey ? DOC_FORM_MAP[formKey] : null;
  const issueForm = formKey === 'certificate_issue';
  const orderForm = form?.layout === 'order';
  const requestId = issueForm ? params.get('request') || source.data?.body?.requestId || null : null;
  const { data: me } = useCurrentEmployee();
  const people = useDocumentPeople(Boolean(form));
  const staged = form?.line === 'staged';
  const picksLine = form?.line === 'select' || staged;
  const suggestion = useDocumentLineSuggestion(picksLine && !sourceId);
  const certRequest = useCertificateRequest(requestId);
  const certTargets = useCertificateTargets(issueForm && !requestId);
  const create = useCreateDocument();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState({});
  const [line, setLine] = useState([]);
  const [linePrefilled, setLinePrefilled] = useState(false);
  const [refIds, setRefIds] = useState([]);
  const [error, setError] = useState('');
  const [loadedSource, setLoadedSource] = useState(null);
  const [loadedRequest, setLoadedRequest] = useState(null);

  const richField = form?.fields.find((field) => field.type === 'richtext');
  const peopleById = useMemo(() => new Map((people.data || []).map((p) => [p.id, p])), [people.data]);

  useEffect(() => {
    if (!formKey || source.data) return;
    setTitle('');
    setBody(formKey === 'certificate_issue' ? { employeeId: '' } : DOC_FORM_MAP[formKey]?.layout === 'order' ? { entries: [] } : {});
    setRefIds([]);
    setError('');
  }, [formKey, source.data]);

  useEffect(() => {
    const req = certRequest.data;
    if (!req || sourceId || loadedRequest === req.id) return;
    setLoadedRequest(req.id);
    setBody({ ...initialCertRequest(req.certType, req.profile.isActive), ...req.request, employeeId: req.employeeId, requestId: req.id });
  }, [certRequest.data, sourceId, loadedRequest]);

  useEffect(() => {
    const doc = source.data;
    if (!doc || loadedSource === doc.id) return;
    setLoadedSource(doc.id);
    setTitle(doc.title);
    let nextBody = doc.body;
    if (doc.formKey === 'certificate_issue') nextBody = { ...initialCertRequest(doc.body.certType), ...doc.body };
    const rich = DOC_FORM_MAP[doc.formKey]?.fields.find((field) => field.type === 'richtext');
    if (rich && doc.body.format !== 'html') nextBody = { ...doc.body, [rich.key]: plainToHtml(doc.body[rich.key]) };
    setBody(nextBody);
    setRefIds(doc.refs.map((ref) => ref.id));
    const previous = doc.steps.filter((step) => step.assigneeId).map((step) => ({ employeeId: step.assigneeId, kind: step.kind }));
    setLine(DOC_FORM_MAP[doc.formKey]?.line === 'staged' ? approvalsFirst(previous) : previous);
    setLinePrefilled(true);
  }, [source.data, loadedSource]);

  useEffect(() => {
    if (linePrefilled || !suggestion.data) return;
    setLine(suggestion.data);
    setLinePrefilled(true);
  }, [suggestion.data, linePrefilled]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await create.mutateAsync({
        formKey,
        title,
        body,
        line: picksLine ? line : [],
        refIds,
        sourceId: sourceId || undefined,
      });
      navigate(`/employee/documents/${result.id}`, { replace: true });
    } catch (err) {
      setError(err.message || '기안하지 못했습니다.');
    }
  }

  if (sourceId && source.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (!form) {
    return (
      <div>
        <PageHeader title="새 기안" description="양식을 고르세요." backTo="/employee/documents" backLabel="전자결재" />
        <FormPicker me={me} onPick={(key) => setParams({ form: key })} />
      </div>
    );
  }

  if (me && !canDraft(form, me)) {
    return (
      <div>
        <PageHeader title={form.label} backTo="/employee/documents/new" backLabel="양식 선택" />
        <Panel>
          <PanelBody>
            <p className="py-6 text-center text-sm text-stripe-muted">
              {form.key === 'certificate' ? (
                <>
                  증명서는 <Link to="/employee/certificates" className="text-primary-600 hover:underline">증명서 메뉴</Link>에서
                  신청합니다.
                </>
              ) : form.retired ? (
                '더 이상 쓰지 않는 양식입니다.'
              ) : (
                `${form.label} 양식은 인사담당만 기안할 수 있습니다.`
              )}
            </p>
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const requestBodyPending = Boolean(certRequest.data) && !sourceId && loadedRequest !== certRequest.data.id;
  if (requestId && (certRequest.isLoading || requestBodyPending)) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (requestId && certRequest.isError) {
    return (
      <div>
        <PageHeader title={form.label} backTo="/admin/certificates" backLabel="증명서 발급" />
        <ErrorMessage message={certRequest.error?.message || '증명서 신청을 불러오지 못했습니다.'} onRetry={() => certRequest.refetch()} />
      </div>
    );
  }

  const request = certRequest.data || null;
  const requestClosed = Boolean(request && request.status !== 'requested');
  const issueTargetName = request?.employeeName || certTargets.data?.find((t) => t.id === String(body.employeeId || ''))?.name;
  const signers = signersFromDraft({ me, line: picksLine ? line : [], peopleById, hr: form.hr });
  const writer = me ? [me.name, [me.department, me.position].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : '';

  return (
    <div>
      <PageHeader
        title={source.data ? `다시 기안 · ${form.label}` : form.label}
        description={`${form.description} · 결재: ${formLineText(form)}`}
        backTo={sourceId ? `/employee/documents/${sourceId}` : '/employee/documents/new'}
        backLabel={sourceId ? '원래 문서' : '양식 선택'}
      />
      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 overflow-x-auto rounded-md border border-stripe-border bg-white p-4">
            {orderForm ? (
              <PersonnelOrderSheet
                className="min-w-[720px]"
                signers={signers}
                orderNo={<span className="text-[13px] text-stripe-muted">발령번호(인사 연도 - 번호호)는 결재가 끝나면 매깁니다</span>}
                body={body}
                onChange={setBody}
                people={people.data || []}
              />
            ) : (
            <DraftSheet
              className="min-w-[720px]"
              title={sheetTitle(form)}
              signers={signers}
              documentNo={<span className="text-[13px] text-stripe-muted">결재가 끝나면 자동으로 매깁니다</span>}
              date={todayKst()}
              writer={writer}
              subject={
                issueForm ? (
                  issueTargetName && body.certType ? (
                    `${issueTargetName} ${CERT_TYPES[body.certType]?.label || '증명서'} 발급 품의`
                  ) : (
                    <span className="text-[13px] text-stripe-muted">발급 대상을 고르면 자동으로 적습니다</span>
                  )
                ) : (
                  <input
                    className={sheetInput}
                    maxLength={TITLE_MAX}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`예: ${form.key === 'business_trip' ? '부산공장 설비 점검 출장' : form.label}`}
                    aria-label="제목"
                  />
                )
              }
            >
              {issueForm ? (
                <SheetRow label="발급 내용" align="top">
                  <div className="py-1 font-sans">
                    {requestClosed && (
                      <p className="mb-3 flex items-start gap-1.5 rounded-md bg-[#fef3c7] px-3 py-2 text-[13px] text-[#b45309]">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        이 신청은 지금 "{request.statusLabel}" 상태라 발급 품의를 올릴 수 없습니다.
                      </p>
                    )}
                    <CertificateIssueFields value={body} onChange={setBody} request={request} />
                    <p className="mt-3 rounded-md bg-[#f6f9fc] px-3 py-2 text-[13px] text-stripe-muted">
                      결재선의 마지막 결재자가 승인하면 증명서가 발급되어 발급대장에 남고
                      {request ? ', 신청한 직원에게 메일로 알립니다.' : ' 인쇄할 수 있습니다.'} 반려·회수하면 신청은 다시 접수 대기로 돌아갑니다.
                    </p>
                  </div>
                </SheetRow>
              ) : (
                <SheetFields form={form} values={body} onChange={setBody} />
              )}
              {richField && (
                <div className="border-b border-black">
                  <RichTextEditor
                    key={`${formKey}-${loadedSource || 'new'}`}
                    value={body[richField.key] || ''}
                    onChange={(html) => setBody((prev) => ({ ...prev, [richField.key]: html }))}
                  />
                </div>
              )}
            </DraftSheet>
            )}
          </div>

          <div className="space-y-6">
            {picksLine && (
              <Panel overflowVisible>
                <PanelHeader
                  title="결재선"
                  description={
                    staged
                      ? '지정한 결재자가 차례로 결재를 마치면 합의자에게 넘어갑니다. 합의자(예: 인사담당)는 합의하면서 다음 결재선을 지정할 수 있고, 반대하면 반려됩니다.'
                      : '위에서부터 차례로 처리합니다. 앞 사람이 결재·합의하면 다음 사람에게 메일이 갑니다. 합의자가 반대하면 반려되고, 마지막은 결재자여야 합니다.'
                  }
                />
                <PanelBody>
                  {issueForm && (
                    <p className="mb-3 text-[12px] text-stripe-muted">
                      관리팀 내부 결재입니다. 팀장·임원 등 발급을 승인할 사람을 지정하세요.
                    </p>
                  )}
                  <ApprovalLineEditor
                    people={people.data || []}
                    value={line}
                    onChange={setLine}
                    max={MAX_LINE}
                    excludeId={me?.id}
                    hrStep={form.hr}
                    approvalFirst={staged}
                  />
                </PanelBody>
              </Panel>
            )}

            <Panel overflowVisible>
              <PanelHeader title="참조" description={`문서를 함께 볼 사람을 ${MAX_REFS}명까지 지정합니다. 결재가 끝나면 메일로 알립니다.`} />
              <PanelBody>
                <PeoplePicker people={people.data || []} value={refIds} onChange={setRefIds} max={MAX_REFS} excludeId={me?.id} />
              </PanelBody>
            </Panel>

            {error && <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm text-[#df1b41]">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/employee/documents')}>
                취소
              </Button>
              <Button type="submit" disabled={create.isPending || requestClosed}>
                <Send className="h-4 w-4" /> {create.isPending ? '올리는 중…' : '기안하기'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
