import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Users, FileText, BarChart3, Download, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, Clock, AlertCircle, Edit3, X, ChevronLeft, ChevronRight, CircleUser as UserIcon, Search, UploadCloud,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { LeaveRequestForm } from './LeaveRequestForm';
import { LeaveHistory } from './LeaveHistory';
import { LeaveCalendar } from './LeaveCalendar';
import { ReshumSimulator } from './ReshumSimulator';
import { useAuth } from '../context/AuthContext';
import * as api from '../../lib/api';
import type { LeaveRequest, AdminStats, User, LeaveBalance, AuditLogEntry } from '../../types';
import type { HRAgentInfo } from '../../lib/api';

type DRHView = 'dashboard' | 'users' | 'hr-agents' | 'all-requests' | 'audit' | 'balances' | 'my-leave' | 'history' | 'calendar' | 'pending-assignment' | 'reshum-import' | 'reshum-simulator' | 'manager-approvals';

const COLORS = ['#E8491D', '#1D4E89', '#F4B942', '#34A853', '#9B59B6', '#16A085'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING_MANAGER: 'Pending Manager', APPROVED_BY_MANAGER: 'Manager Approved',
    PENDING_ADMIN: 'Awaiting Assignment',
    PENDING_HR_ACCEPT: 'Pending HR Confirmation',
    PENDING_HR: 'Pending HR', RESERVED: 'In Progress', TREATED: 'Treated',
    REJECTED_BY_MANAGER: 'Rejected', CANCELLED: 'Cancelled',
  };
  return map[status] || status;
}

