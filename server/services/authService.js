import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db.js';
import { DEFAULT_PASSWORD } from '../../src/constants/hr.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const SESSION_SECRET = process.env.SESSION_SECRET || 'holiday-internal-session-v1';

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

export function createSession(user) {
  return signPayload({
    employeeId: String(user.employee_id),
    empNo: user.username,
    name: user.name,
    position: user.position,
    isAdmin: Boolean(user.is_admin),
    exp: Date.now() + TOKEN_TTL_MS,
  });
}

export function getSession(token) {
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

export function destroySession() {
  // Tokens are signed and stateless; logout is handled on the client.
}

export function ensureUserForEmployee(employeeId, empNo) {
  const username = String(empNo || '').trim();
  if (!employeeId || !username) return null;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE employee_id = ?').get(employeeId);
  if (existing) {
    if (existing.username !== username) {
      const taken = db.prepare('SELECT id FROM users WHERE username = ? AND employee_id != ?').get(
        username,
        employeeId
      );
      if (!taken) {
        db.prepare('UPDATE users SET username = ? WHERE employee_id = ?').run(username, employeeId);
      }
    }
    return existing;
  }

  const taken = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (taken) return taken;

  const result = db
    .prepare('INSERT INTO users (employee_id, username, password_hash) VALUES (?, ?, ?)')
    .run(employeeId, username, hashPassword(DEFAULT_PASSWORD));
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

export function syncUsersFromEmployees() {
  const employees = getDb()
    .prepare(`SELECT id, emp_no FROM employees WHERE emp_no IS NOT NULL AND trim(emp_no) != ''`)
    .all();
  for (const emp of employees) {
    ensureUserForEmployee(emp.id, emp.emp_no);
  }
  return getDb().prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

export function login(username, password) {
  const id = String(username || '').trim();
  if (!id || !password) {
    throw Object.assign(new Error('사번과 비밀번호를 입력하세요.'), { status: 400 });
  }

  const row = getDb()
    .prepare(
      `SELECT u.*, e.name, e.position, e.is_active, e.is_admin
       FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE u.username = ?`
    )
    .get(id);

  if (!row || !verifyPassword(password, row.password_hash)) {
    throw Object.assign(new Error('사번 또는 비밀번호가 올바르지 않습니다.'), { status: 401 });
  }
  if (!row.is_active) {
    throw Object.assign(new Error('퇴사 처리된 계정입니다.'), { status: 403 });
  }

  const token = createSession(row);
  return {
    token,
    user: {
      employeeId: String(row.employee_id),
      empNo: row.username,
      name: row.name,
      position: row.position || '팀원',
      isAdmin: Boolean(row.is_admin),
    },
  };
}

export function isEmployeeAdmin(employeeId) {
  const row = getDb().prepare('SELECT is_admin FROM employees WHERE id = ?').get(Number(employeeId));
  return Boolean(row?.is_admin);
}
