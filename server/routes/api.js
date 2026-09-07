import express from 'express';
import cors from 'cors';
import * as leaveService from '../services/leaveService.js';
import * as employeeService from '../services/employeeService.js';

const router = express.Router();

router.get('/employees/me', (req, res, next) => {
  try {
    const emp = leaveService.getCurrentEmployee();
    if (!emp) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    res.json(emp);
  } catch (e) {
    next(e);
  }
});

router.get('/employees', (req, res, next) => {
  try {
    res.json(leaveService.getAllEmployees());
  } catch (e) {
    next(e);
  }
});

router.get('/employees/:id', (req, res, next) => {
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

router.get('/admin/stats', (req, res, next) => {
  try {
    res.json(leaveService.getAdminStats());
  } catch (e) {
    next(e);
  }
});

router.get('/admin/roster', (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== '0';
    res.json(employeeService.getEmployeeRoster(includeInactive));
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees', (req, res, next) => {
  try {
    const result = employeeService.createEmployee(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/employees/:id', (req, res, next) => {
  try {
    const result = employeeService.updateEmployee(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/terminate', (req, res, next) => {
  try {
    const result = employeeService.terminateEmployee(req.params.id, req.body.terminatedDate);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/employees/:id/reactivate', (req, res, next) => {
  try {
    const result = employeeService.reactivateEmployee(req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/accruals', (req, res, next) => {
  try {
    res.json(leaveService.getAdminAccruals(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.get('/admin/employees/:id/usages', (req, res, next) => {
  try {
    res.json(leaveService.getAdminUsages(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.post('/leave/requests', (req, res, next) => {
  try {
    const result = leaveService.submitLeaveRequest(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/admin/accruals', (req, res, next) => {
  try {
    const result = leaveService.createAccrual(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/accruals/:id', (req, res, next) => {
  try {
    const result = leaveService.updateAccrual(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/accruals/:id', (req, res, next) => {
  try {
    leaveService.deleteAccrual(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/usages', (req, res, next) => {
  try {
    const result = leaveService.createUsage(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.put('/admin/usages/:id', (req, res, next) => {
  try {
    const result = leaveService.updateUsage(req.params.id, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/admin/usages/:id', (req, res, next) => {
  try {
    leaveService.deleteUsage(req.params.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
