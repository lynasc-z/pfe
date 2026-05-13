import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Calendar, FileText, Plus, User } from 'lucide-react';
import { LeaveRequestForm } from './LeaveRequestForm';
import { LeaveHistory } from './LeaveHistory';
import { LeaveCalendar } from './LeaveCalendar';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../context/AuthContext';
import * as api from '../../lib/api';
import type { LeaveBalance, LeaveRequest as LeaveRequestType } from '../../types';

type EmployeeView = 'dashboard' | 'new-request' | 'history' | 'calendar';

export function EmployeeDashboard() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<EmployeeView>('dashboard');
  const [editTarget, setEditTarget] = useState<LeaveRequestType | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [recentLeaves, setRecentLeaves] = useState<LeaveRequestType[]>([]);

  const fetchData = async () => {
    try {
      const [b, r] = await Promise.all([api.getMyBalances(), api.getMyRequests()]);
      setBalances(b);
      setRecentLeaves(r.slice(0, 5));
    } catch (err: any) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const employee = {
    name: user?.fullName ?? 'Employee',
    position: user?.position ?? '',
    department: user?.department ?? '',
    employeeId: user?.employeeId ?? '',
  };

  const viewTitles: Record<EmployeeView, string> = {
    dashboard: 'Overview', 'new-request': 'New Request', history: 'Leave History', calendar: 'Calendar',
  };

  const renderContent = () => {
    switch (currentView) {
      case 'new-request':
        return <LeaveRequestForm
          onBack={() => { setEditTarget(undefined); setCurrentView('dashboard'); }}
          onSubmit={() => { fetchData(); setEditTarget(undefined); setCurrentView('history'); }}
          editTarget={editTarget}
        />;
      case 'history':
        return <LeaveHistory
          onBack={() => setCurrentView('dashboard')}
          onEdit={(req) => { setEditTarget(req); setCurrentView('new-request'); }}
        />;
      case 'calendar':
        return <LeaveCalendar onBack={() => setCurrentView('dashboard')} />;
      default:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-4xl text-[#0A0A0A] mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  Welcome back, {employee.name.split(' ')[0]}
                </h1>
                <p className="text-gray-600">Manage your leave requests and track your balance</p>
              </div>
              <NotificationBell />
            </div>

            {/* Personal Info Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-[#0A0A0A] to-[#2A2A2A] rounded-2xl p-8 text-white relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6B00] opacity-10 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-[#FF6B00] rounded-full flex items-center justify-center">
                      <User className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                        {employee.name}
                      </h2>
                      <p className="text-gray-400">{employee.position}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">Employee ID</p>
                    <p className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                      {employee.employeeId}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-sm text-gray-400 mb-1">Department</p>
                    <p className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      {employee.department}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-sm text-gray-400 mb-1">Status</p>
                    <p className="text-lg flex items-center gap-2" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      <span className="w-2 h-2 bg-green-400 rounded-full" />
                      Active
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Leave Balances */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border border-gray-200 p-8"
            >
              <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                Leave Balances
              </h2>
              <div className="space-y-6">
                {balances.map((balance) => {
                  const total = balance.totalDays ?? 0;
                  const used = balance.usedDays;
                  const remaining = total - used;
                  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                  return (
                    <div key={balance.id ?? balance.leaveTypeId}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-[#0A0A0A]">{balance.leaveType.name}</h3>
                        <span className="text-sm text-gray-500">{remaining} / {total > 0 ? total : '∞'} days remaining</span>
                      </div>
                      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(pct, 100)}%` }}
                          transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF8C3D] rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
                {balances.length === 0 && (
                  <p className="text-gray-400 text-center py-4">No leave balances found</p>
                )}
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid md:grid-cols-2 gap-4"
            >
              <motion.button
                onClick={() => setCurrentView('new-request')}
                className="bg-[#FF6B00] text-white rounded-xl p-6 flex items-center gap-4 hover:bg-[#E05F00] transition-all group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-all">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    New Leave Request
                  </h3>
                  <p className="text-sm text-white/80">Submit a new request</p>
                </div>
              </motion.button>

              <motion.button
                onClick={() => setCurrentView('history')}
                className="bg-white border border-gray-200 text-[#0A0A0A] rounded-xl p-6 flex items-center gap-4 hover:border-[#FF6B00] transition-all group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-[#FF6B00]/10 transition-all">
                  <FileText className="w-6 h-6 text-gray-700 group-hover:text-[#FF6B00] transition-all" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    Leave History
                  </h3>
                  <p className="text-sm text-gray-600">View all requests</p>
                </div>
              </motion.button>
            </motion.div>

            {/* Recent Requests */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl border border-gray-200 p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  Recent Requests
                </h2>
                <button
                  onClick={() => setCurrentView('history')}
                  className="text-[#FF6B00] hover:text-[#E05F00] transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                >
                  View All →
                </button>
              </div>

              <div className="space-y-3">
                {recentLeaves.map((leave, index) => {
                  const status = leave.status === 'TREATED' ? 'approved'
                    : leave.status === 'CANCELLED' ? 'cancelled'
                    : leave.status === 'REJECTED_BY_MANAGER' ? 'rejected'
                    : leave.status === 'RESERVED' ? 'reserved'
                    : 'pending';
                  return (
                  <motion.div
                    key={leave.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#FF6B00]/10 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-[#FF6B00]" />
                      </div>
                      <div>
                        <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                          {leave.leaveType.name}
                        </h4>
                        <p className="text-xs text-gray-600">
                          {new Date(leave.startDate).toLocaleDateString()} to {new Date(leave.endDate).toLocaleDateString()} ({leave.daysCount} days)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs ${
                          status === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar userRole="EMPLOYEE" currentView={currentView} onNavigate={setCurrentView} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-72'}`}>
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-8 h-11 flex items-center gap-2">
          <span className="text-xs font-bold text-[#FF6B00] uppercase tracking-widest">Employee</span>
          <span className="text-gray-300 text-base">›</span>
          <span className="text-sm font-semibold text-gray-800">{viewTitles[currentView]}</span>
        </div>
        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div key={currentView} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
