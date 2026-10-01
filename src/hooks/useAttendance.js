import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../api/leaveApi';

export const attendanceKeys = {
  all: ['attendance'],
  today: ['attendance', 'today'],
  myMonth: (month) => ['attendance', 'me', month],
  daily: (date) => ['attendance', 'daily', date],
  monthly: (month) => ['attendance', 'monthly', month],
  employee: (id, month) => ['attendance', 'employee', id, month],
  settings: ['attendance', 'settings'],
  ipCheck: ['attendance', 'ip-check'],
};

function useInvalidateAttendance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
}

export function useAttendanceToday() {
  return useQuery({
    queryKey: attendanceKeys.today,
    queryFn: leaveApi.getMyAttendanceToday,
    refetchInterval: 60_000,
  });
}

export function useCheckAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, data }) => (action === 'in' ? leaveApi.checkIn(data) : leaveApi.checkOut(data)),
    onSuccess: (today) => {
      queryClient.setQueryData(attendanceKeys.today, today);
      queryClient.invalidateQueries({ queryKey: ['attendance', 'me'] });
    },
  });
}

export function useMyAttendanceMonth(month) {
  return useQuery({
    queryKey: attendanceKeys.myMonth(month),
    queryFn: () => leaveApi.getMyAttendanceMonth(month),
    enabled: Boolean(month),
  });
}

export function useAttendanceDaily(date) {
  return useQuery({
    queryKey: attendanceKeys.daily(date),
    queryFn: () => leaveApi.getAttendanceDaily(date),
    enabled: Boolean(date),
  });
}

export function useAttendanceMonthly(month) {
  return useQuery({
    queryKey: attendanceKeys.monthly(month),
    queryFn: () => leaveApi.getAttendanceMonthly(month),
    enabled: Boolean(month),
  });
}

export function useEmployeeAttendance(employeeId, month) {
  return useQuery({
    queryKey: attendanceKeys.employee(employeeId, month),
    queryFn: () => leaveApi.getEmployeeAttendance(employeeId, month),
    enabled: Boolean(employeeId && month),
  });
}

export function useCorrectAttendance() {
  const invalidate = useInvalidateAttendance();
  return useMutation({
    mutationFn: ({ employeeId, date, data }) => leaveApi.correctAttendance(employeeId, date, data),
    onSuccess: invalidate,
  });
}

export function useAttendanceClosing() {
  const invalidate = useInvalidateAttendance();
  return useMutation({
    mutationFn: ({ month, close }) =>
      close ? leaveApi.closeAttendanceMonth(month) : leaveApi.reopenAttendanceMonth(month),
    onSuccess: invalidate,
  });
}

export function useAttendanceSettings() {
  return useQuery({ queryKey: attendanceKeys.settings, queryFn: leaveApi.getAttendanceSettings });
}

export function useSaveAttendanceSettings() {
  const invalidate = useInvalidateAttendance();
  return useMutation({ mutationFn: leaveApi.saveAttendanceSettings, onSuccess: invalidate });
}

export function useAttendanceIpCheck() {
  return useQuery({ queryKey: attendanceKeys.ipCheck, queryFn: leaveApi.checkAttendanceIp, enabled: false });
}
