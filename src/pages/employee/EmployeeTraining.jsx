import { Link } from 'react-router-dom';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar, TrainingDueBadge, TrainingStatusBadge } from '../../components/training/TrainingBadges';
import { useMyTraining } from '../../hooks/useTraining';
import { formatSeconds } from '../../constants/training';

function progressPercent(item) {
  const steps = item.videosTotal + (item.materialRequired ? 1 : 0);
  if (!steps) return item.completedAt ? 100 : 0;
  return ((item.videosDone + (item.materialConfirmedAt ? 1 : 0)) / steps) * 100;
}

/** 나에게 배정된 법정의무교육 */
export function EmployeeTraining() {
  const { data = [], isLoading, isError, error, refetch } = useMyTraining();

  return (
    <div>
      <PageHeader
        title="법정의무교육"
        description="회사가 배정한 법정의무교육입니다. 영상마다 90% 이상 시청하고, 회사 자료 확인이 필요한 교육은 확인까지 마치면 수료됩니다."
      />
      <Panel>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <ErrorMessage message={error?.message} onRetry={() => refetch()} />
        ) : !data.length ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-stripe-muted">배정된 교육이 없습니다.</p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>교육</th>
                  <th>수료 기한</th>
                  <th>진행</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/employee/training/${item.id}`} className="font-medium text-stripe-text hover:text-primary-600">
                        {item.title}
                      </Link>
                      <div className="text-[12px] text-stripe-muted">{item.provider}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="font-mono text-[13px]">{item.dueDate}</div>
                      <TrainingDueBadge daysLeft={item.daysLeft} done={Boolean(item.completedAt) || item.closed} />
                    </td>
                    <td className="min-w-[9rem]">
                      <ProgressBar percent={progressPercent(item)} />
                      <div className="mt-1 text-[12px] text-stripe-muted">
                        영상 {item.videosDone}/{item.videosTotal}
                        {item.materialRequired && ` · 자료 확인 ${item.materialConfirmedAt ? '완료' : '필요'}`}
                        {item.watchedSeconds > 0 && ` · ${formatSeconds(item.watchedSeconds)} 시청`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <TrainingStatusBadge status={item.status} />
                      {item.closed && !item.completedAt && (
                        <Badge className="ml-1" variant="default">
                          마감
                        </Badge>
                      )}
                      {item.completedAt && <div className="mt-0.5 text-[12px] text-stripe-muted">{item.completedAt.slice(0, 16)}</div>}
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
