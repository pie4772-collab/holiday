import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';
import { personnelKeys } from './usePersonnel';

export const documentKeys = {
  all: ['documents'],
  box: (box) => ['documents', 'box', box],
  detail: (id) => ['documents', 'detail', String(id)],
  people: ['documents', 'people'],
  lineSuggestion: ['documents', 'line-suggestion'],
  admin: (filters) => ['documents', 'admin', filters],
  personnelOrders: (filters) => ['documents', 'personnel-orders', filters],
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

export function usePersonnelOrders(filters) {
  return useQuery({
    queryKey: documentKeys.personnelOrders(filters),
    queryFn: () => leaveApi.getPersonnelOrders(filters),
    staleTime: 0,
  });
}

/** 인사명령이 반영되면 사원 명부·조직도·인사기록카드가 바뀝니다. */
function invalidateEmployeeData(queryClient) {
  queryClient.invalidateQueries({ queryKey: leaveKeys.employees });
  queryClient.invalidateQueries({ queryKey: ['admin', 'roster'] });
  queryClient.invalidateQueries({ queryKey: personnelKeys.all });
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
      if (data?.formKey === 'personnel_order' && data.status === 'approved') invalidateEmployeeData(queryClient);
    },
  });
}

/** 잘못 결재된 인사명령을 발령 취소합니다(반영된 사원 정보·발령 이력도 되돌림). */
export function useCancelPersonnelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, reason }) => leaveApi.cancelPersonnelOrder(documentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      invalidateEmployeeData(queryClient);
    },
  });
}

/** 시스템관리자: 인사명령을 대장에서 지웁니다(취소 전이면 반영된 내용을 먼저 되돌림). */
export function useDeletePersonnelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId) => leaveApi.deletePersonnelOrder(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all });
      invalidateEmployeeData(queryClient);
    },
  });
}

/** 인사명령 대장에서 발령 반영을 취소하거나 다시 반영합니다. */
export function usePersonnelOrderAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, op }) => (op === 'cancel' ? leaveApi.cancelPersonnelOrderAction(id) : leaveApi.retryPersonnelOrderAction(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', 'personnel-orders'] });
      invalidateEmployeeData(queryClient);
    },
  });
}

export function useCreateDocument() {
  return useDocumentMutation((data) => leaveApi.createDocument(data));
}

export function useApproveDocument() {
  return useDocumentMutation(({ id, comment, line }) => leaveApi.approveDocument(id, comment, line));
}

export function useRejectDocument() {
  return useDocumentMutation(({ id, reason }) => leaveApi.rejectDocument(id, reason));
}

export function useWithdrawDocument() {
  return useDocumentMutation((id) => leaveApi.withdrawDocument(id));
}

export function useReceiveDocument() {
  return useDocumentMutation(({ id, line, comment }) => leaveApi.receiveDocument(id, { line, comment }));
}
