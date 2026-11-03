/** 영상 길이의 이 비율 이상을 정상 재생으로 시청해야 그 영상을 수료한 것으로 봅니다. */
export const COMPLETE_RATIO = 0.9;

/** 기한이 이 일수 안으로 들어오면 미수료자에게 안내 메일을 한 번 보냅니다. */
export const TRAINING_REMINDER_DAYS = 7;

/** 시청 기록을 보내는 간격(초)과 한 번에 인정하는 최대 시청 시간(초) */
export const HEARTBEAT_SECONDS = 10;
export const MAX_HEARTBEAT_SECONDS = 30;

export const VIDEO_KINDS = {
  youtube: '영상 (페이지에서 재생)',
  link: '외부 사이트 링크',
};

export const TARGET_TYPES = {
  all: '전 직원',
  workplace: '사업장',
  employees: '직원 선택',
};

/** TargetPicker 값 → 서버로 보낼 대상 */
export function targetPayload(value) {
  if (value.type === 'workplace') return { type: 'workplace', workplaceCode: value.workplaceCode };
  if (value.type === 'employees') return { type: 'employees', employeeIds: value.employeeIds || [] };
  return { type: 'all' };
}

export const ASSIGNMENT_STATUS = {
  completed: { label: '수료', variant: 'success' },
  in_progress: { label: '수강 중', variant: 'info' },
  not_started: { label: '미수강', variant: 'default' },
  overdue: { label: '기한 지남', variant: 'danger' },
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** YouTube 주소(watch·youtu.be·embed·shorts) 또는 영상 ID 에서 11자리 ID 를 꺼냅니다. 아니면 '' */
export function parseYouTubeId(value) {
  const raw = String(value || '').trim();
  if (YOUTUBE_ID.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') || '';
    const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/);
    if (!id && match) id = match[1];
  }
  return YOUTUBE_ID.test(id) ? id : '';
}

export function videoUrl(video) {
  return video.kind === 'youtube' ? `https://www.youtube.com/watch?v=${video.videoRef}` : video.videoRef;
}

/** 초 → "12분 30초" */
export function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  if (minutes) return secs ? `${minutes}분 ${secs}초` : `${minutes}분`;
  return `${secs}초`;
}
