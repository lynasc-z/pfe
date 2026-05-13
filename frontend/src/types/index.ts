// ─── User & Auth ─────────────────────────────────────────────────────────────

export type UserRole = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';
export type Gender = 'MALE' | 'FEMALE';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
  position: string;
  employeeId: string;
  managerId?: string | null;
  gender?: Gender | null;
  createdAt?: string;
  deletedAt?: string | null;
  manager?: { id: string; fullName: string } | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ─── Leave Types ─────────────────────────────────────────────────────────────

export type QuotaScope = 'ANNUAL' | 'PER_OCCURRENCE' | 'ONCE_PER_CAREER' | 'UNLIMITED';
export type DurationUnit = 'BUSINESS_DAYS' | 'CALENDAR_DAYS';

export interface LeaveType {
  id: string;
  name: string;
  maxDays: number | null;
  requiresDocument: boolean;
  quotaScope: QuotaScope;
  fixedDuration: number | null;
  durationUnit: DurationUnit;
  genderRestriction: Gender | null;
  cooldownDays: number | null;
}

// ─── Leave Balance ───────────────────────────────────────────────────────────

export interface LeaveBalance {
  id: string | null;
  userId: string;
  leaveTypeId: string;
  year: number;
  totalDays: number | null;
  usedDays: number;
  leaveType: LeaveType;
}

// ─── Leave Request ───────────────────────────────────────────────────────────

export type LeaveStatus =
  | 'PENDING_MANAGER'
  | 'APPROVED_BY_MANAGER'
  | 'PENDING_ADMIN'
  | 'PENDING_HR_ACCEPT'
  | 'PENDING_HR'
  | 'RESERVED'
  | 'AWAITING_DOCUMENT'
  | 'TREATED'
  | 'REJECTED_BY_MANAGER'
  | 'REJECTED_BY_HR'
  | 'CANCELLED';

export interface RequestAction {
  id: string;
  requestId: string;
  actorId: string;
  action: 'APPROVE' | 'REJECT' | 'RESERVE' | 'TREAT' | 'CANCEL' | 'REASSIGN' | 'ADJUST_BALANCE' | 'ASSIGN' | 'EDIT' | 'REQUEST_DOCUMENT';
  comment: string | null;
  createdAt: string;
  actor: {
    fullName: string;
    role: UserRole;
  };
}

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string | null;
  recoveryDate: string | null;
  documentPath: string | null;
  status: LeaveStatus;
  reservedById: string | null;
  assignedHrId: string | null;
  assignedHr?: { id: string; fullName: string } | null;
  missionType: string | null;
  transport: string | null;
  itinerary: string | null;
  destination: string | null;
  weddingDate: string | null;
  childBirthDate: string | null;
  childName: string | null;
  relationship: string | null;
  createdAt: string;
  updatedAt: string;
  leaveType: LeaveType;
  user?: {
    id: string;
    fullName: string;
    department: string;
    position: string;
    employeeId: string;
  };
  actions?: RequestAction[];
  reservedBy?: { id: string; fullName: string } | null;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  requestId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  request?: {
    id: string;
    status: LeaveStatus;
    startDate: string;
    endDate: string;
  };
}

export interface NotificationResponse {
  notifications: Notification[];
  unreadCount: number;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface BalanceAdjustment {
  id: string;
  userId: string;
  adjustedBy: string;
  year: number;
  deltaTotal: number;
  deltaUsed: number;
  reason: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  requestId: string;
  actorId: string;
  action: 'APPROVE' | 'REJECT' | 'RESERVE' | 'TREAT' | 'CANCEL' | 'REASSIGN' | 'ADJUST_BALANCE';
  comment: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; role: UserRole };
  request: {
    id: string;
    status: LeaveStatus;
    startDate: string;
    endDate: string;
    user: { fullName: string; employeeId: string };
    leaveType: { name: string };
  };
}

export interface AuditLogResponse {
  actions: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface HRStats {
  totalEmployees: number;
  statusCounts: { pending_manager: number; pending_hr: number; reserved: number; treated: number; rejected: number; cancelled?: number };
  totalRequests: number;
  departmentStats: Record<string, number>;
  typeStats: Record<string, number>;
  monthlyData: { month: number; count: number; days: number }[];
}

export interface AdminStats extends HRStats {
  hrAgentStats: {
    id: string;
    fullName: string;
    email: string;
    totalReserved: number;
    treated: number;
    inProgress: number;
  }[];
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export interface PaginatedLeaveRequests {
  data: LeaveRequest[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface CalendarLeave {
  id: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: LeaveStatus;
  recoveryDate: string | null;
  leaveType: { name: string };
  user: { fullName: string; department: string };
}
