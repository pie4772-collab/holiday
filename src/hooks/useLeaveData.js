import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';

export const leaveKeys = {
  currentEmployee: ['employee', 'me'],
  employee: (id) => ['employee', id],
  employees: ['employees'],
  adminStats: ['admin', 'stats'],
  leaveHistory: (id) => ['leave', 'history', id],
  leaveUsages: (id) => ['leave', 'usages', id],
  pendingApprovals: ['leave', 'approvals'],
  adminAccruals: (id) => ['admin', 'accruals', id],
  adminUsages: (id) => ['admin', 'usages', id],
};

function invalidateEmployeeData(queryClient, employeeId) {
  queryClient.invalidateQueries({ queryKey: leaveKeys.employee(employeeId) });
  queryClient.invalidateQueries({ queryKey: leaveKeys.leaveHistory(employeeId) });
  queryClient.invalidateQueries({ queryKey: leaveKeys.leaveUsages(employeeId) });
  queryClient.invalidateQueries({ queryKey: leaveKeys.adminAccruals(employeeId) });
  queryClient.invalidateQueries({ queryKey: leaveKeys.adminUsages(employeeId) });
  queryClient.invalidateQueries({ queryKey: leaveKeys.employees });
  queryClient.invalidateQueries({ queryKey: leaveKeys.adminStats });
  queryClient.invalidateQueries({ queryKey: leaveKeys.pendingApprovals });
  queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
}

export function useCurrentEmployee() {
  return useQuery({
    queryKey: leaveKeys.currentEmployee,
    queryFn: leaveApi.getCurrentEmployee,
    enabled: Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('holiday_token')),
  });
}

export function useEmployee(id) {
  return useQuery({
    queryKey: leaveKeys.employee(id),
    queryFn: () => leaveApi.getEmployee(id),
    enabled: !!id,
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: leaveKeys.employees,
    queryFn: leaveApi.getEmployees,
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: leaveKeys.adminStats,
    queryFn: leaveApi.getAdminStats,
  });
}

export function useLeaveHistory(employeeId) {
  return useQuery({
    queryKey: leaveKeys.leaveHistory(employeeId),
    queryFn: () => leaveApi.getLeaveHistory(employeeId),
    enabled: !!employeeId,
  });
}

export function useLeaveUsages(employeeId) {
  return useQuery({
    queryKey: leaveKeys.leaveUsages(employeeId),
    queryFn: () => leaveApi.getLeaveUsages(employeeId),
    enabled: !!employeeId,
  });
}

export function usePendingApprovals(enabled = true) {
  return useQuery({
    queryKey: leaveKeys.pendingApprovals,
    queryFn: leaveApi.getPendingApprovals,
    enabled,
  });
}

export function useDecideLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }) =>
      action === 'reject' ? leaveApi.rejectLeaveRequest(id, reason) : leaveApi.approveLeaveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.pendingApprovals });
      queryClient.invalidateQueries({ queryKey: leaveKeys.employees });
      queryClient.invalidateQueries({ queryKey: leaveKeys.adminStats });
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
    },
  });
}

export function useAdminAccruals(employeeId) {
  return useQuery({
    queryKey: leaveKeys.adminAccruals(employeeId),
    queryFn: () => leaveApi.getAdminAccruals(employeeId),
    enabled: !!employeeId,
  });
}

export function useAdminUsages(employeeId) {
  return useQuery({
    queryKey: leaveKeys.adminUsages(employeeId),
    queryFn: () => leaveApi.getAdminUsages(employeeId),
    enabled: !!employeeId,
  });
}

export function useLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leaveApi.submitLeaveRequest,
    onSuccess: (_, variables) => {
      invalidateEmployeeData(queryClient, variables.employeeId);
    },
  });
}

export function useCreateAccrual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveApi.createAccrual,
    onSuccess: (_, variables) => invalidateEmployeeData(queryClient, variables.employeeId),
  });
}

export function useUpdateAccrual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => leaveApi.updateAccrual(id, data),
    onSuccess: (_, variables) => invalidateEmployeeData(queryClient, variables.employeeId),
  });
}

export function useDeleteAccrual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => leaveApi.deleteAccrual(id),
    onSuccess: (_, variables) => invalidateEmployeeData(queryClient, variables.employeeId),
  });
}

export function useCreateUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveApi.createUsage,
    onSuccess: (_, variables) => invalidateEmployeeData(queryClient, variables.employeeId),
  });
}

export function useUpdateUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => leaveApi.updateUsage(id, data),
    onSuccess: (_, variables) => invalidateEmployeeData(queryClient, variables.employeeId),
  });
}

export function useDeleteUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => leaveApi.deleteUsage(id),
    onSuccess: (_, variables) => invalidateEmployeeData(queryClient, variables.employeeId),
  });
}
