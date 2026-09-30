import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentEmployee } from '../hooks/useLeaveData';
import { canAccessAdmin, hasPermission } from '../utils/access';
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

  if (!canAccessAdmin(employee)) {
    return <Navigate to="/employee" replace />;
  }

  return <Outlet />;
}

/** 관리 화면 안에서 권한이 없는 메뉴로 들어오면 관리 홈으로 돌려보냅니다. */
export function RequirePermission({ permission, fallback = '/admin', children }) {
  const { data: employee, isLoading } = useCurrentEmployee();
  if (isLoading) return null;
  if (!hasPermission(employee, permission)) return <Navigate to={fallback} replace />;
  return children;
}
