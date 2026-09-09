import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthToken, setAuthToken } from '../api/client';
import { leaveApi } from '../api/leaveApi';
import { LoadingSpinner } from './LoadingSpinner';

export function RequireAuth({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState(() => (getAuthToken() ? 'checking' : 'anon'));

  useEffect(() => {
    if (!getAuthToken()) {
      setStatus('anon');
      return undefined;
    }

    let cancelled = false;
    leaveApi
      .me()
      .then(() => {
        if (!cancelled) setStatus('ok');
      })
      .catch(() => {
        setAuthToken('');
        if (!cancelled) setStatus('anon');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (status === 'anon') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return children;
}
