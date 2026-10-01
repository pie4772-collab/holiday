import { getDb } from '../db.js';
import { decryptBytes, encryptBytes } from '../secrets.js';
import { validateUpload } from '../utils/fileUpload.js';
import { DOCUMENT_PREVIEW_EXTENSIONS } from '../../src/constants/personnel.js';

const TITLE_MAX = 200;
const BODY_MAX = 20000;
const MANAGE = 'notices.manage';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function code(value) {
  return value == null ? '' : String(value).trim();
}

/** 공지 대상: 전사(NULL) 또는 사업장 코드 */
function canSee(access, notice) {
  if (!notice.workplace_code) return true;
  if (access.scopes[MANAGE] === 'all') return true;
  return code(notice.workplace_code) === code(access.employee.workplace_code);
}

/** 전사 공지는 전체 범위 관리자만, 사업장 공지는 그 사업장을 맡은 관리자가 다룹니다. */
function canManage(access, workplaceCode) {
  const scope = access.scopes[MANAGE];
  if (!scope) return false;
  if (scope === 'all') return true;
  return Boolean(workplaceCode) && scope.has(code(workplaceCode));
}

async function workplaceNames() {
  const rows = await getDb().prepare('SELECT workplace_code, name FROM attendance_sites').all();
  return new Map(rows.map((row) => [code(row.workplace_code), row.name]));
}

function mapNotice(row, access, names) {
  return {
    id: String(row.id),
    title: row.title,
    workplaceCode: row.workplace_code || null,
    workplaceName: row.workplace_code ? names.get(code(row.workplace_code)) || row.workplace_code : '전사',
    pinned: Boolean(row.pinned),
    mustRead: Boolean(row.must_read),
    authorName: row.author_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileCount: Number(row.file_count) || 0,
    readAt: row.read_at || null,
    canEdit: canManage(access, row.workplace_code),
  };
}

const LIST_SQL = `
  SELECT n.id, n.title, n.workplace_code, n.pinned, n.must_read, n.created_at, n.updated_at,
         a.name AS author_name, r.read_at,
         (SELECT COUNT(*) FROM notice_files f WHERE f.notice_id = n.id) AS file_count
  FROM notices n
  LEFT JOIN employees a ON a.id = n.author_id
  LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.employee_id = ?`;

/** 볼 수 있는 공지 목록. 고정 공지가 먼저, 그다음 최신순입니다. */
export async function listNotices(access, { limit } = {}) {
  const rows = await getDb()
    .prepare(`${LIST_SQL} ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC`)
    .all(Number(access.employee.id));
  const names = await workplaceNames();
  const visible = rows.filter((row) => canSee(access, row)).map((row) => mapNotice(row, access, names));
  const max = Number(limit);
  return {
    notices: max > 0 ? visible.slice(0, max) : visible,
    total: visible.length,
    unreadMustRead: visible.filter((n) => n.mustRead && !n.readAt).length,
    canCreate: Boolean(access.scopes[MANAGE]),
  };
}

async function loadNotice(id) {
  const row = await getDb().prepare('SELECT * FROM notices WHERE id = ?').get(Number(id));
  if (!row) throw httpError('공지를 찾을 수 없습니다.', 404);
  return row;
}

async function loadVisible(access, id) {
  const row = await loadNotice(id);
  if (!canSee(access, row)) throw httpError('이 공지를 볼 수 없습니다.', 403);
  return row;
}

export async function getNotice(access, id) {
  const base = await loadVisible(access, id);
  const db = getDb();
  const row = await db.prepare(`${LIST_SQL} WHERE n.id = ?`).get(Number(access.employee.id), base.id);
  const files = await db
    .prepare('SELECT id, file_name, extension, size_bytes, created_at FROM notice_files WHERE notice_id = ? ORDER BY id')
    .all(base.id);
  return {
    ...mapNotice(row, access, await workplaceNames()),
    body: base.body,
    files: files.map((f) => ({
      id: String(f.id),
      fileName: f.file_name,
      extension: f.extension,
      sizeBytes: Number(f.size_bytes),
      previewable: DOCUMENT_PREVIEW_EXTENSIONS.includes(f.extension),
    })),
  };
}

function cleanNotice(access, data) {
  const title = text(data?.title);
  const body = text(data?.body);
  if (!title) throw httpError('제목을 입력하세요.');
  if (title.length > TITLE_MAX) throw httpError(`제목은 ${TITLE_MAX}자 이내로 입력하세요.`);
  if (!body) throw httpError('내용을 입력하세요.');
  if (body.length > BODY_MAX) throw httpError(`내용은 ${BODY_MAX.toLocaleString()}자 이내로 입력하세요.`);
  const workplaceCode = code(data?.workplaceCode) || null;
  if (!canManage(access, workplaceCode)) {
    throw httpError(workplaceCode ? '이 사업장 공지를 올릴 권한이 없습니다.' : '전사 공지는 시스템관리자·인사담당만 올릴 수 있습니다.', 403);
  }
  return { title, body, workplaceCode, pinned: data?.pinned ? 1 : 0, mustRead: data?.mustRead ? 1 : 0 };
}

