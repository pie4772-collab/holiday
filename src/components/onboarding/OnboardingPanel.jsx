import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { Panel, PanelBody, PanelHeader } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LoadingSpinner } from '../LoadingSpinner';
import { OnboardingRequestModal } from './OnboardingRequestModal';
import { useCancelOnboardingForm, useOnboardingForms } from '../../hooks/useOnboarding';
import { ONBOARDING_STATUS } from '../../constants/onboarding';

/** 인사기록카드 증명서류 탭: 입사자에게 서류 작성을 요청하고 진행 상황을 봅니다. */
export function OnboardingPanel({ employee, editable }) {
  const { data, isLoading, isError, error } = useOnboardingForms(employee.id);
  const cancel = useCancelOnboardingForm();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const forms = data?.forms || [];

  async function handleCancel(form) {
    if (!window.confirm(`${form.label} 작성 요청을 취소할까요? 입사자 화면에서 사라집니다.`)) return;
    try {
      await cancel.mutateAsync({ employeeId: employee.id, formId: form.id });
      setMessage(`${form.label} 작성 요청을 취소했습니다.`);
    } catch (err) {
      window.alert(err.message || '취소하지 못했습니다.');
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="입사 서류 전자 작성"
        description="근로계약서·임금결정통지서·서약서·윤리서약서를 보내면 입사자가 동의·서명하고, 완성본 PDF가 아래 증명서류에 저장됩니다."
        actions={
          editable &&
          employee.isActive && (
            <Button size="sm" onClick={() => setOpen(true)} disabled={!data}>
              <FileSignature className="h-3.5 w-3.5" />
              작성 요청
            </Button>
          )
        }
      />
      {message && (
        <PanelBody className="border-b border-stripe-border py-3">
          <p className="text-sm text-stripe-muted">{message}</p>
        </PanelBody>
      )}
      {isLoading ? (
        <div className="py-8 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#df1b41]">{error?.message || '목록을 불러오지 못했습니다.'}</p>
      ) : forms.length === 0 ? (
        <p className="py-8 text-center text-sm text-stripe-muted">보낸 작성 요청이 없습니다.</p>
      ) : (
        <div className="stripe-table-fit-wrap">
          <table className="stripe-table stripe-table-fit w-full">
            <thead>
              <tr>
                <th>서류</th>
                <th>상태</th>
                <th>요청</th>
                <th>작성</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => {
                const status = ONBOARDING_STATUS[form.status];
                return (
                  <tr key={form.id}>
                    <td className="whitespace-nowrap">{form.label}</td>
                    <td className="whitespace-nowrap">
                      <Badge variant={status?.variant}>{status?.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-[13px]">
                      {form.requestedBy || '-'} · <span className="font-mono">{String(form.requestedAt).slice(0, 10)}</span>
                    </td>
                    <td className="whitespace-nowrap text-[13px]">
                      {form.status === 'signed' ? (
                        <>
                          <span className="font-mono">{String(form.signedAt).slice(0, 16)}</span>
                          <span className="ml-1 text-stripe-muted">
                            {form.documentId ? '· 증명서류에 저장' : '· 저장 파일 삭제됨'}
                          </span>
                        </>
                      ) : form.status === 'cancelled' ? (
                        <span className="font-mono text-stripe-muted">{String(form.cancelledAt).slice(0, 10)} 취소</span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {editable && form.status === 'requested' && (
                        <button className="text-xs text-stripe-muted hover:text-[#df1b41]" onClick={() => handleCancel(form)}>
                          요청 취소
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && data && (
        <OnboardingRequestModal
          employee={employee}
          company={data.company}
          forms={forms}
          onClose={() => setOpen(false)}
          onDone={(text) => {
            setOpen(false);
            setMessage(text);
          }}
        />
      )}
    </Panel>
  );
}
