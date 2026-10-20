import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../LoadingSpinner';
import { ErrorMessage } from '../ErrorMessage';
import { EvaluationStatusBadge, OutcomeBadge } from './EvaluationBadges';
import { useEvaluation, useEvaluationAction, useSaveEvaluation } from '../../hooks/useEvaluations';
import {
  EVALUATION_ITEMS,
  GRADES,
  MAX_ITEM_SCORE,
  OUTCOMES,
  SCORE_LABELS,
  addDays,
  periodEnd,
  suggestGrade,
} from '../../constants/evaluation';
import { formatDate } from '../../utils/leaveCalculations';

const SCORES = Array.from({ length: MAX_ITEM_SCORE }, (_, i) => i + 1);

function initialForm(data) {
  return {
    scores: Object.fromEntries(data.scores.map((s) => [s.key, s.score])),
    grade: data.grade,
    comment: data.comment,
    recommendation: data.recommendation,
  };
}

function defaultOutcomeDate(outcome, dueDate) {
  if (outcome === 'regular') return addDays(dueDate, 1);
  if (outcome === 'extend') return periodEnd(addDays(dueDate, 1), 1);
  return '';
}

function initialDecision(data) {
  const outcome = data.kind === 'probation' ? data.recommendation || 'regular' : '';
  return { outcome, outcomeDate: defaultOutcomeDate(outcome, data.dueDate), note: '' };
}

