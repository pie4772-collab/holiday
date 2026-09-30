import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db.js';
import { SESSION_SECRET } from '../secrets.js';
import { DEFAULT_PASSWORD } from '../../src/constants/hr.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(64)}`;

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const actual = Buffer.from(sig);
  const valid = Buffer.from(expected);
  if (actual.length !== valid.length || !timingSafeEqual(actual, valid)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.employeeId || Number(payload.exp) <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(user, mustChangePassword) {
  return signPayload({
    employeeId: String(user.employee_id),
    empNo: user.username,
    name: user.name,
    position: user.position,
    isAdmin: Boolean(user.is_admin),
    tv: Number(user.token_version) || 0,
    mustChangePassword: Boolean(mustChangePassword),
    exp: Date.now() + TOKEN_TTL_MS,
  });
}

function publicUser(row, mustChangePassword) {
  return {
    employeeId: String(row.employee_id),
    empNo: row.username,
    name: row.name,
    position: row.position || '팀원',
    isAdmin: Boolean(row.is_admin),
    mustChangePassword: Boolean(mustChangePassword),
  };
}

function loadUserByEmployeeId(employeeId) {
  return getDb()
    .prepare(
      `SELECT u.*, e.name, e.position, e.is_active, e.is_admin
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.employee_id = ?`
    )
    .get(Number(employeeId));
}

/**
 * 서명·만료를 확인한 뒤 DB의 token_version·재직 여부와 대조합니다.
 * 비밀번호 변경·초기화·로그아웃·퇴사 처리 시 이전에 발급된 토큰은 즉시 무효가 됩니다.
 */
export async function getSession(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const row = await getDb()
    .prepare(
      `SELECT u.token_version, e.is_active
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.employee_id = ?`
    )
    .get(Number(payload.employeeId));
  if (!row || !row.is_active) return null;
  if ((Number(row.token_version) || 0) !== (Number(payload.tv) || 0)) return null;
  return payload;
}

async function bumpTokenVersion(employeeId) {
  await getDb()
    .prepare('UPDATE users SET token_version = token_version + 1 WHERE employee_id = ?')
    .run(Number(employeeId));
}

/** 로그아웃: 해당 사용자의 모든 기기에서 발급된 토큰을 무효화합니다. */
export async function logout(session) {
  if (session?.employeeId) await bumpTokenVersion(session.employeeId);
}

export async function ensureUserForEmployee(employeeId, empNo) {
  const username = String(empNo || '').trim();
  if (!employeeId || !username) return null;

  const db = getDb();
  const existing = await db.prepare('SELECT * FROM users WHERE employee_id = ?').get(employeeId);
  if (existing) {
    if (existing.username !== username) {
      const taken = await db
        .prepare('SELECT id FROM users WHERE username = ? AND employee_id != ?')
        .get(username, employeeId);
      if (!taken) {
        await db.prepare('UPDATE users SET username = ? WHERE employee_id = ?').run(username, employeeId);
      }
    }
    return existing;
  }

  const taken = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (taken) return taken;

  const result = await db
    .prepare('INSERT INTO users (employee_id, username, password_hash) VALUES (?, ?, ?)')
    .run(employeeId, username, hashPassword(DEFAULT_PASSWORD));
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

export async function syncUsersFromEmployees() {
  const employees = await getDb()
    .prepare(`SELECT id, emp_no FROM employees WHERE emp_no IS NOT NULL AND trim(emp_no) != ''`)
    .all();
  for (const emp of employees) {
    await ensureUserForEmployee(emp.id, emp.emp_no);
  }
  return (await getDb().prepare('SELECT COUNT(*) AS c FROM users').get()).c;
}

function lockedMinutesLeft(row) {
  if (!row.locked_until) return 0;
  const ms = new Date(row.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

async function recordFailedLogin(row) {
  const db = getDb();
  await db
    .prepare('UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = ?')
    .run(row.id);
  const { failed_login_count: count } = await db
    .prepare('SELECT failed_login_count FROM users WHERE id = ?')
    .get(row.id);
  if (count >= MAX_FAILED_LOGINS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    await db
      .prepare('UPDATE users SET failed_login_count = 0, locked_until = ? WHERE id = ?')
      .run(until, row.id);
    return { locked: true, remaining: 0 };
  }
  return { locked: false, remaining: MAX_FAILED_LOGINS - count };
}

export async function login(username, password) {
  const id = String(username || '').trim();
  if (!id || !password) {
    throw httpError(400, '사번과 비밀번호를 입력하세요.');
  }

  const row = await getDb()
    .prepare(
      `SELECT u.*, e.name, e.position, e.is_active, e.is_admin
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.username = ?`
    )
    .get(id);

  if (!row) {
    verifyPassword(String(password), DUMMY_HASH);
    throw httpError(401, '사번 또는 비밀번호가 올바르지 않습니다.');
  }

  const lockedFor = lockedMinutesLeft(row);
  if (lockedFor > 0) {
    throw httpError(
      423,
      `로그인에 ${MAX_FAILED_LOGINS}회 실패해 계정이 잠겼습니다. ${lockedFor}분 뒤 다시 시도하거나 관리자에게 비밀번호 초기화를 요청하세요.`
    );
  }

  if (!verifyPassword(String(password), row.password_hash)) {
    const result = await recordFailedLogin(row);
    if (result.locked) {
      throw httpError(
        423,
        `로그인에 ${MAX_FAILED_LOGINS}회 실패해 계정이 ${LOCK_MINUTES}분간 잠겼습니다. 관리자에게 비밀번호 초기화를 요청할 수 있습니다.`
      );
    }
    throw httpError(
      401,
      `사번 또는 비밀번호가 올바르지 않습니다. (${result.remaining}회 더 실패하면 ${LOCK_MINUTES}분간 잠깁니다)`
    );
  }
  if (!row.is_active) {
    throw httpError(403, '퇴사 처리된 계정입니다.');
  }

  if (row.failed_login_count || row.locked_until) {
    await getDb()
      .prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?')
      .run(row.id);
  }

  const mustChangePassword = String(password) === DEFAULT_PASSWORD;
  return {
    token: createSession(row, mustChangePassword),
    user: publicUser(row, mustChangePassword),
  };
}

export function validateNewPassword(password, { username } = {}) {
  const value = String(password || '');
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하여야 합니다.`;
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return '비밀번호에 영문과 숫자를 모두 포함하세요.';
  }
  if (value === DEFAULT_PASSWORD) {
    return '초기 비밀번호는 사용할 수 없습니다.';
  }
  if (username && value.toLowerCase().includes(String(username).toLowerCase())) {
    return '비밀번호에 사번을 포함할 수 없습니다.';
  }
  return null;
}

export async function changePassword(employeeId, currentPassword, newPassword) {
  const row = await loadUserByEmployeeId(employeeId);
  if (!row || !row.is_active) throw httpError(401, '로그인이 필요합니다.');
  if (!verifyPassword(String(currentPassword || ''), row.password_hash)) {
    throw httpError(400, '현재 비밀번호가 올바르지 않습니다.');
  }
  const problem = validateNewPassword(newPassword, { username: row.username });
  if (problem) throw httpError(400, problem);
  if (String(newPassword) === String(currentPassword)) {
    throw httpError(400, '현재 비밀번호와 다른 비밀번호를 입력하세요.');
  }

  await getDb()
    .prepare(
      `UPDATE users
       SET password_hash = ?, token_version = token_version + 1,
           failed_login_count = 0, locked_until = NULL,
           password_changed_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(hashPassword(String(newPassword)), row.id);

  const updated = await loadUserByEmployeeId(employeeId);
  return { token: createSession(updated, false), user: publicUser(updated, false) };
}

/** 관리자 초기화: 초기 비밀번호로 되돌리고 잠금·기존 세션을 해제합니다. 다음 로그인 때 변경을 요구합니다. */
export async function resetPassword(employeeId) {
  const row = await loadUserByEmployeeId(employeeId);
  if (!row) throw httpError(404, '로그인 계정이 없는 직원입니다. 사번이 등록되어 있는지 확인하세요.');
  await getDb()
    .prepare(
      `UPDATE users
       SET password_hash = ?, token_version = token_version + 1,
           failed_login_count = 0, locked_until = NULL, password_changed_at = NULL
       WHERE id = ?`
    )
    .run(hashPassword(DEFAULT_PASSWORD), row.id);
  return { employeeId: String(row.employee_id), empNo: row.username, name: row.name };
}

export async function isEmployeeAdmin(employeeId) {
  const row = await getDb().prepare('SELECT is_admin FROM employees WHERE id = ?').get(Number(employeeId));
  return Boolean(row?.is_admin);
}
