import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';

export const rosterKeys = {
  roster: (includeInactive) => ['admin', 'roster', includeInactive],
};

function invalidateRoster(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
  queryClient.invalidateQueries({ queryKey: leaveKeys.employees });
  queryClient.invalidateQueries({ queryKey: leaveKeys.adminStats });
}

export function useEmployeeRoster(includeInactive = true) {
  return useQuery({
    queryKey: rosterKeys.roster(includeInactive),
    queryFn: () => leaveApi.getEmployeeRoster(includeInactive),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveApi.createEmployee,
    onSuccess: () => invalidateRoster(queryClient),
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => leaveApi.updateEmployee(id, data),
    onSuccess: () => invalidateRoster(queryClient),
  });
}

export function useTerminateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, terminatedDate }) => leaveApi.terminateEmployee(id, terminatedDate),
    onSuccess: () => invalidateRoster(queryClient),
  });
}

export function useReactivateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => leaveApi.reactivateEmployee(id),
    onSuccess: () => invalidateRoster(queryClient),
  });
}
