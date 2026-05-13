import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Calendar, CheckCircle, Users, XCircle, FileText, Clock, Download, Search, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { LeaveRequestForm } from './LeaveRequestForm';
import { LeaveHistory } from './LeaveHistory';
import { LeaveCalendar } from './LeaveCalendar';
import { useAuth } from '../context/AuthContext';
import * as api from '../../lib/api';
import { getToken } from '../../lib/api';
import type { LeaveRequest, LeaveBalance } from '../../types';

type ManagerView = 'dashboard' | 'employees' | 'requests' | 'my-leave' | 'calendar' | 'history' | 'team-history';

interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  employeeId: string;
}

export function ManagerDashboard() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<ManagerView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [allTeamRequests, setAllTeamRequests] = useState<LeaveRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [selectedEmployeeBalances, setSelectedEmployeeBalances] = useState<LeaveBalance[]>([]);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [cancelByMgrLoading, setCancelByMgrLoading] = useState<string | null>(null);
  const [myBalances, setMyBalances] = useState<LeaveBalance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [requestsFilter, setRequestsFilter] = useState<'pending' | 'all'>('pending');

  const fetchData = async () => {
    try {
      const [team, requests, balances] = await Promise.all([api.getTeamMembers(), api.getTeamRequests(), api.getMyBalances()]);
      setTeamMembers(team);
      setAllTeamRequests(requests);
      setPendingRequests(requests.filter(r => r.status === 'PENDING_MANAGER'));
      setMyBalances(balances);
    } catch (err) {
      console.error('Failed to load manager data:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openReviewModal = async (request: LeaveRequest) => {
    setSelectedRequest(request);
    setReviewComment('');
    setSelectedEmployeeBalances([]);
    if (request.userId) {
      try {
        const balances = await api.getTeamMemberBalance(request.userId);
        setSelectedEmployeeBalances(balances);
      } catch {
        // non-critical — balance display is informational only
      }
    }
  };

  const handleApprove = async (requestId: string) => {
    setReviewLoading(true);
    try {
      await api.reviewRequest(requestId, 'approve', reviewComment || undefined);
      toast.success('Request approved');
      setSelectedRequest(null);
      setReviewComment('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve request');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setReviewLoading(true);
    try {
      await api.reviewRequest(requestId, 'reject', reviewComment || undefined);
      toast.success('Request rejected');
      setSelectedRequest(null);
      setReviewComment('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject request');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCancelByManager = async (requestId: string) => {
    if (!window.confirm('Cancel this pending request?')) return;
    setCancelByMgrLoading(requestId);
    try {
      await api.cancelByManager(requestId);
      toast.success('Request cancelled');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel request');
    } finally {
      setCancelByMgrLoading(null);
    }
  };

  // Derive team availability from current leave requests
  const onLeaveIds = new Set(
    allTeamRequests
      .filter(r => r.status === 'TREATED' && new Date(r.startDate) <= new Date() && new Date(r.endDate) >= new Date())
      .map(r => r.userId)
  );

  const viewTitles: Record<ManagerView, string> = {
    dashboard: 'Overview', employees: 'Team Overview', requests: 'Pending Requests',
    'my-leave': 'Request Leave', calendar: 'Calendar', history: 'My Leave History', 'team-history': 'Team History',
  };

  const renderContent = () => {
    switch (currentView) {
      case 'employees':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <h1 className="text-4xl text-[#0A0A0A] mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Team Overview
            </h1>
            <p className="text-gray-600 mb-8">Monitor your team's availability and leave status</p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamMembers.map((employee, index) => {
                const isOnLeave = onLeaveIds.has(employee.id);
                const initials = employee.fullName.split(' ').map(n => n[0]).join('').slice(0, 2);
                return (
                <motion.div
                  key={employee.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:border-[#FF6B00] transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#FF6B00] text-white rounded-full flex items-center justify-center flex-shrink-0" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                      {initials}
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                        {employee.fullName}
                      </h3>
                      <p className="text-sm text-gray-600 mb-1">{employee.position}</p>
                      <p className="text-xs text-gray-500">{employee.department}</p>
                      <div className="mt-3">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
                            !isOnLeave
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                          style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${!isOnLeave ? 'bg-green-500' : 'bg-yellow-500'}`} />
                          {!isOnLeave ? 'Available' : 'On Leave'}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </div>
          </motion.div>
        );

      case 'requests': {
        const statusLabel = (s: string) => {
          const map: Record<string, string> = {
            PENDING_MANAGER: 'Awaiting Review', PENDING_ADMIN: 'Pending Admin',
            PENDING_HR_ACCEPT: 'Pending HR Confirmation', PENDING_HR: 'Pending HR',
            RESERVED: 'Reserved by HR', TREATED: 'Treated',
            REJECTED_BY_MANAGER: 'Rejected', REJECTED_BY_HR: 'Rejected by HR',
            CANCELLED: 'Cancelled', AWAITING_DOCUMENT: 'Awaiting Document',
          };
          return map[s] || s.replace(/_/g, ' ');
        };
        const statusBadge = (s: string) => {
          if (s === 'PENDING_MANAGER') return 'bg-yellow-100 text-yellow-700';
          if (s === 'TREATED') return 'bg-green-100 text-green-700';
          if (s === 'RESERVED') return 'bg-blue-100 text-blue-700';
          if (s.startsWith('REJECTED') || s === 'CANCELLED') return 'bg-red-100 text-red-700';
          return 'bg-gray-100 text-gray-600';
        };
        const displayedRequests = (requestsFilter === 'pending' ? pendingRequests : allTeamRequests)
          .filter(r => !searchQuery || r.user?.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <h1 className="text-4xl text-[#0A0A0A] mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Leave Requests
            </h1>
            <p className="text-gray-600 mb-4">Review and manage your team's leave requests</p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by employee…"
                  className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
                />
              </div>
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                {(['pending', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setRequestsFilter(f)}
                    className={`px-4 py-2 text-sm transition-all ${requestsFilter === f ? 'bg-[#FF6B00] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  >
                    {f === 'pending' ? `Pending (${pendingRequests.length})` : `All (${allTeamRequests.length})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {displayedRequests.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-300" />
                  <p className="text-gray-500">{requestsFilter === 'pending' ? 'No pending requests. All caught up!' : 'No requests found.'}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  <AnimatePresence initial={false}>
                  {displayedRequests.map((request, index) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-center justify-between p-5 hover:bg-gray-50 transition-all"
                    >
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-[#FF6B00]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-[#FF6B00]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-base" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                              {request.user?.fullName}
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge(request.status)}`} style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                              {statusLabel(request.status)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mb-1">{request.user?.employeeId}</p>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(request.startDate).toLocaleDateString()} – {new Date(request.endDate).toLocaleDateString()}
                            </span>
                            <span>·</span>
                            <span>{request.leaveType.name}</span>
                            <span>·</span>
                            <span>{request.daysCount} day{request.daysCount !== 1 ? 's' : ''}</span>
                          </div>
                          {request.reason && (
                            <p className="text-xs text-gray-500 mt-1 italic truncate max-w-md">"{request.reason}"</p>
                          )}
                          {request.documentPath && (
                            <a
                              href={`/uploads/${request.documentPath}?token=${encodeURIComponent(getToken() || '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 text-[#FF6B00] hover:underline text-xs"
                            >
                              <Download className="w-3 h-3" />
                              Document attached
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        {request.status === 'PENDING_MANAGER' ? (
                          <>
                            <motion.button
                              onClick={() => openReviewModal(request)}
                              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:border-[#FF6B00] hover:text-[#FF6B00] transition-all text-sm"
                              style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              Review
                            </motion.button>
                            <motion.button
                              onClick={() => handleCancelByManager(request.id)}
                              disabled={cancelByMgrLoading === request.id}
                              className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50 text-sm"
                              style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                              whileHover={{ scale: cancelByMgrLoading === request.id ? 1 : 1.05 }}
                              whileTap={{ scale: cancelByMgrLoading === request.id ? 1 : 0.95 }}
                            >
                              {cancelByMgrLoading === request.id ? '…' : 'Cancel'}
                            </motion.button>
                          </>
                        ) : (
                          <button
                            onClick={() => openReviewModal(request)}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm"
                            style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        );
      }


      case 'my-leave':
        return <LeaveRequestForm onBack={() => setCurrentView('dashboard')} onSubmit={() => { fetchData(); setCurrentView('dashboard'); }} />;

      case 'history':
        return <LeaveHistory onBack={() => setCurrentView('dashboard')} />;

      case 'team-history':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-4xl text-[#0A0A0A] mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Team Leave History</h1>
                <p className="text-gray-600">All leave requests from your team</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Doc'].map(h => (
                      <th key={h} className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTeamRequests.map((req) => (
                    <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50 transition-all">
                      <td className="py-3 px-4">
                        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{req.user?.fullName}</p>
                        <p className="text-xs text-gray-500">{req.user?.department}</p>
                      </td>
                      <td className="py-3 px-4 text-sm">{req.leaveType.name}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{new Date(req.startDate).toLocaleDateString()} – {new Date(req.endDate).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-sm">{req.daysCount}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          req.status === 'TREATED' ? 'bg-green-100 text-green-700' :
                          req.status === 'RESERVED' ? 'bg-blue-100 text-blue-700' :
                          req.status.startsWith('REJECTED') || req.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`} style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{req.status.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="py-3 px-4">
                        {req.documentPath && (
                          <a
                            href={`/uploads/${req.documentPath}?token=${encodeURIComponent(getToken() || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#FF6B00] hover:underline text-xs"
                            title="View document"
                          >
                            <Download className="w-4 h-4" />
                            PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allTeamRequests.length === 0 && <div className="text-center py-12 text-gray-500">No team requests found</div>}
            </div>
          </motion.div>
        );

      case 'calendar':
        return <LeaveCalendar onBack={() => setCurrentView('dashboard')} />;

      default:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-4xl text-[#0A0A0A] mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  Manager Dashboard
                </h1>
                <p className="text-gray-600">Manage your team's leave requests and availability</p>
              </div>
            </div>

            {/* Personal Info + My Balance */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-[#0A0A0A] to-[#2A2A2A] rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF6B00] opacity-10 rounded-full blur-3xl" />
                <div className="relative z-10 flex items-start gap-4">
                  <div className="w-14 h-14 bg-[#FF6B00] rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl mb-0.5" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{user?.fullName}</h2>
                    <p className="text-gray-400 text-sm">{user?.position}</p>
                    <p className="text-gray-500 text-xs mt-1">{user?.department}</p>
                    <div className="flex gap-6 mt-3">
                      <div>
                        <p className="text-xs text-gray-400">Employee ID</p>
                        <p className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{user?.employeeId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Status</p>
                        <p className="text-sm flex items-center gap-1.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />Active
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>My Leave Balance</h2>
                  <button onClick={() => setCurrentView('my-leave')} className="text-sm text-[#FF6B00] hover:underline" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>Request Leave</button>
                </div>
                <div className="space-y-4">
                  {myBalances.filter(b => b.leaveType.name.toLowerCase().includes('annual') || b.usedDays > 0).slice(0, 3).map(b => {
                    const total = b.totalDays ?? 0;
                    const remaining = total - b.usedDays;
                    const pct = total > 0 ? Math.round((b.usedDays / total) * 100) : 0;
                    return (
                      <div key={b.id ?? b.leaveTypeId}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{b.leaveType.name}</span>
                          <span className="text-xs text-gray-500">{remaining}/{total > 0 ? total : '∞'} days left</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF8C3D] rounded-full" style={{ width: `${Math.min(pct, 100)}%`, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                  {myBalances.length === 0 && <p className="text-gray-400 text-center text-sm py-4">No balance data</p>}
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-[#FF6B00] to-[#FF8C3D] rounded-2xl p-6 text-white"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6" />
                  </div>
                  <span className="text-3xl" style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    {pendingRequests.length}
                  </span>
                </div>
                <h3 className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Pending Requests
                </h3>
                <p className="text-sm text-white/80 mt-1">Awaiting your review</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-6 border border-gray-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-3xl text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    {teamMembers.filter(e => !onLeaveIds.has(e.id)).length}
                  </span>
                </div>
                <h3 className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Available
                </h3>
                <p className="text-sm text-gray-600 mt-1">Team members present</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-6 border border-gray-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-yellow-600" />
                  </div>
                  <span className="text-3xl text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    {onLeaveIds.size}
                  </span>
                </div>
                <h3 className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  On Leave
                </h3>
                <p className="text-sm text-gray-600 mt-1">Team members away</p>
              </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid md:grid-cols-3 gap-4"
            >
              <motion.button
                onClick={() => setCurrentView('requests')}
                className="bg-[#FF6B00] text-white rounded-xl p-6 flex items-center gap-4 hover:bg-[#E05F00] transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    Review Requests
                  </h3>
                  <p className="text-sm text-white/80">Approve or reject</p>
                </div>
              </motion.button>

              <motion.button
                onClick={() => setCurrentView('employees')}
                className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-4 hover:border-[#FF6B00] transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-gray-700" />
                </div>
                <div className="text-left">
                  <h3 className="text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    View Team
                  </h3>
                  <p className="text-sm text-gray-600">Team overview</p>
                </div>
              </motion.button>

              <motion.button
                onClick={() => setCurrentView('my-leave')}
                className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-4 hover:border-[#FF6B00] transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-gray-700" />
                </div>
                <div className="text-left">
                  <h3 className="text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    My Leave
                  </h3>
                  <p className="text-sm text-gray-600">Request leave</p>
                </div>
              </motion.button>
            </motion.div>

            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white rounded-2xl border border-gray-200 p-8"
            >
              <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                Recent Activity
              </h2>
              <div className="space-y-4">
                {allTeamRequests.filter(r => r.status !== 'PENDING_MANAGER').slice(0, 5).map((req) => {
                  const isApproved = req.status === 'TREATED' || req.status === 'RESERVED' || req.status === 'APPROVED_BY_MANAGER' || req.status === 'PENDING_HR';
                  return (
                    <div key={req.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className={`w-10 h-10 ${isApproved ? 'bg-green-100' : 'bg-red-100'} rounded-lg flex items-center justify-center`}>
                        {isApproved ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                          {isApproved ? 'Approved' : 'Rejected'} {req.user?.fullName}'s {req.leaveType.name}
                        </p>
                        <p className="text-xs text-gray-600">{new Date(req.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  );
                })}
                {allTeamRequests.filter(r => r.status !== 'PENDING_MANAGER').length === 0 && (
                  <p className="text-gray-500 text-center py-4">No recent activity</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar userRole="MANAGER" currentView={currentView} onNavigate={setCurrentView} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-72'}`}>
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-8 h-11 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#FF6B00] uppercase tracking-widest">Manager</span>
            <span className="text-gray-300 text-base">›</span>
            <span className="text-sm font-semibold text-gray-800">{viewTitles[currentView]}</span>
          </div>
          <NotificationBell />
        </div>
        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div key={currentView} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Request Review Modal */}
      {selectedRequest && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedRequest(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl mb-6" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              {selectedRequest.status === 'PENDING_MANAGER' ? 'Review Leave Request' : 'Request Details'}
            </h2>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Employee</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {selectedRequest.user?.fullName}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{selectedRequest.user?.employeeId}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Leave Type</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {selectedRequest.leaveType.name}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Start Date</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {new Date(selectedRequest.startDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">End Date / Duration</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {new Date(selectedRequest.endDate).toLocaleDateString()}
                    <span className="text-gray-500 font-normal text-sm ml-2">({selectedRequest.daysCount} day{selectedRequest.daysCount !== 1 ? 's' : ''})</span>
                  </p>
                </div>
              </div>

              {/* Employee leave balance for this type */}
              {(() => {
                const bal = selectedEmployeeBalances.find(b => b.leaveTypeId === selectedRequest.leaveTypeId);
                if (!bal) return null;
                const total = bal.totalDays;
                const used = bal.usedDays;
                const remaining = total != null ? total - used : null;
                const insufficient = remaining != null && remaining < selectedRequest.daysCount;
                return (
                  <div className={`rounded-lg p-4 border ${insufficient ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100'}`}>
                    <p className={`text-sm mb-2 ${insufficient ? 'text-red-700' : 'text-blue-700'}`} style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      Employee Balance — {selectedRequest.leaveType.name}
                    </p>
                    <div className="flex gap-6 text-sm">
                      <span><span className="text-gray-500">Total:</span> <strong>{total ?? '∞'}</strong></span>
                      <span><span className="text-gray-500">Used:</span> <strong>{used}</strong></span>
                      <span><span className={insufficient ? 'text-red-600' : 'text-gray-500'}>Remaining:</span> <strong className={insufficient ? 'text-red-700' : ''}>{remaining ?? '∞'}</strong></span>
                    </div>
                    {insufficient && (
                      <p className="text-xs text-red-600 mt-2">⚠ Insufficient balance — approval will be blocked by the system.</p>
                    )}
                  </div>
                );
              })()}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Reason</p>
                <p className="text-gray-800">{selectedRequest.reason || 'No reason provided'}</p>
              </div>

              {/* Attached Document */}
              {selectedRequest.documentPath && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Attached Document</p>
                  <a
                    href={`/uploads/${selectedRequest.documentPath}?token=${encodeURIComponent(getToken() || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF6B00]/10 text-[#FF6B00] rounded-lg hover:bg-[#FF6B00]/20 transition-all text-sm"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  >
                    <Download className="w-4 h-4" />
                    View / Download PDF
                  </a>
                </div>
              )}

              {selectedRequest.status === 'PENDING_MANAGER' && (
              <div>
                <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Comment (optional)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all resize-none"
                  rows={3}
                  placeholder="Add a comment..."
                />
              </div>
              )}
            </div>

            {selectedRequest.status === 'PENDING_MANAGER' ? (
            <div className="flex gap-4">
              <motion.button
                onClick={() => handleReject(selectedRequest.id)}
                disabled={reviewLoading}
                className="flex-1 py-3 bg-white border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                whileHover={{ scale: reviewLoading ? 1 : 1.02 }}
                whileTap={{ scale: reviewLoading ? 1 : 0.98 }}
              >
                <XCircle className="w-5 h-5" />
                Reject
              </motion.button>
              <motion.button
                onClick={() => handleApprove(selectedRequest.id)}
                disabled={reviewLoading}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                whileHover={{ scale: reviewLoading ? 1 : 1.02 }}
                whileTap={{ scale: reviewLoading ? 1 : 0.98 }}
              >
                {reviewLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Approve
                  </>
                )}
              </motion.button>
            </div>
            ) : (
            <div className="flex gap-4">
              <motion.button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Close
              </motion.button>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
