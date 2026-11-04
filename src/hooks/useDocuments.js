import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';

export const documentKeys = {
  all: ['documents'],
  box: (box) => ['documents', 'box', box],
  detail: (id) => ['documents', 'detail', String(id)],
  people: ['documents', 'people'],
  lineSuggestion: ['documents', 'line-suggestion'],
  admin: (filters) => ['documents', 'admin', filters],
};

export function useDocumentBox(box) {
  return useQuery({ queryKey: documentKeys.box(box), queryFn: () => leaveApi.getDocumentBox(box), staleTime: 0 });
}

export function useDocument(id) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => leaveApi.getDocument(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useDocumentPeople(enabled = true) {
  return useQuery({ queryKey: documentKeys.people, queryFn: leaveApi.getDocumentPeople, enabled });
}

export function useDocumentLineSuggestion(enabled = true) {
  return useQuery({
    queryKey: documentKeys.lineSuggestion,
    queryFn: leaveApi.getDocumentLineSuggestion,
    enabled,
    staleTime: 0,
  });
}

export function useAdminDocuments(filters) {
  return useQuery({ queryKey: documentKeys.admin(filters), queryFn: () => leaveApi.getAdminDocuments(filters), staleTime: 0 });
}

/** 결재·기안 뒤에는 결재함·Home 할 일 수·증명서 목록을 새로 받습니다. */
function useDocumentMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      if (data?.id && data.steps) queryClient.setQueryData(documentKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
    },
  });
}

export function useCreateDocument() {
  return useDocumentMutation((data) => leaveApi.createDocument(data));
}

export function useApproveDocument() {
  return useDocumentMutation(({ id, comment }) => leaveApi.approveDocument(id, comment));
}

export function useRejectDocument() {
  return useDocumentMutation(({ id, reason }) => leaveApi.rejectDocument(id, reason));
}

export function useWithdrawDocument() {
  return useDocumentMutation((id) => leaveApi.withdrawDocument(id));
}
