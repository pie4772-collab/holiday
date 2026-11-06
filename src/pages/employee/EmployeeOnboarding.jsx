import { useRef, useState } from 'react';
import { ArrowLeft, Download, Eye, FileSignature, PenLine } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { OnboardingSheet } from '../../components/onboarding/OnboardingSheet';
import { SignaturePad } from '../../components/onboarding/SignaturePad';
import { useMyOnboarding, useSubmitOnboardingForm } from '../../hooks/useOnboarding';
import { leaveApi } from '../../api/leaveApi';
import { openProtectedFile } from '../../utils/fileDownload';
import { renderSheetPdf } from '../../utils/sheetPdf';
import {
  EMPLOYEE_INPUTS,
  EMPLOYEE_INPUT_LABELS,
  ONBOARDING_AGREEMENTS,
  ONBOARDING_STATUS,
  kstToday,
  onboardingForm,
} from '../../constants/onboarding';

function FormWriter({ form, context, onBack, onDone }) {
  const def = onboardingForm(form.kind);
  const inputs = EMPLOYEE_INPUTS[form.kind] || [];
  const submit = useSubmitOnboardingForm();
  const sheetRef = useRef(null);
  const [values, setValues] = useState({ address: context.employee.address, phone: context.employee.phone });
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = Object.fromEntries(inputs.map((key) => [key, (values[key] || '').trim()]));

  async function handleSubmit() {
    setError('');
    const missing = inputs.find((key) => !input[key]);
    if (missing) return setError(`${EMPLOYEE_INPUT_LABELS[missing]}을(를) 입력하세요.`);
    if (!agreed) return setError('내용을 확인하고 동의에 체크하세요.');
    if (!signature) return setError('서명 칸에 서명하세요.');
    setBusy(true);
    try {
      const pdf = await renderSheetPdf(sheetRef.current);
      await submit.mutateAsync({ formId: form.id, pdf, ...input });
      onDone(`${def.label}을(를) 제출했습니다. 완성본은 아래 목록에서 내려받을 수 있습니다.`);
    } catch (err) {
      setError(err.message || '제출하지 못했습니다. 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-stripe-muted hover:text-primary-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        서류 목록
      </button>
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[auto_minmax(320px,1fr)] items-start">
        <div className="overflow-x-auto rounded-md border border-stripe-border bg-[#f6f9fc] p-3">
          <div className="mx-auto w-fit shadow-sm">
            <OnboardingSheet
              ref={sheetRef}
              kind={form.kind}
              data={form.company}
              company={context.company}
              employee={context.employee}
              input={input}
              signature={signature}
              signedDate={kstToday()}
              seal={def.seal}
            />
          </div>
        </div>

        <Panel className="2xl:sticky 2xl:top-8">
          <PanelHeader title={`${def.label} 작성`} description="내용을 끝까지 읽고 동의·서명한 뒤 제출하세요." />
          <PanelBody className="space-y-4">
            {inputs.map((key) => (
              <div key={key}>
                <label className="stripe-label">{EMPLOYEE_INPUT_LABELS[key]}</label>
                <input
                  className="stripe-input"
                  value={values[key] || ''}
                  maxLength={key === 'address' ? 200 : 30}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </div>
            ))}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>{ONBOARDING_AGREEMENTS[form.kind]}</span>
            </label>
            <div>
              <label className="stripe-label">서명</label>
              <SignaturePad onChange={setSignature} disabled={busy} />
            </div>
            {error && <p className="text-sm text-[#df1b41]">{error}</p>}
            <Button className="w-full" onClick={handleSubmit} disabled={busy}>
              <FileSignature className="h-4 w-4" />
              {busy ? '서류 만드는 중…' : '동의하고 제출'}
            </Button>
            <p className="text-xs text-stripe-muted leading-relaxed">
              제출하면 서명이 들어간 서류가 PDF로 인사기록카드에 보관되고, 제출 뒤에는 고칠 수 없습니다. 잘못 제출했다면
              인사담당에게 다시 요청해 달라고 하세요.
            </p>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function FormList({ forms, onWrite }) {
  const [busyId, setBusyId] = useState(null);

  async function handleOpen(form, preview) {
    setBusyId(form.id);
    try {
      await openProtectedFile(
        () => leaveApi.downloadMyOnboardingForm(form.id),
        `${form.docType}_${String(form.signedAt).slice(0, 10)}.pdf`,
        preview
      );
    } catch (err) {
      window.alert(err.message || '파일을 열지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="divide-y divide-stripe-border">
      {forms.map((form) => {
        const status = ONBOARDING_STATUS[form.status];
        return (
          <div key={form.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{form.label}</span>
                <Badge variant={status?.variant}>{status?.label}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-stripe-muted">
                {form.status === 'signed'
                  ? `${String(form.signedAt).slice(0, 16)} 제출`
                  : `${form.requestedBy || '인사담당'} 요청 · ${String(form.requestedAt).slice(0, 10)}`}
              </p>
            </div>
            {form.status === 'requested' ? (
              <Button size="sm" onClick={() => onWrite(form.id)}>
                <PenLine className="h-3.5 w-3.5" />
                작성하기
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={busyId === form.id} onClick={() => handleOpen(form, true)}>
                  <Eye className="h-3.5 w-3.5" />
                  보기·인쇄
                </Button>
                <Button size="sm" variant="secondary" disabled={busyId === form.id} onClick={() => handleOpen(form, false)}>
                  <Download className="h-3.5 w-3.5" />
                  내려받기
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EmployeeOnboarding() {
  const { data, isLoading, isError, error, refetch } = useMyOnboarding();
  const [writingId, setWritingId] = useState(null);
  const [message, setMessage] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  const writing = data.forms.find((f) => f.id === writingId && f.status === 'requested');
  const pending = data.forms.filter((f) => f.status === 'requested').length;

  return (
    <div>
      <PageHeader
        title="입사 서류"
        description="인사담당이 요청한 근로계약서·임금결정통지서·서약서를 확인하고 동의·서명합니다. 작성한 서류는 언제든 내려받을 수 있습니다."
      />
      {writing ? (
        <FormWriter
          key={writing.id}
          form={writing}
          context={data}
          onBack={() => setWritingId(null)}
          onDone={(text) => {
            setWritingId(null);
            setMessage(text);
          }}
        />
      ) : (
        <>
          {message && (
            <p className="mb-4 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-3 text-sm text-[#047857]">{message}</p>
          )}
          <Panel>
            <PanelHeader
              title="받은 서류"
              description={pending ? `작성할 서류가 ${pending}건 있습니다.` : '작성할 서류가 없습니다.'}
            />
            {data.forms.length === 0 ? (
              <p className="py-10 text-center text-sm text-stripe-muted">받은 입사 서류 작성 요청이 없습니다.</p>
            ) : (
              <FormList forms={data.forms} onWrite={setWritingId} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
