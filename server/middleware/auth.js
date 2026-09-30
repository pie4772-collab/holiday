import { getSession, isEmployeeAdmin } from '../services/authService.js';

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

export async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  if (!(await isEmployeeAdmin(req.user.employeeId))) {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
}