function ChoiceButton({ active, disabled, onClick, title, children, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-primary-500 bg-primary-500 text-white'
          : 'border-stripe-border bg-white text-stripe-text hover:bg-[#f6f9fc] disabled:hover:bg-white'
      } disabled:cursor-default ${className}`}
    >
      {children}
    </button>
  );
}

/** 평가표 보기·작성. 평가 관리 권한자에게는 확정·반려 칸도 보입니다. */
export function EvaluationModal({ evaluationId, onClose, onDone }) {
  const { data, isLoading, isError, error, refetch } = useEvaluation(evaluationId);
  const save = useSaveEvaluation();
  const action = useEvaluationAction();
  const [form, setForm] = useState(null);
  const [decision, setDecision] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!data) return;
    setForm(initialForm(data));
    setDecision(initialDecision(data));
  }, [data]);

  const busy = save.isPending || action.isPending;
  const editable = Boolean(data?.canEdit);
  const isProbation = data?.kind === 'probation';

  function setScore(key, score) {
    setForm((prev) => ({ ...prev, scores: { ...prev.scores, [key]: score } }));
  }

  async function handleSave(submit) {
    setNotice(null);
    try {
      await save.mutateAsync({
        id: data.id,
        data: {
          scores: EVALUATION_ITEMS.map((item) => ({ key: item.key, score: form.scores[item.key] ?? null })),
          grade: form.grade,
          comment: form.comment,
          recommendation: isProbation ? form.recommendation : '',
          submit,
        },
      });
      if (submit) {
        onDone?.(`${data.employee.name} ${data.label} 평가표를 제출했습니다.`);
        onClose();
      } else {
        setNotice({ type: 'ok', text: data.status === 'submitted' ? '저장했습니다.' : '임시 저장했습니다. 제출해야 인사담당에게 넘어갑니다.' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  async function handleAction(name) {
    setNotice(null);
    try {
      const payload =
        name === 'confirm'
          ? { outcome: decision.outcome, outcomeDate: decision.outcomeDate, note: decision.note }
          : { note: decision.note };
      await action.mutateAsync({ id: data.id, action: name, data: payload });
      const done =
        name === 'confirm'
          ? `${data.employee.name} ${data.label}을(를) 확정했습니다. 인사기록카드 평가 이력에 기록했습니다.`
          : `${data.employee.name} ${data.label}을(를) 평가자에게 반려했습니다.`;
      onDone?.(done);
      onClose();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  const filled = form ? EVALUATION_ITEMS.map((item) => form.scores[item.key]).filter((s) => s != null) : [];
  const total = filled.reduce((sum, s) => sum + s, 0);
  const suggested = filled.length === EVALUATION_ITEMS.length ? suggestGrade(total, filled.length) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stripe-border bg-white px-5 py-4">
          {data ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-stripe-text">{data.label} 평가표</h2>
                <EvaluationStatusBadge status={data.status} />
                <OutcomeBadge outcome={data.outcome} />
              </div>
              <p className="mt-0.5 text-[13px] text-stripe-muted">
                {data.employee.name} · {data.employee.department} · {data.employee.position} · 입사 {formatDate(data.employee.hireDate)}
                {' · '}기한 {formatDate(data.dueDate)}
              </p>
            </div>
          ) : (
            <h2 className="text-base font-semibold text-stripe-text">평가표</h2>
          )}
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>

        {isLoading || (data && !form) ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="p-5">
            <ErrorMessage message={error?.message} onRetry={() => refetch()} />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {data.status === 'pending' && data.hrNote && (
              <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
                반려 사유: {data.hrNote}
              </div>
            )}
            {data.status === 'cancelled' && (
              <div className="rounded-md border border-stripe-border bg-[#f6f9fc] px-4 py-3 text-sm text-stripe-muted">
                취소된 평가입니다{data.hrNote ? ` · ${data.hrNote}` : ''}
              </div>
            )}

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-stripe-text">항목별 점수</h3>
                <span className="text-[12px] text-stripe-muted">1 매우 미흡 · 3 보통 · 5 매우 우수</span>
              </div>
              <div className="divide-y divide-[#f0f3f7] rounded-md border border-stripe-border">
                {EVALUATION_ITEMS.map((item) => (
                  <div key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stripe-text">{item.label}</p>
                      <p className="text-[12px] text-stripe-muted">{item.hint}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {SCORES.map((score) => (
                        <ChoiceButton
                          key={score}
                          title={SCORE_LABELS[score]}
                          active={form.scores[item.key] === score}
                          disabled={!editable}
                          onClick={() => setScore(item.key, score)}
                          className="w-9"
                        >
                          {score}
                        </ChoiceButton>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-right text-sm text-stripe-text">
                합계 <span className="font-semibold tabular-nums">{total}</span>
                <span className="text-stripe-muted"> / {EVALUATION_ITEMS.length * MAX_ITEM_SCORE}점</span>
                {suggested && <span className="ml-2 text-stripe-muted">추천 등급 {suggested}</span>}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-stripe-text">종합등급</h3>
              <div className="flex gap-1">
                {GRADES.map((grade) => (
                  <ChoiceButton
                    key={grade}
                    active={form.grade === grade}
                    disabled={!editable}
                    onClick={() => setForm((prev) => ({ ...prev, grade }))}
                    className="w-11"
                  >
                    {grade}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-stripe-text">평가 의견</h3>
              {editable ? (
                <textarea
                  value={form.comment}
                  onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
                  rows={4}
                  maxLength={2000}
                  placeholder="강점, 보완할 점, 근거가 되는 사례를 적어 주세요."
                  className="stripe-input resize-y"
                />
              ) : (
                <p className="whitespace-pre-line rounded-md bg-[#f6f9fc] px-4 py-3 text-sm text-stripe-text">{form.comment || '-'}</p>
              )}
            </div>

            {isProbation && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-stripe-text">평가자 의견 (수습 결과)</h3>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(OUTCOMES).map(([key, label]) => (
                    <ChoiceButton
                      key={key}
                      active={form.recommendation === key}
                      disabled={!editable}
                      onClick={() => setForm((prev) => ({ ...prev, recommendation: key }))}
                    >
                      {label}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
            )}

            {data.submittedAt && (
              <p className="text-[12px] text-stripe-muted">
                제출: {data.submittedByName || data.evaluatorName} · {data.submittedAt.slice(0, 16)}
              </p>
            )}

            {notice && (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${
                  notice.type === 'error'
                    ? 'border-[#fecaca] bg-[#fef2f2] text-[#df1b41]'
                    : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#09825d]'
                }`}
              >
                {notice.text}
              </div>
            )}

            {editable && (
              <div className="flex flex-wrap justify-end gap-2">
                {data.status === 'pending' ? (
                  <>
                    <Button variant="secondary" disabled={busy} onClick={() => handleSave(false)}>
                      임시 저장
                    </Button>
                    <Button disabled={busy} onClick={() => handleSave(true)}>
                      제출
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={busy} onClick={() => handleSave(false)}>
                    평가표 고친 내용 저장
                  </Button>
                )}
              </div>
            )}

            {data.canManage && data.status === 'submitted' && decision && (
              <div className="rounded-md border border-primary-200 bg-primary-50/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-stripe-text">인사담당 확정</h3>
                {isProbation && (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(OUTCOMES).map(([key, label]) => (
                        <ChoiceButton
                          key={key}
                          active={decision.outcome === key}
                          onClick={() =>
                            setDecision((prev) => ({ ...prev, outcome: key, outcomeDate: defaultOutcomeDate(key, data.dueDate) }))
                          }
                        >
                          {label}
                        </ChoiceButton>
                      ))}
                    </div>
                    {decision.outcome !== 'reject' ? (
                      <div className="max-w-xs">
                        <label className="stripe-label">
                          {decision.outcome === 'regular' ? '정규직 전환일' : '연장 수습 종료일'}
                        </label>
                        <input
                          type="date"
                          value={decision.outcomeDate}
                          onChange={(e) => setDecision((prev) => ({ ...prev, outcomeDate: e.target.value }))}
                          className="stripe-input"
                        />
                        {decision.outcome === 'extend' && (
                          <p className="mt-1 text-[12px] text-stripe-muted">
                            지금 수습 종료일 {data.dueDate}. 같은 평가자에게 다음 차수 수습평가가 만들어집니다.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[#b45309]">
                        본채용 거부는 서면 통지 등 별도 절차가 필요합니다. 확정해도 퇴사 처리는 되지 않으니 사원 명부에서 따로 처리하세요.
                        입사 1년 평가는 취소됩니다.
                      </p>
                    )}
                  </>
                )}
                <div>
                  <label className="stripe-label">인사 의견 (반려할 때는 반려 사유)</label>
                  <input
                    value={decision.note}
                    onChange={(e) => setDecision((prev) => ({ ...prev, note: e.target.value }))}
                    maxLength={500}
                    className="stripe-input"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy || decision.note.trim().length < 2}
                    title="반려 사유를 적어야 반려할 수 있습니다"
                    onClick={() => handleAction('return')}
                  >
                    평가자에게 반려
                  </Button>
                  <Button disabled={busy} onClick={() => handleAction('confirm')}>
                    확정
                  </Button>
                </div>
              </div>
            )}

            {data.status === 'confirmed' && (
              <div className="rounded-md border border-stripe-border bg-[#f6f9fc] px-4 py-3 text-sm text-stripe-text space-y-1">
                <p>
                  확정: {data.confirmedByName || '-'} · {data.confirmedAt.slice(0, 16)}
                </p>
                {data.outcome && (
                  <p>
                    결과: {OUTCOMES[data.outcome]}
                    {data.outcomeDate && ` (${data.outcome === 'regular' ? '전환일' : '수습 종료일'} ${data.outcomeDate})`}
                  </p>
                )}
                {data.hrNote && <p>인사 의견: {data.hrNote}</p>}
                <p className="text-[12px] text-stripe-muted">인사기록카드 평가 이력에 기록되었습니다.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
