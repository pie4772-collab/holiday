import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';
import { personnelKeys } from './usePersonnel';

export const evaluationKeys = {
  all: ['evaluations'],
  list: (view) => ['evaluations', 'list', view],
  candidates: ['evaluations', 'candidates'],
  employee: (id) => ['evaluations', 'employee', id],
  mine: ['evaluations', 'mine'],
  detail: (id) => ['evaluations', 'detail', id],
};

export function useEvaluations(view) {
  return useQuery({ queryKey: evaluationKeys.list(view), queryFn: () => leaveApi.getEvaluations(view) });
}

export function useEvaluationCandidates(enabled = true) {
  return useQuery({
    queryKey: evaluationKeys.candidates,
    queryFn: leaveApi.getEvaluationCandidates,
    enabled,
  });
}

export function useEmployeeEvaluations(employeeId, enabled = true) {
  return useQuery({
    queryKey: evaluationKeys.employee(employeeId),
    queryFn: () => leaveApi.getEmployeeEvaluations(employeeId),
    enabled: Boolean(employeeId) && enabled,
  });
}

export function useMyEvaluations() {
  return useQuery({ queryKey: evaluationKeys.mine, queryFn: leaveApi.getMyEvaluations });
}

export function useEvaluation(id) {
  return useQuery({
    queryKey: evaluationKeys.detail(id),
    queryFn: () => leaveApi.getEvaluation(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** 평가가 바뀌면 직원 정보(수습 종료일·전환일)·인사기록카드·내 할 일 수도 같이 새로 받습니다. */
function useEvaluationMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
      queryClient.invalidateQueries({ queryKey: personnelKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
      queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
    },
  });
}

export function useSetHireType() {
  return useEvaluationMutation(({ employeeId, hireType }) => leaveApi.setHireType(employeeId, hireType));
}

export function useAssignEvaluator() {
  return useEvaluationMutation(({ id, data }) => leaveApi.assignEvaluator(id, data));
}

export function useEvaluationAction() {
  return useEvaluationMutation(({ id, action, data }) => leaveApi.evaluationAction(id, action, data));
}

export function useSaveEvaluation() {
  return useEvaluationMutation(({ id, data }) => leaveApi.saveEvaluation(id, data));
}
