import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { DueBadge, EvaluationStatusBadge, OutcomeBadge } from '../../components/evaluations/EvaluationBadges';
import { EvaluationModal } from '../../components/evaluations/EvaluationModal';
import { AssignEvaluatorModal } from '../../components/evaluations/AssignEvaluatorModal';
import { useEvaluationAction, useEvaluations, useSetHireType } from '../../hooks/useEvaluations';
import { EVALUATION_KINDS, HIRE_TYPES, OPEN_STATUSES, REMINDER_DAYS } from '../../constants/evaluation';
import { formatDate } from '../../utils/leaveCalculations';

function Stat({ label, value, tone = '' }) {
  return (
    <div className="stripe-panel px-4 py-3">
      <p className="text-[12px] text-stripe-muted">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone || 'text-stripe-text'}`}>{value}</p>
    </div>
  );
}

function UntypedPanel({ employees, onMessage }) {
  const setHireType = useSetHireType();
  const [busyId, setBusyId] = useState('');

  async function choose(employee, hireType) {
    setBusyId(employee.id);
    try {
      await setHireType.mutateAsync({ employeeId: employee.id, hireType });
      const label = HIRE_TYPES.find((t) => t.key === hireType)?.label;
      onMessage({ type: 'ok', text: `${employee.name}님을 ${label}(으)로 지정하고 평가 일정을 만들었습니다.` });
    } catch (err) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId('');
    }
  }

  return (
    <Panel className="mb-5">
      <PanelHeader
        title={`입사 구분 미지정 ${employees.length}명`}
        description="입사 1년이 안 된 직원입니다. 신입·경력을 정하면 평가 일정이 만들어집니다. 기한이 지난 평가는 필요 없으면 취소하세요."
      />
      <div className="stripe-table-fit-wrap">
        <table className="stripe-table stripe-table-fit w-full">
          <thead>
            <tr>
              <th>이름</th>
              <th>부서</th>
              <th>입사일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="whitespace-nowrap">
                  <span className="font-medium">{employee.name}</span>
                  <span className="ml-1 text-[12px] text-stripe-muted">{employee.position}</span>
                </td>
                <td className="muted whitespace-nowrap">
                  {employee.workplace} · {employee.department}
                </td>
                <td className="font-mono text-[13px] whitespace-nowrap">{employee.hireDate}</td>
                <td className="text-right whitespace-nowrap">
                  <div className="inline-flex gap-1.5">
                    {HIRE_TYPES.map((type) => (
                      <Button
                        key={type.key}
                        size="sm"
                        variant="secondary"
                        title={type.hint}
                        disabled={busyId === employee.id}
                        onClick={() => choose(employee, type.key)}
                      >
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CancelForm({ item, onDone, onCancel }) {
  const action = useEvaluationAction();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      await action.mutateAsync({ id: item.id, action: 'cancel', data: { note } });
      onDone(`${item.employee.name} ${item.label}을(를) 취소했습니다.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="취소 사유 (예: 이전에 평가 완료)"
        maxLength={500}
        className="stripe-input w-56"
      />
      {error && <p className="text-[12px] text-[#df1b41]">{error}</p>}
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          닫기
        </Button>
        <Button size="sm" variant="danger" disabled={action.isPending || note.trim().length < 2} onClick={submit}>
          평가 취소
        </Button>
      </div>
    </div>
  );
}

