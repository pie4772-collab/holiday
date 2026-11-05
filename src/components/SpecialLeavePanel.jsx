import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Panel, PanelHeader } from './ui/Panel';
import { Badge } from './ui/Badge';
import { LoadingSpinner } from './LoadingSpinner';
import { SPECIAL_LEAVE_KINDS, describeGroupDates, groupLeaveUsages, usageLabel } from '../constants/leaveKinds';

const STATUS = {
  pending: { label: '대기', variant: 'warning' },
  approved: { label: '승인', variant: 'success' },
  rejected: { label: '반려', variant: 'danger' },
};

/**
 * 연차 외 휴가 기록: 종류별 연간 합계와 신청별 목록.
 * onDelete(group): 주면 신청별 삭제 버튼을 보여 줍니다(관리자).
 */
export function SpecialLeavePanel({ usages, isLoading, defaultYear, onDelete, deleting = false, className = '' }) {
  const [year, setYear] = useState(String(defaultYear || new Date().getFullYear()));
  const years = useMemo(() => {
    const set = new Set((usages || []).map((u) => String(u.date).slice(0, 4)));
    set.add(String(defaultYear || new Date().getFullYear()));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [usages, defaultYear]);

  const inYear = useMemo(() => (usages || []).filter((u) => String(u.date).startsWith(year)), [usages, year]);
  const groups = useMemo(
    () => groupLeaveUsages(inYear).sort((a, b) => String(b.first.date).localeCompare(String(a.first.date))),
    [inYear]
  );
  const totals = useMemo(
    () =>
      SPECIAL_LEAVE_KINDS.map((kind) => {
        const sum = (status) =>
          inYear
            .filter((u) => u.kind === kind.key && u.status === status)
            .reduce((acc, u) => acc + (Number(u.days) || 0), 0);
        return { ...kind, approved: sum('approved'), pending: sum('pending') };
      }),
    [inYear]
  );

  return (
    <Panel className={className}>
      <PanelHeader
        title="특별휴가 기록"
        description="경조휴가·공가·출산전후휴가·배우자 출산휴가·가족돌봄휴가 · 연차 잔여에서 빠지지 않습니다"
        actions={
          <select className="stripe-input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        }
      />
      {isLoading ? (
        <LoadingSpinner className="p-8" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-[#f0f3f7] border-b border-stripe-border">
            {totals.map((item) => (
              <div key={item.key} className="bg-white px-4 py-3">
                <p className="text-[12px] text-stripe-muted">{item.label}</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-stripe-text">
                  {item.approved}일
                  {item.pending > 0 && (
                    <span className="ml-1 text-[12px] font-normal text-[#b45309]">대기 {item.pending}일</span>
                  )}
                </p>
              </div>
            ))}
          </div>
          {!groups.length ? (
            <p className="py-10 text-center text-sm text-stripe-muted">{year}년 특별휴가 기록이 없습니다.</p>
          ) : (
            <div className="stripe-table-fit-wrap">
              <table className="stripe-table stripe-table-fit w-full">
                <thead>
                  <tr>
                    <th>기간</th>
                    <th>종류</th>
                    <th>상태</th>
                    <th>사유</th>
                    {onDelete && <th className="text-center">관리</th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const usage = group.first;
                    const status = STATUS[usage.status] || STATUS.pending;
                    return (
                      <tr key={group.key}>
                        <td className="font-mono text-[13px] whitespace-nowrap">{describeGroupDates(group)}</td>
                        <td>
                          <Badge variant="purple">{usageLabel(usage)}</Badge>
                        </td>
                        <td>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="muted text-[13px]">
                          {usage.reason || '-'}
                          {usage.status === 'rejected' && usage.rejectReason ? ` · 반려: ${usage.rejectReason}` : ''}
                        </td>
                        {onDelete && (
                          <td className="text-center">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => onDelete(group)}
                              className="rounded p-1.5 text-stripe-muted hover:bg-[#fee2e2] hover:text-[#df1b41] disabled:opacity-50"
                              title="이 신청 삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
