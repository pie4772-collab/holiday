import express from 'express';
import * as leaveService from '../services/leaveService.js';
import * as employeeService from '../services/employeeService.js';
import * as authService from '../services/authService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { isEmployeeAdmin } from '../services/authService.js';
import * as approvalService from '../services/approvalService.js';
import * as mailService from '../services/mailService.js';

const router = express.Router();

router.post('/auth/login', async (req, res, next) => {
  try {
    res.json(await authService.login(req.body.username, req.body.password));
  } catch (e) {
    next(e);
  }
});

router.post('/auth/logout', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  authService.destroySession(token);
  res.json({ success: true });
});

router.get('/auth/me', requireAuth, async (req, res) => {
  res.json({
    ...req.user,
    isAdmin: await isEmployeeAdmin(req.user.employeeId),
    canApprove: await approvalService.canApproveRequests(req.user.employeeId),
  });
});

router.get('/employees/me', requireAuth, async (req, res, next) => {
  try {
    const emp = await leaveService.getCurrentEmployee(req.user.employeeId);
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    res.json(emp);
  } catch (e) {
    next(e);
  }
});

router.get('/employees', requireAdmin, async (req, res, next) => {
  try {
    res.json(await leaveService.getAllEmployees());
  } catch (e) {
    next(e);
  }
});

router.get('/admin/stats', requireAdmin, async (req, res, next) => {
  try {
    res.json(await leaveService.getAdminStats());
  } catch (e) {
    next(e);
  }
});

router.get('/admin/mail-settings', requireAdmin, async (req, res, next) => {
  try {
    res.json(await mailService.getMailSettings());
  } catch (e) {
    next(e);
  }
});

