import { getDb, LOCK_TRAINING } from '../db.js';
import * as mailService from './mailService.js';
import { listEvaluationManagers } from './evaluationService.js';
import { addDays, diffDays } from '../../src/constants/evaluation.js';
import {
  COMPLETE_RATIO,
  MAX_HEARTBEAT_SECONDS,
  TRAINING_REMINDER_DAYS,
  parseYouTubeId,
} from '../../src/constants/training.js';

const TITLE_MAX = 200;
const PROVIDER_MAX = 100;
const DESCRIPTION_MAX = 2000;
const MATERIAL_MAX = 20000;
const MAX_VIDEOS = 30;
const MAX_DURATION = 6 * 3600;
const MAX_SELECTED = 2000;
/** 시청 기록이 끊겼다가 이어질 때 한 번에 인정하는 밀린 시간(초) */
const BACKLOG_SECONDS = 60;

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const kstStampFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function kstToday(date = new Date()) {
  return kstDate.format(date);
}

function kstHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(date));
}

function kstStamp(ms = Date.now()) {
  return kstStampFormat.format(new Date(ms));
}

function parseStamp(stamp) {
  const ms = Date.parse(`${String(stamp || '').replace(' ', 'T')}+09:00`);
  return Number.isFinite(ms) ? ms : 0;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

function cleanDate(value, label) {
  const raw = text(value);
  if (!isDateKey(raw)) throw httpError(`${label}을(를) YYYY-MM-DD 형식으로 입력하세요.`);
  return raw;
}

function limited(value, max, label, { required = false } = {}) {
  const raw = text(value);
  if (required && !raw) throw httpError(`${label}을(를) 입력하세요.`);
  if (raw.length > max) throw httpError(`${label}은(는) ${max}자 이내로 입력하세요.`);
  return raw;
}

/* ───────────── 과정·영상 ───────────── */

function mapVideo(row) {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: row.title,
    kind: row.kind,
    videoRef: row.video_ref,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function mapCourse(row, videos = []) {
  return {
    id: Number(row.id),
    code: row.code || null,
    title: row.title,
    provider: row.provider || '',
    description: row.description || '',
    guidance: row.guidance || '',
    companyMaterial: row.company_material || '',
    requireMaterialConfirm: Boolean(Number(row.require_material_confirm)),
    sortOrder: Number(row.sort_order) || 0,
    isActive: Boolean(Number(row.is_active)),
    videos,
  };
}

async function courseRow(id) {
  const row = await getDb().prepare('SELECT * FROM training_courses WHERE id = ?').get(toId(id));
  if (!row) throw httpError('교육 과정을 찾을 수 없습니다.', 404);
  return row;
}

async function courseVideos(courseId) {
  const rows = await getDb()
    .prepare('SELECT * FROM training_videos WHERE course_id = ? ORDER BY sort_order, id')
    .all(Number(courseId));
  return rows.map(mapVideo);
}

export async function getCourse(id) {
  const row = await courseRow(id);
  return mapCourse(row, await courseVideos(row.id));
}

export async function listCourses() {
  const db = getDb();
  const rows = await db.prepare('SELECT * FROM training_courses ORDER BY sort_order, id').all();
  const videos = await db.prepare('SELECT * FROM training_videos ORDER BY course_id, sort_order, id').all();
  const sessions = await db.prepare('SELECT course_id, COUNT(*) AS n FROM training_sessions GROUP BY course_id').all();
  const sessionCount = new Map(sessions.map((r) => [Number(r.course_id), Number(r.n)]));
  return rows.map((row) => ({
    ...mapCourse(
      row,
      videos.filter((v) => Number(v.course_id) === Number(row.id)).map(mapVideo)
    ),
    sessionCount: sessionCount.get(Number(row.id)) || 0,
  }));
}

function cleanVideo(video, index) {
  const label = `${index + 1}번째 영상`;
  const title = limited(video?.title, TITLE_MAX, `${label} 제목`, { required: true });
  const kind = video?.kind === 'link' ? 'link' : video?.kind === 'youtube' ? 'youtube' : '';
  if (!kind) throw httpError(`${label}의 종류를 고르세요.`);
  let videoRef = text(video?.videoRef);
  if (kind === 'youtube') {
    videoRef = parseYouTubeId(videoRef);
    if (!videoRef) throw httpError(`${label}: YouTube 주소(또는 11자리 영상 ID)를 확인하세요.`);
  } else {
    let url;
    try {
      url = new URL(videoRef);
    } catch {
      url = null;
    }
    if (!url || !['http:', 'https:'].includes(url.protocol)) throw httpError(`${label}: http(s)로 시작하는 주소를 입력하세요.`);
    if (videoRef.length > 1000) throw httpError(`${label}: 주소가 너무 깁니다.`);
  }
  let durationSeconds = null;
  if (video?.durationSeconds != null && text(video.durationSeconds) !== '') {
    durationSeconds = Math.round(Number(video.durationSeconds));
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_DURATION) {
      throw httpError(`${label}: 영상 길이를 확인하세요.`);
    }
  }
  return { id: toId(video?.id), title, kind, videoRef, durationSeconds: kind === 'youtube' ? durationSeconds : null };
}

function cleanCourse(data) {
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  if (videos.length > MAX_VIDEOS) throw httpError(`영상은 ${MAX_VIDEOS}개까지 등록할 수 있습니다.`);
  return {
    title: limited(data?.title, TITLE_MAX, '교육명', { required: true }),
    provider: limited(data?.provider, PROVIDER_MAX, '제공 기관'),
    description: limited(data?.description, DESCRIPTION_MAX, '설명'),
    guidance: limited(data?.guidance, DESCRIPTION_MAX, '활용 시 확인사항'),
    companyMaterial: limited(data?.companyMaterial, MATERIAL_MAX, '회사 자료'),
    requireMaterialConfirm: data?.requireMaterialConfirm ? 1 : 0,
    isActive: data?.isActive === false ? 0 : 1,
    videos: videos.map(cleanVideo),
  };
}

/** 과정 저장. 영상은 보낸 목록으로 맞추되, id 가 같은 영상은 시청 기록을 유지합니다(주소가 바뀌면 기록을 지웁니다). */
export async function saveCourse(courseId, data) {
  const course = cleanCourse(data);
  const db = getDb();
  let id = courseId == null ? 0 : (await courseRow(courseId)).id;
  await db.transaction(async () => {
    if (id) {
      await db
        .prepare(
          `UPDATE training_courses SET title = ?, provider = ?, description = ?, guidance = ?, company_material = ?,
             require_material_confirm = ?, is_active = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        )
        .run(
          course.title,
          course.provider,
          course.description,
          course.guidance,
          course.companyMaterial,
          course.requireMaterialConfirm,
          course.isActive,
          id
        );
    } else {
      const max = await db.prepare('SELECT MAX(sort_order) AS m FROM training_courses').get();
      const result = await db
        .prepare(
          `INSERT INTO training_courses (title, provider, description, guidance, company_material, require_material_confirm, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          course.title,
          course.provider,
          course.description,
          course.guidance,
          course.companyMaterial,
          course.requireMaterialConfirm,
          course.isActive,
          (Number(max?.m) || 0) + 1
        );
      id = Number(result.lastInsertRowid);
    }

    const existing = await db.prepare('SELECT * FROM training_videos WHERE course_id = ?').all(id);
    const byId = new Map(existing.map((row) => [Number(row.id), row]));
    const kept = new Set();
    for (const [index, video] of course.videos.entries()) {
      const old = video.id ? byId.get(video.id) : null;
      if (old && !kept.has(video.id)) {
        kept.add(video.id);
        if (old.kind !== video.kind || old.video_ref !== video.videoRef) {
          await db.prepare('DELETE FROM training_progress WHERE video_id = ?').run(video.id);
        }
        await db
          .prepare('UPDATE training_videos SET title = ?, kind = ?, video_ref = ?, duration_seconds = ?, sort_order = ? WHERE id = ?')
          .run(video.title, video.kind, video.videoRef, video.durationSeconds, index + 1, video.id);
      } else {
        await db
          .prepare(
            'INSERT INTO training_videos (course_id, title, kind, video_ref, duration_seconds, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(id, video.title, video.kind, video.videoRef, video.durationSeconds, index + 1);
      }
    }
    for (const oldId of byId.keys()) {
      if (kept.has(oldId)) continue;
      await db.prepare('DELETE FROM training_progress WHERE video_id = ?').run(oldId);
      await db.prepare('DELETE FROM training_videos WHERE id = ?').run(oldId);
    }
  });
  return getCourse(id);
}

/** 과정을 지우면 그 과정으로 배정한 교육과 대상자·수강·이수 기록도 함께 지웁니다. */
export async function deleteCourse(courseId) {
  const row = await courseRow(courseId);
  const db = getDb();
  const sessions = 'SELECT id FROM training_sessions WHERE course_id = ?';
  const assignees = `SELECT id FROM training_assignees WHERE session_id IN (${sessions})`;
  let removed = { sessions: 0, assignees: 0 };
  await db.transaction(async () => {
    const counts = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM training_sessions WHERE course_id = ?) AS sessions,
                (SELECT COUNT(*) FROM training_assignees WHERE session_id IN (${sessions})) AS assignees`
      )
      .get(row.id, row.id);
    removed = { sessions: Number(counts?.sessions) || 0, assignees: Number(counts?.assignees) || 0 };
    await db.prepare(`DELETE FROM training_progress WHERE assignee_id IN (${assignees})`).run(row.id);
    await db.prepare(`DELETE FROM training_assignees WHERE session_id IN (${sessions})`).run(row.id);
    await db.prepare('DELETE FROM training_sessions WHERE course_id = ?').run(row.id);
    await db.prepare('DELETE FROM training_progress WHERE video_id IN (SELECT id FROM training_videos WHERE course_id = ?)').run(row.id);
    await db.prepare('DELETE FROM training_videos WHERE course_id = ?').run(row.id);
    await db.prepare('DELETE FROM training_courses WHERE id = ?').run(row.id);
  });
  return { success: true, removed };
}

/* ───────────── 수강 진도 요약 ───────────── */

function summarize(videos, progressRows, course, assignee) {
  const byVideo = new Map(progressRows.map((p) => [Number(p.video_id), p]));
  const items = videos.map((video) => {
    const p = byVideo.get(video.id);
    const durationSeconds = video.durationSeconds || (p?.duration_seconds ? Number(p.duration_seconds) : null);
    const watchedSeconds = p ? Number(p.watched_seconds) || 0 : 0;
    const completedAt = p?.completed_at || null;
    let percent = completedAt ? 100 : 0;
    if (video.kind === 'youtube' && durationSeconds) percent = Math.min(100, Math.floor((watchedSeconds / durationSeconds) * 100));
    return {
      ...video,
      durationSeconds,
      requiredSeconds: video.kind === 'youtube' && durationSeconds ? Math.ceil(durationSeconds * COMPLETE_RATIO) : null,
      watchedSeconds,
      percent,
      openedAt: p?.opened_at || null,
      completedAt,
    };
  });
  const opened = items.map((v) => v.openedAt).filter(Boolean).sort();
  return {
    videos: items,
    videosDone: items.filter((v) => v.completedAt).length,
    videosTotal: items.length,
    watchedSeconds: items.reduce((sum, v) => sum + v.watchedSeconds, 0),
    materialRequired: Boolean(Number(course.require_material_confirm)) && Boolean(text(course.company_material)),
    materialConfirmedAt: assignee.material_confirmed_at || null,
    startedAt: opened[0] || assignee.material_confirmed_at || null,
  };
}

function statusOf(assignee, summary, today) {
  if (assignee.completed_at) return 'completed';
  if (assignee.due_date < today) return 'overdue';
  if (summary.startedAt || summary.watchedSeconds > 0) return 'in_progress';
  return 'not_started';
}

function isComplete(summary) {
  return summary.videos.every((v) => v.completedAt) && (!summary.materialRequired || Boolean(summary.materialConfirmedAt));
}

/* ───────────── 배정(연도별 교육) ───────────── */

const SESSION_SQL = `
  SELECT s.*, c.title AS course_title, c.provider AS course_provider, c.code AS course_code, c.sort_order AS course_sort,
         (SELECT COUNT(*) FROM training_assignees a WHERE a.session_id = s.id) AS assignee_count,
         (SELECT COUNT(*) FROM training_assignees a WHERE a.session_id = s.id AND a.completed_at IS NOT NULL) AS completed_count
  FROM training_sessions s JOIN training_courses c ON c.id = s.course_id`;

function mapSession(row, today = kstToday()) {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    courseTitle: row.course_title,
    provider: row.course_provider || '',
    year: Number(row.year),
    title: row.title,
    startDate: row.start_date,
    dueDate: row.due_date,
    daysLeft: diffDays(row.due_date, today),
    status: row.status,
    remindedAt: row.reminded_at || null,
    createdAt: row.created_at,
    assigneeCount: Number(row.assignee_count) || 0,
    completedCount: Number(row.completed_count) || 0,
  };
}

async function sessionRow(id) {
  const row = await getDb().prepare(`${SESSION_SQL} WHERE s.id = ?`).get(toId(id));
  if (!row) throw httpError('교육 배정을 찾을 수 없습니다.', 404);
  return row;
}

export async function listSessions(year) {
  const today = kstToday();
  const wanted = Number(year) || Number(today.slice(0, 4));
  const db = getDb();
  const rows = await db.prepare(`${SESSION_SQL} WHERE s.year = ? ORDER BY c.sort_order, s.due_date, s.id`).all(wanted);
  const years = await db.prepare('SELECT DISTINCT year FROM training_sessions ORDER BY year DESC').all();
  const yearList = [...new Set([Number(today.slice(0, 4)), wanted, ...years.map((r) => Number(r.year))])].sort((a, b) => b - a);
  return { year: wanted, years: yearList, sessions: rows.map((row) => mapSession(row, today)) };
}

/** 대상 지정 화면용: 재직 중인 직원과 사업장 목록 */
export async function listTargets() {
  const rows = await getDb()
    .prepare(
      `SELECT id, emp_no, name, workplace, workplace_code, department, position FROM employees
       WHERE is_active = 1 ORDER BY workplace_code, department, name, id`
    )
    .all();
  const workplaces = new Map();
  for (const row of rows) {
    const code = text(row.workplace_code);
    if (!code) continue;
    const entry = workplaces.get(code) || { code, name: row.workplace || code, count: 0 };
    entry.count += 1;
    workplaces.set(code, entry);
  }
  return {
    employees: rows.map((row) => ({
      id: Number(row.id),
      empNo: row.emp_no,
      name: row.name,
      workplace: row.workplace || '',
      workplaceCode: text(row.workplace_code),
      department: row.department || '',
      position: row.position || '',
    })),
    workplaces: [...workplaces.values()],
  };
}

async function resolveTargets(target) {
  const db = getDb();
  const type = target?.type;
  let rows;
  if (type === 'all') {
    rows = await db.prepare('SELECT id FROM employees WHERE is_active = 1').all();
  } else if (type === 'workplace') {
    const code = text(target.workplaceCode);
    if (!code) throw httpError('사업장을 고르세요.');
    rows = await db.prepare('SELECT id FROM employees WHERE is_active = 1 AND workplace_code = ?').all(code);
  } else if (type === 'employees') {
    const ids = [...new Set((Array.isArray(target.employeeIds) ? target.employeeIds : []).map(toId).filter(Boolean))];
    if (!ids.length) throw httpError('대상 직원을 한 명 이상 고르세요.');
    if (ids.length > MAX_SELECTED) throw httpError(`한 번에 ${MAX_SELECTED}명까지 고를 수 있습니다.`);
    rows = await db
      .prepare(`SELECT id FROM employees WHERE is_active = 1 AND id IN (${ids.map(() => '?').join(', ')})`)
      .all(...ids);
  } else {
    throw httpError('교육 대상을 고르세요.');
  }
  if (!rows.length) throw httpError('대상에 해당하는 재직 직원이 없습니다.');
  return rows.map((row) => Number(row.id));
}

async function insertAssignees(db, sessionId, employeeIds) {
  let added = 0;
  for (const employeeId of employeeIds) {
    const result = await db
      .prepare(
        `INSERT INTO training_assignees (session_id, employee_id) VALUES (?, ?)
         ON CONFLICT (session_id, employee_id) DO NOTHING`
      )
      .run(sessionId, employeeId);
    added += Number(result.changes) || 0;
  }
  return added;
}

function cleanSessionFields(data, course) {
  const startDate = cleanDate(data?.startDate, '시작일');
  const dueDate = cleanDate(data?.dueDate, '수료 기한');
  if (dueDate < startDate) throw httpError('수료 기한은 시작일보다 빠를 수 없습니다.');
  const year = Number(data?.year) || Number(startDate.slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw httpError('교육 연도를 확인하세요.');
  const title = limited(data?.title, TITLE_MAX, '교육명') || `${year}년 ${course.title}`;
  return { startDate, dueDate, year, title };
}

export async function createSession(data, actor) {
  const course = await courseRow(data?.courseId);
  if (!Number(course.is_active)) throw httpError('사용 안 함으로 둔 과정은 배정할 수 없습니다.');
  const fields = cleanSessionFields(data, course);
  const employeeIds = await resolveTargets(data?.target);
  const db = getDb();
  let id = 0;
  await db.transaction(async () => {
    const result = await db
      .prepare(
        `INSERT INTO training_sessions (course_id, year, title, start_date, due_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(course.id, fields.year, fields.title, fields.startDate, fields.dueDate, toId(actor?.id) || null);
    id = Number(result.lastInsertRowid);
    await insertAssignees(db, id, employeeIds);
  });
  return getSession(id);
}

export async function updateSession(id, data) {
  const row = await sessionRow(id);
  const fields = cleanSessionFields({ year: row.year, ...data }, { title: row.course_title });
  const status = data?.status === 'closed' ? 'closed' : 'open';
  await getDb()
    .prepare(
      `UPDATE training_sessions SET title = ?, year = ?, start_date = ?, due_date = ?, status = ?,
         reminded_at = CASE WHEN due_date = ? THEN reminded_at ELSE NULL END,
         updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(fields.title, fields.year, fields.startDate, fields.dueDate, status, fields.dueDate, row.id);
  return getSession(row.id);
}

export async function deleteSession(id) {
  const row = await sessionRow(id);
  const db = getDb();
  await db.transaction(async () => {
    await db
      .prepare('DELETE FROM training_progress WHERE assignee_id IN (SELECT id FROM training_assignees WHERE session_id = ?)')
      .run(row.id);
    await db.prepare('DELETE FROM training_assignees WHERE session_id = ?').run(row.id);
    await db.prepare('DELETE FROM training_sessions WHERE id = ?').run(row.id);
  });
  return { success: true };
}

export async function addAssignees(id, target) {
  const row = await sessionRow(id);
  const employeeIds = await resolveTargets(target);
  const db = getDb();
  let added = 0;
  await db.transaction(async () => {
    added = await insertAssignees(db, row.id, employeeIds);
  });
  return { added, session: await getSession(row.id) };
}

export async function removeAssignee(sessionId, assigneeId) {
  const row = await sessionRow(sessionId);
  const db = getDb();
  const assignee = await db
    .prepare('SELECT id FROM training_assignees WHERE id = ? AND session_id = ?')
    .get(toId(assigneeId), row.id);
  if (!assignee) throw httpError('대상자를 찾을 수 없습니다.', 404);
  await db.transaction(async () => {
    await db.prepare('DELETE FROM training_progress WHERE assignee_id = ?').run(assignee.id);
    await db.prepare('DELETE FROM training_assignees WHERE id = ?').run(assignee.id);
  });
  return getSession(row.id);
}

/** 배정 상세: 과정 정보와 대상자별 수강 현황 */
export async function getSession(id) {
  const today = kstToday();
  const row = await sessionRow(id);
  const db = getDb();
  const course = await courseRow(row.course_id);
  const videos = await courseVideos(row.course_id);
  const assignees = await db
    .prepare(
      `SELECT a.*, e.emp_no, e.name, e.workplace, e.department, e.position, e.email, e.is_active
       FROM training_assignees a JOIN employees e ON e.id = a.employee_id
       WHERE a.session_id = ? ORDER BY e.workplace_code, e.department, e.name, e.id`
    )
    .all(row.id);
  const progress = await db
    .prepare(
      `SELECT p.* FROM training_progress p JOIN training_assignees a ON a.id = p.assignee_id WHERE a.session_id = ?`
    )
    .all(row.id);
  const byAssignee = new Map();
  for (const p of progress) {
    const key = Number(p.assignee_id);
    if (!byAssignee.has(key)) byAssignee.set(key, []);
    byAssignee.get(key).push(p);
  }
  return {
    ...mapSession(row, today),
    course: mapCourse(course, videos),
    assignees: assignees.map((a) => {
      const summary = summarize(videos, byAssignee.get(Number(a.id)) || [], course, a);
      return {
        id: Number(a.id),
        employeeId: Number(a.employee_id),
        empNo: a.emp_no,
        name: a.name,
        workplace: a.workplace || '',
        department: a.department || '',
        position: a.position || '',
        isActive: Boolean(Number(a.is_active)),
        hasEmail: Boolean(text(a.email)),
        status: statusOf({ ...a, due_date: row.due_date }, summary, today),
        completedAt: a.completed_at || null,
        materialConfirmedAt: summary.materialConfirmedAt,
        materialRequired: summary.materialRequired,
        startedAt: summary.startedAt,
        watchedSeconds: summary.watchedSeconds,
        videosDone: summary.videosDone,
        videosTotal: summary.videosTotal,
      };
    }),
  };
}

/** 수료 현황 CSV 내용 */
export async function exportSession(id) {
  const session = await getSession(id);
  const headers = ['이름', '사번', '사업장', '부서', '직위', '수료 여부', '수료 일시', '수강 시작', '시청 시간(분)', '영상 진행', '자료 확인 일시'];
  const statusText = { completed: '수료', in_progress: '수강 중', not_started: '미수강', overdue: '미수료(기한 지남)' };
  const rows = session.assignees.map((a) => [
    a.name,
    a.empNo,
    a.workplace,
    a.department,
    a.position,
    statusText[a.status],
    a.completedAt || '',
    a.startedAt || '',
    Math.round((a.watchedSeconds / 60) * 10) / 10,
    `${a.videosDone}/${a.videosTotal}`,
    a.materialConfirmedAt || '',
  ]);
  return { filename: `training-${session.year}-${session.id}.csv`, headers, rows };
}

/* ───────────── 직원 수강 ───────────── */

const ASSIGNMENT_SQL = `
  SELECT a.*, s.course_id, s.year, s.title AS session_title, s.start_date, s.due_date, s.status AS session_status
  FROM training_assignees a JOIN training_sessions s ON s.id = a.session_id`;

/** 직원이 지금 해야 할 교육 수(진행 중이고 시작일이 지났고 아직 수료하지 않은 것) */
export async function countTasks(employeeId, today = kstToday()) {
  const row = await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM training_assignees a JOIN training_sessions s ON s.id = a.session_id
       WHERE a.employee_id = ? AND a.completed_at IS NULL AND s.status = 'open' AND s.start_date <= ?`
    )
    .get(Number(employeeId), today);
  return Number(row?.n) || 0;
}

async function buildAssignment(row, today, { detail = false } = {}) {
  const db = getDb();
  const course = await courseRow(row.course_id);
  const videos = await courseVideos(row.course_id);
  const progress = await db.prepare('SELECT * FROM training_progress WHERE assignee_id = ?').all(row.id);
  const summary = summarize(videos, progress, course, row);
  const base = {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    title: row.session_title,
    year: Number(row.year),
    startDate: row.start_date,
    dueDate: row.due_date,
    daysLeft: diffDays(row.due_date, today),
    closed: row.session_status === 'closed',
    status: statusOf(row, summary, today),
    completedAt: row.completed_at || null,
    courseTitle: course.title,
    provider: course.provider || '',
    watchedSeconds: summary.watchedSeconds,
    videosDone: summary.videosDone,
    videosTotal: summary.videosTotal,
    materialRequired: summary.materialRequired,
    materialConfirmedAt: summary.materialConfirmedAt,
  };
  if (!detail) return base;
  return {
    ...base,
    description: course.description || '',
    guidance: course.guidance || '',
    companyMaterial: course.company_material || '',
    videos: summary.videos,
  };
}

export async function listMine(employeeId) {
  const today = kstToday();
  const rows = await getDb()
    .prepare(
      `${ASSIGNMENT_SQL} WHERE a.employee_id = ? AND s.start_date <= ?
       ORDER BY CASE WHEN a.completed_at IS NULL THEN 0 ELSE 1 END, s.due_date, s.id`
    )
    .all(Number(employeeId), today);
  const assignments = [];
  for (const row of rows) assignments.push(await buildAssignment(row, today));
  return assignments;
}

async function ownAssignment(employeeId, assigneeId) {
  const row = await getDb().prepare(`${ASSIGNMENT_SQL} WHERE a.id = ? AND a.employee_id = ?`).get(toId(assigneeId), Number(employeeId));
  if (!row) throw httpError('교육을 찾을 수 없습니다.', 404);
  return row;
}

export async function getAssignment(employeeId, assigneeId) {
  const today = kstToday();
  const row = await ownAssignment(employeeId, assigneeId);
  if (row.start_date > today) throw httpError(`${row.start_date}부터 수강할 수 있습니다.`, 403);
  return buildAssignment(row, today, { detail: true });
}

function assertWritable(row, today) {
  if (row.session_status === 'closed') throw httpError('마감된 교육입니다.', 409);
  if (row.start_date > today) throw httpError(`${row.start_date}부터 수강할 수 있습니다.`, 403);
}

async function courseVideo(row, videoId) {
  const video = await getDb()
    .prepare('SELECT * FROM training_videos WHERE id = ? AND course_id = ?')
    .get(toId(videoId), Number(row.course_id));
  if (!video) throw httpError('영상을 찾을 수 없습니다.', 404);
  return video;
}

async function progressRow(db, assigneeId, videoId) {
  return db.prepare('SELECT * FROM training_progress WHERE assignee_id = ? AND video_id = ?').get(assigneeId, videoId);
}

/** 모든 영상과(필요하면) 회사 자료 확인을 마쳤으면 수료로 기록합니다. */
async function refreshCompletion(db, row, stamp) {
  if (row.completed_at) return;
  const course = await courseRow(row.course_id);
  const videos = await courseVideos(row.course_id);
  const progress = await db.prepare('SELECT * FROM training_progress WHERE assignee_id = ?').all(row.id);
  const fresh = await db.prepare('SELECT * FROM training_assignees WHERE id = ?').get(row.id);
  if (!isComplete(summarize(videos, progress, course, fresh))) return;
  await db.prepare('UPDATE training_assignees SET completed_at = ? WHERE id = ? AND completed_at IS NULL').run(stamp, row.id);
}

/**
 * 영상 시청 기록. seconds 는 지난 기록 뒤로 정상 재생한 시간입니다.
 * 실제로 흐른 시간보다 많이 인정하지 않도록, 인정한 시간만큼만 기준 시각(updated_at)을 앞으로 옮깁니다.
 */
export async function recordProgress(employeeId, assigneeId, data) {
  const today = kstToday();
  const db = getDb();
  await db.transaction(async () => {
    await db.lock(LOCK_TRAINING, assigneeId);
    const row = await ownAssignment(employeeId, assigneeId);
    assertWritable(row, today);
    const video = await courseVideo(row, data?.videoId);
    if (video.kind !== 'youtube') throw httpError('페이지에서 재생하는 영상이 아닙니다.');

    const reported = Math.round(Number(data?.duration));
    const duration = Number.isFinite(reported) && reported > 0 && reported <= MAX_DURATION ? reported : null;
    if (duration && video.duration_seconds == null) {
      await db.prepare('UPDATE training_videos SET duration_seconds = ? WHERE id = ? AND duration_seconds IS NULL').run(duration, video.id);
    }
    const p = await progressRow(db, row.id, video.id);
    const required = Number(video.duration_seconds) || duration || Number(p?.duration_seconds) || null;

    const now = Date.now();
    const base = Math.max(p ? parseStamp(p.updated_at) : 0, Math.floor(now / 1000) * 1000 - BACKLOG_SECONDS * 1000);
    const claimed = Math.max(0, Math.floor(Number(data?.seconds) || 0));
    const credit = Math.max(0, Math.min(claimed, MAX_HEARTBEAT_SECONDS, Math.floor((now - base) / 1000)));
    let watched = (p ? Number(p.watched_seconds) || 0 : 0) + credit;
    if (required) watched = Math.min(watched, required);
    const stamp = kstStamp(now);
    const completedAt = p?.completed_at || (required && watched >= Math.ceil(required * COMPLETE_RATIO) ? stamp : null);
    const clock = kstStamp(base + credit * 1000);

    if (p) {
      await db
        .prepare('UPDATE training_progress SET watched_seconds = ?, duration_seconds = ?, completed_at = ?, updated_at = ? WHERE id = ?')
        .run(watched, required, completedAt, clock, p.id);
    } else {
      await db
        .prepare(
          `INSERT INTO training_progress (assignee_id, video_id, watched_seconds, duration_seconds, opened_at, completed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(row.id, video.id, watched, required, stamp, completedAt, clock);
    }
    if (completedAt) await refreshCompletion(db, row, stamp);
  });
  return getAssignment(employeeId, assigneeId);
}

/** 외부 사이트 링크를 연 기록 */
export async function openLink(employeeId, assigneeId, videoId) {
  const today = kstToday();
  const db = getDb();
  await db.transaction(async () => {
    await db.lock(LOCK_TRAINING, assigneeId);
    const row = await ownAssignment(employeeId, assigneeId);
    assertWritable(row, today);
    const video = await courseVideo(row, videoId);
    const stamp = kstStamp();
    const p = await progressRow(db, row.id, video.id);
    if (p) {
      if (!p.opened_at) await db.prepare('UPDATE training_progress SET opened_at = ? WHERE id = ?').run(stamp, p.id);
    } else {
      await db
        .prepare('INSERT INTO training_progress (assignee_id, video_id, opened_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(row.id, video.id, stamp, stamp);
    }
  });
  return getAssignment(employeeId, assigneeId);
}

/** 외부 사이트 교육을 마쳤다는 본인 확인. 먼저 링크를 열어야 합니다. */
export async function completeLink(employeeId, assigneeId, videoId) {
  const today = kstToday();
  const db = getDb();
  await db.transaction(async () => {
    await db.lock(LOCK_TRAINING, assigneeId);
    const row = await ownAssignment(employeeId, assigneeId);
    assertWritable(row, today);
    const video = await courseVideo(row, videoId);
    if (video.kind !== 'link') throw httpError('영상은 끝까지 시청하면 자동으로 완료됩니다.');
    const p = await progressRow(db, row.id, video.id);
    if (!p?.opened_at) throw httpError('먼저 링크를 열어 교육을 수강하세요.');
    const stamp = kstStamp();
    if (!p.completed_at) {
      await db.prepare('UPDATE training_progress SET completed_at = ?, updated_at = ? WHERE id = ?').run(stamp, stamp, p.id);
    }
    await refreshCompletion(db, row, stamp);
  });
  return getAssignment(employeeId, assigneeId);
}

/** 회사 자료(성희롱 처리절차 등)를 읽고 확인 */
export async function confirmMaterial(employeeId, assigneeId) {
  const today = kstToday();
  const db = getDb();
  await db.transaction(async () => {
    await db.lock(LOCK_TRAINING, assigneeId);
    const row = await ownAssignment(employeeId, assigneeId);
    assertWritable(row, today);
    const course = await courseRow(row.course_id);
    if (!text(course.company_material)) throw httpError('확인할 회사 자료가 없습니다.');
    const stamp = kstStamp();
    if (!row.material_confirmed_at) {
      await db.prepare('UPDATE training_assignees SET material_confirmed_at = ? WHERE id = ?').run(stamp, row.id);
    }
    await refreshCompletion(db, row, stamp);
  });
  return getAssignment(employeeId, assigneeId);
}

/* ───────────── 안내 메일 ───────────── */

async function pendingByEmployee(sessionRows, today) {
  const db = getDb();
  const byEmployee = new Map();
  for (const session of sessionRows) {
    const rows = await db
      .prepare(
        `SELECT e.* FROM training_assignees a JOIN employees e ON e.id = a.employee_id
         WHERE a.session_id = ? AND a.completed_at IS NULL AND e.is_active = 1 ORDER BY e.id`
      )
      .all(session.id);
    for (const employee of rows) {
      const key = Number(employee.id);
      if (!byEmployee.has(key)) byEmployee.set(key, { employee, items: [] });
      byEmployee.get(key).items.push({ title: session.title, dueDate: session.due_date, daysLeft: diffDays(session.due_date, today) });
    }
  }
  return [...byEmployee.values()];
}

async function mailPending(groups) {
  const result = { sent: 0, failed: 0, noEmail: 0 };
  for (const { employee, items } of groups) {
    if (!text(employee.email)) {
      result.noEmail += 1;
      continue;
    }
    const outcome = await mailService.notifyTrainingReminder(employee, items);
    if (outcome?.error || outcome?.skipped) result.failed += 1;
    else result.sent += 1;
  }
  return result;
}

/** 관리자가 직접 미수료자에게 안내 메일을 보냅니다. */
export async function remindSession(id) {
  const row = await sessionRow(id);
  if (row.status === 'closed') throw httpError('마감된 교육입니다.');
  if (!(await mailService.isMailEnabled())) throw httpError('메일 발송이 꺼져 있습니다. 메일 설정에서 먼저 켜주세요.');
  const groups = await pendingByEmployee([row], kstToday());
  if (!groups.length) throw httpError('미수료 대상자가 없습니다.');
  return { total: groups.length, ...(await mailPending(groups)) };
}

/** 기한이 TRAINING_REMINDER_DAYS 일 안으로 들어온 진행 중 교육마다 한 번, 미수료자에게 알리고 인사담당에게 요약을 보냅니다. */
export async function sendDueReminders(today = kstToday()) {
  if (!(await mailService.isMailEnabled())) return { sent: 0, skipped: 'mail-disabled' };
  const db = getDb();
  const sessions = await db
    .prepare(
      `${SESSION_SQL} WHERE s.status = 'open' AND s.reminded_at IS NULL AND s.start_date <= ? AND s.due_date <= ?
       ORDER BY s.due_date, s.id`
    )
    .all(today, addDays(today, TRAINING_REMINDER_DAYS));
  if (!sessions.length) return { sent: 0 };
  const groups = await pendingByEmployee(sessions, today);
  const result = await mailPending(groups);
  const summary = sessions
    .map((row) => mapSession(row, today))
    .filter((s) => s.completedCount < s.assigneeCount);
  if (summary.length) await mailService.notifyTrainingSummary(await listEvaluationManagers(), summary);
  for (const session of sessions) {
    await db.prepare(`UPDATE training_sessions SET reminded_at = datetime('now', 'localtime') WHERE id = ?`).run(session.id);
  }
  return result;
}

let reminderTimer = null;
let lastReminderDate = '';

/** 매시간 확인해서 하루에 한 번(오전 8시 이후) 기한 안내를 보냅니다. TRAINING_REMINDERS=off 면 끕니다. */
export function startReminderSchedule() {
  if (reminderTimer || process.env.TRAINING_REMINDERS === 'off') return;
  const tick = async () => {
    const today = kstToday();
    if (today === lastReminderDate || kstHour() < 8) return;
    lastReminderDate = today;
    try {
      const result = await sendDueReminders(today);
      if (result.sent) console.log(`[training] 수료 기한 안내 ${result.sent}건을 보냈습니다.`);
    } catch (error) {
      console.error('[training] 수료 기한 안내 실패:', error.message);
    }
  };
  setTimeout(tick, 90_000).unref();
  reminderTimer = setInterval(tick, 60 * 60_000);
  reminderTimer.unref();
}
