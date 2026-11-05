import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { SelectOrInput } from '../ui/SelectOrInput';
import {
  DEFAULT_POSITION,
  JOB_RANKS,
  JOB_TYPES,
  PAY_STEP_MAX,
  POSITIONS,
  gradesForRank,
  hasPayGrade,
  payGradeText,
} from '../../constants/hr';
import { HIRE_TYPES } from '../../constants/evaluation';

const PAY_STEPS = Array.from({ length: PAY_STEP_MAX }, (_, i) => i + 1);

/** 직위를 바꾸면 그 직위에 없는 급은 비우고, 급이 하나뿐인 직위는 그 급으로 맞춥니다. 임원은 급호를 비웁니다. */
function withRank(form, jobRank) {
  if (!hasPayGrade(jobRank)) return { ...form, jobRank, payGrade: '', payStep: '' };
  const grades = gradesForRank(jobRank);
  const keep = grades.some((g) => g.key === form.payGrade);
  return { ...form, jobRank, payGrade: keep ? form.payGrade : grades.length === 1 && jobRank ? grades[0].key : '' };
}

function uniqueSorted(values) {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko', { numeric: true })
  );
}

const emptyForm = {
  empNo: '',
  name: '',
  hireDate: new Date().toISOString().slice(0, 10),
  hireType: '',
  workplace: '',
  department: '',
  jobType: '사무직',
  position: DEFAULT_POSITION,
  jobRank: '',
  payGrade: '',
  payStep: '',
  concurrentDept: '',
  concurrentPosition: '',
  email: '',
  notes: '',
};

