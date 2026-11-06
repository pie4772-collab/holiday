import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { TrainingModal } from './TrainingModal';
import { useDeleteTrainingCourse, useSaveTrainingCourse } from '../../hooks/useTraining';
import { VIDEO_KINDS, parseYouTubeId } from '../../constants/training';

function clockText(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "12:30" → 750, "12" → 720(분), '' → null. 형식이 틀리면 NaN */
function parseClock(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parts = raw.split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d+$/.test(p)) || parts.length > 3) return NaN;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0] * 60;
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

function toForm(course) {
  return {
    title: course?.title || '',
    provider: course?.provider || '',
    description: course?.description || '',
    guidance: course?.guidance || '',
    companyMaterial: course?.companyMaterial || '',
    requireMaterialConfirm: Boolean(course?.requireMaterialConfirm),
    isActive: course ? course.isActive : true,
    videos: (course?.videos || []).map((v) => ({
      key: `v${v.id}`,
      id: v.id,
      title: v.title,
      kind: v.kind,
      videoRef: v.kind === 'youtube' ? `https://www.youtube.com/watch?v=${v.videoRef}` : v.videoRef,
      duration: clockText(v.durationSeconds),
    })),
  };
}

let newKey = 0;

/** 교육 과정 추가·수정: 설명, 회사 자료, 영상 목록 */
export function CourseFormModal({ course, onClose, onSaved }) {
  const save = useSaveTrainingCourse();
  const remove = useDeleteTrainingCourse();
  const [form, setForm] = useState(() => toForm(course));
  const [error, setError] = useState('');

  function setVideo(index, patch) {
    setForm({ ...form, videos: form.videos.map((v, i) => (i === index ? { ...v, ...patch } : v)) });
  }

  function moveVideo(index, delta) {
    const videos = [...form.videos];
    const [item] = videos.splice(index, 1);
    videos.splice(index + delta, 0, item);
    setForm({ ...form, videos });
  }

  function addVideo() {
    newKey += 1;
    setForm({ ...form, videos: [...form.videos, { key: `n${newKey}`, title: '', kind: 'youtube', videoRef: '', duration: '' }] });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const videos = [];
    for (const [index, v] of form.videos.entries()) {
      const durationSeconds = v.kind === 'youtube' ? parseClock(v.duration) : null;
      if (Number.isNaN(durationSeconds)) {
        setError(`${index + 1}번째 영상 길이는 "분:초" 형식(예: 12:30)으로 입력하세요.`);
        return;
      }
      videos.push({ id: v.id, title: v.title, kind: v.kind, videoRef: v.videoRef, durationSeconds });
    }
    try {
      const saved = await save.mutateAsync({ id: course?.id, data: { ...form, videos } });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err.message || '저장하지 못했습니다.');
    }
  }

  async function handleDelete() {
    const used = Number(course.sessionCount) || 0;
    const message = used
      ? `"${course.title}" 과정을 삭제할까요?\n\n이 과정으로 배정한 교육 ${used}건과 대상자·수강·이수 기록이 모두 함께 삭제되며 되돌릴 수 없습니다. 수료 명단이 필요하면 먼저 CSV로 받아 두세요.`
      : `"${course.title}" 과정을 삭제할까요?`;
    if (!window.confirm(message)) return;
    try {
      await remove.mutateAsync(course.id);
      onClose();
    } catch (err) {
      setError(err.message || '삭제하지 못했습니다.');
    }
  }

  return (
    <TrainingModal title={course ? '교육 과정 설정' : '교육 과정 추가'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div>
            <label className="stripe-label">교육명</label>
            <input className="stripe-input" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="stripe-label">제공 기관</label>
            <input
              className="stripe-input"
              maxLength={100}
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="stripe-label">설명 (직원에게 보임)</label>
          <textarea
            rows={2}
            className="stripe-input resize-y"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className="stripe-label">활용 시 확인사항 (관리자에게만 보임)</label>
          <textarea rows={3} className="stripe-input resize-y" value={form.guidance} onChange={(e) => setForm({ ...form, guidance: e.target.value })} />
        </div>
        <div>
          <label className="stripe-label">회사 자료 (예: 성희롱 발생 시 처리절차·조치기준·고충상담 및 구제절차)</label>
          <textarea
            rows={8}
            className="stripe-input resize-y"
            value={form.companyMaterial}
            onChange={(e) => setForm({ ...form, companyMaterial: e.target.value })}
          />
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-stripe-text">
            <input
              type="checkbox"
              checked={form.requireMaterialConfirm}
              onChange={(e) => setForm({ ...form, requireMaterialConfirm: e.target.checked })}
            />
            직원이 회사 자료를 읽고 확인해야 수료
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="stripe-label mb-0">교육 영상·링크</label>
            <Button type="button" size="sm" variant="secondary" onClick={addVideo}>
              <Plus className="h-3.5 w-3.5" /> 추가
            </Button>
          </div>
          <div className="space-y-2">
            {form.videos.map((video, index) => {
              const youtubeId = video.kind === 'youtube' ? parseYouTubeId(video.videoRef) : '';
              return (
                <div key={video.key} className="rounded-md border border-stripe-border p-3">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_12rem_auto]">
                    <span className="text-[12px] font-medium text-stripe-muted">{index + 1}</span>
                    <input
                      className="stripe-input"
                      placeholder="제목"
                      maxLength={200}
                      value={video.title}
                      onChange={(e) => setVideo(index, { title: e.target.value })}
                    />
                    <select
                      className="stripe-input order-last col-span-3 sm:order-none sm:col-span-1"
                      value={video.kind}
                      onChange={(e) => setVideo(index, { kind: e.target.value })}
                    >
                      {Object.entries(VIDEO_KINDS).map(([kind, label]) => (
                        <option key={kind} value={kind}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <div className="flex">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveVideo(index, -1)}
                        className="rounded p-1 text-stripe-muted hover:bg-[#f0f3f7] disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === form.videos.length - 1}
                        onClick={() => moveVideo(index, 1)}
                        className="rounded p-1 text-stripe-muted hover:bg-[#f0f3f7] disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, videos: form.videos.filter((_, i) => i !== index) })}
                        className="rounded p-1 text-[#df1b41] hover:bg-[#fee2e2]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div
                    className={`mt-2 grid items-center gap-2 ${video.kind === 'youtube' ? 'grid-cols-[minmax(0,1fr)_7.5rem]' : 'grid-cols-1'}`}
                  >
                    <input
                      className="stripe-input"
                      placeholder={video.kind === 'youtube' ? 'YouTube 주소 (https://www.youtube.com/watch?v=...)' : 'https://...'}
                      value={video.videoRef}
                      onChange={(e) => setVideo(index, { videoRef: e.target.value })}
                    />
                    {video.kind === 'youtube' && (
                      <input
                        className="stripe-input"
                        placeholder="길이 분:초"
                        value={video.duration}
                        onChange={(e) => setVideo(index, { duration: e.target.value })}
                      />
                    )}
                  </div>
                  {video.kind === 'youtube' && video.videoRef && !youtubeId && (
                    <p className="mt-1 text-[12px] text-[#df1b41]">YouTube 영상 주소가 아닙니다.</p>
                  )}
                  {video.kind === 'youtube' && (
                    <p className="mt-1 text-[12px] text-stripe-muted">
                      길이를 비워 두면 처음 재생할 때 플레이어가 알려준 길이로 채웁니다. 영상 소유자가 퍼가기를 막은 영상은 "외부 사이트 링크"로 등록하세요.
                    </p>
                  )}
                </div>
              );
            })}
            {!form.videos.length && <p className="text-sm text-stripe-muted">등록된 영상이 없습니다.</p>}
          </div>
          {course && (
            <p className="mt-2 text-[12px] text-stripe-muted">영상 주소를 바꾸거나 지우면 그 영상의 시청 기록이 지워집니다. 이미 수료한 직원은 그대로 수료로 남습니다.</p>
          )}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-stripe-text">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          사용 (끄면 새로 배정할 때 목록에 나오지 않음)
        </label>

        {error && <p className="text-sm text-[#df1b41]">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            {course && (
              <Button type="button" variant="ghost" className="text-[#df1b41]" onClick={handleDelete} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" /> 과정 삭제
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
      </form>
    </TrainingModal>
  );
}
