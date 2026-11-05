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
  ScrollText,
  Mail,
  Users,
  Contact,
  Clock,
  Settings2,
  MapPinCheck,
  Megaphone,
  UserCheck,
  PenLine,
  GraduationCap,
  FileCheck,
  FileBadge,
  Files,
  Settings,
  HardDrive,
  ChevronDown,
} from 'lucide-react';
import { ASSIGNABLE_ROLES, ROLE_LABELS, canAccessAdmin, hasPermission } from '../utils/access';
import { useAppStore } from '../store/useAppStore';
import { useCurrentEmployee } from '../hooks/useLeaveData';
import { setAuthToken } from '../api/client';
import { leaveApi } from '../api/leaveApi';
import { BrandLockup } from './BrandLockup';

const employeeNav = [
  { to: '/employee', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/employee/notices', icon: Megaphone, label: '공지사항' },
  { to: '/employee/attendance', icon: Clock, label: '출퇴근' },
  { to: '/employee/documents', icon: FileCheck, label: '전자결재' },
  { to: '/employee/certificates', icon: FileBadge, label: '증명서' },
  { to: '/employee/training', icon: GraduationCap, label: '법정의무교육' },
  { to: '/employee/history', icon: History, label: '연차 사용현황' },
  { to: '/employee/calendar', icon: Calendar, label: '캘린더' },
  { to: '/employee/request', icon: FilePlus, label: '연차 신청' },
  { to: '/employee/profile', icon: Contact, label: '내 인사기록' },
];

const adminNav = [
  { to: '/admin', icon: BarChart3, label: 'Home', end: true },
  {
    key: 'leave',
    icon: CalendarDays,
    label: '연차',
    children: [
      { to: '/admin/leave-manage', icon: CalendarDays, label: '연차 관리', permission: 'leave.view' },
      { to: '/admin/approvals', icon: ClipboardCheck, label: '연차 승인' },
      { to: '/admin/approval-history', icon: ScrollText, label: '승인·반려 이력', permission: 'approvalLogs.view' },
      { to: '/admin/leave-reports', icon: FileSpreadsheet, label: '연차 보고서', permission: 'reports.view' },
      { to: '/admin/leave-settlements', icon: Scale, label: 'IFRS 연차부채', permission: 'payroll' },
      { to: '/admin/leave-event-settlements', icon: Wallet, label: '연차 정산', permission: 'payroll' },
    ],
  },
  { to: '/admin/roster', icon: ClipboardList, label: '사원 명부', permission: 'employees.view' },
  { to: '/admin/personnel', icon: Contact, label: '인사기록카드', permission: 'records.view' },
  { to: '/admin/evaluations', icon: UserCheck, label: '수습·정기 평가', permission: 'evaluations.manage' },
  { to: '/admin/training', icon: GraduationCap, label: '법정의무교육', permission: 'training.manage' },
  { to: '/admin/documents', icon: Files, label: '전자결재 문서함', permission: 'documents.manage' },
  { to: '/admin/certificates', icon: FileBadge, label: '증명서 발급', permission: 'certificates.manage' },
  { to: '/admin/attendance', icon: Clock, label: '근태 현황', permission: 'attendance.view' },
  {
    key: 'settings',
    icon: Settings,
    label: '환경설정',
    children: [
      { to: '/admin/attendance-settings', icon: Settings2, label: '근태 설정', permission: 'attendance.manage' },
      { to: '/admin/approval-lines', icon: GitBranch, label: '결재 라인', permission: 'approvalLines.manage' },
      { to: '/admin/mail-settings', icon: Mail, label: '메일 서버', permission: 'mail.manage' },
      { to: '/admin/storage', icon: HardDrive, label: '저장공간', permission: 'storage.view' },
    ],
  },
];

/** 권한 있는 메뉴만 남깁니다. 하위 메뉴가 하나도 남지 않은 묶음은 뺍니다. */
function allowedNav(items, employee) {
  return items.flatMap((item) => {
    if (item.children) {
      const children = allowedNav(item.children, employee);
      return children.length ? [{ ...item, children }] : [];
    }
    return !item.permission || hasPermission(employee, item.permission) ? [item] : [];
  });
}

function primaryRoleLabel(employee) {
  const role = ASSIGNABLE_ROLES.find((r) => employee?.roles?.includes(r));
  return role ? ROLE_LABELS[role] : '관리자';
}

/** 접었다 펼치는 메뉴 묶음. 하위 화면에 있으면 펼친 채로 시작합니다. */
function NavGroup({ item, onNavigate }) {
  const location = useLocation();
  const active = item.children.some((child) => location.pathname.startsWith(child.to));
  const [toggled, setToggled] = useState(null);
  const open = toggled ?? active;
  const badge = item.children.reduce((sum, child) => sum + (child.badge || 0), 0);
  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        className={`stripe-nav-item w-full ${active && !open ? 'active' : ''}`}
      >
        <Icon className="h-4 w-4 opacity-80 shrink-0" />
        {item.label}
        {!open && badge > 0 && (
          <span className="ml-auto rounded-full bg-[#df1b41] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
        <ChevronDown
          className={`${!open && badge > 0 ? '' : 'ml-auto'} h-3.5 w-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="ml-[18px] mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
          <NavItems items={item.children} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

function NavItems({ items, onNavigate, className = '' }) {
  return (
    <>
      {items.map((item) => {
        if (item.children) return <NavGroup key={item.key} item={item} onNavigate={onNavigate} />;
        const { to, icon: Icon, label, end, badge } = item;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => `stripe-nav-item ${isActive ? 'active' : ''} ${className}`}
          >
            <Icon className="h-4 w-4 opacity-80 shrink-0" />
            {label}
            {badge > 0 && (
              <span className="ml-auto rounded-full bg-[#df1b41] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {badge}
              </span>
            )}
          </NavLink>
        );
      })}
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
  const canAdmin = canAccessAdmin(currentEmployee);
  const canApprove = Boolean(currentEmployee?.canApprove);
  const canReviewRemote =
    (canApprove && currentEmployee?.position !== '대표이사') || hasPermission(currentEmployee, 'attendance.edit');
  const employeeItems = [
    ...employeeNav.map((item) =>
      item.to === '/employee/documents' ? { ...item, badge: currentEmployee?.documentTasks || 0 } : item
    ),
    ...(canApprove ? [{ to: '/employee/approvals', icon: ClipboardCheck, label: '연차 승인' }] : []),
    ...(canReviewRemote
      ? [{ to: '/employee/attendance-reviews', icon: MapPinCheck, label: '외근·출장 확인' }]
      : []),
    ...(hasPermission(currentEmployee, 'team.view')
      ? [{ to: '/employee/team', icon: Users, label: '부서원 연차' }]
      : []),
    ...(currentEmployee?.evaluationTasks || location.pathname === '/employee/evaluations'
      ? [{ to: '/employee/evaluations', icon: PenLine, label: '평가 작성' }]
      : []),
  ];
  const adminItems = allowedNav(adminNav, currentEmployee)
    .map((item) =>
      item.to === '/admin/certificates' ? { ...item, badge: currentEmployee?.certificateRequestTasks || 0 } : item
    );
  if (canReviewRemote) {
    const index = adminItems.findIndex((item) => item.to === '/admin/attendance');
    adminItems.splice(index >= 0 ? index + 1 : adminItems.length, 0, {
      to: '/admin/attendance-reviews',
      icon: MapPinCheck,
      label: '외근·출장 확인',
    });
  }
  const navItems = role === 'admin' && canAdmin ? adminItems : employeeItems;
  const adminLabel = primaryRoleLabel(currentEmployee);
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
          <Link to={homePath} className="min-w-0 hover:opacity-90">
            <BrandLockup
              subtitle={
                currentEmployee
                  ? `${currentEmployee.name}${role === 'admin' ? ` · ${adminLabel}` : ` · ${currentEmployee.department}`}`
                  : '인사관리'
              }
              markClassName="h-8 w-8"
            />
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
            <div className="mt-1 flex justify-center gap-2 text-[10px] text-stripe-sidebar-muted">
              <Link to={`/change-password?next=${encodeURIComponent(location.pathname)}`} className="hover:text-white">
                비밀번호
              </Link>
              <button type="button" onClick={handleLogout} className="hover:text-white">
                로그아웃
              </button>
            </div>
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
          <Link to={homePath} className="hover:opacity-90">
            <BrandLockup markClassName="h-9 w-9" />
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
                  {role === 'admin' ? adminLabel : currentEmployee.position || currentEmployee.department}
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
          <div className="mt-2 flex gap-3 px-1 text-[11px] text-stripe-sidebar-muted">
            <Link to={`/change-password?next=${encodeURIComponent(location.pathname)}`} className="hover:text-white">
              비밀번호 변경
            </Link>
            <button type="button" onClick={handleLogout} className="hover:text-white">
              로그아웃
            </button>
          </div>
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
          {navItems.flatMap((item) => item.children || [item]).map(({ to, icon: Icon, label, end }) => (
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
        <div className="px-4 py-5 sm:px-6 sm:py-8 mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
