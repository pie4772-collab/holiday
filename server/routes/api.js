import express from 'express';
import * as leaveService from '../services/leaveService.js';
import * as employeeService from '../services/employeeService.js';
import * as authService from '../services/authService.js';
import * as accessService from '../services/accessService.js';
import { requireAuth, loadAccess, requirePermission } from '../middleware/auth.js';
import { isEmployeeAdmin } from '../services/authService.js';
import * as approvalService from '../services/approvalService.js';
import * as mailService from '../services/mailService.js';
import * as personnelService from '../services/personnelService.js';
import { getDb } from '../db.js';

const router = express.Router();

function forbidden(res) {
  return res.status(403).json({ message: '이 직원의 정보를 볼 권한이 없습니다.' });
}

/** 본인·권한 범위 안의 직원·담당 부서원만 조회할 수 있습니다. */
async function canViewEmployee(access, employeeId) {
  if (String(access.employee.id) === String(employeeId)) return true;
  const target = await accessService.getEmployeeRow(employeeId);
  if (!target) return true;
  return (
    access.covers('leave.view', target) ||
    access.covers('employees.view', target) ||
    access.isTeamLead(target)
  );
}

async function requireCoveredEmployee(req, res, permission, employeeId) {
  if (req.access.scopes[permission] === 'all') return true;
  const target = await accessService.getEmployeeRow(employeeId);
  if (!target) {
    res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    return false;
  }
  if (!req.access.covers(permission, target)) {
    forbidden(res);
    return false;
  }
  return true;
}

async function requireCoveredRecord(req, res, permission, table, recordId) {
  if (req.access.scopes[permission] === 'all') return true;
  const row = await getDb().prepare(`SELECT employee_id FROM ${table} WHERE id = ?`).get(recordId);
  if (!row) {
    res.status(404).json({ message: '내역을 찾을 수 없습니다.' });
    return false;
  }
  return requireCoveredEmployee(req, res, permission, row.employee_id);
}

