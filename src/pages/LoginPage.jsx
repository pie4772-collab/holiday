import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { getAuthToken, setAuthToken } from '../api/client';
import { leaveApi } from '../api/leaveApi';
import { useAppStore } from '../store/useAppStore';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setRole = useAppStore((s) => s.setRole);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checking, setChecking] = useState(() => Boolean(getAuthToken()));
  const nextPath = (() => {
    const queryNext = new URLSearchParams(location.search).get('next');
    const from = location.state?.from;
    const candidate = queryNext || from || '/employee';
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
      return '/employee';
    }
    return candidate;
  })();

  useEffect(() => {
    if (!getAuthToken()) {
      setChecking(false);
      return undefined;
    }
    let cancelled = false;
    leaveApi
      .me()
      .then(() => {
        if (!cancelled) navigate(nextPath, { replace: true });
      })
      .catch(() => {
        setAuthToken('');
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, nextPath]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const result = await leaveApi.login(username, password);
      setAuthToken(result.token);
      setRole(nextPath.startsWith('/admin') ? 'admin' : 'employee');
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-stripe-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm stripe-panel p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-500 text-white text-sm font-bold">
            H
          </div>
          <div>
            <h1 className="text-base font-semibold text-stripe-text">Holiday</h1>
            <p className="text-xs text-stripe-muted">사번으로 로그인</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="stripe-label">사번 (유저 ID)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="stripe-input font-mono"
              placeholder="예: 2016017"
            />
          </div>
          <div>
            <label className="stripe-label">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="stripe-input"
            />
          </div>
          {error && <p className="text-sm text-[#df1b41]">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? '로그인 중…' : '로그인'}
          </Button>
        </form>
      </div>
    </div>
  );
}
