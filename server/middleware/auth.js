import { getSession, isEmployeeAdmin } from '../services/authService.js';

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  req.user = getSession(token);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  if (!isEmployeeAdmin(req.user.employeeId)) {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
}
