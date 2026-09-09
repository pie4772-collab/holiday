import express from 'express';
import * as leaveService from '../services/leaveService.js';
import * as employeeService from '../services/employeeService.js';
import * as authService from '../services/authService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { isEmployeeAdmin } from '../services/authService.js';
import * as approvalService from '../services/approvalService.js';
import * as mailService from '../services/mailService.js';

const router = express.Router();

router.post('/auth/login', (req, res, next) => {
  try {
    res.json(authService.login(req.body.username, req.body.password));
  } catch (e) {
    next(e);
  }
});

router.post('/auth/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  authService.destroySession(token);
  res.json({ success: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    ...req.user,
    isAdmin: isEmployeeAdmin(req.user.employeeId),
    canApprove: approvalService.canApproveRequests(req.user.employeeId),
  });
});

router.get('/employees/me', requireAuth, (req, res, next) => {
  try {
    const emp = leaveService.getCurrentEmployee(req.user.employeeId);
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    res.json(emp);
  } catch (e) {
    next(e);
  }
});

router.get('/employees', requireAdmin, (req, res, next) => {
  try {
    res.json(leaveService.getAllEmployees());
  } catch (e) {
    next(e);
  }
});

router.get('/admin/stats', requireAdmin, (req, res, next) => {
  try {
    res.json(leaveService.getAdminStats());
  } catch (e) {
    next(e);
  }
});

router.get('/admin/mail-settings', requireAdmin, (req, res, next) => {
  try {
    res.json(mailService.getMailSettings());
  } catch (e) {
    next(e);
  }
});

router.put('/admin/mail-settings', requireAdmin, (req, res, next) => {
  try {
    res.json(mailService.saveMailSettings(req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/mail-settings/test', requireAdmin, (req, res, next) => {
  mailService
    .sendTestMail(req.body?.to, req.body || {})
    .then((result) => res.json(result))
    .catch(next);
});

router.get('/admin/leave-reports', requireAdmin, (req, res, next) => {
  try {
    const savedOnly = req.query.saved === '1';
    const report = savedOnly
      ? leaveService.getSavedMonthlyLeaveReport(req.query.year, req.query.month)
      : leaveService.getMonthlyLeaveReport(req.query.year, req.query.month);
    if (!report) return res.status(404).json({ message: '저장된 월말 보고서가 없습니다.' });
    res.json(report);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/leave-reports', requireAdmin, (req, res, next) => {
  try {
    res.status(201).json(
      leaveService.saveMonthlyLeaveReport(req.body.year, req.body.month, req.user.employeeId)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id', requireAuth, (req, res, next) => {
  try {
    const emp = leaveService.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    res.json(emp);
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id/leave/history', (req, res, next) => {
  try {
    res.json(leaveService.getLeaveHistory(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id/leave/usages', (req, res, next) => {
  try {
    res.json(leaveService.getLeaveUsages(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/approval-lines', requireAdmin, (req, res, next) => {
  try {
    res.json(approvalService.listApprovalLines());
  } catch (e) {
    next(e);
  }
});

router.put('/admin/approval-lines', requireAdmin, (req, res, next) => {
  try {
    res.json(approvalService.saveApprovalLines(req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/roster', requireAdmin, (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== '0';
    res.json(employeeService.getEmployeeRoster(includeInactive));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees', requireAdmin, (req, res, next) => {
  try {
    const result = employeeService.createEmployee(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id', requireAdmin, (req, res, next) => {
  try {
    const result = employeeService.updateEmployee(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/terminate', requireAdmin, (req, res, next) => {
  try {
    const result = employeeService.terminateEmployee(req.params.id, req.body.terminatedDate);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/reactivate', requireAdmin, (req, res, next) => {
  try {
    const result = employeeService.reactivateEmployee(req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/accruals', requireAdmin, (req, res, next) => {
  try {
    res.json(leaveService.getAdminAccruals(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/usages', requireAdmin, (req, res, next) => {
  try {
    res.json(leaveService.getAdminUsages(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.post('/leave/requests', requireAuth, (req, res, next) => {
  try {
    const result = leaveService.submitLeaveRequest({
      ...req.body,
      employeeId: req.user.employeeId,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/leave/approvals', requireAuth, (req, res, next) => {
  try {
    res.json(leaveService.getPendingApprovals(req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.post('/leave/usages/:id/approve', requireAuth, (req, res, next) => {
  try {
    res.json(leaveService.decideLeaveRequest(req.params.id, req.user.employeeId, 'approve'));
  } catch (e) {
    next(e);
  }
});

router.post('/leave/usages/:id/reject', requireAuth, (req, res, next) => {
  try {
    res.json(
      leaveService.decideLeaveRequest(req.params.id, req.user.employeeId, 'reject', req.body?.reason)
    );
  } catch (e) {
    next(e);
  }
});

router.post('/admin/accruals', requireAdmin, (req, res, next) => {
  try {
    const result = leaveService.createAccrual(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/accruals/:id', requireAdmin, (req, res, next) => {
  try {
    const result = leaveService.updateAccrual(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/accruals/:id', requireAdmin, (req, res, next) => {
  try {
    leaveService.deleteAccrual(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/usages', requireAdmin, (req, res, next) => {
  try {
    const result = leaveService.createUsage(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/usages/:id', requireAdmin, (req, res, next) => {
  try {
    const result = leaveService.updateUsage(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/usages/:id', requireAdmin, (req, res, next) => {
  try {
    leaveService.deleteUsage(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
