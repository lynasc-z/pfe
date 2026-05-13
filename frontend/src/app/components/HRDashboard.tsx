import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Users, FileText, Clock, BarChart3, Download, CircleUser as UserIcon, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { LeaveCalendar } from './LeaveCalendar';
import { LeaveHistory } from './LeaveHistory';
import { LeaveRequestForm } from './LeaveRequestForm';
import { useAuth } from '../context/AuthContext';
import * as api from '../../lib/api';
import { getToken } from '../../lib/api';
import type { LeaveRequest, HRStats, LeaveBalance } from '../../types';

type HRView = 'dashboard' | 'requests' | 'my-requests' | 'my-leave' | 'employees' | 'balances' | 'calendar' | 'history';

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING_MANAGER: 'Pending Manager',
    APPROVED_BY_MANAGER: 'Manager Approved',
    PENDING_ADMIN: 'Awaiting Assignment',
    PENDING_HR_ACCEPT: 'Pending Your Confirmation',
    PENDING_HR: 'Pending HR',
    RESERVED: 'Reserved',
    AWAITING_DOCUMENT: 'Document Required',
    TREATED: 'Treated',
    REJECTED_BY_MANAGER: 'Rejected by Manager',
    REJECTED_BY_HR: 'Rejected by HR',
    CANCELLED: 'Cancelled',
  };
  return map[status] || status;
}

function statusColor(status: string) {
  if (status === 'TREATED') return 'bg-green-100 text-green-700';
  if (status === 'RESERVED') return 'bg-blue-100 text-blue-700';
  if (status === 'AWAITING_DOCUMENT') return 'bg-amber-100 text-amber-700';
  if (status.startsWith('REJECTED') || status === 'CANCELLED') return 'bg-red-100 text-red-700';
  if (status === 'PENDING_ADMIN') return 'bg-purple-100 text-purple-700';
  if (status === 'PENDING_HR_ACCEPT') return 'bg-pink-100 text-pink-700';
  if (status === 'PENDING_HR') return 'bg-orange-100 text-orange-700';
  return 'bg-yellow-100 text-yellow-700';
}

