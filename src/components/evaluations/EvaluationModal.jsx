import { useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../LoadingSpinner';
import { ErrorMessage } from '../ErrorMessage';
import { EvaluationStatusBadge, OutcomeBadge } from './EvaluationBadges';
import { EvaluationPrintSheet } from './EvaluationPrintSheet';
import { useEvaluation, useEvaluationAction, useReviewEvaluation, useSaveEvaluation } from '../../hooks/useEvaluations';
import {
  COMPANY_NAME,
  EVALUATION_GROUPS,
  EVALUATION_ITEMS,
  EVALUATION_KINDS,
  MAX_ITEM_SCORE,
  MAX_TOTAL_SCORE,
  OUTCOMES,
  PASS_SCORE,
  SCORE_LABELS,
  addDays,
  allowedOutcomes,
  periodEnd,
} from '../../constants/evaluation';
import { formatDate } from '../../utils/leaveCalculations';

const SCORES = Array.from({ length: MAX_ITEM_SCORE }, (_, i) => i + 1);

function initialForm(data) {
  return {
    scores: Object.fromEntries(data.scores.map((s) => [s.key, s.score])),
    comment: data.comment,
    reviewerComment: data.reviewerComment,
    recommendation: data.recommendation,
  };
}

function sumScores(scores) {
  const filled = EVALUATION_ITEMS.map((item) => scores[item.key]).filter((s) => s != null);
  return { count: filled.length, total: filled.reduce((sum, s) => sum + s, 0) };
}

/** 점수를 다 매기면 정규직 채용 여부를 75점 기준에 맞춥니다. */
function fitRecommendation(recommendation, scores) {
  const { count, total } = sumScores(scores);
  if (count < EVALUATION_ITEMS.length) return recommendation;
  const allowed = allowedOutcomes(total);
  if (allowed.length === 1) return allowed[0];
  return allowed.includes(recommendation) ? recommendation : '';
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
      } disabled:cursor-default ${!active && disabled ? 'opacity-60' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

function InfoCell({ label, children }) {
  return (
    <div className="flex min-w-0 border-b border-r border-stripe-border">
      <div className="w-20 shrink-0 bg-[#f6f9fc] px-3 py-2 text-[12px] font-medium text-stripe-muted">{label}</div>
      <div className="min-w-0 px-3 py-2 text-sm text-stripe-text">{children || '-'}</div>
    </div>
  );
}

function OpinionBox({ title, who, editable, value, onChange, placeholder, emptyText }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stripe-text">{title}</h3>
        {who && <span className="text-[12px] text-stripe-muted">{who}</span>}
      </div>
      {editable ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={placeholder}
          className="stripe-input resize-y"
        />
      ) : (
        <p className="min-h-[3rem] whitespace-pre-line rounded-md bg-[#f6f9fc] px-4 py-3 text-sm text-stripe-text">
          {value || <span className="text-stripe-muted">{emptyText}</span>}
        </p>
      )}
    </div>
  );
}

/**
 * 근무평가서 보기·작성. 팀장(평가자)은 점수·평가의견(팀장)·정규직 채용 여부를, 임원은 평가의견(임원)을 씁니다.
 * 평가 관리 권한자에게는 확정·반려 칸도 보입니다.
 */
