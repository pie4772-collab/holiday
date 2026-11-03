import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';

export const trainingKeys = {
  all: ['training'],
  mine: ['training', 'mine'],
  assignment: (id) => ['training', 'assignment', String(id)],
  courses: ['training', 'courses'],
  targets: ['training', 'targets'],
  sessions: (year) => ['training', 'sessions', year || 'current'],
  session: (id) => ['training', 'session', String(id)],
};

export function useMyTraining() {
  return useQuery({ queryKey: trainingKeys.mine, queryFn: leaveApi.getMyTraining, staleTime: 0 });
}

export function useTrainingAssignment(id) {
  return useQuery({
    queryKey: trainingKeys.assignment(id),
    queryFn: () => leaveApi.getTrainingAssignment(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** 수강 기록 응답(갱신된 배정 상세)을 바로 캐시에 넣고, 수료하면 목록·할 일 수를 새로 받습니다. */
function useAssignmentMutation(id, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      const before = queryClient.getQueryData(trainingKeys.assignment(id));
      queryClient.setQueryData(trainingKeys.assignment(id), data);
      if (data?.completedAt && !before?.completedAt) {
        queryClient.invalidateQueries({ queryKey: trainingKeys.mine });
        queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
      }
    },
  });
}

export function useTrainingProgress(id) {
  return useAssignmentMutation(id, (data) => leaveApi.recordTrainingProgress(id, data));
}

export function useTrainingLinkAction(id) {
  return useAssignmentMutation(id, ({ videoId, action }) => leaveApi.trainingLinkAction(id, videoId, action));
}

export function useConfirmTrainingMaterial(id) {
  return useAssignmentMutation(id, () => leaveApi.confirmTrainingMaterial(id));
}

export function useTrainingCourses(enabled = true) {
  return useQuery({ queryKey: trainingKeys.courses, queryFn: leaveApi.getTrainingCourses, enabled });
}

export function useTrainingTargets(enabled = true) {
  return useQuery({ queryKey: trainingKeys.targets, queryFn: leaveApi.getTrainingTargets, enabled });
}

export function useTrainingSessions(year) {
  return useQuery({ queryKey: trainingKeys.sessions(year), queryFn: () => leaveApi.getTrainingSessions(year), staleTime: 0 });
}

export function useTrainingSession(id) {
  return useQuery({
    queryKey: trainingKeys.session(id),
    queryFn: () => leaveApi.getTrainingSession(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

function useTrainingAdminMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.all });
      queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
    },
  });
}

export function useSaveTrainingCourse() {
  return useTrainingAdminMutation(({ id, data }) => leaveApi.saveTrainingCourse(id, data));
}

export function useDeleteTrainingCourse() {
  return useTrainingAdminMutation((id) => leaveApi.deleteTrainingCourse(id));
}

export function useCreateTrainingSession() {
  return useTrainingAdminMutation((data) => leaveApi.createTrainingSession(data));
}

export function useUpdateTrainingSession() {
  return useTrainingAdminMutation(({ id, data }) => leaveApi.updateTrainingSession(id, data));
}

export function useDeleteTrainingSession() {
  return useTrainingAdminMutation((id) => leaveApi.deleteTrainingSession(id));
}

export function useAddTrainingAssignees() {
  return useTrainingAdminMutation(({ id, target }) => leaveApi.addTrainingAssignees(id, target));
}

export function useRemoveTrainingAssignee() {
  return useTrainingAdminMutation(({ id, assigneeId }) => leaveApi.removeTrainingAssignee(id, assigneeId));
}

export function useRemindTrainingSession() {
  return useMutation({ mutationFn: (id) => leaveApi.remindTrainingSession(id) });
}