function workplaceScope(access, permission) {
  const scope = access.scopes[permission];
  return scope === 'all' ? null : scope;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** 사업장 한정 권한이면 보고서를 해당 사업장 직원만 남기고 합계를 다시 계산합니다. */
function scopeMonthlyReport(report, access) {
  const codes = workplaceScope(access, 'reports.view');
  if (!codes || !report) return report;
  const sum = (list, key) => round1(list.reduce((acc, item) => acc + (Number(item[key]) || 0), 0));
  const workplaces = (report.workplaces || [])
    .map((group) => {
      const employees = (group.employees || []).filter((emp) => codes.has(String(emp.workplaceCode || '')));
      return {
        ...group,
        employees,
        employeeCount: employees.length,
        accrued: sum(employees, 'accrued'),
        usedInMonth: sum(employees, 'usedInMonth'),
        remaining: sum(employees, 'remaining'),
        pendingInMonth: sum(employees, 'pendingInMonth'),
      };
    })
    .filter((group) => group.employeeCount > 0);
  return {
    ...report,
    workplaces,
    totals: {
      employeeCount: workplaces.reduce((acc, group) => acc + group.employeeCount, 0),
      accrued: sum(workplaces, 'accrued'),
      usedInMonth: sum(workplaces, 'usedInMonth'),
      remaining: sum(workplaces, 'remaining'),
      pendingInMonth: sum(workplaces, 'pendingInMonth'),
    },
  };
}

router.post('/auth/login', async (req, res, next) => {
  try {
    res.json(await authService.login(req.body.username, req.body.password));
  } catch (e) {
    next(e);
  }
});

router.post('/auth/logout', async (req, res) => {
  await authService.logout(req.user);
  res.json({ success: true });
});

router.post('/auth/change-password', requireAuth, async (req, res, next) => {
  try {
    res.json(
      await authService.changePassword(req.user.employeeId, req.body?.currentPassword, req.body?.newPassword)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const { tv: _tv, ...session } = req.user;
    const access = accessService.describeAccess(await accessService.getAccess(req.user.employeeId));
    res.json({
      ...session,
      mustChangePassword: Boolean(req.user.mustChangePassword),
      isAdmin: await isEmployeeAdmin(req.user.employeeId),
      canApprove: await approvalService.canApproveRequests(req.user.employeeId),
      ...access,
      canAccessAdmin: access.permissions.includes('admin'),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/employees/me', requireAuth, async (req, res, next) => {
  try {
    const emp = await leaveService.getCurrentEmployee(req.user.employeeId);
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    const access = accessService.describeAccess(await accessService.getAccess(req.user.employeeId));
    res.json({ ...emp, ...access, canAccessAdmin: access.permissions.includes('admin') });
  } catch (e) {
    next(e);
  }
});

router.get('/employees', requirePermission('leave.view'), async (req, res, next) => {
  try {
    res.json(await leaveService.getAllEmployees(await accessService.scopedEmployeeIds(req.access, 'leave.view')));
  } catch (e) {
    next(e);
  }
});

router.get('/team/members', requirePermission('team.view'), async (req, res, next) => {
  try {
    const members = await accessService.listTeamMembers(req.access);
    if (!members.length) return res.json([]);
    res.json(await leaveService.getAllEmployees(new Set(members.map((row) => String(row.id)))));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/stats', requirePermission('admin'), async (req, res, next) => {
  try {
    const perm = req.access.has('leave.view') ? 'leave.view' : 'employees.view';
    res.json(await leaveService.getAdminStats(await accessService.scopedEmployeeIds(req.access, perm)));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/mail-settings', requirePermission('mail.manage'), async (req, res, next) => {
  try {
    res.json(await mailService.getMailSettings());
  } catch (e) {
    next(e);
  }
});

router.put('/admin/mail-settings', requirePermission('mail.manage'), async (req, res, next) => {
  try {
    res.json(await mailService.saveMailSettings(req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/mail-settings/test', requirePermission('mail.manage'), async (req, res, next) => {
  mailService
    .sendTestMail(req.body?.to, req.body || {})
    .then((result) => res.json(result))
    .catch(next);
});

router.get('/admin/leave-reports', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const savedOnly = req.query.saved === '1';
    const report = savedOnly
      ? await leaveService.getSavedMonthlyLeaveReport(req.query.year, req.query.month)
      : await leaveService.getMonthlyLeaveReport(req.query.year, req.query.month);
    if (!report) return res.status(404).json({ message: '저장된 월말 보고서가 없습니다.' });
    res.json(scopeMonthlyReport(report, req.access));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/leave-reports', requirePermission('reports.save'), async (req, res, next) => {
  try {
    res.status(201).json(
      await leaveService.saveMonthlyLeaveReport(req.body.year, req.body.month, req.user.employeeId)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/admin/leave-settlements', requirePermission('payroll'), async (req, res, next) => {
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

router.post('/admin/leave-settlements', requirePermission('payroll'), async (req, res, next) => {
  try {
    res.status(201).json(
      await leaveService.saveLeavePaySettlement(req.body.year, req.body.month, req.user.employeeId)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/admin/leave-event-settlements', requirePermission('payroll'), async (req, res, next) => {
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

router.post('/admin/leave-event-settlements', requirePermission('payroll'), async (req, res, next) => {
  try {
    res.status(201).json(await leaveService.saveLeaveEventSettlement(req.body.year, req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id/ordinary-wage', requirePermission('payroll'), async (req, res, next) => {
  try {
    const purpose = req.body.purpose === 'settlement' ? 'settlement' : 'liability';
    res.json(await leaveService.updateEmployeeOrdinaryWage(req.params.id, req.body.ordinaryWage, purpose));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/ordinary-wages/template', requirePermission('payroll'), async (req, res, next) => {
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

router.post('/admin/ordinary-wages/upload', requirePermission('payroll'), async (req, res, next) => {
  try {
    const purpose = req.body.purpose === 'settlement' ? 'settlement' : 'liability';
    res.json(
      await leaveService.bulkUpdateOrdinaryWagesByEmpNo(req.body.rows || req.body.items || [], purpose)
    );
  } catch (e) {
    next(e);
  }
});

router.post('/admin/ordinary-wages/load-previous-month', requirePermission('payroll'), async (req, res, next) => {
  try {
    res.json(
      await leaveService.loadLiabilityOrdinaryWagesFromPreviousMonth(req.body.year, req.body.month)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id', loadAccess, async (req, res, next) => {
  try {
    if (!(await canViewEmployee(req.access, req.params.id))) return forbidden(res);
    const emp = await leaveService.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    res.json(emp);
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id/leave/history', loadAccess, async (req, res, next) => {
  try {
    if (!(await canViewEmployee(req.access, req.params.id))) return forbidden(res);
    res.json(await leaveService.getLeaveHistory(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id/leave/usages', loadAccess, async (req, res, next) => {
  try {
    if (!(await canViewEmployee(req.access, req.params.id))) return forbidden(res);
    res.json(await leaveService.getLeaveUsages(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/approval-lines', requirePermission('approvalLines.manage'), async (req, res, next) => {
  try {
    res.json(await approvalService.listApprovalLines());
  } catch (e) {
    next(e);
  }
});

router.put('/admin/approval-lines', requirePermission('approvalLines.manage'), async (req, res, next) => {
  try {
    res.json(await approvalService.saveApprovalLines(req.body));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/roster', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== '0';
    const roster = await employeeService.getEmployeeRoster(includeInactive);
    const ids = await accessService.scopedEmployeeIds(req.access, 'employees.view');
    res.json(ids ? roster.filter((emp) => ids.has(String(emp.id))) : roster);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id/roles', requirePermission('roles.manage'), async (req, res, next) => {
  try {
    res.json(await accessService.setEmployeeRoles(req.params.id, req.body?.roles));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const result = await employeeService.createEmployee(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const result = await employeeService.updateEmployee(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/terminate', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const result = await employeeService.terminateEmployee(req.params.id, req.body.terminatedDate);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/reactivate', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const result = await employeeService.reactivateEmployee(req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/reset-password', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    res.json(await authService.resetPassword(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/accruals', requirePermission('leave.view'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'leave.view', req.params.id))) return;
    res.json(await leaveService.getAdminAccruals(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/usages', requirePermission('leave.view'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'leave.view', req.params.id))) return;
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

router.get('/admin/leave-approval-logs', requirePermission('approvalLogs.view'), async (req, res, next) => {
  try {
    res.json(
      await leaveService.getLeaveApprovalHistory({
        year: req.query.year,
        workplace: req.query.workplace,
        action: req.query.action,
        query: req.query.query || req.query.q,
        workplaceCodes: workplaceScope(req.access, 'approvalLogs.view'),
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

router.post('/admin/accruals', requirePermission('leave.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'leave.edit', req.body?.employeeId))) return;
    const result = await leaveService.createAccrual(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/accruals/:id', requirePermission('leave.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredRecord(req, res, 'leave.edit', 'leave_accruals', req.params.id))) return;
    const result = await leaveService.updateAccrual(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/accruals/:id', requirePermission('leave.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredRecord(req, res, 'leave.edit', 'leave_accruals', req.params.id))) return;
    await leaveService.deleteAccrual(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/usages', requirePermission('leave.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'leave.edit', req.body?.employeeId))) return;
    const result = await leaveService.createUsage(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/usages/:id', requirePermission('leave.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredRecord(req, res, 'leave.edit', 'leave_usages', req.params.id))) return;
    const result = await leaveService.updateUsage(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/usages/:id', requirePermission('leave.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredRecord(req, res, 'leave.edit', 'leave_usages', req.params.id))) return;
    await leaveService.deleteUsage(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get('/employees/me/personnel', requireAuth, async (req, res, next) => {
  try {
    res.json(await personnelService.getPersonnelCard(req.user.employeeId, { self: true }));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/personnel', requirePermission('records.view'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'records.view', req.params.id))) return;
    res.json(await personnelService.getPersonnelCard(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id/personnel/profile', requirePermission('records.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'records.edit', req.params.id))) return;
    res.json(await personnelService.saveProfile(req.params.id, req.body || {}, req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/personnel/records', requirePermission('records.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredEmployee(req, res, 'records.edit', req.params.id))) return;
    res.status(201).json(await personnelService.createRecord(req.params.id, req.body || {}, req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.put('/admin/personnel/records/:recordId', requirePermission('records.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredRecord(req, res, 'records.edit', 'employee_records', req.params.recordId))) return;
    res.json(await personnelService.updateRecord(req.params.recordId, req.body || {}, req.user.employeeId));
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/personnel/records/:recordId', requirePermission('records.edit'), async (req, res, next) => {
  try {
    if (!(await requireCoveredRecord(req, res, 'records.edit', 'employee_records', req.params.recordId))) return;
    await personnelService.deleteRecord(req.params.recordId);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get('/admin/personnel/export', requirePermission('records.edit'), async (req, res, next) => {
  try {
    const type = req.query.type === 'records' ? 'records' : 'profiles';
    const { headers, rows } = await personnelService.exportPersonnel(type);
    const escape = (value) => {
      const cell = value == null ? '' : String(value);
      return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
    };
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="personnel-${type}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/personnel/import', requirePermission('records.edit'), async (req, res, next) => {
  try {
    const type = req.body?.type === 'records' ? 'records' : 'profiles';
    const result = await personnelService.importPersonnel(type, req.body?.table, req.user.employeeId);
    res.status(result.applied ? 200 : 400).json(
      result.applied ? result : { ...result, message: `오류 ${result.errors.length}건이 있어 반영하지 않았습니다.` }
    );
  } catch (e) {
    next(e);
  }
});

export default router;