export function HRDashboard() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<HRView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<HRStats | null>(null);
  const [allBalances, setAllBalances] = useState<LeaveBalance[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [filter, setFilter] = useState<string>('active');
  const [pendingConfirmation, setPendingConfirmation] = useState<LeaveRequest[]>([]);
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null);
  const [declineComment, setDeclineComment] = useState('');
  const [declineTarget, setDeclineTarget] = useState<LeaveRequest | null>(null);
  const [myBalances, setMyBalances] = useState<LeaveBalance[]>([]);
  const [docRequestTarget, setDocRequestTarget] = useState<LeaveRequest | null>(null);
  const [docRequestComment, setDocRequestComment] = useState('');
  const [docRequestLoading, setDocRequestLoading] = useState(false);

  // Batch processing state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchComment, setBatchComment] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchAction, setBatchAction] = useState<'approve' | 'reject'>('approve');
  const [hrSearch, setHrSearch] = useState('');

  const viewTitles: Record<HRView, string> = {
    dashboard: 'Overview', requests: 'All Requests', 'my-requests': 'My Cases',
    'my-leave': 'Request Leave', employees: 'Employee Balances', balances: 'Employee Balances',
    calendar: 'Calendar', history: 'Leave History',
  };

  const fetchData = async () => {
    try {
      const [reqs, hrStats, balances] = await Promise.all([
        api.getAllRequests(),
        api.getHRStats(),
        api.getAllBalances(),
      ]);
      setAllRequests(reqs.data);
      setPendingRequests(reqs.data.filter(r => r.status === 'PENDING_HR'));
      setPendingConfirmation(reqs.data.filter(r => r.status === 'PENDING_HR_ACCEPT' && r.assignedHrId === user?.id));
      setStats(hrStats);
      setAllBalances(balances);
      const myBal = await api.getMyBalances();
      setMyBalances(myBal);
    } catch (err) {
      console.error('Failed to load HR data:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleReserve = async (requestId: string) => {
    setReviewLoading(true);
    try {
      await api.reserveRequest(requestId);
      toast.success('Request reserved');
      setSelectedRequest(null);
      setReviewComment('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reserve request');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleTreat = async (requestId: string) => {
    setReviewLoading(true);
    try {
      await api.treatRequest(requestId, reviewComment || undefined);
      toast.success('Request treated successfully');
      setSelectedRequest(null);
      setReviewComment('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to treat request');
    } finally {
      setReviewLoading(false);
    }
  };

  const toggleSelectRequest = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRequests.map(r => r.id)));
    }
  };

  const handleBatchProcess = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      await api.batchReserveRequests(Array.from(selectedIds));
      toast.success(`${selectedIds.size} requests reserved`);
      setSelectedIds(new Set());
      setBatchComment('');
      setShowBatchModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Batch reserve failed');
    } finally {
      setBatchLoading(false);
    }
  };

  const activeStatuses = ['PENDING_MANAGER', 'APPROVED_BY_MANAGER', 'PENDING_ADMIN', 'PENDING_HR_ACCEPT', 'PENDING_HR', 'RESERVED', 'TREATED'];
  const filteredRequests = (filter === 'all'
    ? allRequests
    : filter === 'active'
    ? allRequests.filter(r => activeStatuses.includes(r.status))
    : allRequests.filter(r => r.status === filter)
  ).filter(r => !hrSearch || r.user?.fullName.toLowerCase().includes(hrSearch.toLowerCase()));

  const handleAcceptAssignment = async (requestId: string) => {
    setConfirmLoading(requestId);
    try {
      await api.acceptAssignment(requestId);
      toast.success('Assignment accepted');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept assignment');
    } finally {
      setConfirmLoading(null);
    }
  };

  const handleDeclineAssignment = async () => {
    if (!declineTarget) return;
    setConfirmLoading(declineTarget.id);
    try {
      await api.declineAssignment(declineTarget.id, declineComment || undefined);
      toast.success('Assignment declined');
      setDeclineTarget(null);
      setDeclineComment('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to decline assignment');
    } finally {
      setConfirmLoading(null);
    }
  };

  const handleRequestDocument = async () => {
    if (!docRequestTarget) return;
    setDocRequestLoading(true);
    try {
      await api.requestDocument(docRequestTarget.id, docRequestComment);
      toast.success('Document request sent');
      setDocRequestTarget(null);
      setDocRequestComment('');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to request document');
    } finally {
      setDocRequestLoading(false);
    }
  };

  const initials = user?.fullName.split(' ').map(n => n[0]).join('').toUpperCase() || 'HR';

  const renderDashboard = () => (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-[#0A0A0A] mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            HR Dashboard
          </h1>
          <p className="text-gray-600">Overview of all leave requests and employee balances</p>
        </div>
      </div>

      {/* Personal Info + My Balance */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-[#0A0A0A] to-[#2A2A2A] rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF6B00] opacity-10 rounded-full blur-3xl" />
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-14 h-14 bg-[#FF6B00] rounded-full flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-7 h-7 text-white" />
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
      <div className="grid grid-cols-4 gap-6">
        {[
          { label: 'Pending HR', value: pendingRequests.length, icon: Clock, color: '#FF6B00' },
          { label: 'Reserved', value: stats?.statusCounts.reserved ?? 0, icon: FileText, color: '#3B82F6' },
          { label: 'Treated', value: stats?.statusCounts.treated ?? 0, icon: CheckCircle, color: '#22C55E' },
          { label: 'Total Employees', value: stats?.totalEmployees ?? 0, icon: Users, color: '#8B5CF6' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-2xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${stat.color}15` }}>
                <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
              </div>
            </div>
            <p className="text-3xl text-[#0A0A0A] mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              {stat.value}
            </p>
            <p className="text-sm text-gray-600">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Pending Your Confirmation (PENDING_HR_ACCEPT) */}
      {pendingConfirmation.length > 0 && (
        <div className="bg-white rounded-2xl border border-pink-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-pink-100 bg-pink-50 flex items-center gap-2">
            <Clock className="w-5 h-5 text-pink-500" />
            <h2 className="font-semibold text-pink-800">Assigned to You — Pending Confirmation ({pendingConfirmation.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingConfirmation.map(req => (
              <div key={req.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{req.user?.fullName}</p>
                  <p className="text-sm text-gray-500">{req.leaveType.name} · {new Date(req.startDate).toLocaleDateString()} – {new Date(req.endDate).toLocaleDateString()} ({req.daysCount} days)</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptAssignment(req.id)}
                    disabled={confirmLoading === req.id}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {confirmLoading === req.id ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    onClick={() => { setDeclineTarget(req); setDeclineComment(''); }}
                    disabled={confirmLoading === req.id}
                    className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending HR Requests */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Waiting List ({pendingRequests.length})
          </h2>
          {pendingRequests.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === pendingRequests.length && pendingRequests.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-[#FF6B00] rounded"
                />
                Select All
              </label>
              {selectedIds.size > 0 && (
                <motion.button
                  onClick={() => { setShowBatchModal(true); setBatchComment(''); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <FileText className="w-4 h-4" />
                  Reserve ({selectedIds.size})
                </motion.button>
              )}
            </div>
          )}
        </div>

        {pendingRequests.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No requests pending</p>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
            {pendingRequests.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0, overflow: 'hidden' }}
                className={`flex items-center justify-between p-4 rounded-xl hover:bg-gray-100 transition-all ${
                  selectedIds.has(request.id) ? 'bg-orange-50 border border-[#FF6B00]/30' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(request.id)}
                    onChange={() => toggleSelectRequest(request.id)}
                    className="w-4 h-4 accent-[#FF6B00] rounded"
                  />
                  <div className="w-10 h-10 bg-[#FF6B00]/10 rounded-full flex items-center justify-center">
                    <span className="text-sm text-[#FF6B00]" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>
                      {request.user?.fullName.split(' ').map(n => n[0]).join('') || '?'}
                    </span>
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      {request.user?.fullName}
                    </p>
                    <p className="text-sm text-gray-600">
                      {request.leaveType.name} · {request.daysCount} days · {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <motion.button
                  onClick={() => { setSelectedRequest(request); setReviewComment(''); }}
                  className="px-4 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E05F00] transition-all text-sm"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Reserve
                </motion.button>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Leave Type Distribution */}
      {stats && Object.keys(stats.typeStats).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl mb-6" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Leave Type Distribution
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(stats.typeStats).map(([type, count]) => (
              <div key={type} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">{type}</p>
                <p className="text-2xl text-[#0A0A0A]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  {count}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderAllRequests = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            All Requests
          </h1>
          <p className="text-gray-600">View and manage all employee leave requests</p>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={hrSearch}
            onChange={e => setHrSearch(e.target.value)}
            placeholder="Search employee…"
            className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
          />
        </div>
        {[['active','Active'], ['all', 'All'], ['PENDING_HR_ACCEPT','Awaiting Confirmation'], ['PENDING_HR', 'Pending HR'], ['RESERVED', 'Reserved'], ['TREATED', 'Treated'], ['REJECTED_BY_MANAGER', 'Rejected'], ['CANCELLED', 'Cancelled']].map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg transition-all text-sm ${
              filter === f ? 'bg-[#FF6B00] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Reserved By', 'Actions'].map(h => (
                <th key={h} className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((req) => (
              <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50 transition-all">
                <td className="py-4 px-4">
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{req.user?.fullName}</p>
                  <p className="text-xs text-gray-500">{req.user?.department}</p>
                </td>
                <td className="py-4 px-4 text-sm">{req.leaveType.name}</td>
                <td className="py-4 px-4 text-sm text-gray-600">
                  {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                </td>
                <td className="py-4 px-4 text-sm">{req.daysCount}</td>
                <td className="py-4 px-4">
                  <span className={`px-3 py-1 rounded-full text-xs ${statusColor(req.status)}`}
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {statusLabel(req.status)}
                  </span>
                </td>
                <td className="py-4 px-4 text-xs text-gray-500">
                  {req.reservedBy ? (
                    <span className={req.reservedBy.id === user?.id ? 'text-blue-600 font-medium' : 'text-gray-500'}>
                      {req.reservedBy.id === user?.id ? 'You' : req.reservedBy.fullName}
                    </span>
                  ) : '—'}
                </td>
                <td className="py-4 px-4">
                  {req.status === 'PENDING_HR' ? (
                    <motion.button
                      onClick={() => { setSelectedRequest(req); setReviewComment(''); }}
                      className="px-3 py-1.5 bg-[#FF6B00] text-white rounded-lg text-xs"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Reserve
                    </motion.button>
                  ) : req.status === 'RESERVED' && req.reservedById === user?.id ? (
                    <motion.button
                      onClick={() => { setSelectedRequest(req); setReviewComment(''); }}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Mark Treated
                    </motion.button>
                  ) : (
                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                    >
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRequests.length === 0 && (
          <div className="text-center py-12 text-gray-500">No requests found</div>
        )}
      </div>
    </div>
  );

  const renderEmployees = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Employee Balances
          </h1>
          <p className="text-gray-600">View all employee leave balances</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {['Leave Type', 'Total Days', 'Used', 'Remaining'].map(h => (
                <th key={h} className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allBalances.map((balance) => (
              <tr key={balance.id} className="border-b border-gray-100 hover:bg-gray-50 transition-all">
                <td className="py-4 px-4" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  {balance.leaveType.name}
                </td>
                <td className="py-4 px-4 text-sm">{balance.totalDays}</td>
                <td className="py-4 px-4 text-sm">{balance.usedDays}</td>
                <td className="py-4 px-4">
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    balance.totalDays - balance.usedDays > 5 ? 'bg-green-100 text-green-700' :
                    balance.totalDays - balance.usedDays > 0 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`} style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {balance.totalDays - balance.usedDays}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {allBalances.length === 0 && (
          <div className="text-center py-12 text-gray-500">No balance data available</div>
        )}
      </div>
    </div>
  );

  const myReservedRequests = allRequests.filter(r => r.reservedById === user?.id);
  const myInProgress = myReservedRequests.filter(r => r.status === 'RESERVED');
  const myCompleted = myReservedRequests.filter(r => r.status === 'TREATED');

  const renderMyRequestsTable = (requests: typeof myReservedRequests, showTreat: boolean) => (
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50">
          {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Actions'].map(h => (
            <th key={h} className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {requests.map((req) => (
          <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50 transition-all">
            <td className="py-4 px-4">
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{req.user?.fullName}</p>
              <p className="text-xs text-gray-500">{req.user?.department}</p>
            </td>
            <td className="py-4 px-4 text-sm">{req.leaveType.name}</td>
            <td className="py-4 px-4 text-sm text-gray-600">{new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}</td>
            <td className="py-4 px-4 text-sm">{req.daysCount}</td>
            <td className="py-4 px-4">
              <span className={`px-3 py-1 rounded-full text-xs ${statusColor(req.status)}`} style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{statusLabel(req.status)}</span>
            </td>
            <td className="py-4 px-4">
              {showTreat ? (
                <div className="flex gap-2">
                  <motion.button onClick={() => { setSelectedRequest(req); setReviewComment(''); }} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Mark Treated</motion.button>
                  <motion.button
                    onClick={() => { setDocRequestTarget(req); setDocRequestComment(''); }}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Req. Doc
                  </motion.button>
                </div>
              ) : (
                <button onClick={() => setSelectedRequest(req)} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>View</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderMyRequests = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>My Requests</h1>
          <p className="text-gray-600">Requests you have reserved and are processing</p>
        </div>
      </div>

      {/* In Progress */}
      <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
          <h2 className="font-semibold text-blue-800" style={{ fontFamily: 'var(--font-display)' }}>In Progress ({myInProgress.length})</h2>
        </div>
        {myInProgress.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No requests in progress</div>
        ) : renderMyRequestsTable(myInProgress, true)}
      </div>

      {/* Completed */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full" />
          <h2 className="font-semibold text-gray-700" style={{ fontFamily: 'var(--font-display)' }}>Completed ({myCompleted.length})</h2>
        </div>
        {myCompleted.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No completed requests yet</div>
        ) : renderMyRequestsTable(myCompleted, false)}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'requests': return renderAllRequests();
      case 'my-requests': return renderMyRequests();
      case 'my-leave': return <LeaveRequestForm onBack={() => setCurrentView('dashboard')} onSubmit={() => { fetchData(); setCurrentView('history'); }} />;
      case 'employees': return renderEmployees();
      case 'balances': return renderEmployees();
      case 'history': return <LeaveHistory onBack={() => setCurrentView('dashboard')} />;
      case 'calendar': return <LeaveCalendar onBack={() => setCurrentView('dashboard')} />;
      default: return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar userRole="HR" currentView={currentView} onNavigate={setCurrentView} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-72'}`}>
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-8 h-11 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#FF6B00] uppercase tracking-widest">HR</span>
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

      {/* Review Modal */}
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
              {selectedRequest.status === 'PENDING_HR' ? 'Reserve Request' : selectedRequest.status === 'RESERVED' ? 'Mark as Treated' : 'Request Details'}
            </h2>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Employee</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{selectedRequest.user?.fullName}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedRequest.user?.department} · {selectedRequest.user?.employeeId}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Leave Type</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{selectedRequest.leaveType.name}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Start Date</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{new Date(selectedRequest.startDate).toLocaleDateString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">End Date</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{new Date(selectedRequest.endDate).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <span className={`px-3 py-1 rounded-full text-xs ${statusColor(selectedRequest.status)}`}
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  {statusLabel(selectedRequest.status)}
                </span>
              </div>

              {selectedRequest.reason && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Reason</p>
                  <p className="text-gray-800">{selectedRequest.reason}</p>
                </div>
              )}

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

              {/* Action history */}
              {selectedRequest.actions && selectedRequest.actions.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Action History</p>
                  {selectedRequest.actions.map(action => (
                    <div key={action.id} className="flex items-center gap-2 text-sm mb-1">
                      {action.action === 'APPROVE' || action.action === 'TREAT' ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : action.action === 'RESERVE' ? (
                        <FileText className="w-4 h-4 text-blue-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span>
                        {action.action === 'APPROVE' ? 'Approved' :
                         action.action === 'REJECT' ? 'Rejected' :
                         action.action === 'RESERVE' ? 'Reserved' :
                         action.action === 'TREAT' ? 'Treated' :
                         'Cancelled'} by {action.actor.fullName} ({action.actor.role})
                      </span>
                      {action.comment && <span className="text-gray-500">— "{action.comment}"</span>}
                    </div>
                  ))}
                </div>
              )}

              {selectedRequest.status === 'RESERVED' && selectedRequest.reservedById === user?.id && (
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

              {selectedRequest.reservedBy && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600 mb-1">Reserved by</p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{selectedRequest.reservedBy.fullName}</p>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              {selectedRequest.status === 'PENDING_HR' ? (
                <motion.button
                  onClick={() => handleReserve(selectedRequest.id)}
                  disabled={reviewLoading}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  whileHover={{ scale: reviewLoading ? 1 : 1.02 }}
                  whileTap={{ scale: reviewLoading ? 1 : 0.98 }}
                >
                  {reviewLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Reserve This Request
                    </>
                  )}
                </motion.button>
              ) : selectedRequest.status === 'RESERVED' && selectedRequest.reservedById === user?.id ? (
                <motion.button
                  onClick={() => handleTreat(selectedRequest.id)}
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
                      Mark as Treated
                    </>
                  )}
                </motion.button>
              ) : (
                <motion.button
                  onClick={() => setSelectedRequest(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Close
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Batch Process Modal */}
      {showBatchModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowBatchModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              {batchAction === 'approve' ? 'Approve' : 'Reject'} {selectedIds.size} Request{selectedIds.size > 1 ? 's' : ''}
            </h2>
            <p className="text-gray-600 mb-6">
              You are about to {batchAction} {selectedIds.size} selected request{selectedIds.size > 1 ? 's' : ''}. Employees will be notified.
            </p>

            <div className="mb-6">
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Comment (optional)
              </label>
              <textarea
                value={batchComment}
                onChange={(e) => setBatchComment(e.target.value)}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all resize-none"
                rows={3}
                placeholder="Add a comment for all selected requests..."
              />
            </div>

            <div className="flex gap-4">
              <motion.button
                onClick={() => setShowBatchModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={handleBatchProcess}
                disabled={batchLoading}
                className={`flex-1 py-3 text-white rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                  batchAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
                style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                whileHover={{ scale: batchLoading ? 1 : 1.02 }}
                whileTap={{ scale: batchLoading ? 1 : 0.98 }}
              >
                {batchLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {batchAction === 'approve' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    {batchAction === 'approve' ? 'Approve All' : 'Reject All'}
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Decline Assignment Modal */}
      {declineTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-1">Decline Assignment</h3>
            <p className="text-sm text-gray-500 mb-4">
              Declining <strong>{declineTarget.user?.fullName}</strong>'s {declineTarget.leaveType.name} request.
              The Admin will be notified and can reassign it.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason (optional)</label>
              <textarea
                value={declineComment}
                onChange={e => setDeclineComment(e.target.value)}
                rows={3}
                placeholder="Reason for declining this assignment…"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleDeclineAssignment}
                disabled={confirmLoading === declineTarget.id}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {confirmLoading === declineTarget.id ? 'Declining…' : 'Decline Assignment'}
              </button>
              <button
                onClick={() => setDeclineTarget(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Document Modal */}
      {docRequestTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-1">Request Additional Document</h3>
            <p className="text-sm text-gray-500 mb-4">
              Ask <strong>{docRequestTarget.user?.fullName}</strong> to upload a supporting document.
              Their request will be paused until they provide it.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">Instructions for employee *</label>
              <textarea
                value={docRequestComment}
                onChange={e => setDocRequestComment(e.target.value)}
                rows={3}
                placeholder="e.g. Please provide a medical certificate…"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRequestDocument}
                disabled={docRequestLoading || !docRequestComment.trim()}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {docRequestLoading ? 'Sending…' : 'Request Document'}
              </button>
              <button
                onClick={() => setDocRequestTarget(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
