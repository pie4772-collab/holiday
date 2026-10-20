import { useState } from 'react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { DueBadge, EvaluationStatusBadge } from '../../components/evaluations/EvaluationBadges';
import { EvaluationModal } from '../../components/evaluations/EvaluationModal';
import { useMyEvaluations } from '../../hooks/useEvaluations';
import { formatDate } from '../../utils/leaveCalculations';

const TASK_LABELS = { write: '평가표 작성', review: '임원 의견 작성' };

/** 인사담당이 나를 평가자(팀장) 또는 임원으로 지정한 평가 */
export function EmployeeEvaluations() {
  const { data = [], isLoading, isError, refetch } = useMyEvaluations();
  const [openId, setOpenId] = useState(null);
  const [message, setMessage] = useState('');

  return (
    <div>
      <PageHeader
        title="평가 작성"
        description="인사담당이 평가자(팀장) 또는 임원으로 지정한 근무평가입니다. 팀장은 20개 항목 점수와 평가의견을, 임원은 팀장 제출 뒤 평가의견을 적어 제출하세요. 제출하면 인사담당이 확정합니다."
      />
      {message && (
        <div className="mb-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#09825d]">{message}</div>
      )}
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage onRetry={() => refetch()} />
        ) : !data.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">작성할 평가가 없습니다.</p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>대상</th>
                  <th>평가</th>
                  <th>내 역할</th>
                  <th>기한</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium">{item.employee.name}</span>
                      <span className="ml-1 text-[12px] text-stripe-muted">{item.employee.position}</span>
                      <div className="text-[12px] text-stripe-muted">
                        {item.employee.department} · 입사 {formatDate(item.employee.hireDate)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{item.label}</td>
                    <td className="whitespace-nowrap text-[13px]">{item.myRole === 'reviewer' ? '임원' : '평가자(팀장)'}</td>
                    <td className="whitespace-nowrap">
                      <div className="font-mono text-[13px]">{item.dueDate}</div>
                      <DueBadge item={item} />
                    </td>
                    <td className="whitespace-nowrap">
                      <EvaluationStatusBadge status={item.status} />
                      {item.status === 'pending' && item.hrNote && (
                        <div className="mt-0.5 text-[12px] text-[#b45309]">반려됨 · 사유 확인</div>
                      )}
                    </td>
                    <td className="text-right">
                      <Button size="sm" variant={item.myTask ? 'primary' : 'secondary'} onClick={() => setOpenId(item.id)}>
                        {TASK_LABELS[item.myTask] || '보기'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {openId && <EvaluationModal evaluationId={openId} onClose={() => setOpenId(null)} onDone={setMessage} />}
    </div>
  );
}
