import { Check } from 'lucide-react';
import { formatDate, getOneYearAnniversary } from '../utils/leaveCalculations';
import { Panel, PanelHeader, PanelBody } from './ui/Panel';
import { Badge } from './ui/Badge';

export function Timeline({ hireDate, leaveSummary }) {
  const settlement = leaveSummary?.firstYearMonthlySettlement;
  const oneYearDate = hireDate ? formatDate(getOneYearAnniversary(hireDate)) : null;
  const year = leaveSummary?.displayYear ?? new Date().getFullYear();
  const settledDeduction = leaveSummary?.settledDeduction ?? 0;
  const phase = leaveSummary?.phase
    || (leaveSummary?.isFirstYear ? 'first_year_monthly' : leaveSummary?.isProratedTarget ? 'prorated' : 'annual');

  const firstYearStatus = phase === 'first_year_monthly' ? 'current' : 'completed';
  const settlementStatus = phase === 'first_year_monthly' ? 'upcoming' : 'completed';
  const proratedStatus = phase === 'prorated' ? 'current' : phase === 'annual' ? 'completed' : 'upcoming';
  const annualStatus = phase === 'annual' ? 'current' : 'upcoming';

  const steps = [
    {
      key: 'hire',
      title: '입사',
      date: hireDate ? formatDate(hireDate) : '-',
      description: '입사일 기준 연차 관리 시작',
      status: 'completed',
    },
    {
      key: 'first_year',
      title: '첫해 월차 발생',
      date: hireDate ? `${formatDate(hireDate)} ~` : '-',
      description: firstYearStatus === 'current'
        ? `입사 대응일마다 1개 발생 (최대 11개) · 현재 ${settlement?.totalMonths || 0}개`
        : '입사 대응일마다 1개 발생 (최대 11개) · 첫해 월차 기간 종료',
      status: firstYearStatus,
    },
    {
      key: 'settlement',
      title: '첫해 월차 정산 (일사일)',
      date: settlement?.settledDate || oneYearDate || '입사 1주년',
      description: settlementStatus === 'completed'
        ? settlement?.settledThisYear
          ? `정산 ${settlement.settledDays}일 · 잔여에서 차감`
          : '일사일(입사 1주년) 정산 완료'
        : '일사일(입사 1주년)에 월차 일괄 정산·잔여 차감',
      status: settlementStatus,
    },
    {
      key: 'prorated',
      title: '비례 연차',
      date: oneYearDate || '-',
      description: leaveSummary?.proratedLeave
        ? `15 × (남은일수/365) → ${leaveSummary.proratedLeave}일 (0.1~0.4→0.5, 0.6~0.9→1)`
        : proratedStatus === 'completed'
          ? '1년 도달 후 다음 회계연도까지 비례 발생 · 기간 종료'
          : '1년 도달 후 다음 회계연도까지 비례 발생',
      status: proratedStatus,
    },
    {
      key: 'annual',
      title: '정규 연차 (회계기준일)',
      date: '매년 1/1',
      description: leaveSummary?.annualLeave
        ? `${year}년 ${leaveSummary.annualLeave}일 · 정산 ${settledDeduction}일 차감`
        : `${year}년 회계기준일(1/1) 발생·정산`,
      status: annualStatus,
    },
  ];

  return (
    <Panel>
      <PanelHeader title={`${year}년 연차 타임라인`} />
      <PanelBody noPadding>
        <div className="divide-y divide-[#f0f3f7]">
          {steps.map((step) => (
            <div key={step.key} className="flex gap-4 px-5 py-4">
              <div className="flex-shrink-0 pt-0.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    step.status === 'completed'
                      ? 'bg-[#d7f7c2] text-[#09825d]'
                      : step.status === 'current'
                        ? 'bg-primary-500 text-white'
                        : 'bg-[#f0f3f7] text-stripe-muted'
                  }`}
                >
                  {step.status === 'completed' ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-medium text-stripe-text">{step.title}</h4>
                  {step.status === 'current' && <Badge variant="primary">현재</Badge>}
                  {step.status === 'upcoming' && <Badge>예정</Badge>}
                </div>
                <p className="text-xs text-stripe-muted mt-0.5 font-mono">{step.date}</p>
                <p className="text-[13px] text-stripe-muted mt-1.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}
