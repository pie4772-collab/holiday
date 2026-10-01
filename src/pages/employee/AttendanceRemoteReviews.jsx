import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { WorkTypeLabel } from '../../components/attendance/AttendanceBadges';
import { useRemoteReviews, useReviewRemote } from '../../hooks/useAttendance';
import { REMOTE_STATUS_LABELS, formatClock } from '../../constants/attendance';

const STATUS_VARIANTS = { pending: 'warning', approved: 'success', rejected: 'danger' };

function RecordTimes({ item }) {
  const r = item.record;
  return (
    <div className="space-y-0.5 text-[13px]">
      <div>
        <span className="text-stripe-muted">출근</span>{' '}
        <span className="tabular-nums">{formatClock(r.checkInAt, r.workDate) || '-'}</span>{' '}
        <WorkTypeLabel type={r.checkInType} place={r.checkInPlace} />
      </div>
      <div>
        <span className="text-stripe-muted">퇴근</span>{' '}
        <span className="tabular-nums">{formatClock(r.checkOutAt, r.workDate) || '-'}</span>{' '}
        <WorkTypeLabel type={r.checkOutType} place={r.checkOutPlace} />
      </div>
    </div>
  );
}

export function AttendanceRemoteReviews() {
  const [status, setStatus] = useState('pending');
  const { data, isLoading, isError, refetch } = useRemoteReviews(status);
  const review = useReviewRemote();
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  async function decide(item, decision) {
    setMessage('');
    try {
      await review.mutateAsync({ recordId: item.record.id, data: { decision, reason: decision === 'reject' ? reason : '' } });
      setRejecting(null);
      setReason('');
      setMessage(`${item.name} ${item.record.workDate} 외근·출장을 ${decision === 'approve' ? '확인' : '반려'}했습니다.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="외근·출장 확인"
        description="확인한 외근·출장은 지각·조퇴 판정에서 빠집니다. 팀원은 팀장, 팀장은 공장장·임원이 확인합니다."
      />
      <div className="mb-4 inline-flex rounded-md border border-stripe-border p-0.5">
        {[
          { key: 'pending', label: '확인 대기' },
          { key: 'done', label: '처리 내역 (60일)' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStatus(item.key)}
            className={`rounded px-4 py-1.5 text-sm font-medium ${status === item.key ? 'bg-primary-50 text-primary-700' : 'text-stripe-muted'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {message && (
        <div className="mb-4 rounded-md border border-stripe-border bg-[#f6f9fc] px-4 py-3 text-sm text-stripe-text">{message}</div>
      )}
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage onRetry={() => refetch()} />
        ) : !data.length ? (
          <p className="py-12 text-center text-sm text-stripe-muted">
            {status === 'pending' ? '확인할 외근·출장 기록이 없습니다.' : '처리한 내역이 없습니다.'}
          </p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>근무일</th>
                  <th>직원</th>
                  <th>기록</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.record.id}>
                    <td className="font-mono text-[13px] whitespace-nowrap">{item.record.workDate}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-medium">{item.name}</span>
                      <span className="ml-1 text-[12px] text-stripe-muted">{item.position}</span>
                      <div className="text-[12px] text-stripe-muted">
                        {item.workplace} · {item.department}
                      </div>
                    </td>
                    <td>
                      <RecordTimes item={item} />
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge variant={STATUS_VARIANTS[item.record.remoteStatus] || 'default'}>
                        {REMOTE_STATUS_LABELS[item.record.remoteStatus] || '-'}
                      </Badge>
                      {item.reviewerName && item.record.remoteStatus !== 'pending' && (
                        <div className="text-[12px] text-stripe-muted mt-0.5">{item.reviewerName}</div>
                      )}
                      {item.record.remoteRejectReason && (
                        <div className="text-[12px] text-[#df1b41] mt-0.5">{item.record.remoteRejectReason}</div>
                      )}
                    </td>
                    <td className="text-right">
                      {item.record.remoteStatus === 'pending' &&
                        (rejecting === item.record.id ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="반려 사유"
                              maxLength={500}
                              className="stripe-input w-48"
                            />
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="secondary" onClick={() => setRejecting(null)}>
                                취소
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={review.isPending || reason.trim().length < 2}
                                onClick={() => decide(item, 'reject')}
                              >
                                반려
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" disabled={review.isPending} onClick={() => decide(item, 'approve')}>
                              <CheckCircle className="h-3.5 w-3.5" />
                              확인
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={review.isPending}
                              onClick={() => {
                                setReason('');
                                setRejecting(item.record.id);
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              반려
                            </Button>
                          </div>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
