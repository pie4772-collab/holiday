import { useState } from 'react';
import { Button } from '../ui/Button';
import { TrainingModal } from './TrainingModal';
import { TargetPicker } from './TargetPicker';
import { useCreateTrainingSession, useTrainingTargets } from '../../hooks/useTraining';
import { targetPayload } from '../../constants/training';

function todayKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** 연도별 교육 배정: 과정·기간·대상을 고릅니다. */
export function SessionFormModal({ courses, year, onClose, onSaved }) {
  const create = useCreateTrainingSession();
  const { data: targets } = useTrainingTargets();
  const active = courses.filter((c) => c.isActive);
  const today = todayKey();
  const sameYear = Number(today.slice(0, 4)) === Number(year);
  const [form, setForm] = useState({
    courseId: active[0]?.id || '',
    title: '',
    startDate: sameYear ? today : `${year}-01-01`,
    dueDate: `${year}-12-31`,
  });
  const [target, setTarget] = useState({ type: 'all', workplaceCode: '', employeeIds: [] });
  const [error, setError] = useState('');
  const course = active.find((c) => String(c.id) === String(form.courseId));
  const autoTitle = course ? `${form.startDate.slice(0, 4) || year}년 ${course.title}` : '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const saved = await create.mutateAsync({
        ...form,
        courseId: Number(form.courseId),
        title: form.title.trim() || autoTitle,
        target: targetPayload(target),
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message || '배정하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title="교육 배정" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div>
          <label className="stripe-label">교육 과정</label>
          <select className="stripe-input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.provider ? `(${c.provider})` : ''}
              </option>
            ))}
          </select>
          {course?.guidance && <p className="mt-1.5 text-[12px] leading-relaxed text-[#b45309]">{course.guidance}</p>}
          {course?.requireMaterialConfirm && !course.companyMaterial && (
            <p className="mt-1 text-[12px] text-[#df1b41]">
              회사 자료가 비어 있습니다. 과정 설정에서 회사 자료를 입력해야 직원이 확인 절차를 거칩니다.
            </p>
          )}
        </div>
        <div>
          <label className="stripe-label">교육명</label>
          <input
            className="stripe-input"
            maxLength={200}
            placeholder={autoTitle}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="stripe-label">시작일</label>
            <input
              type="date"
              className="stripe-input"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="stripe-label">수료 기한</label>
            <input type="date" className="stripe-input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="stripe-label">교육 대상 (재직 직원)</label>
          {targets ? (
            <TargetPicker targets={targets} value={target} onChange={setTarget} />
          ) : (
            <p className="text-sm text-stripe-muted">직원 목록을 불러오는 중…</p>
          )}
        </div>
        <p className="text-[12px] text-stripe-muted">
          기한 7일 전에 미수료 직원에게 안내 메일이 한 번 자동으로 나갑니다(메일 발송이 켜져 있을 때). 입사자는 배정 화면에서 대상 추가로 넣을 수 있습니다.
        </p>
        {error && <p className="text-sm text-[#df1b41]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={create.isPending || !course || !targets}>
            {create.isPending ? '배정 중…' : '배정'}
          </Button>
        </div>
      </form>
    </TrainingModal>
  );
}
