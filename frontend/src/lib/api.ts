import type {
  AuthResponse,
  User,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  PaginatedLeaveRequests,
  NotificationResponse,
  HRStats,
  AdminStats,
  AuditLogResponse,
  CalendarLeave,
} from '../types';

const API_BASE = '/api';

// ─── Token management ────────────────────────────────────────────────────────

let token: string | null = localStorage.getItem('token');

export function setToken(t: string | null) {
  token = t;
  if (t) {
    localStorage.setItem('token', t);
  } else {
    localStorage.removeItem('token');
  }
}

export function getToken(): string | null {
  return token;
}

// ─── Fetch wrapper ───────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Network error' }));
    if (res.status === 401) {
      // Notify AuthContext to log out — token expired or revoked
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe(): Promise<User> {
  return request<User>('/auth/me');
}

export function logout() {
  setToken(null);
  localStorage.removeItem('user');
}

// ─── Leave Types ─────────────────────────────────────────────────────────────

export async function getLeaveTypes(): Promise<LeaveType[]> {
  return request<LeaveType[]>('/leaves/types');
}

// ─── Leave Requests ──────────────────────────────────────────────────────────

export async function createLeaveRequest(formData: FormData): Promise<LeaveRequest> {
  return request<LeaveRequest>('/leaves', {
    method: 'POST',
    body: formData,
  });
}

export async function getMyRequests(status?: string): Promise<LeaveRequest[]> {
  const query = status ? `?status=${status}` : '';
  return request<LeaveRequest[]>(`/leaves/mine${query}`);
}

export async function getRequestById(id: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}`);
}

export async function getMyBalances(year?: number): Promise<LeaveBalance[]> {
  const query = year ? `?year=${year}` : '';
  return request<LeaveBalance[]>(`/leaves/balance${query}`);
}

export async function cancelRequest(id: string): Promise<void> {
  await request<void>(`/leaves/${id}`, { method: 'DELETE' });
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export async function getTeamRequests(status?: string): Promise<LeaveRequest[]> {
  const query = status ? `?status=${status}` : '';
  return request<LeaveRequest[]>(`/leaves/team${query}`);
}

export async function getTeamMemberBalance(userId: string, year?: number): Promise<LeaveBalance[]> {
  const query = year ? `?year=${year}` : '';
  return request<LeaveBalance[]>(`/leaves/team/balance/${userId}${query}`);
}

export async function reviewRequest(id: string, action: 'approve' | 'reject', comment?: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ action, comment }),
  });
}

// ─── HR ──────────────────────────────────────────────────────────────────────

export async function getAllRequests(status?: string, page = 1, limit = 500): Promise<PaginatedLeaveRequests> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('limit', String(limit));
  return request<PaginatedLeaveRequests>(`/leaves/all?${params}`);
}

export async function reserveRequest(id: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}/reserve`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}

