import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';
import { LoginPage } from './pages/LoginPage';
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { EmployeeLeaveHistory } from './pages/employee/EmployeeLeaveHistory';
import { EmployeeCalendar } from './pages/employee/EmployeeCalendar';
import { EmployeeRequest } from './pages/employee/EmployeeRequest';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminEmployeeList } from './pages/admin/AdminEmployeeList';
import { AdminEmployeeRoster } from './pages/admin/AdminEmployeeRoster';
import { AdminEmployeeDetail } from './pages/admin/AdminEmployeeDetail';
import { AdminLeaveManageList } from './pages/admin/AdminLeaveManageList';
import { AdminLeaveManage } from './pages/admin/AdminLeaveManage';
import { EmployeeApprovals } from './pages/employee/EmployeeApprovals';
import { AdminApprovalLines } from './pages/admin/AdminApprovalLines';
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
  const { isRequestModalOpen, closeRequestModal, role } = useAppStore();
  const { data: employee } = useCurrentEmployee();
  const leaveRequest = useLeaveRequest();

  if (role !== 'employee') return null;

  async function handleSubmit(data) {
    await leaveRequest.mutateAsync(data);
    closeRequestModal();
  }

  return (
    <LeaveRequestModal
      isOpen={isRequestModalOpen}
      onClose={closeRequestModal}
      onSubmit={handleSubmit}
      isSubmitting={leaveRequest.isPending}
      employeeId={employee?.id}
    />
  );
}

function RoleRedirect() {
  const { role } = useAppStore();
  const { data: employee } = useCurrentEmployee();
  if (role === 'admin' && employee?.isAdmin) {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/employee" replace />;
}

function AppRoutes() {
  const { setRole } = useAppStore();
  const { data: employee } = useCurrentEmployee();

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/admin') && employee?.isAdmin) setRole('admin');
    else if (path.startsWith('/employee')) setRole('employee');
  }, [setRole, employee?.isAdmin]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<RoleRedirect />} />

        <Route path="employee">
          <Route index element={<EmployeeDashboard />} />
          <Route path="history" element={<EmployeeLeaveHistory />} />
          <Route path="calendar" element={<EmployeeCalendar />} />
          <Route path="request" element={<EmployeeRequest />} />
          <Route path="approvals" element={<EmployeeApprovals />} />
        </Route>

        <Route path="admin" element={<RequireAdmin />}>
          <Route index element={<AdminDashboard />} />
          <Route path="approvals" element={<EmployeeApprovals />} />
          <Route path="roster" element={<AdminEmployeeRoster />} />
          <Route path="approval-lines" element={<AdminApprovalLines />} />
          <Route path="employees" element={<AdminEmployeeList />} />
          <Route path="employees/:id" element={<AdminEmployeeDetail />} />
          <Route path="leave-manage" element={<AdminLeaveManageList />} />
          <Route path="leave-manage/:id" element={<AdminLeaveManage />} />
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
