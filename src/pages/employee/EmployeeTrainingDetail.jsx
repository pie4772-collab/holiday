import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, PlayCircle } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { ProgressBar, TrainingDueBadge, TrainingStatusBadge } from '../../components/training/TrainingBadges';
import { YouTubePlayer } from '../../components/training/YouTubePlayer';
import {
  useConfirmTrainingMaterial,
  useTrainingAssignment,
  useTrainingLinkAction,
  useTrainingProgress,
} from '../../hooks/useTraining';
import { COMPLETE_RATIO, formatSeconds } from '../../constants/training';

function VideoStatus({ video }) {
  if (video.completedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-[#09825d]">
        <CheckCircle2 className="h-3.5 w-3.5" /> 완료
      </span>
    );
  }
  if (video.kind === 'link') {
    return <span className="text-[12px] text-stripe-muted">{video.openedAt ? '수강 확인 필요' : '미수강'}</span>;
  }
  return (
    <span className="text-[12px] text-stripe-muted">
      {formatSeconds(video.watchedSeconds)}
      {video.requiredSeconds ? ` / ${formatSeconds(video.requiredSeconds)} 필요` : ''}
    </span>
  );
}

export function EmployeeTrainingDetail() {
  const { id } = useParams();
  const { data, isLoading, isError, error, refetch } = useTrainingAssignment(id);
  const progress = useTrainingProgress(id);
  const linkAction = useTrainingLinkAction(id);
  const confirmMaterial = useConfirmTrainingMaterial(id);
  const [selectedId, setSelectedId] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [actionError, setActionError] = useState('');

  const { mutate: sendProgress } = progress;
  const report = useCallback(
    (videoId) =>
      ({ seconds, duration }) =>
        sendProgress({ videoId, seconds, duration }, { onError: (err) => setActionError(err.message) }),
    [sendProgress]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (isError || !data) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  const writable = !data.closed;
  const fallback = data.videos.find((v) => v.kind === 'youtube' && !v.completedAt) || data.videos.find((v) => v.kind === 'youtube');
  const active = data.videos.find((v) => v.id === selectedId && v.kind === 'youtube') || fallback;

  function runLink(videoId, action) {
    setActionError('');
    linkAction.mutate({ videoId, action }, { onError: (err) => setActionError(err.message) });
  }

  function handleConfirm() {
    setActionError('');
    confirmMaterial.mutate(undefined, { onError: (err) => setActionError(err.message) });
  }

  return (
    <div>
      <PageHeader
        title={data.title}
        backTo="/employee/training"
        backLabel="법정의무교육"
        description={`${data.provider ? `${data.provider} · ` : ''}수강 기간 ${data.startDate} ~ ${data.dueDate}`}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TrainingStatusBadge status={data.status} />
          <TrainingDueBadge daysLeft={data.daysLeft} done={Boolean(data.completedAt) || data.closed} />
        </div>
      </PageHeader>

      {data.completedAt ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#09825d]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {data.completedAt.slice(0, 16)}에 수료했습니다.
        </div>
      ) : data.closed ? (
        <div className="mb-4 rounded-md border border-stripe-border bg-[#f6f9fc] px-4 py-3 text-sm text-stripe-muted">
          마감된 교육입니다. 영상은 볼 수 있지만 수강 기록은 남지 않습니다.
        </div>
      ) : (
        <div className="mb-4 rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          영상마다 {Math.round(COMPLETE_RATIO * 100)}% 이상 정상 재생으로 시청하세요{data.materialRequired ? ', 아래 회사 자료를 읽고 확인을 누르면' : '. 모두 마치면'} 자동으로
          수료됩니다. 건너뛴 구간은 시청 시간에 들어가지 않으며, 중간에 멈춰도 기록은 이어집니다.
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{actionError}</div>
      )}

      {data.description && <p className="mb-4 whitespace-pre-line text-sm text-stripe-text">{data.description}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <PanelBody>
            {active ? (
              <>
                <YouTubePlayer key={active.id} videoId={active.videoRef} report={report(active.id)} disabled={!writable} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-stripe-text">{active.title}</div>
                  <VideoStatus video={active} />
                </div>
                <ProgressBar className="mt-2" percent={active.percent} />
              </>
            ) : (
              <p className="py-8 text-center text-sm text-stripe-muted">페이지에서 재생하는 영상이 없습니다. 오른쪽 목록의 링크로 수강하세요.</p>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="교육 목록" description={`${data.videosDone}/${data.videosTotal} 완료`} />
          <ul className="divide-y divide-stripe-border">
            {data.videos.map((video) => (
              <li key={video.id} className={`px-4 py-3 ${active?.id === video.id ? 'bg-primary-50/60' : ''}`}>
                <div className="flex items-start gap-2">
                  {video.completedAt ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#09825d]" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stripe-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-stripe-text">{video.title}</div>
                    <div className="mt-0.5">
                      <VideoStatus video={video} />
                    </div>
                    {video.kind === 'youtube' ? (
                      active?.id !== video.id && (
                        <button
                          type="button"
                          onClick={() => setSelectedId(video.id)}
                          className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary-600 hover:underline"
                        >
                          <PlayCircle className="h-3.5 w-3.5" /> 재생
                        </button>
                      )
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <a
                          href={video.videoRef}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => writable && !video.openedAt && runLink(video.id, 'open')}
                          className="inline-flex items-center gap-1 rounded-md border border-stripe-border bg-white px-2.5 py-1 text-[12px] font-medium text-stripe-text hover:bg-[#f6f9fc]"
                        >
                          공식 사이트 열기 <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {writable && !video.completedAt && (
                          <Button
                            size="sm"
                            disabled={!video.openedAt || linkAction.isPending}
                            title={video.openedAt ? '' : '먼저 공식 사이트를 열어 수강하세요.'}
                            onClick={() => runLink(video.id, 'done')}
                          >
                            수강 완료
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {data.companyMaterial && (
        <Panel className="mt-4">
          <PanelHeader
            title="회사 자료"
            description={data.materialRequired ? '끝까지 읽고 확인을 눌러야 수료됩니다.' : '함께 읽어 주세요.'}
          />
          <PanelBody>
            <div className="max-h-[28rem] overflow-y-auto whitespace-pre-line rounded-md border border-stripe-border bg-[#f6f9fc] p-4 text-sm leading-relaxed text-stripe-text">
              {data.companyMaterial}
            </div>
            {data.materialRequired &&
              (data.materialConfirmedAt ? (
                <p className="mt-3 inline-flex items-center gap-1 text-sm text-[#09825d]">
                  <CheckCircle2 className="h-4 w-4" /> {data.materialConfirmedAt.slice(0, 16)}에 확인했습니다.
                </p>
              ) : (
                writable && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-stripe-text">
                      <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                      위 내용을 읽고 이해했습니다.
                    </label>
                    <Button size="sm" disabled={!agreed || confirmMaterial.isPending} onClick={handleConfirm}>
                      확인
                    </Button>
                  </div>
                )
              ))}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
