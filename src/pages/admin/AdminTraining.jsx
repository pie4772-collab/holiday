import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Plus, Settings2 } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar, TrainingDueBadge } from '../../components/training/TrainingBadges';
import { SessionFormModal } from '../../components/training/SessionFormModal';
import { CourseFormModal } from '../../components/training/CourseFormModal';
import { useTrainingCourses, useTrainingSessions } from '../../hooks/useTraining';
import { formatSeconds, videoUrl } from '../../constants/training';

/** 법정의무교육: 연도별 배정·수료 현황과 교육 과정 설정 */
export function AdminTraining() {
  const navigate = useNavigate();
  const [year, setYear] = useState(null);
  const sessions = useTrainingSessions(year);
  const courses = useTrainingCourses();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const shownYear = sessions.data?.year || year || new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title="법정의무교육"
        description="교육 과정마다 연도별로 대상과 기한을 정해 배정하면, 직원이 사내 시스템에서 영상을 보고 수료합니다. 수료 명단은 CSV·인쇄 대장으로 남길 수 있습니다."
        actions={
          <>
            <select className="stripe-input w-auto" value={shownYear} onChange={(e) => setYear(Number(e.target.value))}>
              {(sessions.data?.years || [shownYear]).map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <Button onClick={() => setCreating(true)} disabled={!courses.data?.length}>
              <Plus className="h-4 w-4" /> 교육 배정
            </Button>
          </>
        }
      />

      <Panel className="mb-6">
        <PanelHeader title={`${shownYear}년 교육 배정`} />
        {sessions.isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : sessions.isError ? (
          <ErrorMessage message={sessions.error?.message} onRetry={() => sessions.refetch()} />
        ) : !sessions.data.sessions.length ? (
          <PanelBody>
            <p className="py-6 text-center text-sm text-stripe-muted">
              {shownYear}년에 배정한 교육이 없습니다. 오른쪽 위 "교육 배정"으로 시작하세요.
            </p>
          </PanelBody>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>교육</th>
                  <th>기간</th>
                  <th>수료 현황</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {sessions.data.sessions.map((s) => {
                  const percent = s.assigneeCount ? (s.completedCount / s.assigneeCount) * 100 : 0;
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/admin/training/${s.id}`} className="font-medium text-stripe-text hover:text-primary-600">
                          {s.title}
                        </Link>
                        <div className="text-[12px] text-stripe-muted">{s.provider}</div>
                      </td>
                      <td className="whitespace-nowrap font-mono text-[13px]">
                        {s.startDate} ~ {s.dueDate}
                      </td>
                      <td className="min-w-[10rem]">
                        <ProgressBar percent={percent} />
                        <div className="mt-1 text-[12px] text-stripe-muted">
                          {s.completedCount}/{s.assigneeCount}명 수료 ({Math.round(percent)}%)
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {s.status === 'closed' ? (
                          <Badge>마감</Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="info">진행</Badge>
                            <TrainingDueBadge daysLeft={s.daysLeft} done={s.completedCount === s.assigneeCount} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="교육 과정"
          description="공식 영상과 회사 자료를 과정마다 관리합니다. 영상 주소나 회사 규정이 바뀌면 여기서 고치세요."
          actions={
            <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
              <Plus className="h-3.5 w-3.5" /> 과정 추가
            </Button>
          }
        />
        {courses.isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : courses.isError ? (
          <ErrorMessage message={courses.error?.message} onRetry={() => courses.refetch()} />
        ) : (
          <ul className="divide-y divide-stripe-border">
            {courses.data.map((course) => {
              const missingMaterial = course.requireMaterialConfirm && !course.companyMaterial;
              return (
                <li key={course.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stripe-text">{course.title}</span>
                        {course.provider && <span className="text-[12px] text-stripe-muted">{course.provider}</span>}
                        {!course.isActive && <Badge>사용 안 함</Badge>}
                        {course.requireMaterialConfirm && course.companyMaterial && <Badge variant="purple">회사 자료 확인</Badge>}
                      </div>
                      {course.guidance && <p className="mt-1 text-[12px] leading-relaxed text-stripe-muted">{course.guidance}</p>}
                      {missingMaterial && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#df1b41]">
                          <AlertTriangle className="h-3.5 w-3.5" /> 회사 자료(처리절차·조치기준·고충상담 및 구제절차)를 입력하세요.
                        </p>
                      )}
                      <ul className="mt-2 space-y-0.5">
                        {course.videos.map((v) => (
                          <li key={v.id} className="text-[12px] text-stripe-text">
                            <a href={videoUrl(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary-600">
                              {v.title} <ExternalLink className="h-3 w-3 text-stripe-muted" />
                            </a>
                            <span className="ml-1 text-stripe-muted">
                              {v.kind === 'link' ? '외부 사이트' : v.durationSeconds ? formatSeconds(v.durationSeconds) : '길이 미확인'}
                            </span>
                          </li>
                        ))}
                        {!course.videos.length && <li className="text-[12px] text-[#df1b41]">등록된 영상이 없습니다.</li>}
                      </ul>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(course)}>
                      <Settings2 className="h-3.5 w-3.5" /> 설정
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {creating && courses.data && (
        <SessionFormModal
          courses={courses.data}
          year={shownYear}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            navigate(`/admin/training/${saved.id}`);
          }}
        />
      )}
      {editing && <CourseFormModal course={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
