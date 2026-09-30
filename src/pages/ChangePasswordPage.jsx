import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/Button';
import { BrandMark } from '../components/BrandLockup';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { setAuthToken } from '../api/client';
import { leaveApi } from '../api/leaveApi';

const MIN_LENGTH = 8;

function safeNext(search) {
  const candidate = new URLSearchParams(search).get('next') || '/';
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/';
  if (candidate.startsWith('/change-password') || candidate.startsWith('/login')) return '/';
  return candidate;
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const nextPath = safeNext(location.search);
  const [me, setMe] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    leaveApi
      .me()
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) navigate('/login', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!me) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const forced = Boolean(me.mustChangePassword);

  function clientError() {
    if (newPassword.length < MIN_LENGTH) return `새 비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`;
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return '새 비밀번호에 영문과 숫자를 모두 포함하세요.';
    }
    if (newPassword !== confirmPassword) return '새 비밀번호 확인이 일치하지 않습니다.';
    if (newPassword === currentPassword) return '현재 비밀번호와 다른 비밀번호를 입력하세요.';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = clientError();
    setError(problem);
    if (problem) return;
    setIsSubmitting(true);
    try {
      const result = await leaveApi.changePassword(currentPassword, newPassword);
      setAuthToken(result.token);
      queryClient.clear();
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.message || '비밀번호를 변경하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await leaveApi.logout();
    } catch {
      // ignore network errors on logout
    }
    setAuthToken('');
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-stripe-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md stripe-panel overflow-hidden">
        <div className="px-6 pt-6 pb-2 flex items-center gap-3">
          <BrandMark className="h-9 w-9" />
          <div>
            <h1 className="text-lg font-semibold text-stripe-text">비밀번호 변경</h1>
            <p className="text-xs text-stripe-muted">
              {me.name} · {me.empNo}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {forced && (
            <p className="text-sm rounded-md bg-[#fff8e6] border border-[#f5d68a] text-[#7a5a00] px-3 py-2">
              초기 비밀번호를 사용 중입니다. 새 비밀번호를 설정해야 이용할 수 있습니다.
            </p>
          )}
          <div>
            <label className="stripe-label">현재 비밀번호</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="stripe-input"
            />
          </div>
          <div>
            <label className="stripe-label">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="stripe-input"
            />
            <p className="text-xs text-stripe-muted mt-1">
              {MIN_LENGTH}자 이상, 영문과 숫자를 모두 포함하고 사번은 넣을 수 없습니다.
            </p>
          </div>
          <div>
            <label className="stripe-label">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="stripe-input"
            />
          </div>
          {error && <p className="text-sm text-[#df1b41]">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? '변경 중…' : '비밀번호 변경'}
          </Button>
          <div className="flex justify-between text-xs">
            {forced ? (
              <span />
            ) : (
              <button type="button" onClick={() => navigate(nextPath)} className="text-stripe-muted hover:text-stripe-text">
                취소
              </button>
            )}
            <button type="button" onClick={handleLogout} className="text-stripe-muted hover:text-stripe-text">
              로그아웃
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
