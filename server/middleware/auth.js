import { getSession } from '../services/authService.js';
import { getAccess } from '../services/accessService.js';

const ALLOWED_DURING_PASSWORD_CHANGE = new Set(['/auth/me', '/auth/change-password', '/auth/logout', '/auth/login']);

export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    req.user = await getSession(token);
    if (req.user?.mustChangePassword && !ALLOWED_DURING_PASSWORD_CHANGE.has(req.path)) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: '초기 비밀번호를 사용 중입니다. 비밀번호를 변경한 뒤 이용하세요.',
      });
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  next();
}

/** 로그인 사용자의 역할·권한을 req.access 에 담습니다. */
export async function loadAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  try {
    req.access = await getAccess(req.user.employeeId);
    if (!req.access) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    await loadAccess(req, res, (err) => {
      if (err) return next(err);
      if (!req.access.has(permission)) {
        return res.status(403).json({ message: '이 작업을 할 권한이 없습니다.' });
      }
      next();
    });
  };
}
