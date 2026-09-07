import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentEmployee } from '../hooks/useLeaveData';
import { LoadingSpinner } from './LoadingSpinner';

export function RequireAdmin() {
  const { data: employee, isLoading } = useCurrentEmployee();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!employee?.isAdmin) {
    return <Navigate to="/employee" replace />;
  }

  return <Outlet />;
}
