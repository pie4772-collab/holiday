import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ASSIGNABLE_ROLES, ROLE_BADGE_VARIANTS, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../utils/access';

export function RoleBadges({ roles = [], empty = '-' }) {
  if (!roles.length) return <span className="muted">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} variant={ROLE_BADGE_VARIANTS[role]}>
          {ROLE_LABELS[role] || role}
        </Badge>
      ))}
    </span>
  );
}

export function RoleEditorModal({ employee, onClose, onSubmit, isSubmitting, error }) {
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (employee) setRoles((employee.roles || []).filter((role) => ASSIGNABLE_ROLES.includes(role)));
  }, [employee]);

  if (!employee) return null;

  const isDeptHead = (employee.roles || []).includes('dept_head');

  function toggle(role) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(roles);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[#0a2540]/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md stripe-panel shadow-xl rounded-t-xl sm:rounded-lg max-h-[92vh] overflow-y-auto safe-bottom">
        <div className="flex items-center justify-between border-b border-stripe-border px-5 py-4">
          <h2 className="text-base font-semibold text-stripe-text">역할 지정</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-[#f0f3f7]">
            <X className="h-4 w-4 text-stripe-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-stripe-muted">
            <span className="font-medium text-stripe-text">{employee.name}</span>
            {employee.empNo && <span className="ml-1 font-mono text-xs">({employee.empNo})</span>}
            {employee.workplace && <span className="ml-1">· {employee.workplace}</span>}
          </p>
          <div className="space-y-2">
            {ASSIGNABLE_ROLES.map((role) => {
              const disabled = role === 'site_admin' && !employee.workplace;
              return (
                <label
                  key={role}
                  className={`flex items-start gap-3 rounded-md border border-stripe-border px-3 py-2.5 ${
                    disabled ? 'opacity-50' : 'cursor-pointer hover:bg-[#f6f9fc]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-stripe-border"
                    checked={roles.includes(role)}
                    disabled={disabled}
                    onChange={() => toggle(role)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-stripe-text">{ROLE_LABELS[role]}</span>
                    <span className="block text-xs text-stripe-muted mt-0.5">{ROLE_DESCRIPTIONS[role]}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-stripe-muted leading-relaxed">
            부서장은 직급·겸직직급이 팀장이면 자동으로 적용됩니다
            {isDeptHead ? ' (현재 부서장)' : ''}. 시스템관리자·인사담당은 연차 결재에서 기존 관리자처럼 모든 단계를
            승인할 수 있습니다.
          </p>
          {error && (
            <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#df1b41]">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