export async function treatRequest(id: string, comment?: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}/treat`, {
    method: 'PATCH',
    body: JSON.stringify({ comment }),
  });
}

export async function batchReserveRequests(requestIds: string[]): Promise<{ results: { id: string; success: boolean; error?: string }[] }> {
  return request(`/leaves/batch-reserve`, {
    method: 'POST',
    body: JSON.stringify({ requestIds }),
  });
}

export async function getAllBalances(year?: number): Promise<LeaveBalance[]> {
  const query = year ? `?year=${year}` : '';
  return request<LeaveBalance[]>(`/leaves/all-balances${query}`);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getTeamMembers(): Promise<User[]> {
  return request<User[]>('/users/team');
}

export async function getAllUsers(): Promise<User[]> {
  return request<User[]>('/users/manage');
}

export async function getManagersList(): Promise<{ id: string; fullName: string; department: string }[]> {
  return request('/users/managers');
}

export async function createUserAccount(data: {
  email: string;
  password: string;
  fullName: string;
  role: string;
  department: string;
  position: string;
  employeeId: string;
  managerId?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
}): Promise<User> {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUserAccount(id: string, data: {
  fullName?: string;
  role?: string;
  department?: string;
  position?: string;
  managerId?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
}): Promise<User> {
  return request<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUserAccount(id: string): Promise<void> {
  await request<void>(`/users/${id}`, { method: 'DELETE' });
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function getNotifications(): Promise<NotificationResponse> {
  return request<NotificationResponse>('/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  await request<void>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request<void>('/notifications/read-all', { method: 'PATCH' });
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getHRStats(): Promise<HRStats> {
  return request<HRStats>('/leaves/stats/hr');
}

// ─── Admin ───────────────────────────────────────────────────────────────────────────────

export async function getAdminStats(from?: string, to?: string): Promise<AdminStats> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString() ? `?${params}` : '';
  return request<AdminStats>(`/leaves/stats/drh${query}`);
}

export async function getAdminUsers(): Promise<User[]> {
  return request<User[]>('/leaves/admin/users');
}

export async function getAdminAgentRequests(hrId: string): Promise<LeaveRequest[]> {
  return request<LeaveRequest[]>(`/leaves/admin/hr/${hrId}/requests`);
}

export async function reassignRequest(id: string, hrId: string, comment?: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/admin/${id}/reassign`, {
    method: 'PATCH',
    body: JSON.stringify({ hrId, comment }),
  });
}

export async function adjustBalance(userId: string, data: {
  leaveTypeId: string;
  year: number;
  deltaTotal?: number;
  deltaUsed?: number;
  reason: string;
}): Promise<LeaveBalance> {
  return request<LeaveBalance>(`/leaves/admin/balances/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getAuditLog(params?: {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  actorId?: string;
  type?: string;
}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.actorId) qs.set('actorId', params.actorId);
  if (params?.type) qs.set('type', params.type);
  const query = qs.toString() ? `?${qs}` : '';
  return request<AuditLogResponse>(`/leaves/admin/audit${query}`);
}

// ─── DRH Exports (blob download) ─────────────────────────────────────────────

async function downloadBlob(path: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRequestsCsv(params?: { from?: string; to?: string; status?: string; hrId?: string }): Promise<void> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.status) qs.set('status', params.status);
  if (params?.hrId) qs.set('hrId', params.hrId);
  const query = qs.toString() ? `?${qs}` : '';
  return downloadBlob(`/leaves/admin/export/requests.csv${query}`, 'leave-requests.csv');
}

export function exportBalancesCsv(year?: number): Promise<void> {
  const query = year ? `?year=${year}` : '';
  return downloadBlob(`/leaves/admin/export/balances.csv${query}`, `leave-balances-${year ?? new Date().getFullYear()}.csv`);
}

export function exportStatsPdf(params?: { from?: string; to?: string }): Promise<void> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const query = qs.toString() ? `?${qs}` : '';
  return downloadBlob(`/leaves/admin/export/stats.pdf${query}`, 'sonatrach-leave-stats.pdf');
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export async function getCalendarLeaves(year?: number, month?: number, department?: string): Promise<CalendarLeave[]> {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (month) params.set('month', String(month));
  if (department) params.set('department', department);
  const query = params.toString() ? `?${params}` : '';
  return request<CalendarLeave[]>(`/leaves/calendar${query}`);
}

// ─── Admin (Dispatcher) ─────────────────────────────────────────────────────────────

export interface HRAgentInfo {
  id: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  employeeId: string;
  pendingCount: number;
}

export async function getAdminPendingRequests(): Promise<LeaveRequest[]> {
  return request<LeaveRequest[]>('/leaves/admin/pending');
}

export async function getHRAgents(): Promise<HRAgentInfo[]> {
  return request<HRAgentInfo[]>('/leaves/admin/hr-agents');
}

export async function assignRequest(
  id: string,
  hrId: string,
  comment?: string
): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ hrId, comment }),
  });
}

export async function acceptAssignment(id: string): Promise<void> {
  await request<void>(`/leaves/${id}/accept-assignment`, { method: 'PATCH' });
}

export async function declineAssignment(id: string, comment?: string): Promise<void> {
  await request<void>(`/leaves/${id}/decline-assignment`, {
    method: 'PATCH',
    body: JSON.stringify({ comment }),
  });
}

// ─── RESHUM Import ────────────────────────────────────────────────────────────

export interface RESHUMImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { employeeId: string; error: string }[];
}

export async function getReshumConfig(): Promise<{ configured: boolean; url: string | null; hasApiKey: boolean }> {
  return request('/users/reshum-config');
}

export async function fetchReshumEmployees(): Promise<{ employees: unknown[]; count: number }> {
  return request<{ employees: unknown[]; count: number }>('/users/fetch-reshum', { method: 'POST' });
}

export async function importEmployees(employees: unknown[]): Promise<RESHUMImportResult> {
  return request<RESHUMImportResult>('/users/import', {
    method: 'POST',
    body: JSON.stringify(employees),
  });
}

export async function syncEmployees(employees: unknown[]): Promise<RESHUMImportResult> {
  return request<RESHUMImportResult>('/users/sync', {
    method: 'POST',
    body: JSON.stringify(employees),
  });
}

// ─── New: Edit request ────────────────────────────────────────────────────────

export async function editRequest(id: string, formData: FormData | Record<string, unknown>): Promise<LeaveRequest> {
  const body = formData instanceof FormData ? formData : JSON.stringify(formData);
  return request<LeaveRequest>(`/leaves/${id}/edit`, { method: 'PATCH', body });
}

// ─── New: Manager cancel team request ─────────────────────────────────────────

export async function cancelByManager(id: string, comment?: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}/cancel-by-manager`, {
    method: 'PATCH',
    body: JSON.stringify({ comment }),
  });
}

