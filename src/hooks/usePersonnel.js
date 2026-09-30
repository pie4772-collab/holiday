import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';

export const personnelKeys = {
  all: ['personnel'],
  card: (id) => ['personnel', 'card', id],
  mine: ['personnel', 'mine'],
};

export function usePersonnelCard(employeeId) {
  return useQuery({
    queryKey: personnelKeys.card(employeeId),
    queryFn: () => leaveApi.getPersonnelCard(employeeId),
    enabled: Boolean(employeeId),
  });
}

export function useMyPersonnelCard() {
  return useQuery({
    queryKey: personnelKeys.mine,
    queryFn: leaveApi.getMyPersonnelCard,
  });
}

function useInvalidatePersonnel() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: personnelKeys.all });
}

export function useSavePersonnelProfile() {
  const invalidate = useInvalidatePersonnel();
  return useMutation({
    mutationFn: ({ employeeId, data }) => leaveApi.savePersonnelProfile(employeeId, data),
    onSuccess: invalidate,
  });
}

export function useSavePersonnelRecord() {
  const invalidate = useInvalidatePersonnel();
  return useMutation({
    mutationFn: ({ employeeId, recordId, data }) =>
      recordId ? leaveApi.updatePersonnelRecord(recordId, data) : leaveApi.createPersonnelRecord(employeeId, data),
    onSuccess: invalidate,
  });
}

export function useDeletePersonnelRecord() {
  const invalidate = useInvalidatePersonnel();
  return useMutation({
    mutationFn: ({ recordId }) => leaveApi.deletePersonnelRecord(recordId),
    onSuccess: invalidate,
  });
}

export function useImportPersonnel() {
  const invalidate = useInvalidatePersonnel();
  return useMutation({
    mutationFn: ({ type, table }) => leaveApi.importPersonnel(type, table),
    onSuccess: invalidate,
  });
}