function statusColor(status: string) {
  if (status === 'TREATED') return 'bg-green-100 text-green-700';
  if (status === 'RESERVED') return 'bg-blue-100 text-blue-700';
  if (status.startsWith('REJECTED') || status === 'CANCELLED') return 'bg-red-100 text-red-700';
  if (status === 'PENDING_ADMIN') return 'bg-purple-100 text-purple-700';
  if (status === 'PENDING_HR_ACCEPT') return 'bg-pink-100 text-pink-700';
  if (status === 'PENDING_HR') return 'bg-orange-100 text-orange-700';
  return 'bg-yellow-100 text-yellow-700';
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<DRHView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear());
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentRequests, setAgentRequests] = useState<Record<string, LeaveRequest[]>>({});

  const [reassignModal, setReassignModal] = useState<{ open: boolean; requestId: string; currentHrName: string }>({ open: false, requestId: '', currentHrName: '' });
  const [reassignHrId, setReassignHrId] = useState('');
  const [reassignComment, setReassignComment] = useState('');

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ open: boolean; balance: LeaveBalance | null }>({ open: false, balance: null });
  const [adjustDeltaTotal, setAdjustDeltaTotal] = useState(0);
  const [adjustDeltaUsed, setAdjustDeltaUsed] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [myBalances, setMyBalances] = useState<LeaveBalance[]>([]);

  // Pending Assignment (dispatcher) state
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [hrAgents, setHRAgents] = useState<HRAgentInfo[]>([]);
  const [assignTarget, setAssignTarget] = useState<LeaveRequest | null>(null);
  const [assignHrId, setAssignHrId] = useState('');
  const [assignComment, setAssignComment] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // All-requests filter state
  const [requestsStatusFilter, setRequestsStatusFilter] = useState<string>('active');
  const [adminRequestsSearch, setAdminRequestsSearch] = useState('');
  const [adminUsersSearch, setAdminUsersSearch] = useState('');
  const [managerApprovals, setManagerApprovals] = useState<LeaveRequest[]>([]);

  // RESHUM import state
  const [reshumConfig, setReshumConfig] = useState<{ configured: boolean; url: string | null; hasApiKey: boolean } | null>(null);
  const [reshumParsed, setReshumParsed] = useState<unknown[] | null>(null);
  const [reshumParseError, setReshumParseError] = useState('');
  const [reshumResult, setReshumResult] = useState<api.RESHUMImportResult | null>(null);
  const [reshumLoading, setReshumLoading] = useState(false);
  const [reshumFetching, setReshumFetching] = useState(false);
  const [reshumMode, setReshumMode] = useState<'import' | 'sync'>('import');

  const hrUsers = allUsers.filter(u => u.role === 'HR');

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.getAdminStats(from || undefined, to || undefined);
      setStats(s);
    } catch { /* ignore */ }
  }, [from, to]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, users, reqs, pending, agents, mgrApprovals] = await Promise.all([
        api.getAdminStats(from || undefined, to || undefined),
        api.getAdminUsers(),
        api.getAllRequests(),
        api.getAdminPendingRequests(),
        api.getHRAgents(),
        api.getManagerApprovals(),
      ]);
      setStats(s);
      setAllUsers(users);
      setAllRequests(reqs.data);
      setPendingRequests(pending);
      setHRAgents(agents);
      setManagerApprovals(mgrApprovals);
      const myBal = await api.getMyBalances();
      setMyBalances(myBal);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const fetchBalances = useCallback(async () => {
    try {
      const b = await api.getAllBalances(balanceYear);
      setBalances(b);
    } catch { /* ignore */ }
  }, [balanceYear]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await api.getAuditLog({ page: auditPage, limit: 20, from: from || undefined, to: to || undefined });
      setAuditLog(res.actions);
      setAuditTotal(res.total);
      setAuditPages(res.pages);
    } catch { /* ignore */ }
  }, [auditPage, from, to]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (currentView === 'balances') fetchBalances(); }, [currentView, fetchBalances]);
  useEffect(() => { if (currentView === 'audit') fetchAudit(); }, [currentView, fetchAudit]);

  const fetchAgentRequests = async (hrId: string) => {
    if (agentRequests[hrId]) return;
    try {
      const reqs = await api.getAdminAgentRequests(hrId);
      setAgentRequests(prev => ({ ...prev, [hrId]: reqs }));
    } catch { /* ignore */ }
  };

  const toggleAgent = (hrId: string) => {
    if (expandedAgent === hrId) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(hrId);
      fetchAgentRequests(hrId);
    }
  };

  const handleReassign = async () => {
    if (!reassignHrId) return;
    try {
      await api.reassignRequest(reassignModal.requestId, reassignHrId, reassignComment || undefined);
      toast.success('Request reassigned');
      setReassignModal({ open: false, requestId: '', currentHrName: '' });
      setReassignHrId('');
      setReassignComment('');
      setAgentRequests({});
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message || 'Reassign failed');
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignHrId) return;
    setAssignLoading(true);
    try {
      await api.assignRequest(assignTarget.id, assignHrId, assignComment || undefined);
      toast.success('Request assigned to HR');
      setAssignTarget(null);
      setAssignHrId('');
      setAssignComment('');
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message || 'Assign failed');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAdjustBalance = async () => {
    try {
      await api.adjustBalance(adjustModal.balance.userId, {
        leaveTypeId: adjustModal.balance.leaveTypeId,
        year: adjustModal.balance.year,
        deltaTotal: adjustDeltaTotal,
        deltaUsed: adjustDeltaUsed,
        reason: adjustReason,
      });
      toast.success('Balance adjusted');
      setAdjustModal({ open: false, balance: null });
      setAdjustDeltaTotal(0);
      setAdjustDeltaUsed(0);
      setAdjustReason('');
      fetchBalances();
    } catch (err: any) {
      toast.error(err?.message || 'Adjust balance failed');
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try { await api.exportRequestsCsv({ from: from || undefined, to: to || undefined }); toast.success('CSV exported'); }
    catch (err: any) { toast.error(err?.message || 'Export failed'); }
    finally { setExporting(false); }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try { await api.exportStatsPdf({ from: from || undefined, to: to || undefined }); toast.success('PDF exported'); }
    catch (err: any) { toast.error(err?.message || 'Export failed'); }
    finally { setExporting(false); }
  };

  const monthlyChartData = stats?.monthlyData.map(d => ({ month: MONTHS[d.month - 1], requests: d.count, days: d.days })) ?? [];
  const departmentChartData = stats ? Object.entries(stats.departmentStats).map(([name, count]) => ({ name, count })) : [];
  const typeChartData = stats ? Object.entries(stats.typeStats).map(([name, value]) => ({ name, value })) : [];
  const hrWorkloadData = stats?.hrAgentStats.map(hr => ({ name: hr.fullName.split(' ').slice(-1)[0], inProgress: hr.inProgress, treated: hr.treated })) ?? [];

  const renderDateRange = () => (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <button onClick={fetchStats} className="flex items-center gap-1.5 bg-[#E8491D] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-orange-700 transition-colors">
        <RefreshCw className="w-3.5 h-3.5" />Apply
      </button>
      {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="text-sm text-gray-500 hover:text-gray-700 underline">Clear</button>}
      <div className="flex gap-2 ml-auto">
        <button onClick={handleExportCsv} disabled={exporting} className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
          <Download className="w-3.5 h-3.5" />CSV
        </button>
        <button onClick={handleExportPdf} disabled={exporting} className="flex items-center gap-1.5 bg-[#1D4E89] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-800 transition-colors disabled:opacity-50">
          <FileText className="w-3.5 h-3.5" />PDF Report
        </button>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Personal Info + My Balance */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-[#0A0A0A] to-[#2A2A2A] rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#E8491D] opacity-10 rounded-full blur-3xl" />
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-14 h-14 bg-[#E8491D] rounded-full flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl mb-0.5 font-bold" style={{ fontFamily: 'Archivo' }}>{user?.fullName}</h2>
              <p className="text-gray-400 text-sm">{user?.position}</p>
              <p className="text-gray-500 text-xs mt-1">{user?.department}</p>
              <div className="flex gap-6 mt-3">
                <div>
                  <p className="text-xs text-gray-400">Employee ID</p>
                  <p className="text-sm font-semibold">{user?.employeeId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />Active
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900" style={{ fontFamily: 'Archivo' }}>My Leave Balance</h2>
            <button onClick={() => setCurrentView('my-leave')} className="text-sm text-[#E8491D] hover:underline font-medium">Request Leave</button>
          </div>
          <div className="space-y-4">
            {myBalances.filter(b => b.leaveType.name.toLowerCase().includes('annual') || b.usedDays > 0).slice(0, 3).map(b => {
              const total = b.totalDays ?? 0;
              const remaining = total - b.usedDays;
              const pct = total > 0 ? Math.round((b.usedDays / total) * 100) : 0;
              return (
                <div key={b.id ?? b.leaveTypeId}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-700">{b.leaveType.name}</span>
                    <span className="text-xs text-gray-500">{remaining}/{total > 0 ? total : '∞'} days left</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#E8491D] to-[#F4B942] rounded-full" style={{ width: `${Math.min(pct, 100)}%`, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              );
            })}
            {myBalances.length === 0 && <p className="text-gray-400 text-center text-sm py-4">No balance data</p>}
          </div>
        </div>
      </div>
      {renderDateRange()}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="bg-blue-50 text-blue-600" />
            <StatCard icon={FileText} label="Total Requests" value={stats.totalRequests} color="bg-orange-50 text-orange-600" />
            <StatCard icon={CheckCircle} label="Treated" value={stats.statusCounts.treated} color="bg-green-50 text-green-600" />
            <StatCard icon={Clock} label="Pending HR" value={(stats.statusCounts.pending_hr ?? 0) + (stats.statusCounts.reserved ?? 0)} color="bg-yellow-50 text-yellow-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Requests</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyChartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Line type="monotone" dataKey="requests" stroke="#E8491D" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="days" stroke="#1D4E89" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">By Department</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={departmentChartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip /><Bar dataKey="count" fill="#E8491D" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">By Leave Type</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {typeChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">HR Agent Workload</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hrWorkloadData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="inProgress" name="In Progress" fill="#F4B942" stackId="a" />
                  <Bar dataKey="treated" name="Treated" fill="#34A853" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderHRAgents = () => (
    <div className="space-y-4">
      {renderDateRange()}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><h2 className="font-semibold text-gray-900">HR Agents Performance</h2></div>
        <div className="divide-y divide-gray-50">
          {(stats?.hrAgentStats ?? []).map(hr => (
            <div key={hr.id}>
              <div className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => toggleAgent(hr.id)}>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{hr.fullName}</p>
                  <p className="text-xs text-gray-500">{hr.email}</p>
                </div>
                <div className="flex gap-4 text-sm mr-4">
                  <span className="text-blue-600">{hr.totalReserved} total</span>
                  <span className="text-yellow-600">{hr.inProgress} active</span>
                  <span className="text-green-600">{hr.treated} done</span>
                </div>
                {expandedAgent === hr.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
              {expandedAgent === hr.id && (
                <div className="bg-gray-50 px-4 pb-3">
                  {(agentRequests[hr.id] ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">No requests assigned.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-200">
                          <th className="text-left py-2">Employee</th>
                          <th className="text-left py-2">Type</th>
                          <th className="text-left py-2">Dates</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(agentRequests[hr.id] ?? []).map(req => (
                          <tr key={req.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5">{req.user?.fullName}</td>
                            <td className="py-1.5">{req.leaveType.name}</td>
                            <td className="py-1.5 text-gray-500 text-xs">{new Date(req.startDate).toLocaleDateString()} → {new Date(req.endDate).toLocaleDateString()}</td>
                            <td className="py-1.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(req.status)}`}>{statusLabel(req.status)}</span>
                            </td>
                            <td className="py-1.5">
                              {(req.status === 'RESERVED' || req.status === 'PENDING_HR') && (
                                <button onClick={() => setReassignModal({ open: true, requestId: req.id, currentHrName: hr.fullName })} className="text-xs text-blue-600 hover:underline">Reassign</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPendingAssignment = () => (
    <div className="space-y-4">
      {pendingRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No requests awaiting assignment</p>
          <p className="text-gray-400 text-sm mt-1">All approved requests have been assigned to HR agents</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Awaiting Assignment ({pendingRequests.length})</h2>
            <span className="text-xs text-gray-400">Click "Assign" to route to an HR agent</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Employee</th>
                  <th className="text-left px-4 py-2">Dept</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Dates</th>
                  <th className="text-left px-4 py-2">Days</th>
                  <th className="text-left px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendingRequests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{req.user?.fullName}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{req.user?.department}</td>
                    <td className="px-4 py-2">{req.leaveType.name}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{new Date(req.startDate).toLocaleDateString()} → {new Date(req.endDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{req.daysCount}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => { setAssignTarget(req); setAssignHrId(''); setAssignComment(''); }}
                        className="px-3 py-1 bg-[#E8491D] text-white text-xs rounded-lg hover:bg-orange-700 transition-colors">
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderAllRequests = () => {
    const activeStatuses = ['PENDING_MANAGER', 'APPROVED_BY_MANAGER', 'PENDING_ADMIN', 'PENDING_HR_ACCEPT', 'PENDING_HR', 'RESERVED', 'TREATED'];
    const filtered = (requestsStatusFilter === 'all'
      ? allRequests
      : requestsStatusFilter === 'active'
      ? allRequests.filter(r => activeStatuses.includes(r.status))
      : allRequests.filter(r => r.status === requestsStatusFilter)
    ).filter(r => !adminRequestsSearch || r.user?.fullName.toLowerCase().includes(adminRequestsSearch.toLowerCase()) || r.user?.department?.toLowerCase().includes(adminRequestsSearch.toLowerCase()));

    return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">All Leave Requests ({filtered.length})</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={adminRequestsSearch}
              onChange={e => setAdminRequestsSearch(e.target.value)}
              placeholder="Search employee…"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E8491D]/30"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap text-sm">
          {[['active','Active'], ['all','All'], ['PENDING_ADMIN','Awaiting Assignment'], ['PENDING_HR','Pending HR'], ['TREATED','Treated'], ['REJECTED_BY_MANAGER','Rejected']].map(([val, label]) => (
            <button key={val} onClick={() => setRequestsStatusFilter(val)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${requestsStatusFilter === val ? 'bg-[#E8491D] text-white border-[#E8491D]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Employee</th>
              <th className="text-left px-4 py-2">Dept</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Dates</th>
              <th className="text-left px-4 py-2">Days</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Handled By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(req => (
              <tr key={req.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{req.user?.fullName}</td>
                <td className="px-4 py-2 text-gray-500">{req.user?.department}</td>
                <td className="px-4 py-2">{req.leaveType.name}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{new Date(req.startDate).toLocaleDateString()} → {new Date(req.endDate).toLocaleDateString()}</td>
                <td className="px-4 py-2">{req.daysCount}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(req.status)}`}>{statusLabel(req.status)}</span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{req.reservedBy?.fullName ?? '→'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );};


  const renderUsers = () => {
    const filteredUsers = adminUsersSearch
      ? allUsers.filter(u =>
          u.fullName.toLowerCase().includes(adminUsersSearch.toLowerCase()) ||
          u.department?.toLowerCase().includes(adminUsersSearch.toLowerCase()) ||
          u.employeeId?.toLowerCase().includes(adminUsersSearch.toLowerCase()))
      : allUsers;
    return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">All Users ({filteredUsers.length})</h2>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={adminUsersSearch}
            onChange={e => setAdminUsersSearch(e.target.value)}
            placeholder="Search name, dept, ID…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#E8491D]/30"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Employee ID</th>
              <th className="text-left px-4 py-2">Department</th>
              <th className="text-left px-4 py-2">Position</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Manager</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredUsers.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{u.fullName}</td>
                <td className="px-4 py-2 text-gray-500">{u.employeeId}</td>
                <td className="px-4 py-2">{u.department}</td>
                <td className="px-4 py-2">{u.position}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'HR' ? 'bg-purple-100 text-purple-700' : u.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' : u.role === 'ADMIN' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">{u.manager?.fullName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    );
  };

  const renderReshumImport = () => {
    // Load config when first rendered
    if (reshumConfig === null) {
      api.getReshumConfig().then(setReshumConfig).catch(() => setReshumConfig({ configured: false, url: null, hasApiKey: false }));
    }

    const handleFetch = async () => {
      setReshumFetching(true);
      setReshumParseError('');
      setReshumParsed(null);
      setReshumResult(null);
      try {
        const { employees } = await api.fetchReshumEmployees();
        setReshumParsed(employees);
      } catch (e: any) {
        setReshumParseError(e.message);
      } finally {
        setReshumFetching(false);
      }
    };

    const handleRun = async () => {
      if (!reshumParsed) return;
      setReshumLoading(true);
      setReshumResult(null);
      try {
        const result = reshumMode === 'import'
          ? await api.importEmployees(reshumParsed)
          : await api.syncEmployees(reshumParsed);
        setReshumResult(result);
        fetchAll();
      } catch (e: any) {
        setReshumParseError(e.message);
      } finally {
        setReshumLoading(false);
      }
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-[#E8491D]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">RESHUM Employee Import</h2>
              <p className="text-xs text-gray-500">Pull employees from the configured RESHUM API and import them into the system</p>
            </div>
          </div>
        </div>

        {/* Connection status */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">RESHUM API endpoint</span>
            {reshumConfig === null ? (
              <span className="text-xs text-gray-400">Loading…</span>
            ) : reshumConfig.configured ? (
              <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 px-2.5 py-1 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                Not configured
              </span>
            )}
          </div>

          {reshumConfig?.configured && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 font-mono text-xs text-gray-600 break-all">
              {reshumConfig.url}
              {reshumConfig.hasApiKey && (
                <span className="ml-3 text-gray-400 font-sans">(API key configured)</span>
              )}
            </div>
          )}

          {!reshumConfig?.configured && reshumConfig !== null && (
            <p className="text-xs text-gray-500">
              Set <span className="font-mono bg-gray-100 px-1 rounded">RESHUM_API_URL</span> (and optionally <span className="font-mono bg-gray-100 px-1 rounded">RESHUM_API_KEY</span>) in the backend <span className="font-mono bg-gray-100 px-1 rounded">.env</span> file to enable this feature.
            </p>
          )}

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Mode:</span>
            {(['import', 'sync'] as const).map(m => (
              <button key={m} onClick={() => setReshumMode(m)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${reshumMode === m ? 'bg-[#E8491D] text-white border-[#E8491D]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {m === 'import' ? 'Import (create new)' : 'Sync (create + update existing)'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleFetch} disabled={!reshumConfig?.configured || reshumFetching}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center gap-2">
              {reshumFetching && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {reshumFetching ? 'Fetching…' : 'Fetch from RESHUM'}
            </button>
            {reshumParsed && (
              <button onClick={handleRun} disabled={reshumLoading}
                className="px-4 py-2 bg-[#E8491D] text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {reshumLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {reshumLoading ? 'Running…' : `Run ${reshumMode === 'import' ? 'Import' : 'Sync'} (${reshumParsed.length} employees)`}
              </button>
            )}
          </div>

          {reshumParseError && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{reshumParseError}
            </div>
          )}
          {reshumParsed && !reshumResult && (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Fetched {reshumParsed.length} employee record{reshumParsed.length !== 1 ? 's' : ''} — ready to {reshumMode}
            </div>
          )}
        </div>

        {/* Results */}
        {reshumResult && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Import Result</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Created', value: reshumResult.created, color: 'bg-green-50 text-green-700' },
                { label: 'Updated', value: reshumResult.updated, color: 'bg-blue-50 text-blue-700' },
                { label: 'Skipped', value: reshumResult.skipped, color: 'bg-gray-50 text-gray-700' },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-4 text-center ${s.color}`}>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {reshumResult.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-red-700">Errors ({reshumResult.errors.length})</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {reshumResult.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 bg-red-50 px-3 py-2 rounded text-xs text-red-700">
                      <span className="font-mono font-bold shrink-0">{e.employeeId}</span>
                      <span>{e.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAudit = () => (
    <div className="space-y-4">
      {renderDateRange()}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Audit Log</h2>
          <span className="text-xs text-gray-500">{auditTotal} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Actor</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Employee</th>
                <th className="text-left px-4 py-2">Leave Type</th>
                <th className="text-left px-4 py-2">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {auditLog.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{entry.actor.fullName}</div>
                    <div className="text-xs text-gray-500">{entry.actor.role}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${entry.action === 'TREAT' ? 'bg-green-100 text-green-700' : entry.action === 'APPROVE' ? 'bg-blue-100 text-blue-700' : entry.action === 'REJECT' || entry.action === 'CANCEL' ? 'bg-red-100 text-red-700' : entry.action === 'REASSIGN' ? 'bg-purple-100 text-purple-700' : entry.action === 'ADJUST_BALANCE' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-2">{entry.request?.user?.fullName ?? '→'}</td>
                  <td className="px-4 py-2 text-gray-500">{entry.request?.leaveType?.name ?? '→'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{entry.comment ?? '→'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {auditPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">Page {auditPage} of {auditPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1} className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setAuditPage(p => Math.min(auditPages, p + 1))} disabled={auditPage === auditPages} className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBalances = () => {
    // Group balances by user
    const byUser = balances.reduce<Record<string, { user: any; balances: LeaveBalance[] }>>((acc, b) => {
      const uid = (b as any).user?.id ?? b.userId;
      if (!acc[uid]) acc[uid] = { user: (b as any).user, balances: [] };
      acc[uid].balances.push(b);
      return acc;
    }, {});
    const userGroups = Object.entries(byUser);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Year</label>
            <input type="number" value={balanceYear} onChange={e => setBalanceYear(parseInt(e.target.value, 10))} min="2020" max="2100" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-24" />
          </div>
          <button onClick={fetchBalances} className="flex items-center gap-1.5 bg-[#E8491D] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-orange-700 transition-colors"><RefreshCw className="w-3.5 h-3.5" />Load</button>
          <button onClick={() => api.exportBalancesCsv(balanceYear)} className="flex items-center gap-1.5 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 ml-auto"><Download className="w-3.5 h-3.5" />Export CSV</button>
        </div>

        <p className="text-sm text-gray-500">Leave Balances → {balanceYear} &middot; {userGroups.length} employee{userGroups.length !== 1 ? 's' : ''}</p>

        <div className="space-y-3">
          {userGroups.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">No balance data for {balanceYear}</div>
          )}
          {userGroups.map(([uid, group]) => {
            const isOpen = expandedUserId === uid;
            const initials = (group.user?.fullName ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
            const totalLeaveTypes = group.balances.length;
            const annualBalance = group.balances.find(b => b.leaveType?.name?.toLowerCase().includes('annual'));
            return (
              <div key={uid} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* User card header → click to expand */}
                <button
                  onClick={() => setExpandedUserId(isOpen ? null : uid)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-[#E8491D] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{group.user?.fullName ?? '→'}</p>
                    <p className="text-xs text-gray-500">{group.user?.department ?? '→'} &middot; {group.user?.employeeId ?? ''}</p>
                  </div>
                  {annualBalance && (
                    <div className="text-right mr-4">
                      <p className="text-xs text-gray-400">Annual Leave</p>
                      <p className="text-sm font-semibold text-gray-700">{annualBalance.totalDays - annualBalance.usedDays}<span className="text-gray-400 font-normal">/{annualBalance.totalDays} days</span></p>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mr-2">{totalLeaveTypes} type{totalLeaveTypes !== 1 ? 's' : ''}</div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {/* Expanded leave balance details */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="text-left px-5 py-2">Leave Type</th>
                          <th className="text-left px-4 py-2">Total</th>
                          <th className="text-left px-4 py-2">Used</th>
                          <th className="text-left px-4 py-2">Remaining</th>
                          <th className="text-left px-4 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.balances.map(b => {
                          const remaining = b.totalDays - b.usedDays;
                          const pct = b.totalDays > 0 ? Math.round((b.usedDays / b.totalDays) * 100) : 0;
                          return (
                            <tr key={b.id} className="hover:bg-gray-50">
                              <td className="px-5 py-2.5">
                                <div>
                                  <p className="font-medium text-gray-800">{b.leaveType?.name ?? '→'}</p>
                                  <div className="mt-1 h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-[#E8491D] to-[#F4B942] rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-gray-600">{b.totalDays}</td>
                              <td className="px-4 py-2.5 text-gray-600">{b.usedDays}</td>
                              <td className="px-4 py-2.5">
                                <span className={`font-semibold ${remaining < 5 ? 'text-red-600' : 'text-green-600'}`}>{remaining}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <button onClick={() => { setAdjustModal({ open: true, balance: b }); setAdjustDeltaTotal(0); setAdjustDeltaUsed(0); setAdjustReason(''); }} className="text-xs flex items-center gap-1 text-blue-600 hover:underline"><Edit3 className="w-3 h-3" />Adjust</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const navItems: { id: DRHView; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'pending-assignment', label: 'Assign to HR', icon: Clock },
    { id: 'manager-approvals', label: 'Manager Approvals', icon: CheckCircle },
    { id: 'hr-agents', label: 'HR Agents', icon: Users },
    { id: 'all-requests', label: 'All Requests', icon: FileText },
    { id: 'balances', label: 'Balances', icon: CheckCircle },
    { id: 'audit', label: 'Audit Log', icon: AlertCircle },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'reshum-import', label: 'RESHUM Import', icon: UserIcon },
  ];
  const renderManagerApprovals = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Manager Approvals</h1>
          <p className="text-gray-600 text-sm">Requests from top-managers (no reporting manager) pending your review</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {managerApprovals.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No top-manager requests pending approval.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {['Employee', 'Type', 'Dates', 'Days', 'Submitted', 'Actions'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {managerApprovals.map(req => (
                <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50 transition-all">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-gray-900">{req.user?.fullName}</p>
                    <p className="text-xs text-gray-500">{req.user?.department} · {req.user?.employeeId}</p>
                  </td>
                  <td className="py-3 px-4 text-sm">{req.leaveType.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {new Date(req.startDate).toLocaleDateString()} – {new Date(req.endDate).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-sm">{req.daysCount}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!confirm(`Approve ${req.user?.fullName}'s ${req.leaveType.name} request?`)) return;
                          try {
                            await api.reviewRequest(req.id, 'approve');
                            toast.success('Request approved');
                            setManagerApprovals(prev => prev.filter(r => r.id !== req.id));
                          } catch (err: any) { toast.error(err?.message || 'Approve failed'); }
                        }}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={async () => {
                          const comment = window.prompt('Rejection reason (optional):') ?? undefined;
                          try {
                            await api.reviewRequest(req.id, 'reject', comment);
                            toast.success('Request rejected');
                            setManagerApprovals(prev => prev.filter(r => r.id !== req.id));
                          } catch (err: any) { toast.error(err?.message || 'Reject failed'); }
                        }}
                        className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Sidebar userRole="ADMIN" collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} currentView={currentView} onNavigate={(v) => setCurrentView(v as DRHView)} />
      <main className={`transition-all duration-300 overflow-auto ${sidebarCollapsed ? 'ml-[72px]' : 'ml-72'}`}>
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-6 h-11 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#E8491D] uppercase tracking-widest">Admin</span>
            <span className="text-gray-300 text-base">›</span>
            <span className="text-sm font-semibold text-gray-800">{navItems.find(n => n.id === currentView)?.label ?? 'Portal'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:block">{user?.fullName}</span>
            <NotificationBell />
          </div>
        </div>
        <div className="max-w-7xl mx-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
              <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-[#E8491D] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={currentView} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {currentView === 'dashboard' && renderDashboard()}
              {currentView === 'pending-assignment' && renderPendingAssignment()}
              {currentView === 'hr-agents' && renderHRAgents()}
              {currentView === 'all-requests' && renderAllRequests()}
              {currentView === 'users' && renderUsers()}
              {currentView === 'audit' && renderAudit()}
              {currentView === 'balances' && renderBalances()}
              {currentView === 'my-leave' && <LeaveRequestForm onBack={() => setCurrentView('dashboard')} onSubmit={() => { fetchAll(); setCurrentView('history'); }} />}
              {currentView === 'history' && <LeaveHistory onBack={() => setCurrentView('dashboard')} />}
              {currentView === 'calendar' && <LeaveCalendar userRole="ADMIN" onBack={() => setCurrentView('dashboard')} />}
              {currentView === 'reshum-import' && renderReshumImport()}
              {currentView === 'reshum-simulator' && <ReshumSimulator />}
              {currentView === 'manager-approvals' && renderManagerApprovals()}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

      </main>

      {reassignModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-1">Reassign Request</h3>
            <p className="text-sm text-gray-500 mb-4">Currently: <strong>{reassignModal.currentHrName}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Assign to HR Agent</label>
                <select value={reassignHrId} onChange={e => setReassignHrId(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select agent→</option>
                  {hrUsers.map(h => <option key={h.id} value={h.id}>{h.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Comment (optional)</label>
                <textarea value={reassignComment} onChange={e => setReassignComment(e.target.value)} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleReassign} disabled={!reassignHrId} className="flex-1 bg-[#E8491D] text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">Reassign</button>
              <button onClick={() => setReassignModal({ open: false, requestId: '', currentHrName: '' })} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {adjustModal.open && adjustModal.balance && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-1">Adjust Balance</h3>
            <p className="text-sm text-gray-500 mb-4">{(adjustModal.balance as any).user?.fullName} → {adjustModal.balance.leaveType?.name} ({adjustModal.balance.year})</p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm grid grid-cols-3 gap-2 text-center">
              <div><div className="text-xs text-gray-500">Total</div><div className="font-bold">{adjustModal.balance.totalDays}</div></div>
              <div><div className="text-xs text-gray-500">Used</div><div className="font-bold">{adjustModal.balance.usedDays}</div></div>
              <div><div className="text-xs text-gray-500">Remaining</div><div className="font-bold">{adjustModal.balance.totalDays - adjustModal.balance.usedDays}</div></div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">? Total Days</label>
                  <input type="number" value={adjustDeltaTotal} onChange={e => setAdjustDeltaTotal(parseInt(e.target.value, 10) || 0)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">? Used Days</label>
                  <input type="number" value={adjustDeltaUsed} onChange={e => setAdjustDeltaUsed(parseInt(e.target.value, 10) || 0)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
                <textarea value={adjustReason} onChange={e => setAdjustReason(e.target.value)} rows={2} placeholder="Reason for adjustment→" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAdjustBalance} disabled={!adjustReason.trim()} className="flex-1 bg-[#E8491D] text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">Apply Adjustment</button>
              <button onClick={() => setAdjustModal({ open: false, balance: null })} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to HR Modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-1">Assign to HR Agent</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{assignTarget.user?.fullName}</strong> — {assignTarget.leaveType.name}
              <br /><span className="text-xs">{new Date(assignTarget.startDate).toLocaleDateString()} → {new Date(assignTarget.endDate).toLocaleDateString()} ({assignTarget.daysCount} days)</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">HR Agent <span className="text-red-500">*</span></label>
                <select value={assignHrId} onChange={e => setAssignHrId(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select HR agent→</option>
                  {hrAgents.filter(h => h.id !== assignTarget?.userId).map(h => (
                    <option key={h.id} value={h.id}>{h.fullName} ({h.pendingCount} active)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Comment (optional)</label>
                <textarea value={assignComment} onChange={e => setAssignComment(e.target.value)} rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAssign} disabled={!assignHrId || assignLoading} className="flex-1 bg-[#E8491D] text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {assignLoading ? 'Assigning→' : 'Assign'}
              </button>
              <button onClick={() => setAssignTarget(null)} className="flex-1 border border-gray-200 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
