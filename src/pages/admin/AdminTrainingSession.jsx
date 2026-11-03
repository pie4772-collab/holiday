import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Download, Mail, Pencil, Printer, Trash2, UserPlus, X } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { TrainingDueBadge, TrainingStatusBadge } from '../../components/training/TrainingBadges';
import { TrainingModal } from '../../components/training/TrainingModal';
import { TargetPicker } from '../../components/training/TargetPicker';
import { TrainingPrintSheet } from '../../components/training/TrainingPrintSheet';
import {
  useAddTrainingAssignees,
  useDeleteTrainingSession,
  useRemindTrainingSession,
  useRemoveTrainingAssignee,
  useTrainingSession,
  useTrainingTargets,
  useUpdateTrainingSession,
} from '../../hooks/useTraining';
import { leaveApi } from '../../api/leaveApi';
import { formatSeconds, targetPayload } from '../../constants/training';

const FILTERS = {
  all: { label: '전체', match: () => true },
  completed: { label: '수료', match: (a) => Boolean(a.completedAt) },
  pending: { label: '미수료', match: (a) => !a.completedAt },
};

function SessionEditModal({ session, onClose }) {
  const update = useUpdateTrainingSession();
  const [form, setForm] = useState({
    title: session.title,
    startDate: session.startDate,
    dueDate: session.dueDate,
    status: session.status,
  });
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await update.mutateAsync({ id: session.id, data: form });
      onClose();
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title="배정 수정" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div>
          <label className="stripe-label">교육명</label>
          <input className="stripe-input" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="stripe-label">시작일</label>
            <input type="date" className="stripe-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="stripe-label">수료 기한</label>
            <input type="date" className="stripe-input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-5 text-sm text-stripe-text">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={form.status === 'open'} onChange={() => setForm({ ...form, status: 'open' })} />
            진행
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={form.status === 'closed'} onChange={() => setForm({ ...form, status: 'closed' })} />
            마감 (더 이상 수강 기록을 받지 않음)
          </label>
        </div>
        <p className="text-[12px] text-stripe-muted">기한을 바꾸면 기한 전 안내 메일을 새 기한에 맞춰 다시 한 번 보냅니다.</p>
        {error && <p className="text-sm text-[#df1b41]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? '저장 중…' : '저장'}
          </Button>
        </div>
      </form>
    </TrainingModal>
  );
}

