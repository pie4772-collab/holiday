import { Navigate, useLocation } from 'react-router-dom';
import { getAuthToken } from '../api/client';

export function RequireAuth({ children }) {
  const location = useLocation();
  if (!getAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
