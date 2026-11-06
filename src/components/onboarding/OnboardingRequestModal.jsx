import { useState } from 'react';
import { Send, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { OnboardingSheet, SHEET_HEIGHT, SHEET_WIDTH } from './OnboardingSheet';
import { useRequestOnboardingForms } from '../../hooks/useOnboarding';
import { HIRE_TYPE_LABELS } from '../../constants/evaluation';
import { payGradeText } from '../../constants/hr';
import {
  DEFAULT_PROBATION,
  DEFAULT_WAGE_TERMS,
  INSURANCES,
  ONBOARDING_FORMS,
  defaultMonthlyBonus,
  defaultWagePeriod,
  kstToday,
  wageTotals,
} from '../../constants/onboarding';

/** 사업장별 근무장소 문구·근무시간 등은 마지막으로 보낸 값을 다음 요청의 기본값으로 씁니다. */
const LAST_KEY = 'holiday_onboarding_last';
const PREVIEW_SCALE = 0.55;

function readLast() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY)) || {};
  } catch {
    return {};
  }
}

function saveLast(employee, contract) {
  const last = readLast();
  localStorage.setItem(
    LAST_KEY,
    JSON.stringify({
      workplaces: { ...(last.workplaces || {}), [employee.workplace || '']: contract.workplace },
      workStart: contract.workStart,
      workEnd: contract.workEnd,
      breakStart: contract.breakStart,
      breakEnd: contract.breakEnd,
      workDays: contract.workDays,
      wageTerms: contract.wageTerms,
    })
  );
}

function probationFor(hireType) {
  if (hireType === 'experienced') return '해당 없음(경력)';
  if (hireType === 'contract') return '해당 없음';
  return DEFAULT_PROBATION;
}

function initialData(employee) {
  const last = readLast();
  const hire = employee.hireDate || kstToday();
  const rank = employee.jobRank || employee.position || '';
  const role = [[rank, HIRE_TYPE_LABELS[employee.hireType]].filter(Boolean).join('/'), payGradeText(employee.payGrade, employee.payStep)]
    .filter(Boolean)
    .join(', ');
  return {
    contract: {
      startDate: hire,
      endDate: '',
      contractDate: hire,
      workplace: last.workplaces?.[employee.workplace || ''] || employee.workplace || '',
      duty: `${employee.jobType || '사무직'}${role ? `(${role})` : ''}${employee.department ? `, ${employee.department} 업무` : ''}`,
      workStart: last.workStart || '08:30',
      workEnd: last.workEnd || '17:30',
      breakStart: last.breakStart || '12:00',
      breakEnd: last.breakEnd || '13:00',
      workDays: last.workDays || '매주 5일근무 / 휴일 (토/무급, 일/주휴)',
      wageTerms: last.wageTerms || DEFAULT_WAGE_TERMS,
      probation: probationFor(employee.hireType),
      insurance: Object.fromEntries(INSURANCES.map((i) => [i.key, true])),
    },
    wage: {
      category: '신규입사',
      period: defaultWagePeriod(hire),
      noticeDate: kstToday(),
      workplace: employee.workplace || '',
      rank,
      department: employee.department || '',
      hireDate: employee.hireDate || '',
      basePay: '',
      allowance: '',
      monthlyBonus: '',
    },
    pledge: {},
    ethics: { department: employee.department || '', rank },
  };
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="stripe-label">{label}</label>
      {children}
    </div>
  );
}

function digits(value) {
  return String(value).replace(/[^\d]/g, '');
}