export async function createNotice(access, data) {
  const notice = cleanNotice(access, data);
  const result = await getDb()
    .prepare(
      `INSERT INTO notices (title, body, workplace_code, pinned, must_read, author_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(notice.title, notice.body, notice.workplaceCode, notice.pinned, notice.mustRead, Number(access.employee.id));
  return getNotice(access, result.lastInsertRowid);
}

async function loadManaged(access, id) {
  const row = await loadNotice(id);
  if (!canManage(access, row.workplace_code)) throw httpError('이 공지를 고칠 권한이 없습니다.', 403);
  return row;
}

/** 수정해도 확인 기록은 유지합니다. 다시 확인받으려면 resetReads 를 켭니다. */
export async function updateNotice(access, id, data) {
  const row = await loadManaged(access, id);
  const notice = cleanNotice(access, data);
  const db = getDb();
  await db.transaction(async () => {
    await db
      .prepare(
        `UPDATE notices SET title = ?, body = ?, workplace_code = ?, pinned = ?, must_read = ?,
           updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(notice.title, notice.body, notice.workplaceCode, notice.pinned, notice.mustRead, row.id);
    if (data?.resetReads) await db.prepare('DELETE FROM notice_reads WHERE notice_id = ?').run(row.id);
  });
  return getNotice(access, row.id);
}

export async function deleteNotice(access, id) {
  const row = await loadManaged(access, id);
  const db = getDb();
  await db.transaction(async () => {
    await db.prepare('DELETE FROM notice_files WHERE notice_id = ?').run(row.id);
    await db.prepare('DELETE FROM notice_reads WHERE notice_id = ?').run(row.id);
    await db.prepare('DELETE FROM notices WHERE id = ?').run(row.id);
  });
}

export async function confirmRead(access, id) {
  const row = await loadVisible(access, id);
  if (!row.must_read) throw httpError('필독 공지만 확인 표시를 합니다.');
  await getDb()
    .prepare('INSERT INTO notice_reads (notice_id, employee_id) VALUES (?, ?) ON CONFLICT (notice_id, employee_id) DO NOTHING')
    .run(row.id, Number(access.employee.id));
  return getNotice(access, row.id);
}

/** 필독 공지 확인 현황: 대상(재직 중, 전사 또는 그 사업장) 중 확인·미확인 */
export async function getReadStatus(access, id) {
  const row = await loadManaged(access, id);
  const db = getDb();
  const targets = row.workplace_code
    ? await db
        .prepare('SELECT id, name, department, position FROM employees WHERE is_active = 1 AND workplace_code = ? ORDER BY department, name, id')
        .all(code(row.workplace_code))
    : await db
        .prepare('SELECT id, name, department, position FROM employees WHERE is_active = 1 ORDER BY department, name, id')
        .all();
  const reads = new Map(
    (await db.prepare('SELECT employee_id, read_at FROM notice_reads WHERE notice_id = ?').all(row.id)).map((r) => [
      Number(r.employee_id),
      r.read_at,
    ])
  );
  const people = targets.map((e) => ({
    employeeId: String(e.id),
    name: e.name,
    department: e.department || '',
    position: e.position || '',
    readAt: reads.get(Number(e.id)) || null,
  }));
  return {
    total: people.length,
    readCount: people.filter((p) => p.readAt).length,
    read: people.filter((p) => p.readAt),
    unread: people.filter((p) => !p.readAt),
  };
}

export async function addFile(access, id, { fileName, content }) {
  const row = await loadManaged(access, id);
  const { name, extension } = validateUpload(fileName, content);
  await getDb()
    .prepare('INSERT INTO notice_files (notice_id, file_name, extension, size_bytes, content) VALUES (?, ?, ?, ?, ?)')
    .run(row.id, name, extension, content.length, encryptBytes(content));
  return getNotice(access, row.id);
}

async function loadFile(fileId) {
  const file = await getDb().prepare('SELECT * FROM notice_files WHERE id = ?').get(Number(fileId));
  if (!file) throw httpError('첨부파일을 찾을 수 없습니다.', 404);
  return file;
}

export async function getFile(access, fileId) {
  const file = await loadFile(fileId);
  await loadVisible(access, file.notice_id);
  const content = decryptBytes(file.content);
  if (!content) throw httpError('첨부파일을 열지 못했습니다. 비밀 키가 바뀌었는지 확인하세요.', 500);
  return { fileName: file.file_name, extension: file.extension, content };
}

export async function deleteFile(access, fileId) {
  const file = await loadFile(fileId);
  await loadManaged(access, file.notice_id);
  await getDb().prepare('DELETE FROM notice_files WHERE id = ?').run(file.id);
  return getNotice(access, file.notice_id);
}

/** 공지를 올릴 수 있는 사업장 목록(전사 포함 여부) */
export async function listTargets(access) {
  const scope = access.scopes[MANAGE];
  if (!scope) return [];
  const names = await workplaceNames();
  const sites = [...names.entries()].map(([value, name]) => ({ value, label: `${name} 공지` }));
  if (scope === 'all') return [{ value: '', label: '전사 공지' }, ...sites];
  return sites.filter((s) => scope.has(s.value));
}
