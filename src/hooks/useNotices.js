import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';

export const noticeKeys = {
  all: ['notices'],
  list: (limit) => ['notices', 'list', limit || 'all'],
  detail: (id) => ['notices', 'detail', id],
  reads: (id) => ['notices', 'reads', id],
  targets: ['notices', 'targets'],
};

export function useNotices(limit) {
  return useQuery({ queryKey: noticeKeys.list(limit), queryFn: () => leaveApi.getNotices(limit) });
}

export function useNotice(id) {
  return useQuery({ queryKey: noticeKeys.detail(id), queryFn: () => leaveApi.getNotice(id), enabled: Boolean(id) });
}

export function useNoticeReads(id, enabled) {
  return useQuery({
    queryKey: noticeKeys.reads(id),
    queryFn: () => leaveApi.getNoticeReads(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useNoticeTargets(enabled) {
  return useQuery({ queryKey: noticeKeys.targets, queryFn: leaveApi.getNoticeTargets, enabled });
}

function useNoticeMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noticeKeys.all }),
  });
}

export function useSaveNotice() {
  return useNoticeMutation(({ id, data }) => leaveApi.saveNotice(id, data));
}

export function useDeleteNotice() {
  return useNoticeMutation((id) => leaveApi.deleteNotice(id));
}

export function useConfirmNoticeRead() {
  return useNoticeMutation((id) => leaveApi.confirmNoticeRead(id));
}

export function useUploadNoticeFile() {
  return useNoticeMutation(({ id, file }) => leaveApi.uploadNoticeFile(id, file));
}

export function useDeleteNoticeFile() {
  return useNoticeMutation((fileId) => leaveApi.deleteNoticeFile(fileId));
}
