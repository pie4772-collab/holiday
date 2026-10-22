/**
 * 저장 시각(datetime('now', 'localtime'))과 오늘 날짜를 한국 시간으로 맞춥니다.
 * 운영 컨테이너는 UTC로 돌기 때문에, 다른 모듈보다 먼저 불러와야 PostgreSQL 세션 시간대에도 반영됩니다.
 */
export const HOST_UTC_OFFSET_MINUTES = -new Date().getTimezoneOffset();

process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Seoul';