function AddAssigneesModal({ session, onClose, onAdded }) {
  const { data: targets } = useTrainingTargets();
  const add = useAddTrainingAssignees();
  const [target, setTarget] = useState({ type: 'employees', workplaceCode: '', employeeIds: [] });
  const [error, setError] = useState('');
  const existing = session.assignees.map((a) => a.employeeId);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const result = await add.mutateAsync({ id: session.id, target: targetPayload(target) });
      onAdded(result.added);
    } catch (err) {
      setError(err.message || '추가하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title="대상 추가" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <p className="text-sm text-stripe-muted">이미 대상인 직원은 목록에서 빠지며, 전 직원·사업장으로 고르면 아직 대상이 아닌 직원만 더해집니다.</p>
        {targets ? (
          <TargetPicker targets={targets} value={target} onChange={setTarget} excludeIds={existing} />
        ) : (
          <p className="text-sm text-stripe-muted">직원 목록을 불러오는 중…</p>
        )}
        {error && <p className="text-sm text-[#df1b41]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={add.isPending || !targets}>
            {add.isPending ? '추가 중…' : '추가'}
          </Button>
        </div>
      </form>
    </TrainingModal>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className="stripe-panel px-4 py-3">
      <div className="text-[12px] text-stripe-muted">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

/** 배정 상세: 대상자별 수강 현황, 대상 추가·제외, CSV·인쇄 대장, 안내 메일 */
export function AdminTrainingSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading, isError, error, refetch } = useTrainingSession(id);
  const remove = useRemoveTrainingAssignee();
  const remind = useRemindTrainingSession();
  const deleteSession = useDeleteTrainingSession();
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError || !session) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  const total = session.assignees.length;
  const completed = session.assignees.filter((a) => a.completedAt).length;
  const rows = session.assignees.filter(FILTERS[filter].match);
  const missingMaterial = session.course.requireMaterialConfirm && !session.course.companyMaterial;
  const noVideoLength = session.course.videos.some((v) => v.kind === 'youtube' && !v.durationSeconds);

  function notify(text) {
    setActionError('');
    setMessage(text);
  }

  function fail(err) {
    setMessage('');
    setActionError(err.message || '처리하지 못했습니다.');
  }

  async function handleRemind() {
    const pending = total - completed;
    if (!window.confirm(`미수료 ${pending}명에게 안내 메일을 보낼까요?`)) return;
    try {
      const result = await remind.mutateAsync(session.id);
      notify(
        `안내 메일 ${result.sent}건을 보냈습니다.${result.noEmail ? ` 이메일이 없는 직원 ${result.noEmail}명은 보내지 못했습니다.` : ''}${
          result.failed ? ` ${result.failed}건은 발송에 실패했습니다.` : ''
        }`
      );
    } catch (err) {
      fail(err);
    }
  }

  async function handleCsv() {
    try {
      const blob = await leaveApi.downloadTrainingCsv(session.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${session.title}_수료현황.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err);
    }
  }

  async function handleRemove(assignee) {
    const warn = assignee.completedAt || assignee.watchedSeconds ? ' 수강 기록도 함께 지워집니다.' : '';
    if (!window.confirm(`${assignee.name}님을 대상에서 뺄까요?${warn}`)) return;
    try {
      await remove.mutateAsync({ id: session.id, assigneeId: assignee.id });
    } catch (err) {
      fail(err);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`"${session.title}" 배정을 삭제할까요? 대상자와 수강 기록이 모두 지워집니다.`)) return;
    try {
      await deleteSession.mutateAsync(session.id);
      navigate('/admin/training');
    } catch (err) {
      fail(err);
    }
  }

  return (
    <div>
      <PageHeader
        title={session.title}
        backTo="/admin/training"
        backLabel="법정의무교육"
        description={`${session.courseTitle}${session.provider ? ` · ${session.provider}` : ''} · ${session.startDate} ~ ${session.dueDate}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('edit')}>
              <Pencil className="h-4 w-4" /> 수정
            </Button>
            <Button variant="secondary" onClick={() => setModal('add')}>
              <UserPlus className="h-4 w-4" /> 대상 추가
            </Button>
            <Button variant="secondary" onClick={handleRemind} disabled={session.status === 'closed' || completed === total || remind.isPending}>
              <Mail className="h-4 w-4" /> 안내 메일
            </Button>
            <Button variant="secondary" onClick={handleCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> 대장 인쇄
            </Button>
            <Button variant="ghost" className="text-[#df1b41]" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {session.status === 'closed' ? <Badge>마감</Badge> : <Badge variant="info">진행</Badge>}
          {session.status === 'open' && <TrainingDueBadge daysLeft={session.daysLeft} done={completed === total} />}
          {session.remindedAt && <span className="text-[12px] text-stripe-muted">기한 안내 메일 {session.remindedAt.slice(0, 16)}</span>}
        </div>
      </PageHeader>

      {message && <div className="mb-4 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#09825d]">{message}</div>}
      {actionError && <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{actionError}</div>}
      {missingMaterial && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#b45309]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          과정에 회사 자료가 비어 있어 직원이 확인 절차 없이 영상만으로 수료됩니다. 법정의무교육 화면의 교육 과정 설정에서 회사 자료를 입력하세요.
        </div>
      )}
      {noVideoLength && (
        <div className="mb-4 rounded-md border border-stripe-border bg-[#f6f9fc] px-4 py-3 text-[13px] text-stripe-muted">
          길이를 아직 모르는 영상이 있습니다. 처음 재생한 직원의 플레이어가 알려준 길이로 채워지며, 과정 설정에서 직접 넣을 수도 있습니다.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="대상" value={`${total}명`} />
        <Stat label="수료" value={`${completed}명`} tone="text-[#09825d]" />
        <Stat label="미수료" value={`${total - completed}명`} tone={total - completed ? 'text-[#df1b41]' : ''} />
        <Stat label="수료율" value={`${total ? Math.round((completed / total) * 100) : 0}%`} />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-1 border-b border-stripe-border px-4 py-2">
          {Object.entries(FILTERS).map(([key, f]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${
                filter === key ? 'bg-primary-50 text-primary-700' : 'text-stripe-muted hover:bg-[#f0f3f7]'
              }`}
            >
              {f.label} {session.assignees.filter(f.match).length}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-stripe-muted">인쇄 대장에는 지금 보이는 명단이 나옵니다.</span>
        </div>
        {!rows.length ? (
          <p className="py-10 text-center text-sm text-stripe-muted">해당하는 직원이 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>직원</th>
                  <th>소속</th>
                  <th>상태</th>
                  <th>영상</th>
                  <th>시청 시간</th>
                  {session.course.requireMaterialConfirm && session.course.companyMaterial && <th>자료 확인</th>}
                  <th>수료 일시</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-1 font-mono text-[12px] text-stripe-muted">{a.empNo}</span>
                      {!a.isActive && (
                        <Badge className="ml-1" variant="default">
                          퇴사
                        </Badge>
                      )}
                      {!a.hasEmail && <div className="text-[11px] text-stripe-muted">이메일 없음</div>}
                    </td>
                    <td className="text-[13px]">
                      {a.workplace} · {a.department}
                      <span className="text-stripe-muted"> · {a.position}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <TrainingStatusBadge status={a.status} />
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-[13px]">
                      {a.videosDone}/{a.videosTotal}
                    </td>
                    <td className="whitespace-nowrap text-[13px]">{a.watchedSeconds ? formatSeconds(a.watchedSeconds) : '-'}</td>
                    {session.course.requireMaterialConfirm && session.course.companyMaterial && (
                      <td className="whitespace-nowrap font-mono text-[12px]">{a.materialConfirmedAt ? a.materialConfirmedAt.slice(0, 16) : '-'}</td>
                    )}
                    <td className="whitespace-nowrap font-mono text-[12px]">{a.completedAt ? a.completedAt.slice(0, 16) : '-'}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        title="대상에서 빼기"
                        onClick={() => handleRemove(a)}
                        className="rounded p-1 text-stripe-muted hover:bg-[#fee2e2] hover:text-[#df1b41]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <TrainingPrintSheet session={session} rows={rows} />
      {modal === 'edit' && <SessionEditModal session={session} onClose={() => setModal(null)} />}
      {modal === 'add' && (
        <AddAssigneesModal
          session={session}
          onClose={() => setModal(null)}
          onAdded={(added) => {
            setModal(null);
            notify(added ? `${added}명을 대상에 더했습니다.` : '새로 더할 직원이 없습니다.');
          }}
        />
      )}
    </div>
  );
}
