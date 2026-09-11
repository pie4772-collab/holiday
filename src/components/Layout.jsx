import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  History,
  Calendar,
  FilePlus,
  BarChart3,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  GitBranch,
  FileSpreadsheet,
  Wallet,
  Scale,
  Mail,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useCurrentEmployee } from '../hooks/useLeaveData';
import { setAuthToken } from '../api/client';
import { leaveApi } from '../api/leaveApi';

const employeeNav = [
  { to: '/employee', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/employee/history', icon: History, label: '연차 사용현황' },
  { to: '/employee/calendar', icon: Calendar, label: '캘린더' },
  { to: '/employee/request', icon: FilePlus, label: '연차 신청' },
];

const adminNav = [
  { to: '/admin', icon: BarChart3, label: 'Home', end: true },
  { to: '/admin/leave-manage', icon: CalendarDays, label: '연차 관리' },
  { to: '/admin/approvals', icon: ClipboardCheck, label: '연차 승인' },
  { to: '/admin/roster', icon: ClipboardList, label: '사원 명부' },
  { to: '/admin/approval-lines', icon: GitBranch, label: '결재 라인' },
  { to: '/admin/leave-reports', icon: FileSpreadsheet, label: '연차 보고서' },
  { to: '/admin/leave-settlements', icon: Scale, label: 'IFRS 연차부채' },
  { to: '/admin/leave-event-settlements', icon: Wallet, label: '연차 정산' },
  { to: '/admin/mail-settings', icon: Mail, label: '메일 서버' },
];

function NavItems({ items, onNavigate, className = '' }) {
  return (
    <>
      {items.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => `stripe-nav-item ${isActive ? 'active' : ''} ${className}`}
        >
          <Icon className="h-4 w-4 opacity-80 shrink-0" />
          {label}
        </NavLink>
      ))}
    </>
  );
}

function RoleToggle({ role, setRole, onSwitch, compact = false }) {
  return (
    <div className={`flex rounded-md bg-white/5 p-0.5 ${compact ? '' : ''}`}>
      {['employee', 'admin'].map((r) => (
        <button
          key={r}
          onClick={() => {
            setRole(r);
            onSwitch?.(r);
          }}
          className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-all ${
            role === r
              ? 'bg-white/15 text-white'
              : 'text-stripe-sidebar-muted hover:text-white/80'
          }`}
        >
          {r === 'employee' ? '직원' : '관리자'}
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const { role, setRole } = useAppStore();
  const { data: currentEmployee } = useCurrentEmployee();
  const [shareUrl, setShareUrl] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const canAdmin = Boolean(currentEmployee?.isAdmin);
  const canApprove = Boolean(currentEmployee?.canApprove);
  const employeeItems = canApprove
    ? [...employeeNav, { to: '/employee/approvals', icon: ClipboardCheck, label: '연차 승인' }]
    : employeeNav;
  const navItems = role === 'admin' && canAdmin ? adminNav : employeeItems;
  const homePath = role === 'admin' && canAdmin ? '/admin' : '/employee';

  async function handleLogout() {
    try {
      await leaveApi.logout();
    } catch {
      // ignore network errors on logout
    }
    setAuthToken('');
    navigate('/login', { replace: true });
  }

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data) => setShareUrl(data.shareUrl || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-stripe-bg">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 bg-stripe-sidebar border-b border-white/10 safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to={homePath} className="flex items-center gap-2.5 min-w-0 hover:opacity-90">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-500 text-white text-sm font-bold">
              동
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white tracking-tight truncate">동양철관 연차관리</h1>
              {currentEmployee && (
                <p className="text-[11px] text-stripe-sidebar-muted truncate">
                  {currentEmployee.name}
                  {role === 'admin' ? ' · 관리자' : ` · ${currentEmployee.department}`}
                </p>
              )}
            </div>
          </Link>
          <div className="w-[108px] shrink-0 ml-2">
            {canAdmin && (
              <RoleToggle
                role={role}
                setRole={setRole}
                compact
                onSwitch={(next) => navigate(next === 'admin' ? '/admin' : '/employee')}
              />
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="mt-1 w-full text-[10px] text-stripe-sidebar-muted hover:text-white"
            >
              로그아웃
            </button>
          </div>
        </div>
        {shareUrl && role === 'admin' && (
          <p className="px-4 pb-2 text-[10px] text-stripe-sidebar-muted leading-relaxed break-all">
            공유: <span className="text-white/90">{shareUrl}</span>
          </p>
        )}
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] bg-stripe-sidebar flex-col fixed h-full z-40">
        <div className="px-5 py-5 border-b border-white/10">
          <Link to={homePath} className="flex items-center gap-2.5 hover:opacity-90">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-500 text-white text-sm font-bold">
              동
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">동양철관</h1>
              <p className="text-[11px] text-stripe-sidebar-muted">연차관리</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-stripe-sidebar-muted/70">
            {role === 'admin' ? '관리' : '내 연차'}
          </p>
          <NavItems items={navItems} />
        </nav>

        <div className="p-4 border-t border-white/10">
          {currentEmployee && (
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                {currentEmployee.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{currentEmployee.name}</p>
                <p className="text-[11px] text-stripe-sidebar-muted">
                  {currentEmployee.empNo ? `${currentEmployee.empNo} · ` : ''}
                  {role === 'admin' ? '관리자' : currentEmployee.position || currentEmployee.department}
                </p>
              </div>
            </div>
          )}
          {canAdmin && (
            <RoleToggle
              role={role}
              setRole={setRole}
              onSwitch={(next) => navigate(next === 'admin' ? '/admin' : '/employee')}
            />
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full text-left px-1 text-[11px] text-stripe-sidebar-muted hover:text-white"
          >
            로그아웃
          </button>
          {shareUrl && role === 'admin' && (
            <p className="mt-3 px-1 text-[10px] text-stripe-sidebar-muted leading-relaxed break-all">
              공유: <span className="text-white/90">{shareUrl}</span>
            </p>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-stripe-sidebar border-t border-white/10 safe-bottom">
        <div className="flex items-stretch justify-around px-1 pt-1 pb-0.5">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 px-1 min-w-0 rounded-md transition-colors ${
                  isActive ? 'text-white' : 'text-stripe-sidebar-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-5 w-5 ${isActive ? 'opacity-100' : 'opacity-70'}`} />
                  <span className="text-[10px] font-medium truncate max-w-full leading-tight">
                    {label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-1 h-0.5 w-8 rounded-full bg-primary-500" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="md:ml-[240px] min-h-screen pt-14 md:pt-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div
          className={`px-4 py-5 sm:px-6 sm:py-8 mx-auto ${
            location.pathname.startsWith('/admin/leave-settlements') ||
            location.pathname.startsWith('/admin/leave-event-settlements') ||
            location.pathname.startsWith('/admin/leave-reports')
              ? 'max-w-[1400px]'
              : 'max-w-[1080px]'
          }`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