router.put('/admin/mail-settings', requireAdmin, async (req, res, next) => {
  try {
    res.json(await mailService.saveMailSettings(req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/mail-settings/test', requireAdmin, async (req, res, next) => {
  mailService
    .sendTestMail(req.body?.to, req.body || {})
    .then((result) => res.json(result))
    .catch(next);
});

router.get('/admin/leave-reports', requireAdmin, async (req, res, next) => {
  try {
    const savedOnly = req.query.saved === '1';
    const report = savedOnly
      ? await leaveService.getSavedMonthlyLeaveReport(req.query.year, req.query.month)
      : await leaveService.getMonthlyLeaveReport(req.query.year, req.query.month);
    if (!report) return res.status(404).json({ message: '저장된 월말 보고서가 없습니다.' });
    res.json(report);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/leave-reports', requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(
      await leaveService.saveMonthlyLeaveReport(req.body.year, req.body.month, req.user.employeeId)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/admin/leave-settlements', requireAdmin, async (req, res, next) => {
  try {
    const savedOnly = req.query.saved === '1';
    const settlement = savedOnly
      ? await leaveService.getSavedLeavePaySettlement(req.query.year, req.query.month)
      : await leaveService.getLeavePaySettlement(req.query.year, req.query.month);
    if (!settlement) return res.status(404).json({ message: '저장된 IFRS 연차부채가 없습니다.' });
    res.json(settlement);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/leave-settlements', requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(
      await leaveService.saveLeavePaySettlement(req.body.year, req.body.month, req.user.employeeId)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/admin/leave-event-settlements', requireAdmin, async (req, res, next) => {
  try {
    const savedOnly = req.query.saved === '1';
    const settlement = savedOnly
      ? await leaveService.getSavedLeaveEventSettlement(req.query.year)
      : await leaveService.getLeaveEventSettlement(req.query.year);
    if (!settlement) return res.status(404).json({ message: '저장된 연차 정산이 없습니다.' });
    res.json(settlement);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/leave-event-settlements', requireAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await leaveService.saveLeaveEventSettlement(req.body.year, req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id/ordinary-wage', requireAdmin, async (req, res, next) => {
  try {
    const purpose = req.body.purpose === 'settlement' ? 'settlement' : 'liability';
    res.json(await leaveService.updateEmployeeOrdinaryWage(req.params.id, req.body.ordinaryWage, purpose));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/ordinary-wages/template', requireAdmin, async (req, res, next) => {
  try {
    const purpose = req.query.purpose === 'settlement' ? 'settlement' : 'liability';
    const template = await leaveService.getOrdinaryWageTemplate(purpose);
    const escape = (value) => {
      const text = value == null ? '' : String(value);
      if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };
    const lines = [
      template.headers.join(','),
      ...template.rows.map((row) =>
        [row.empNo, row.name, row.ordinaryWage, row.workplace, row.department, row.active]
          .map(escape)
          .join(',')
      ),
    ];
    const csv = `\uFEFF${lines.join('\r\n')}`;
    const filename =
      purpose === 'settlement'
        ? 'settlement-ordinary-wage-template.csv'
        : 'ordinary-wage-template.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/ordinary-wages/upload', requireAdmin, async (req, res, next) => {
  try {
    const purpose = req.body.purpose === 'settlement' ? 'settlement' : 'liability';
    res.json(
      await leaveService.bulkUpdateOrdinaryWagesByEmpNo(req.body.rows || req.body.items || [], purpose)
    );
  } catch (e) {
    next(e);
  }
});

router.post('/admin/ordinary-wages/load-previous-month', requireAdmin, async (req, res, next) => {
  try {
    res.json(
      await leaveService.loadLiabilityOrdinaryWagesFromPreviousMonth(req.body.year, req.body.month)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id', requireAuth, async (req, res, next) => {
  try {
    const emp = await leaveService.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    res.json(emp);
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id/leave/history', async (req, res, next) => {
  try {
    res.json(await leaveService.getLeaveHistory(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id/leave/usages', async (req, res, next) => {
  try {
    res.json(await leaveService.getLeaveUsages(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/approval-lines', requireAdmin, async (req, res, next) => {
  try {
    res.json(await approvalService.listApprovalLines());
  } catch (e) {
    next(e);
  }
});

router.put('/admin/approval-lines', requireAdmin, async (req, res, next) => {
  try {
    res.json(await approvalService.saveApprovalLines(req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/roster', requireAdmin, async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== '0';
    res.json(await employeeService.getEmployeeRoster(includeInactive));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees', requireAdmin, async (req, res, next) => {
  try {
    const result = await employeeService.createEmployee(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await employeeService.updateEmployee(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/terminate', requireAdmin, async (req, res, next) => {
  try {
    const result = await employeeService.terminateEmployee(req.params.id, req.body.terminatedDate);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/reactivate', requireAdmin, async (req, res, next) => {
  try {
    const result = await employeeService.reactivateEmployee(req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/accruals', requireAdmin, async (req, res, next) => {
  try {
    res.json(await leaveService.getAdminAccruals(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/usages', requireAdmin, async (req, res, next) => {
  try {
    res.json(await leaveService.getAdminUsages(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.post('/leave/requests', requireAuth, async (req, res, next) => {
  try {
    const result = await leaveService.submitLeaveRequest({
      ...req.body,
      employeeId: req.user.employeeId,
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/leave/approvals', requireAuth, async (req, res, next) => {
  try {
    res.json(await leaveService.getPendingApprovals(req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/leave-approval-logs', requireAdmin, async (req, res, next) => {
  try {
    res.json(
      await leaveService.getLeaveApprovalHistory({
        year: req.query.year,
        workplace: req.query.workplace,
        action: req.query.action,
        query: req.query.query || req.query.q,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/leave/usages/:id/approve', requireAuth, async (req, res, next) => {
  try {
    res.json(await leaveService.decideLeaveRequest(req.params.id, req.user.employeeId, 'approve'));
  } catch (e) {
    next(e);
  }
});

router.post('/leave/usages/:id/reject', requireAuth, async (req, res, next) => {
  try {
    res.json(
      await leaveService.decideLeaveRequest(req.params.id, req.user.employeeId, 'reject', req.body?.reason)
    );
  } catch (e) {
    next(e);
  }
});

router.post('/admin/accruals', requireAdmin, async (req, res, next) => {
  try {
    const result = await leaveService.createAccrual(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/accruals/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await leaveService.updateAccrual(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/accruals/:id', requireAdmin, async (req, res, next) => {
  try {
    await leaveService.deleteAccrual(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/usages', requireAdmin, async (req, res, next) => {
  try {
    const result = await leaveService.createUsage(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/usages/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await leaveService.updateUsage(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/usages/:id', requireAdmin, async (req, res, next) => {
  try {
    await leaveService.deleteUsage(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