export function AdminEvaluations() {
  const [view, setView] = useState('active');
  const { data, isLoading, isError, error, refetch } = useEvaluations(view);
  const restore = useEvaluationAction();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [openId, setOpenId] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [message, setMessage] = useState(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter(
      (item) =>
        (!kind || item.kind === kind) &&
        (!q ||
          [item.employee.name, item.employee.empNo, item.employee.department, item.evaluatorName, item.reviewerName].some((v) =>
            String(v || '').toLowerCase().includes(q)
          ))
    );
  }, [data, query, kind]);

  function done(text) {
    setMessage({ type: 'ok', text });
    setCancelling(null);
  }

  async function handleRestore(item) {
    try {
      await restore.mutateAsync({ id: item.id, action: 'restore' });
      done(`${item.employee.name} ${item.label}을(를) 되살렸습니다.`);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  const summary = data.summary;

  return (
    <div>
      <PageHeader
        title="수습·정기 평가"
        description={`신입은 수습평가(입사 3개월)와 입사 1년 평가, 경력은 3개월 평가를 합니다. 팀장 작성 → 임원 의견 → 인사담당 확정 순서이고, 기한 ${REMINDER_DAYS}일 전에 평가자와 인사담당에게 메일로 알립니다.`}
      />

      {message && (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'border-[#fecaca] bg-[#fef2f2] text-[#df1b41]'
              : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#09825d]'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="작성 대기" value={summary.pending} />
        <Stat label={`기한 ${REMINDER_DAYS}일 이내`} value={summary.dueSoon} tone={summary.dueSoon ? 'text-[#c2410c]' : ''} />
        <Stat label="기한 지남" value={summary.overdue} tone={summary.overdue ? 'text-[#df1b41]' : ''} />
        <Stat label="임원 의견 대기" value={summary.reviewing} tone={summary.reviewing ? 'text-[#6d28d9]' : ''} />
        <Stat label="확정 대기" value={summary.submitted} tone={summary.submitted ? 'text-[#4338ca]' : ''} />
        <Stat label="평가자 미지정" value={summary.noEvaluator} tone={summary.noEvaluator ? 'text-[#b45309]' : ''} />
      </div>

      {data.untyped.length > 0 && <UntypedPanel employees={data.untyped} onMessage={setMessage} />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-md border border-stripe-border p-0.5">
          {[
            { key: 'active', label: '진행 중' },
            { key: 'done', label: '확정·취소' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={`rounded px-4 py-1.5 text-sm font-medium ${view === tab.key ? 'bg-primary-50 text-primary-700' : 'text-stripe-muted'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:w-[28rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stripe-muted" />
            <input
              className="stripe-input stripe-input-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, 사번, 부서, 평가자, 임원"
            />
          </div>
          <select className="stripe-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">평가 전체</option>
            {Object.entries(EVALUATION_KINDS).map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Panel>
        {!items.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">
              {view === 'active' ? '진행 중인 평가가 없습니다. 직원을 등록할 때 입사 구분(신입·경력)을 정하면 일정이 만들어집니다.' : '확정·취소된 평가가 없습니다.'}
            </p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>대상</th>
                  <th>평가</th>
                  <th>기한</th>
                  <th>평가자 · 임원</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap">
                      <Link to={`/admin/personnel/${item.employee.id}`} className="font-medium hover:text-primary-600">
                        {item.employee.name}
                      </Link>
                      <span className="ml-1 text-[12px] text-stripe-muted">{item.employee.position}</span>
                      <div className="text-[12px] text-stripe-muted">
                        {item.employee.department} · 입사 {formatDate(item.employee.hireDate)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{item.label}</td>
                    <td className="whitespace-nowrap">
                      <div className="font-mono text-[13px]">{item.dueDate}</div>
                      <DueBadge item={item} />
                    </td>
                    <td className="whitespace-nowrap">
                      <div>
                        <span className="text-[12px] text-stripe-muted">팀장 </span>
                        {item.evaluatorName ? (
                          <span>{item.evaluatorName}</span>
                        ) : (
                          <span className="text-[13px] text-[#b45309]">미지정</span>
                        )}
                        {['pending', 'reviewing'].includes(item.status) && (
                          <button
                            type="button"
                            onClick={() => setAssigning(item)}
                            className="ml-2 text-[12px] text-primary-600 hover:text-primary-700"
                          >
                            {item.evaluatorId || item.reviewerId ? '변경' : '지정'}
                          </button>
                        )}
                      </div>
                      <div className="text-[13px]">
                        <span className="text-[12px] text-stripe-muted">임원 </span>
                        {item.reviewerName || <span className="text-stripe-muted">-</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <EvaluationStatusBadge status={item.status} />
                        <OutcomeBadge outcome={item.outcome} />
                      </div>
                      {item.totalScore != null && item.status !== 'pending' && (
                        <div className="mt-0.5 text-[12px] text-stripe-muted">
                          {item.totalScore}/{item.maxScore}점
                        </div>
                      )}
                      {item.status === 'pending' && item.hrNote && (
                        <div className="mt-0.5 text-[12px] text-[#b45309]">반려됨</div>
                      )}
                      {item.status === 'cancelled' && item.hrNote && (
                        <div className="mt-0.5 max-w-[14rem] truncate text-[12px] text-stripe-muted" title={item.hrNote}>
                          {item.hrNote}
                        </div>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {cancelling === item.id ? (
                        <CancelForm item={item} onDone={done} onCancel={() => setCancelling(null)} />
                      ) : (
                        <div className="inline-flex gap-1.5">
                          <Button size="sm" variant={item.status === 'submitted' ? 'primary' : 'secondary'} onClick={() => setOpenId(item.id)}>
                            {item.status === 'submitted' ? '확인·확정' : OPEN_STATUSES.includes(item.status) ? '평가표' : '보기'}
                          </Button>
                          {OPEN_STATUSES.includes(item.status) && (
                            <Button size="sm" variant="ghost" onClick={() => setCancelling(item.id)}>
                              취소
                            </Button>
                          )}
                          {item.status === 'cancelled' && (
                            <Button size="sm" variant="ghost" disabled={restore.isPending} onClick={() => handleRestore(item)}>
                              되살리기
                            </Button>
                          )}
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

      {openId && <EvaluationModal evaluationId={openId} onClose={() => setOpenId(null)} onDone={done} />}
      {assigning && <AssignEvaluatorModal item={assigning} onClose={() => setAssigning(null)} onDone={done} />}
    </div>
  );
}
