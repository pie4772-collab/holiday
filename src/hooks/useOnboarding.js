import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';
import { personnelKeys } from './usePersonnel';

export const onboardingKeys = {
  employee: (id) => ['onboarding', 'employee', id],
  mine: ['onboarding', 'mine'],
};

export function useOnboardingForms(employeeId) {
  return useQuery({
    queryKey: onboardingKeys.employee(employeeId),
    queryFn: () => leaveApi.getOnboardingForms(employeeId),
    enabled: Boolean(employeeId),
  });
}

export function useRequestOnboardingForms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, forms }) => leaveApi.requestOnboardingForms(employeeId, forms),
    onSuccess: (data, { employeeId }) => queryClient.setQueryData(onboardingKeys.employee(employeeId), data),
  });
}

export function useCancelOnboardingForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ formId }) => leaveApi.cancelOnboardingForm(formId),
    onSuccess: (_data, { employeeId }) =>
      queryClient.invalidateQueries({ queryKey: onboardingKeys.employee(employeeId) }),
  });
}

export function useMyOnboarding() {
  return useQuery({ queryKey: onboardingKeys.mine, queryFn: leaveApi.getMyOnboarding });
}

export function useSubmitOnboardingForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, ...data }) => leaveApi.submitOnboardingForm(formId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.mine });
      queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
      queryClient.invalidateQueries({ queryKey: personnelKeys.mine });
    },
  });
}
