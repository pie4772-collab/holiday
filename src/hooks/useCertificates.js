import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';
import { leaveKeys } from './useLeaveData';

export const certificateKeys = {
  all: ['certificates'],
  mine: ['certificates', 'mine'],
  detail: (id) => ['certificates', 'detail', String(id)],
  register: (filters) => ['certificates', 'register', filters],
  targets: ['certificates', 'targets'],
  settings: ['certificates', 'settings'],
  requests: (filters) => ['certificates', 'requests', filters],
  request: (id) => ['certificates', 'request', String(id)],
};

export function useMyCertificates() {
  return useQuery({ queryKey: certificateKeys.mine, queryFn: leaveApi.getMyCertificates, staleTime: 0 });
}

export function useCertificate(id) {
  return useQuery({
    queryKey: certificateKeys.detail(id),
    queryFn: () => leaveApi.getCertificate(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useCertificateRegister(filters) {
  return useQuery({
    queryKey: certificateKeys.register(filters),
    queryFn: () => leaveApi.getCertificateRegister(filters),
    staleTime: 0,
  });
}

export function useCertificateTargets(enabled = true) {
  return useQuery({ queryKey: certificateKeys.targets, queryFn: leaveApi.getCertificateTargets, enabled, staleTime: 0 });
}

export function useCertificateSettings(enabled = true) {
  return useQuery({ queryKey: certificateKeys.settings, queryFn: leaveApi.getCertificateSettings, enabled });
}

export function useCertificateRequests(filters) {
  return useQuery({
    queryKey: certificateKeys.requests(filters),
    queryFn: () => leaveApi.getCertificateRequests(filters),
    staleTime: 0,
  });
}

export function useCertificateRequest(id) {
  return useQuery({
    queryKey: certificateKeys.request(id),
    queryFn: () => leaveApi.getCertificateRequest(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

function useCertificateMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      if (data?.id && data.certNo) queryClient.setQueryData(certificateKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: certificateKeys.all });
      queryClient.invalidateQueries({ queryKey: leaveKeys.currentEmployee });
    },
  });
}

export function useRequestCertificate() {
  return useCertificateMutation((data) => leaveApi.requestCertificate(data));
}

export function useCancelCertificateRequest() {
  return useCertificateMutation((id) => leaveApi.cancelCertificateRequest(id));
}

export function useRejectCertificateRequest() {
  return useCertificateMutation(({ id, reason }) => leaveApi.rejectCertificateRequest(id, reason));
}

export function useRevokeCertificate() {
  return useCertificateMutation(({ id, reason }) => leaveApi.revokeCertificate(id, reason));
}

export function useSaveCertificateSettings() {
  return useCertificateMutation((data) => leaveApi.saveCertificateSettings(data));
}
