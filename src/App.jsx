import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin, RequirePermission } from './components/RequireAdmin';
import { canAccessAdmin } from './utils/access';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { EmployeeLeaveHistory } from './pages/employee/EmployeeLeaveHistory';
import { EmployeeCalendar } from './pages/employee/EmployeeCalendar';
import { EmployeeRequest } from './pages/employee/EmployeeRequest';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminEmployeeRoster } from './pages/admin/AdminEmployeeRoster';
import { AdminEmployeeDetail } from './pages/admin/AdminEmployeeDetail';
import { AdminLeaveManageList } from './pages/admin/AdminLeaveManageList';
import { AdminLeaveManage } from './pages/admin/AdminLeaveManage';
import { EmployeeApprovals } from './pages/employee/EmployeeApprovals';
import { EmployeeTeam } from './pages/employee/EmployeeTeam';
import { EmployeeProfile } from './pages/employee/EmployeeProfile';
import { AdminPersonnelList } from './pages/admin/AdminPersonnelList';
import { AdminPersonnelCard } from './pages/admin/AdminPersonnelCard';
import { EmployeeAttendance } from './pages/employee/EmployeeAttendance';
import { AttendanceRemoteReviews } from './pages/employee/AttendanceRemoteReviews';
import { AdminAttendance } from './pages/admin/AdminAttendance';
import { AdminAttendanceEmployee } from './pages/admin/AdminAttendanceEmployee';
import { AdminAttendanceSettings } from './pages/admin/AdminAttendanceSettings';
import { AdminApprovalLines } from './pages/admin/AdminApprovalLines';
import { AdminApprovalHistory } from './pages/admin/AdminApprovalHistory';
import { AdminLeaveReport } from './pages/admin/AdminLeaveReport';
import { AdminLeaveSettlement } from './pages/admin/AdminLeaveSettlement';
import { AdminLeaveEventSettlement } from './pages/admin/AdminLeaveEventSettlement';
import { AdminMailSettings } from './pages/admin/AdminMailSettings';
import { useAppStore } from './store/useAppStore';
import { useCurrentEmployee, useLeaveRequest } from './hooks/useLeaveData';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function GlobalRequestModal() {
  const {
    isRequestModalOpen,
    closeRequestModal,
    requestStartDate,
    role,
    setLastRequestMessage,
  } = useAppStore();
  const { data: employee } = useCurrentEmployee();
  const leaveRequest = useLeaveRequest();

  if (role !== 'employee') return null;

  function handleClose() {
    leaveRequest.reset();
    closeRequestModal();
  }

  async function handleSubmit(data) {
    if (employee?.leaveSummary?.leaveExempt) {
      throw new Error('임원(이사·상무·전무·대표이사)은 연차 신청 대상이 아닙니다.');
    }
    const result = await leaveRequest.mutateAsync(data);
    setLastRequestMessage(
      result?.message ||
        (result?.approvalHint
          ? `연차 신청이 접수되었습니다. ${result.approvalHint}`
          : '연차 신청이 접수되었습니다. 승인을 기다려주세요.')
    );
    leaveRequest.reset();
    closeRequestModal();
  }

  return (
    <LeaveRequestModal
      isOpen={isRequestModalOpen}
      onClose={handleClose}
      onSubmit={handleSubmit}
      isSubmitting={leaveRequest.isPending}
      employeeId={employee?.id}
      initialDate={requestStartDate}
      submitError={leaveRequest.isError ? leaveRequest.error?.message || '신청에 실패했습니다. 다시 시도해주세요.' : ''}
    />
  );
}

function guard(permission, element) {
  return <RequirePermission permission={permission}>{element}</RequirePermission>;
}

function RoleRedirect() {
  const { role } = useAppStore();
  const { data: employee } = useCurrentEmployee();
  if (role === 'admin' && canAccessAdmin(employee)) {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/employee" replace />;
}

function AppRoutes() {
  const { setRole } = useAppStore();
  const { data: employee } = useCurrentEmployee();
  const adminAllowed = canAccessAdmin(employee);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/admin') && adminAllowed) setRole('admin');
    else if (path.startsWith('/employee')) setRole('employee');
  }, [setRole, adminAllowed]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />

        <Route path="employee">
          <Route index element={<EmployeeDashboard />} />
          <Route path="history" element={<EmployeeLeaveHistory />} />
          <Route path="calendar" element={<EmployeeCalendar />} />
          <Route path="request" element={<EmployeeRequest />} />
          <Route path="approvals" element={<EmployeeApprovals />} />
          <Route path="profile" element={<EmployeeProfile />} />
          <Route path="attendance" element={<EmployeeAttendance />} />
          <Route path="attendance-reviews" element={<AttendanceRemoteReviews />} />
          <Route
            path="team"
            element={
              <RequirePermission permission="team.view" fallback="/employee">
                <EmployeeTeam />
              </RequirePermission>
            }
          />
        </Route>

        <Route path="admin" element={<RequireAdmin />}>
          <Route index element={<AdminDashboard />} />
          <Route path="approvals" element={<EmployeeApprovals />} />
          <Route path="approval-history" element={guard('approvalLogs.view', <AdminApprovalHistory />)} />
          <Route path="roster" element={guard('employees.view', <AdminEmployeeRoster />)} />
          <Route path="personnel" element={guard('records.view', <AdminPersonnelList />)} />
          <Route path="personnel/:id" element={guard('records.view', <AdminPersonnelCard />)} />
          <Route path="attendance" element={guard('attendance.view', <AdminAttendance />)} />
          <Route path="attendance/:id" element={guard('attendance.view', <AdminAttendanceEmployee />)} />
          <Route path="attendance-reviews" element={<AttendanceRemoteReviews />} />
          <Route path="attendance-settings" element={guard('attendance.manage', <AdminAttendanceSettings />)} />
          <Route path="approval-lines" element={guard('approvalLines.manage', <AdminApprovalLines />)} />
          <Route path="employees" element={<Navigate to="/admin/leave-manage" replace />} />
          <Route path="employees/:id" element={guard('leave.view', <AdminEmployeeDetail />)} />
          <Route path="leave-manage" element={guard('leave.view', <AdminLeaveManageList />)} />
          <Route path="leave-manage/:id" element={guard('leave.view', <AdminLeaveManage />)} />
          <Route path="leave-reports" element={guard('reports.view', <AdminLeaveReport />)} />
          <Route path="leave-settlements" element={guard('payroll', <AdminLeaveSettlement />)} />
          <Route path="leave-event-settlements" element={guard('payroll', <AdminLeaveEventSettlement />)} />
          <Route path="mail-settings" element={guard('mail.manage', <AdminMailSettings />)} />
        </Route>

        <Route path="*" element={<RoleRedirect />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <GlobalRequestModal />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