export function EvaluationModal({ evaluationId, onClose, onDone }) {
  const { data, isLoading, isError, error, refetch } = useEvaluation(evaluationId);
  const save = useSaveEvaluation();
  const review = useReviewEvaluation();
  const action = useEvaluationAction();
  const [form, setForm] = useState(null);
  const [decision, setDecision] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!data) return;
    setForm(initialForm(data));
    setDecision(initialDecision(data));
  }, [data]);

  const busy = save.isPending || review.isPending || action.isPending;
  const editable = Boolean(data?.canEdit);
  const reviewable = Boolean(data?.canReview);
  const isProbation = data?.kind === 'probation';

  function setScore(key, score) {
    setForm((prev) => {
      const scores = { ...prev.scores, [key]: score };
      return { ...prev, scores, recommendation: isProbation ? fitRecommendation(prev.recommendation, scores) : prev.recommendation };
    });
  }

  function finish(text) {
    onDone?.(text);
    onClose();
  }

  async function handleSave(submit) {
    setNotice(null);
    try {
      await save.mutateAsync({
        id: data.id,
        data: {
          scores: EVALUATION_ITEMS.map((item) => ({ key: item.key, score: form.scores[item.key] ?? null })),
          comment: form.comment,
          recommendation: isProbation ? form.recommendation : '',
          submit,
        },
      });
      if (submit) {
        finish(
          data.reviewerId
            ? `${data.employee.name} ${data.label} 평가표를 제출했습니다. 임원(${data.reviewerName})에게 의견을 요청했습니다.`
            : `${data.employee.name} ${data.label} 평가표를 제출했습니다.`
        );
      } else {
        setNotice({ type: 'ok', text: data.status === 'pending' ? '임시 저장했습니다. 제출해야 다음 단계로 넘어갑니다.' : '저장했습니다.' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  async function handleReview(submit) {
    setNotice(null);
    try {
      await review.mutateAsync({ id: data.id, data: { comment: form.reviewerComment, submit } });
      if (submit) finish(`${data.employee.name} ${data.label} 임원 의견을 제출했습니다.`);
      else setNotice({ type: 'ok', text: data.status === 'reviewing' ? '임원 의견을 임시 저장했습니다.' : '임원 의견을 저장했습니다.' });
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
      finish(
        name === 'confirm'
          ? `${data.employee.name} ${data.label}을(를) 확정했습니다. 인사기록카드 평가 이력에 기록했습니다.`
          : `${data.employee.name} ${data.label}을(를) 팀장에게 반려했습니다.`
      );
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  const { count, total } = form ? sumScores(form.scores) : { count: 0, total: 0 };
  const complete = count === EVALUATION_ITEMS.length;
  const allowed = complete ? allowedOutcomes(total) : Object.keys(OUTCOMES);
  const kind = data ? EVALUATION_KINDS[data.kind] : null;
  const decisionMismatch = isProbation && complete && decision?.outcome && !allowedOutcomes(total).includes(decision.outcome);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stripe-border bg-white px-5 py-4">
          {data ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-stripe-text">
                  {kind?.formTitle || '근무평가서'}
                  {data.round > 1 && ` (${data.round}차)`}
                </h2>
                <EvaluationStatusBadge status={data.status} />
                <OutcomeBadge outcome={data.outcome} />
              </div>
              <p className="mt-0.5 text-[13px] text-stripe-muted">
                {data.employee.name} · {data.label} · 문서번호 {data.documentNo} · 기한 {formatDate(data.dueDate)}
              </p>
            </div>
          ) : (
            <h2 className="text-base font-semibold text-stripe-text">근무평가서</h2>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {data && form && (
              <Button size="sm" variant="secondary" onClick={() => window.print()} title="양식 그대로 인쇄하거나 PDF로 저장합니다">
                <Printer className="h-4 w-4" />
                인쇄
              </Button>
            )}
            <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
              <X className="h-4 w-4 text-stripe-muted" />
            </button>
          </div>
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
              <h3 className="mb-2 text-sm font-semibold text-stripe-text">평가 대상</h3>
              <div className="grid grid-cols-1 border-l border-t border-stripe-border sm:grid-cols-3">
                <InfoCell label="회사">{COMPANY_NAME}</InfoCell>
                <InfoCell label="부서">{data.employee.department}</InfoCell>
                <InfoCell label="입사일자">{formatDate(data.employee.hireDate)}</InfoCell>
                <InfoCell label="성명">{data.employee.name}</InfoCell>
                <InfoCell label="직급">{data.employee.position}</InfoCell>
                <InfoCell label="평가기간">
                  {formatDate(data.periodStart)} ~ {formatDate(data.dueDate)}
                </InfoCell>
                <InfoCell label="평가자">
                  {data.evaluatorName ? `${data.evaluatorName} ${data.evaluatorPosition}` : '미지정'}
                </InfoCell>
                <InfoCell label="임원">{data.reviewerName ? `${data.reviewerName} ${data.reviewerPosition}` : '미지정'}</InfoCell>
                <InfoCell label="작성일자">{data.submittedAt ? formatDate(data.submittedAt.slice(0, 10)) : ''}</InfoCell>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-stripe-text">평가항목</h3>
                <span className="text-[12px] text-stripe-muted">평가점수 1~5점 · 1 매우 미흡 · 3 보통 · 5 매우 우수</span>
              </div>
              <div className="space-y-3">
                {EVALUATION_GROUPS.map((group) => {
                  const groupScores = group.items.map((item) => form.scores[item.key]).filter((s) => s != null);
                  return (
                    <div key={group.key} className="overflow-hidden rounded-md border border-stripe-border">
                      <div className="flex items-center justify-between bg-[#f6f9fc] px-4 py-2">
                        <span className="text-sm font-semibold text-stripe-text">{group.label}</span>
                        <span className="text-[12px] tabular-nums text-stripe-muted">
                          {groupScores.reduce((sum, s) => sum + s, 0)} / {group.items.length * MAX_ITEM_SCORE}점
                        </span>
                      </div>
                      <div className="divide-y divide-[#f0f3f7]">
                        {group.items.map((item) => (
                          <div key={item.key} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-stripe-text">{item.label}</p>
                              <p className="text-[12px] text-stripe-muted">{item.question}</p>
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
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-col gap-1 rounded-md border border-stripe-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-stripe-text">
                  최종 평가 점수 <span className="text-lg font-semibold tabular-nums">{total}</span>
                  <span className="text-stripe-muted"> / {MAX_TOTAL_SCORE}점</span>
                  {!complete && <span className="ml-2 text-[12px] text-[#b45309]">{EVALUATION_ITEMS.length}개 중 {count}개 입력</span>}
                </p>
                {isProbation && (
                  <p className="text-[12px] text-stripe-muted">
                    {PASS_SCORE}점 이상 정식 채용 · {PASS_SCORE}점 미만 수습 연장 또는 계약 종료
                  </p>
                )}
              </div>
            </div>

            <OpinionBox
              title="평가의견(팀장)"
              who={data.evaluatorName || data.submittedByName}
              editable={editable}
              value={form.comment}
              onChange={(comment) => setForm((prev) => ({ ...prev, comment }))}
              placeholder="강점, 보완할 점, 근거가 되는 사례를 적어 주세요."
              emptyText="아직 작성하지 않았습니다."
            />

            {isProbation && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-stripe-text">정규직 채용 여부</h3>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(OUTCOMES).map(([key, label]) => (
                    <ChoiceButton
                      key={key}
                      active={form.recommendation === key}
                      disabled={!editable || !allowed.includes(key)}
                      onClick={() => setForm((prev) => ({ ...prev, recommendation: key }))}
                    >
                      {label}
                    </ChoiceButton>
                  ))}
                </div>
                {editable && (
                  <p className="mt-1 text-[12px] text-stripe-muted">
                    {complete
                      ? total >= PASS_SCORE
                        ? `${PASS_SCORE}점 이상이라 정식 채용입니다.`
                        : `${PASS_SCORE}점 미만이라 수습 연장 또는 계약 종료 중에서 고릅니다.`
                      : '20개 항목 점수를 모두 매기면 점수에 맞는 결과만 고를 수 있습니다.'}
                  </p>
                )}
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
                      {data.reviewerId ? '제출 (임원 의견 요청)' : '제출'}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={busy} onClick={() => handleSave(false)}>
                    평가표 고친 내용 저장
                  </Button>
                )}
              </div>
            )}

            <OpinionBox
              title="평가의견(임원)"
              who={data.reviewedByName || data.reviewerName}
              editable={reviewable}
              value={form.reviewerComment}
              onChange={(reviewerComment) => setForm((prev) => ({ ...prev, reviewerComment }))}
              placeholder={
                data.reviewerId || !data.canManage
                  ? '평가 내용을 확인하고 의견을 적어 주세요.'
                  : '임원이 지정되지 않았습니다. 임원 의견을 받았다면 대신 입력하세요.'
              }
              emptyText={
                data.status === 'pending'
                  ? data.reviewerName
                    ? `팀장이 제출하면 ${data.reviewerName} 임원이 작성합니다.`
                    : '팀장이 제출한 뒤 작성합니다.'
                  : '작성된 의견이 없습니다.'
              }
            />

            {reviewable && (
              <div className="flex flex-wrap justify-end gap-2">
                {data.status === 'reviewing' ? (
                  <>
                    <Button variant="secondary" disabled={busy} onClick={() => handleReview(false)}>
                      임시 저장
                    </Button>
                    <Button disabled={busy} onClick={() => handleReview(true)}>
                      임원 의견 제출
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={busy} onClick={() => handleReview(false)}>
                    임원 의견 저장
                  </Button>
                )}
              </div>
            )}

            {(data.submittedAt || data.reviewedAt) && (
              <p className="text-[12px] text-stripe-muted">
                {data.submittedAt && `팀장 제출: ${data.submittedByName || data.evaluatorName} · ${data.submittedAt.slice(0, 16)}`}
                {data.submittedAt && data.reviewedAt && ' / '}
                {data.reviewedAt && `임원 의견: ${data.reviewedByName || data.reviewerName} · ${data.reviewedAt.slice(0, 16)}`}
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

            {data.canManage && ['reviewing', 'submitted'].includes(data.status) && decision && (
              <div className="rounded-md border border-primary-200 bg-primary-50/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-stripe-text">인사담당 확정</h3>
                {data.status === 'reviewing' && (
                  <p className="text-[13px] text-[#b45309]">
                    {data.reviewerName} 임원의 의견을 기다리고 있습니다. 임원 의견을 받은 뒤 확정할 수 있습니다. 종이로 받은 의견은 위 칸에 대신
                    입력해 제출하세요.
                  </p>
                )}
                {isProbation && data.status === 'submitted' && (
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
                    {decisionMismatch && (
                      <p className="text-[13px] text-[#b45309]">
                        최종 평가 점수 {total}점은 {total >= PASS_SCORE ? `${PASS_SCORE}점 이상(정식 채용)` : `${PASS_SCORE}점 미만(수습 연장 또는 계약 종료)`}
                        입니다. 기준과 다르게 확정하려면 인사 의견에 사유를 남기세요.
                      </p>
                    )}
                    {decision.outcome !== 'reject' ? (
                      <div className="max-w-xs">
                        <label className="stripe-label">{decision.outcome === 'regular' ? '정규직 전환일' : '연장 수습 종료일'}</label>
                        <input
                          type="date"
                          value={decision.outcomeDate}
                          onChange={(e) => setDecision((prev) => ({ ...prev, outcomeDate: e.target.value }))}
                          className="stripe-input"
                        />
                        {decision.outcome === 'extend' && (
                          <p className="mt-1 text-[12px] text-stripe-muted">
                            지금 수습 종료일 {data.dueDate}. 같은 팀장·임원에게 다음 차수 수습평가가 만들어집니다.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[#b45309]">
                        계약 종료는 서면 통지 등 별도 절차가 필요합니다. 확정해도 퇴사 처리는 되지 않으니 사원 명부에서 따로 처리하세요. 입사 1년
                        평가는 취소됩니다.
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
                    팀장에게 반려
                  </Button>
                  <Button disabled={busy || data.status !== 'submitted'} onClick={() => handleAction('confirm')}>
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
      {data && form && (
        <EvaluationPrintSheet
          data={data}
          scores={form.scores}
          total={count ? total : null}
          comment={form.comment}
          reviewerComment={form.reviewerComment}
          recommendation={isProbation ? form.recommendation : ''}
        />
      )}
    </div>
  );
}