function won(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

/** 입사자에게 보낼 서류를 고르고 계약 조건·임금을 채웁니다. 오른쪽에서 실제 서류 모양을 미리 봅니다. */
export function OnboardingRequestModal({ employee, company, forms, onClose, onDone }) {
  const request = useRequestOnboardingForms();
  const signedKinds = new Set(forms.filter((f) => f.status === 'signed').map((f) => f.kind));
  const openKinds = new Set(forms.filter((f) => f.status === 'requested').map((f) => f.kind));
  const [selected, setSelected] = useState(() => ONBOARDING_FORMS.map((f) => f.kind).filter((k) => !signedKinds.has(k)));
  const [data, setData] = useState(() => initialData(employee));
  const [bonusEdited, setBonusEdited] = useState(false);
  const [preview, setPreview] = useState(selected[0] || 'contract');
  const [error, setError] = useState('');

  const set = (kind, key, value) => setData((d) => ({ ...d, [kind]: { ...d[kind], [key]: value } }));
  const contract = data.contract;
  const wage = data.wage;
  const totals = wageTotals(wage);
  const previewKind = selected.includes(preview) ? preview : selected[0];

  function toggle(kind) {
    setSelected((list) => {
      const next = list.includes(kind) ? list.filter((k) => k !== kind) : [...list, kind];
      return ONBOARDING_FORMS.map((f) => f.kind).filter((k) => next.includes(k));
    });
    setPreview(kind);
  }

  function setBasePay(value) {
    const basePay = digits(value);
    setData((d) => ({
      ...d,
      wage: { ...d.wage, basePay, ...(bonusEdited ? {} : { monthlyBonus: basePay ? String(defaultMonthlyBonus(basePay)) : '' }) },
    }));
  }

  async function handleSubmit() {
    setError('');
    if (!selected.length) return setError('보낼 서류를 하나 이상 고르세요.');
    try {
      await request.mutateAsync({
        employeeId: employee.id,
        forms: selected.map((kind) => ({ kind, data: data[kind] })),
      });
      if (selected.includes('contract')) saveLast(employee, contract);
      onDone(`${employee.name}님에게 ${selected.length}건의 입사 서류 작성을 요청했습니다.`);
    } catch (err) {
      setError(err.message || '요청하지 못했습니다.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:max-w-6xl sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">입사 서류 작성 요청 · {employee.name}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_auto] lg:overflow-hidden">
          <div className="space-y-6 p-5 lg:overflow-y-auto">
            <section>
              <h3 className="mb-2 text-sm font-semibold">보낼 서류</h3>
              <div className="grid grid-cols-2 gap-2">
                {ONBOARDING_FORMS.map((form) => (
                  <label
                    key={form.kind}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      selected.includes(form.kind) ? 'border-primary-300 bg-primary-50' : 'border-stripe-border'
                    }`}
                  >
                    <input type="checkbox" checked={selected.includes(form.kind)} onChange={() => toggle(form.kind)} />
                    <span>{form.label}</span>
                    {signedKinds.has(form.kind) && <span className="ml-auto text-xs text-[#09825d]">작성 완료</span>}
                    {!signedKinds.has(form.kind) && openKinds.has(form.kind) && (
                      <span className="ml-auto text-xs text-[#b45309]">대기 중</span>
                    )}
                  </label>
                ))}
              </div>
              {selected.some((k) => openKinds.has(k)) && (
                <p className="mt-2 text-xs text-stripe-muted">작성 대기 중인 서류는 새로 채운 내용으로 바뀝니다.</p>
              )}
              {selected.some((k) => signedKinds.has(k)) && (
                <p className="mt-1 text-xs text-stripe-muted">이미 작성한 서류를 다시 보내면 새로 서명을 받고, 기존 PDF는 그대로 남습니다.</p>
              )}
            </section>

            {selected.includes('contract') && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">근로계약서</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="근로계약 시작일">
                    <input type="date" className="stripe-input" value={contract.startDate} onChange={(e) => set('contract', 'startDate', e.target.value)} />
                  </Field>
                  <Field label="종료일 (계약직만)">
                    <input type="date" className="stripe-input" value={contract.endDate} onChange={(e) => set('contract', 'endDate', e.target.value)} />
                  </Field>
                  <Field label="계약일">
                    <input type="date" className="stripe-input" value={contract.contractDate} onChange={(e) => set('contract', 'contractDate', e.target.value)} />
                  </Field>
                </div>
                <Field label="근무장소">
                  <input
                    className="stripe-input"
                    value={contract.workplace}
                    maxLength={200}
                    placeholder="예: 서울사무소(서울 용산 한강대로 350 갑을빌딩 8층)"
                    onChange={(e) => set('contract', 'workplace', e.target.value)}
                  />
                </Field>
                <Field label="업무의 내용">
                  <input className="stripe-input" value={contract.duty} maxLength={200} onChange={(e) => set('contract', 'duty', e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['workStart', '근로 시작'],
                    ['workEnd', '근로 종료'],
                    ['breakStart', '휴게 시작'],
                    ['breakEnd', '휴게 종료'],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input type="time" className="stripe-input" value={contract[key]} onChange={(e) => set('contract', key, e.target.value)} />
                    </Field>
                  ))}
                </div>
                <Field label="근무일/휴일">
                  <input className="stripe-input" value={contract.workDays} maxLength={200} onChange={(e) => set('contract', 'workDays', e.target.value)} />
                </Field>
                <Field label="임금 조건 (한 줄에 하나)">
                  <textarea
                    className="stripe-input min-h-[120px]"
                    value={contract.wageTerms}
                    maxLength={1000}
                    onChange={(e) => set('contract', 'wageTerms', e.target.value)}
                  />
                </Field>
                <Field label="수습기간">
                  <input className="stripe-input" value={contract.probation} maxLength={500} onChange={(e) => set('contract', 'probation', e.target.value)} />
                </Field>
                <div>
                  <span className="stripe-label">사회보험</span>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {INSURANCES.map((i) => (
                      <label key={i.key} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={Boolean(contract.insurance[i.key])}
                          onChange={(e) => set('contract', 'insurance', { ...contract.insurance, [i.key]: e.target.checked })}
                        />
                        {i.label}
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {selected.includes('wage') && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">임금결정통지서</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="구분">
                    <input className="stripe-input" value={wage.category} maxLength={50} onChange={(e) => set('wage', 'category', e.target.value)} />
                  </Field>
                  <Field label="적용기간">
                    <input className="stripe-input" value={wage.period} maxLength={50} onChange={(e) => set('wage', 'period', e.target.value)} />
                  </Field>
                  <Field label="통지일">
                    <input type="date" className="stripe-input" value={wage.noticeDate} onChange={(e) => set('wage', 'noticeDate', e.target.value)} />
                  </Field>
                  <Field label="사업장">
                    <input className="stripe-input" value={wage.workplace} maxLength={50} onChange={(e) => set('wage', 'workplace', e.target.value)} />
                  </Field>
                  <Field label="직급">
                    <input className="stripe-input" value={wage.rank} maxLength={50} onChange={(e) => set('wage', 'rank', e.target.value)} />
                  </Field>
                  <Field label="부서">
                    <input className="stripe-input" value={wage.department} maxLength={50} onChange={(e) => set('wage', 'department', e.target.value)} />
                  </Field>
                  <Field label="기본급 (월, 원)">
                    <input inputMode="numeric" className="stripe-input text-right" value={wage.basePay ? won(wage.basePay) : ''} onChange={(e) => setBasePay(e.target.value)} />
                  </Field>
                  <Field label="제수당 (월, 원)">
                    <input
                      inputMode="numeric"
                      className="stripe-input text-right"
                      value={wage.allowance ? won(wage.allowance) : ''}
                      onChange={(e) => set('wage', 'allowance', digits(e.target.value))}
                    />
                  </Field>
                  <Field label="월상여 (기본급 25%)">
                    <input
                      inputMode="numeric"
                      className="stripe-input text-right"
                      value={wage.monthlyBonus ? won(wage.monthlyBonus) : ''}
                      onChange={(e) => {
                        setBonusEdited(true);
                        set('wage', 'monthlyBonus', digits(e.target.value));
                      }}
                    />
                  </Field>
                </div>
                <p className="rounded-md bg-[#f6f9fc] px-3 py-2 text-xs text-stripe-muted">
                  월급여 {won(totals.monthly)} · 급여계 {won(totals.salaryYear)} · 상여계 {won(totals.bonusYear)} ·{' '}
                  <strong className="text-stripe-text">연봉 {won(totals.annual)}원</strong>
                </p>
              </section>
            )}

            {selected.includes('ethics') && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">윤리서약서</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="소속">
                    <input className="stripe-input" value={data.ethics.department} maxLength={50} onChange={(e) => set('ethics', 'department', e.target.value)} />
                  </Field>
                  <Field label="직위">
                    <input className="stripe-input" value={data.ethics.rank} maxLength={50} onChange={(e) => set('ethics', 'rank', e.target.value)} />
                  </Field>
                </div>
              </section>
            )}

            {selected.includes('pledge') && (
              <p className="text-sm text-stripe-muted">서약서(입사자용)는 채울 내용이 없습니다. 입사자가 현주소를 적고 서명합니다.</p>
            )}
          </div>

          <div className="hidden border-l border-stripe-border bg-[#f6f9fc] p-4 lg:block lg:overflow-y-auto">
            <div className="mb-3 flex flex-wrap gap-1">
              {selected.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPreview(kind)}
                  className={`rounded px-2.5 py-1 text-xs ${
                    previewKind === kind ? 'bg-primary-500 text-white' : 'bg-white text-stripe-muted hover:text-stripe-text'
                  }`}
                >
                  {ONBOARDING_FORMS.find((f) => f.kind === kind).label}
                </button>
              ))}
            </div>
            {previewKind ? (
              <div
                className="overflow-hidden bg-white shadow-sm"
                style={{ width: SHEET_WIDTH * PREVIEW_SCALE, height: SHEET_HEIGHT * PREVIEW_SCALE }}
              >
                <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                  <OnboardingSheet
                    kind={previewKind}
                    data={data[previewKind]}
                    company={company}
                    employee={employee}
                    seal={ONBOARDING_FORMS.find((f) => f.kind === previewKind).seal}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-stripe-muted" style={{ width: SHEET_WIDTH * PREVIEW_SCALE }}>
                서류를 고르면 미리 볼 수 있습니다.
              </p>
            )}
            <p className="mt-2 text-xs text-stripe-muted" style={{ width: SHEET_WIDTH * PREVIEW_SCALE }}>
              주소·연락처·서명·서명일은 입사자가 작성할 때 채워집니다.
              {!company.sealImage && ' 증명서 설정에 직인 이미지가 없어 직인 없이 (인)으로 찍힙니다.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-stripe-border px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
          {error && <p className="text-sm text-[#df1b41] sm:mr-auto">{error}</p>}
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={handleSubmit} disabled={request.isPending || !selected.length}>
            <Send className="h-4 w-4" />
            {request.isPending ? '보내는 중…' : `작성 요청 보내기 (${selected.length}건)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
