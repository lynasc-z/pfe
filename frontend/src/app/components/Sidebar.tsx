import { motion } from 'motion/react';
import { SonatrachLogo } from './SonatrachLogo';
import { Calendar, FileText, Home, LogOut, Users, BarChart3, UserPlus, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type UserRole = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';

export function Sidebar({
  userRole,
  currentView,
  onNavigate,
  collapsed,
  onToggle,
}: {
  userRole: UserRole;
  currentView: string;
  onNavigate: (view: any) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { logout } = useAuth();

  const employeeMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'new-request', label: 'New Request', icon: Calendar },
    { id: 'history', label: 'Leave History', icon: FileText },
    { id: 'calendar', label: 'Calendar', icon: BarChart3 }
  ];

  const managerMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'requests', label: 'Leave Requests', icon: FileText },
    { id: 'team-history', label: 'Team History', icon: Clock },
    { id: 'my-leave', label: 'My Leave', icon: Calendar },
    { id: 'history', label: 'My Leave History', icon: FileText },
    { id: 'calendar', label: 'Calendar', icon: BarChart3 }
  ];

  const hrMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'requests', label: 'All Requests', icon: FileText },
    { id: 'my-requests', label: 'My Requests', icon: Calendar },
    { id: 'my-leave', label: 'My Leave', icon: Calendar },
    { id: 'balances', label: 'Balances', icon: Users },
    { id: 'history', label: 'Leave History', icon: FileText },
    { id: 'calendar', label: 'Calendar', icon: BarChart3 }
  ];

  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'pending-assignment', label: 'Assign to HR', icon: Clock },
    { id: 'manager-approvals', label: 'Manager Approvals', icon: UserPlus },
    { id: 'hr-agents', label: 'HR Agents', icon: UserPlus },
    { id: 'all-requests', label: 'All Requests', icon: FileText },
    { id: 'balances', label: 'Balances', icon: Users },
    { id: 'audit', label: 'Audit Log', icon: BarChart3 },
    { id: 'users', label: 'All Users', icon: Users },
    { id: 'reshum-import', label: 'RESHUM Import', icon: UserPlus },
    { id: 'reshum-simulator', label: 'RESHUM Simulator', icon: BarChart3 },
    { id: 'calendar', label: 'Calendar', icon: BarChart3 },
  ];

  const menuItems = userRole === 'ADMIN' ? adminMenuItems : userRole === 'HR' ? hrMenuItems : userRole === 'MANAGER' ? managerMenuItems : employeeMenuItems;
  const portalLabel = userRole === 'ADMIN' ? 'Admin Portal' : userRole === 'HR' ? 'HR Portal' : userRole === 'MANAGER' ? 'Manager Portal' : 'Employee Portal';

  return (
    <motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ width: collapsed ? 72 : 288, x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-y-0 left-0 bg-[#0A0A0A] text-white flex flex-col overflow-hidden z-40"
      style={{ minWidth: 0 }}
    >
      <div className={`flex flex-col h-full ${collapsed ? 'px-3 py-6' : 'p-6'}`}>
        {/* Toggle button */}
        <button
          onClick={onToggle}
          className={`flex items-center justify-center p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all mb-4 ${collapsed ? 'self-center' : 'self-end'}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        {/* Logo */}
        <div className={`mb-8 ${collapsed ? 'flex flex-col items-center' : ''}`}>
          {collapsed ? (
            <div className="w-10 h-10 rounded-lg bg-[#FF6B00] flex items-center justify-center text-white font-bold text-sm">
              LR
            </div>
          ) : (
            <>
              <div className="mb-2">
                <SonatrachLogo size="default" className="[&_text]:fill-white" />
              </div>
              <div className="h-px bg-white/10 my-4" />
              <p className="text-lg text-white/80 whitespace-nowrap" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                LeaveRec
              </p>
              <p className="text-sm text-white/50 mt-1 whitespace-nowrap">
                {portalLabel}
              </p>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <motion.button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`relative w-full flex items-center ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'} rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
                whileHover={{ x: isActive || collapsed ? 0 : 4 }}
                whileTap={{ scale: 0.98 }}
                title={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 bg-[#FF6B00] rounded-lg -z-10"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {item.label}
                  </span>
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* Logout */}
        <motion.button
          onClick={logout}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'} rounded-lg text-white/70 hover:bg-red-500/20 hover:text-red-400 transition-all mt-4 whitespace-nowrap`}
          whileHover={{ x: collapsed ? 0 : 4 }}
          whileTap={{ scale: 0.98 }}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && (
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              Logout
            </span>
          )}
        </motion.button>

        {/* Footer */}
        {!collapsed && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-xs text-white/40">© 2026 Sonatrach</p>
            <p className="text-xs text-white/40 mt-1">All rights reserved</p>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