export function EmployeeFormModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  initial,
  mode = 'create',
  employees = [],
}) {
  const [form, setForm] = useState(emptyForm);

  const workplaceOptions = useMemo(() => uniqueSorted(employees.map((e) => e.workplace)), [employees]);
  const departmentOptions = useMemo(
    () =>
      uniqueSorted(
        employees
          .filter((e) => !form.workplace || e.workplace === form.workplace)
          .map((e) => e.department)
      ),
    [employees, form.workplace]
  );
  const allDepartmentOptions = useMemo(
    () => uniqueSorted(employees.flatMap((e) => [e.department, e.concurrentDept])),
    [employees]
  );
  const jobTypeOptions = useMemo(
    () => uniqueSorted([...JOB_TYPES, ...employees.map((e) => e.jobType)]),
    [employees]
  );
  const [terminatedDate, setTerminatedDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (isOpen) {
      if (initial) {
        setForm({
          empNo: initial.empNo || '',
          name: initial.name || '',
          hireDate: initial.hireDate || '',
          hireType: initial.hireType || '',
          workplace: initial.workplace || '',
          department: initial.department || '',
          jobType: initial.jobType || '사무직',
          position: POSITIONS.includes(initial.position) ? initial.position : DEFAULT_POSITION,
          jobRank: JOB_RANKS.includes(initial.jobRank) ? initial.jobRank : '',
          payGrade: initial.payGrade || '',
          payStep: initial.payStep ? String(initial.payStep) : '',
          concurrentDept: initial.concurrentDept || '',
          concurrentPosition: POSITIONS.includes(initial.concurrentPosition)
            ? initial.concurrentPosition
            : '',
          email: initial.email || '',
          notes: initial.notes || '',
        });
      } else {
        setForm(emptyForm);
      }
      setTerminatedDate(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const isTerminate = mode === 'terminate';
  const title =
    mode === 'create' ? '입사 등록' : mode === 'terminate' ? '퇴사 처리' : '직원 정보 수정';

  function handleSubmit(e) {
    e.preventDefault();
    if (isTerminate) {
      onSubmit({ terminatedDate });
    } else {
      onSubmit(form);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>

        {isTerminate ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-sm text-stripe-muted">
              <span className="font-medium text-stripe-text">{initial?.name}</span>
              {initial?.empNo && (
                <span className="ml-1 font-mono text-xs">({initial.empNo})</span>
              )}
              님을 퇴사 처리합니다.
            </p>
            <div>
              <label className="stripe-label">퇴사일</label>
              <input
                type="date"
                value={terminatedDate}
                onChange={(e) => setTerminatedDate(e.target.value)}
                required
                className="stripe-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" variant="danger" disabled={isSubmitting}>
                {isSubmitting ? '처리 중…' : '퇴사 처리'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">이름 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">사번</label>
                <input
                  type="text"
                  value={form.empNo}
                  onChange={(e) => setForm({ ...form, empNo: e.target.value })}
                  placeholder="예: 2024001"
                  className="stripe-input font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">입사일 *</label>
                <input
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                  required
                  className="stripe-input"
                />
              </div>
              <div>
                <label className="stripe-label">입사 구분</label>
                <select
                  value={form.hireType}
                  onChange={(e) => setForm({ ...form, hireType: e.target.value })}
                  className="stripe-input"
                >
                  <option value="">미지정</option>
                  {HIRE_TYPES.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.key === 'new' ? `${type.label} (수습 3개월)` : type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.hireType && (
              <p className="-mt-2 text-[12px] text-stripe-muted">
                {HIRE_TYPES.find((t) => t.key === form.hireType)?.hint}. 평가 일정은 수습·정기 평가 화면에서 관리합니다.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">사업장</label>
                <SelectOrInput
                  value={form.workplace}
                  onChange={(workplace) =>
                    setForm((prev) => {
                      const deptExists = employees.some(
                        (e) => e.workplace === workplace && e.department === prev.department
                      );
                      return { ...prev, workplace, department: deptExists ? prev.department : '' };
                    })
                  }
                  options={workplaceOptions}
                  placeholder="사업장 선택"
                />
              </div>
              <div>
                <label className="stripe-label">직종</label>
                <SelectOrInput
                  value={form.jobType}
                  onChange={(jobType) => setForm((prev) => ({ ...prev, jobType }))}
                  options={jobTypeOptions}
                  placeholder="직종 선택"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">부서</label>
                <SelectOrInput
                  value={form.department}
                  onChange={(department) => setForm((prev) => ({ ...prev, department }))}
                  options={departmentOptions}
                  placeholder="부서 선택"
                />
              </div>
              <div>
                <label className="stripe-label">직급</label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="stripe-input"
                >
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">직위</label>
                <select
                  value={form.jobRank}
                  onChange={(e) => setForm(withRank(form, e.target.value))}
                  className="stripe-input"
                >
                  <option value="">미지정</option>
                  {JOB_RANKS.map((rank) => (
                    <option key={rank} value={rank}>
                      {rank}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="stripe-label">
                  급호
                  {payGradeText(form.payGrade, form.payStep) && (
                    <span className="ml-1.5 font-mono text-primary-600">{payGradeText(form.payGrade, form.payStep)}</span>
                  )}
                </label>
                {!hasPayGrade(form.jobRank) ? (
                  <p className="stripe-input bg-[#f6f9fc] text-stripe-muted">임원은 급호 없음</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={form.payGrade}
                      onChange={(e) => setForm({ ...form, payGrade: e.target.value })}
                      className="stripe-input"
                      aria-label="급"
                    >
                      <option value="">급</option>
                      {gradesForRank(form.jobRank).map((grade) => (
                        <option key={grade.key} value={grade.key}>
                          {grade.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={form.payStep}
                      onChange={(e) => setForm({ ...form, payStep: e.target.value })}
                      className="stripe-input"
                      aria-label="호봉"
                    >
                      <option value="">호봉</option>
                      {PAY_STEPS.map((step) => (
                        <option key={step} value={step}>
                          {step}호봉
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="stripe-label">겸직부서</label>
                <SelectOrInput
                  value={form.concurrentDept}
                  onChange={(concurrentDept) => setForm((prev) => ({ ...prev, concurrentDept }))}
                  options={allDepartmentOptions}
                  emptyLabel="없음"
                />
              </div>
              <div>
                <label className="stripe-label">겸직직급</label>
                <select
                  value={form.concurrentPosition}
                  onChange={(e) => setForm({ ...form, concurrentPosition: e.target.value })}
                  className="stripe-input"
                >
                  <option value="">없음</option>
                  {POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="stripe-label">이메일</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="stripe-input"
              />
            </div>
            <div>
              <label className="stripe-label">비고</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="stripe-input resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '저장 중…' : mode === 'create' ? '등록' : '저장'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
