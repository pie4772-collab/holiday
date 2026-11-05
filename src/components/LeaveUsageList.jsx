import { Badge } from './ui/Badge';
import { describeGroupDates, groupLeaveUsages, isSpecialLeave, usageLabel } from '../constants/leaveKinds';
import { useCancelLeaveRequest } from '../hooks/useLeaveData';
import { useAppStore } from '../store/useAppStore';

const STATUS = {
  pending: { label: '승인 대기', variant: 'warning' },
  approved: { label: '승인됨', variant: 'success' },
  rejected: { label: '반려', variant: 'danger' },
};

export function leaveBadgeVariant(usage) {
  if (isSpecialLeave(usage?.kind)) return 'purple';
  return usage?.type === 'half' ? 'warning' : 'info';
}

/**
 * 같은 신청으로 넣은 여러 날은 한 줄로 묶어 보여 줍니다.
 * cancelableFor: 본인 직원 ID. 주면 승인 대기 신청에 취소 버튼을 보여줍니다(묶인 날 모두 취소).
 */
export function LeaveUsageList({ usages = [], emptyText = '신청 내역이 없습니다.', cancelableFor = null }) {
  const cancelRequest = useCancelLeaveRequest(cancelableFor);
  const setLastRequestMessage = useAppStore((state) => state.setLastRequestMessage);
  const groups = groupLeaveUsages(usages);

  const handleCancel = async (group) => {
    const label = usageLabel(group.first);
    if (!window.confirm(`${describeGroupDates(group)} ${label} 신청을 취소할까요?`)) return;
    try {
      const result = await cancelRequest.mutateAsync({ id: group.first.id, group: group.items.length > 1 });
      setLastRequestMessage(result?.message || '휴가 신청을 취소했습니다.');
    } catch (error) {
      window.alert(error.message || '신청을 취소하지 못했습니다.');
    }
  };

  if (!groups.length) {
    return <p className="px-5 py-8 text-sm text-stripe-muted text-center">{emptyText}</p>;
  }

  return (
    <div className="divide-y divide-[#f0f3f7]">
      {groups.map((group) => {
        const usage = group.first;
        const status = STATUS[usage.status] || STATUS.pending;
        const cancelable = cancelableFor && usage.status === 'pending';
        return (
          <div key={group.key} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-mono text-stripe-text">{describeGroupDates(group)}</p>
              <p className="text-[13px] text-stripe-muted mt-0.5 truncate">
                {usage.reason || '사유 없음'}
              </p>
              {usage.status === 'rejected' && usage.rejectReason && (
                <p className="text-[12px] text-[#df1b41] mt-1">반려: {usage.rejectReason}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant={leaveBadgeVariant(usage)}>{usageLabel(usage)}</Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
              {cancelable && (
                <button
                  type="button"
                  onClick={() => handleCancel(group)}
                  disabled={cancelRequest.isPending}
                  className="text-[12px] text-[#df1b41] hover:text-[#c91839] disabled:opacity-50"
                >
                  신청 취소
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