// ─── New: HR request document ────────────────────────────────────────────────

export async function requestDocument(id: string, comment: string): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leaves/${id}/request-document`, {
    method: 'PATCH',
    body: JSON.stringify({ comment }),
  });
}

// ─── New: Employee upload additional document ─────────────────────────────────

export async function uploadAdditionalDocument(id: string, file: File): Promise<LeaveRequest> {
  const fd = new FormData();
  fd.append('document', file);
  return request<LeaveRequest>(`/leaves/${id}/upload-document`, { method: 'PATCH', body: fd });
}

// ─── New: Admin get top-manager approvals ─────────────────────────────────────

export async function getManagerApprovals(): Promise<LeaveRequest[]> {
  return request<LeaveRequest[]>('/leaves/admin/manager-approvals');
}

// --- RESHUM Simulator (admin) -------------------------------------------------

export interface ReshumEmployee {
  employeeId: string;
  fullName: string;
  department: string;
  position: string;
  managerEmployeeId: string | null;
  balances: { annual: { total: number; used: number }; recovery: { total: number; used: number }; sick: { total: number; used: number }; maternity: { total: number; used: number } };
}

export type ReshumCategory = 'annual' | 'recovery' | 'sick' | 'maternity';

export async function reshumGetEmployee(employeeId: string): Promise<ReshumEmployee> {
  return request<ReshumEmployee>(`/admin/reshum/employees/${employeeId}`);
}

export async function reshumListEmployees(): Promise<ReshumEmployee[]> {
  return request<ReshumEmployee[]>('/admin/reshum/employees');
}

export async function reshumDeduct(p: { employeeId: string; category: ReshumCategory; days: number }): Promise<ReshumEmployee> {
  return request<ReshumEmployee>('/admin/reshum/deduct', { method: 'POST', body: JSON.stringify(p) });
}

export async function reshumCreditRecovery(p: { employeeId: string; days: number }): Promise<ReshumEmployee> {
  return request<ReshumEmployee>('/admin/reshum/credit-recovery', { method: 'POST', body: JSON.stringify(p) });
}

export async function reshumGetState(): Promise<{ employees: Record<string, ReshumEmployee>; lastUpdated: string }> {
  return request('/admin/reshum/state');
}

export async function reshumReset(): Promise<{ employees: Record<string, ReshumEmployee>; lastUpdated: string }> {
  return request('/admin/reshum/reset', { method: 'POST' });
}

