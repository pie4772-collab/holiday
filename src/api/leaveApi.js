import { apiClient } from './client';
import {
  getMockCurrentEmployee,
  getMockEmployeeById,
  getMockEmployees,
  getMockAdminStats,
  getMockLeaveHistory,
  getMockLeaveUsages,
  getMockAdminAccruals,
  getMockAdminUsages,
  addMockLeaveRequest,
  createMockAccrual,
  updateMockAccrual,
  deleteMockAccrual,
  createMockUsage,
  updateMockUsage,
  deleteMockUsage,
} from './mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function delay(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const leaveApi = {
  async getCurrentEmployee() {
    if (USE_MOCK) {
      await delay();
      return getMockCurrentEmployee();
    }
    return apiClient('/employees/me');
  },

  async getEmployee(id) {
    if (USE_MOCK) {
      await delay();
      const emp = getMockEmployeeById(id);
      if (!emp) throw new Error('직원을 찾을 수 없습니다.');
      return emp;
    }
    return apiClient(`/employees/${id}`);
  },

  async getEmployees() {
    if (USE_MOCK) {
      await delay();
      return getMockEmployees();
    }
    return apiClient('/employees');
  },

  async getAdminStats() {
    if (USE_MOCK) {
      await delay();
      return getMockAdminStats();
    }
    return apiClient('/admin/stats');
  },

  async getLeaveHistory(employeeId) {
    if (USE_MOCK) {
      await delay();
      return getMockLeaveHistory(employeeId);
    }
    return apiClient(`/employees/${employeeId}/leave/history`);
  },

  async getLeaveUsages(employeeId) {
    if (USE_MOCK) {
      await delay();
      return getMockLeaveUsages(employeeId);
    }
    return apiClient(`/employees/${employeeId}/leave/usages`);
  },

  async getAdminAccruals(employeeId) {
    if (USE_MOCK) {
      await delay();
      return getMockAdminAccruals(employeeId);
    }
    return apiClient(`/admin/employees/${employeeId}/accruals`);
  },

  async getAdminUsages(employeeId) {
    if (USE_MOCK) {
      await delay();
      return getMockAdminUsages(employeeId);
    }
    return apiClient(`/admin/employees/${employeeId}/usages`);
  },

  async submitLeaveRequest(data) {
    if (USE_MOCK) {
      await delay(500);
      return addMockLeaveRequest(data);
    }
    return apiClient('/leave/requests', { method: 'POST', body: data });
  },

  async getPendingApprovals() {
    if (USE_MOCK) {
      await delay();
      return [];
    }
    return apiClient('/leave/approvals');
  },

  async approveLeaveRequest(id) {
    if (USE_MOCK) {
      await delay(300);
      return { id, status: 'approved' };
    }
    return apiClient(`/leave/usages/${id}/approve`, { method: 'POST' });
  },

  async rejectLeaveRequest(id, reason) {
    if (USE_MOCK) {
      await delay(300);
      return { id, status: 'rejected' };
    }
    return apiClient(`/leave/usages/${id}/reject`, { method: 'POST', body: { reason } });
  },

  async createAccrual(data) {
    if (USE_MOCK) {
      await delay(400);
      return createMockAccrual(data);
    }
    return apiClient('/admin/accruals', { method: 'POST', body: data });
  },

  async updateAccrual(id, data) {
    if (USE_MOCK) {
      await delay(400);
      return updateMockAccrual(id, data);
    }
    return apiClient(`/admin/accruals/${id}`, { method: 'PUT', body: data });
  },

  async deleteAccrual(id) {
    if (USE_MOCK) {
      await delay(300);
      deleteMockAccrual(id);
      return { success: true };
    }
    return apiClient(`/admin/accruals/${id}`, { method: 'DELETE' });
  },

  async createUsage(data) {
    if (USE_MOCK) {
      await delay(400);
      return createMockUsage(data);
    }
    return apiClient('/admin/usages', { method: 'POST', body: data });
  },

  async updateUsage(id, data) {
    if (USE_MOCK) {
      await delay(400);
      return updateMockUsage(id, data);
    }
    return apiClient(`/admin/usages/${id}`, { method: 'PUT', body: data });
  },

  async deleteUsage(id) {
    if (USE_MOCK) {
      await delay(300);
      deleteMockUsage(id);
      return { success: true };
    }
    return apiClient(`/admin/usages/${id}`, { method: 'DELETE' });
  },

  async getEmployeeRoster(includeInactive = true) {
    if (USE_MOCK) {
      await delay();
      return getMockEmployees().map(({ id, empNo, name, department, position, hireDate, email, notes }) => ({
        id,
        empNo: empNo || '',
        name,
        department,
        position,
        hireDate,
        email: email || '',
        notes: notes || '',
        isActive: true,
        terminatedDate: null,
      }));
    }
    const q = includeInactive ? '' : '?includeInactive=0';
    return apiClient(`/admin/roster${q}`);
  },

  async createEmployee(data) {
    if (USE_MOCK) {
      await delay(400);
      return { id: String(Date.now()), ...data, isActive: true, terminatedDate: null };
    }
    return apiClient('/admin/employees', { method: 'POST', body: data });
  },

  async updateEmployee(id, data) {
    if (USE_MOCK) {
      await delay(400);
      return { id, ...data, isActive: true };
    }
    return apiClient(`/admin/employees/${id}`, { method: 'PUT', body: data });
  },

  async terminateEmployee(id, terminatedDate) {
    if (USE_MOCK) {
      await delay(400);
      return { id, isActive: false, terminatedDate: terminatedDate || new Date().toISOString().slice(0, 10) };
    }
    return apiClient(`/admin/employees/${id}/terminate`, { method: 'POST', body: { terminatedDate } });
  },

  async me() {
    if (USE_MOCK) {
      await delay(100);
      return { employeeId: '1', empNo: 'demo', name: '데모', position: '팀원', isAdmin: true };
    }
    return apiClient('/auth/me');
  },

  async login(username, password) {
    if (USE_MOCK) {
      await delay(200);
      return {
        token: 'mock-token',
        user: { employeeId: '1', empNo: username, name: '데모', position: '팀원' },
      };
    }
    return apiClient('/auth/login', { method: 'POST', body: { username, password } });
  },

  async logout() {
    if (USE_MOCK) {
      await delay(100);
      return { success: true };
    }
    return apiClient('/auth/logout', { method: 'POST' });
  },

  async getApprovalLines() {
    if (USE_MOCK) {
      await delay();
      return { seats: [], departments: [] };
    }
    return apiClient('/admin/approval-lines');
  },

  async saveApprovalLines(data) {
    if (USE_MOCK) {
      await delay(300);
      return data;
    }
    return apiClient('/admin/approval-lines', { method: 'PUT', body: data });
  },

  async reactivateEmployee(id) {
    if (USE_MOCK) {
      await delay(400);
      return { id, isActive: true, terminatedDate: null };
    }
    return apiClient(`/admin/employees/${id}/reactivate`, { method: 'POST' });
  },
};
