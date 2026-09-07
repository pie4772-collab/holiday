import { useState } from 'react';
import { FilePlus, CheckCircle } from 'lucide-react';
import { LeaveRequestModal } from '../../components/LeaveRequestModal';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { useCurrentEmployee, useLeaveRequest } from '../../hooks/useLeaveData';
import { useAppStore } from '../../store/useAppStore';

export function EmployeeRequest() {
  const { isRequestModalOpen, openRequestModal, closeRequestModal } = useAppStore();
  const { data: employee, isLoading, isError, refetch } = useCurrentEmployee();
  const leaveRequest = useLeaveRequest();
  const [successMessage, setSuccessMessage] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !employee) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  async function handleSubmit(data) {
    try {
      const result = await leaveRequest.mutateAsync(data);
      setSuccessMessage(
        result?.approvalHint
          ? `연차 신청이 완료되었습니다. ${result.approvalHint}입니다.`
          : '연차 신청이 완료되었습니다. 승인을 기다려주세요.'
      );
      closeRequestModal();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch {
      // error handled by mutation state
    }
  }

  return (
    <div>
      <PageHeader
        title="연차 신청"
        description="날짜, 유형, 사유를 입력하여 연차를 신청합니다."
      />

      {successMessage && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {leaveRequest.isError && (
        <div className="mb-6 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          신청 중 오류가 발생했습니다. 다시 시도해주세요.
        </div>
      )}

      <Panel className="max-w-md">
        <PanelBody>
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50">
              <FilePlus className="h-6 w-6 text-primary-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stripe-text">연차 신청하기</h2>
              <p className="text-sm text-stripe-muted mt-1">
                잔여{' '}
                <span className="font-semibold text-stripe-text tabular-nums">
                  {employee.leaveSummary.remaining}일
                </span>
                <span className="text-stripe-muted/70"> · {employee.leaveSummary.displayYear}년</span>
              </p>
            </div>
            <Button className="w-full" onClick={openRequestModal}>
              신청하기
            </Button>
          </div>

          <div className="mt-6 pt-5 border-t border-stripe-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stripe-muted mb-3">
              안내
            </p>
            <ul className="space-y-2 text-[13px] text-stripe-muted">
              <li>연차 1일 · 반차 0.5일 차감</li>
              <li>팀원 신청은 팀장 승인, 경영전략실은 박지은 승인</li>
              <li>서울 팀장: 관리/수출/영업 소관 임원 승인 후 대표이사 승인</li>
            </ul>
          </div>
        </PanelBody>
      </Panel>

      <LeaveRequestModal
        isOpen={isRequestModalOpen}
        onClose={closeRequestModal}
        onSubmit={handleSubmit}
        isSubmitting={leaveRequest.isPending}
        employeeId={employee.id}
      />
    </div>
  );
}
