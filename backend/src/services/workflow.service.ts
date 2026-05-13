import { prisma } from '../config/db.js';
import { sendLeaveNotificationEmail } from './email.service.js';
import { reshum } from './reshum.service.js';
import { syncAnnualBalanceFromReshum } from './reshum-sync.service.js';

type LeaveStatus =
  | 'PENDING_MANAGER'
  | 'APPROVED_BY_MANAGER'
  | 'PENDING_ADMIN'
  | 'PENDING_HR_ACCEPT'
  | 'PENDING_HR'
  | 'RESERVED'
  | 'AWAITING_DOCUMENT'
  | 'TREATED'
  | 'REJECTED_BY_MANAGER'
  | 'CANCELLED';

const PENDING_STATUSES: LeaveStatus[] = [
  'PENDING_MANAGER',
  'PENDING_ADMIN',
  'PENDING_HR_ACCEPT',
  'PENDING_HR',
  'RESERVED',
  'AWAITING_DOCUMENT',
];

/**
 * Validates that a leave request's dates don't overlap with existing approved/pending requests.
 */
export async function checkDateOverlap(
  userId: string,
  startDate: Date,
  endDate: Date,
  excludeRequestId?: string
): Promise<boolean> {
  const where: any = {
    userId,
    status: { notIn: ['REJECTED_BY_MANAGER', 'CANCELLED'] as LeaveStatus[] },
    OR: [
      { startDate: { lte: endDate }, endDate: { gte: startDate } },
    ],
  };
  if (excludeRequestId) {
    where.id = { not: excludeRequestId };
  }

  const overlapping = await prisma.leaveRequest.findFirst({ where });
  return !!overlapping;
}

/**
 * Checks if user has enough leave days remaining, accounting for pending requests.
 * Returns null remaining when balance tracking does not apply (non-ANNUAL types).
 * For ANNUAL types, lazily syncs the balance row from RESHUM if missing.
 */
export async function checkLeaveBalance(
  userId: string,
  leaveTypeId: string,
  daysRequested: number,
  excludeRequestId?: string
): Promise<{ sufficient: boolean; remaining: number | null }> {
  const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!leaveType) return { sufficient: true, remaining: null };

  // Only ANNUAL leave is balance-tracked. Other quotaScopes use
  // PER_OCCURRENCE / ONCE_PER_CAREER / UNLIMITED rules enforced elsewhere.
  if (leaveType.quotaScope !== 'ANNUAL') {
    return { sufficient: true, remaining: null };
  }

  const year = new Date().getFullYear();

  // Lazy-sync from RESHUM the first time we touch this year's balance.
  let balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
  });
  if (!balance) {
    const synced = await syncAnnualBalanceFromReshum(userId, year);
    if (synced) {
      balance = await prisma.leaveBalance.findUnique({
        where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      });
    }
  }

  const total = balance?.totalDays ?? leaveType.maxDays ?? 0;
  const used = balance?.usedDays ?? 0;

  // Sum days currently held by pending/reserved requests for this user/type/year
  const pendingAgg = await prisma.leaveRequest.aggregate({
    where: {
      userId,
      leaveTypeId,
      status: { in: PENDING_STATUSES },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      startDate: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    _sum: { daysCount: true },
  });
  const pending = pendingAgg._sum.daysCount ?? 0;

  const remaining = total - used - pending;
  return { sufficient: remaining >= daysRequested, remaining };
}

/**
 * Creates a notification for a user.
 */
export async function createNotification(
  userId: string,
  requestId: string,
  message: string
) {
  return prisma.notification.create({
    data: { userId, requestId, message },
  });
}

/**
 * After manager approves, write PENDING_ADMIN in one go (no intermediate APPROVED_BY_MANAGER)
 * and notify all Admin users.
 */
export async function handleManagerApproval(requestId: string, request: any) {
  // Update status to PENDING_ADMIN
  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'PENDING_ADMIN' },
  });

  // Notify all Admin users
  const adminUsers = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null } });
  const employee = await prisma.user.findUnique({ where: { id: request.userId } });
  const employeeName = employee?.fullName || 'An employee';

  for (const admin of adminUsers) {
    await createNotification(
      admin.id,
      requestId,
      `${employeeName}'s leave request is approved and awaiting HR assignment`
    );
    void sendLeaveNotificationEmail(
      admin.email,
      admin.fullName,
      `Leave Request Awaiting HR Assignment — ${employeeName}`,
      `${employeeName}'s leave request has been approved by their manager. Please log in to LeaveRec to assign it to an HR agent.`
    );
  }
}

/**
 * Admin assigns a request to a specific HR agent → PENDING_HR_ACCEPT (HR must confirm).
 */
export async function handleDRHAssign(
  requestId: string,
  hrUserId: string,
  _adminUserId: string
) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request) return;

  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'PENDING_HR_ACCEPT', assignedHrId: hrUserId },
  });

  const hrAgent = await prisma.user.findUnique({ where: { id: hrUserId } });

  // Notify HR agent to confirm
  if (hrAgent) {
    await createNotification(
      hrUserId,
      requestId,
      `${request.user.fullName}'s leave request has been assigned to you — please confirm or decline`
    );
    void sendLeaveNotificationEmail(
      hrAgent.email,
      hrAgent.fullName,
      `Leave Request Assigned to You — Confirmation Required — ${request.user.fullName}`,
      `${request.user.fullName}'s leave request has been assigned to you by Admin. Please log in to LeaveRec to confirm or decline the assignment.`
    );
  }

  // Notify employee
  await createNotification(
    request.userId,
    requestId,
    'Your leave request has been forwarded to HR for processing'
  );
}

/**
 * HR agent accepts their assigned request → PENDING_HR.
 */
export async function handleHRAcceptAssignment(requestId: string, _hrUserId: string) {
  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'PENDING_HR' },
  });
}

/**
 * HR agent declines their assignment → back to shared PENDING_HR pool, notify admins.
 */
export async function handleHRDeclineAssignment(requestId: string, hrUserId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });
  if (!request) return;

  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'PENDING_HR', assignedHrId: null },
  });

  const hrAgent = await prisma.user.findUnique({ where: { id: hrUserId } });
  const adminUsers = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null } });

  for (const admin of adminUsers) {
    await createNotification(
      admin.id,
      requestId,
      `${hrAgent?.fullName ?? 'HR Agent'} declined assignment for ${request.user.fullName}'s leave request — it is now back in the shared HR pool`
    );
  }
}

/**
 * After HR treats a request, deduct leave balance and trigger RESHUM write-back.
 */
export async function handleHRTreat(requestId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true },
  });

  if (!request) return;

  // Deduct local balance only for ANNUAL-scoped leave types.
  if (request.leaveType.quotaScope === 'ANNUAL') {
    const year = request.startDate.getFullYear();
    await prisma.leaveBalance.upsert({
      where: {
        userId_leaveTypeId_year: {
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      },
      create: {
        userId: request.userId,
        leaveTypeId: request.leaveTypeId,
        year,
        totalDays: request.leaveType.maxDays ?? request.daysCount,
        usedDays: request.daysCount,
      },
      update: { usedDays: { increment: request.daysCount } },
    });
  }

  // RESHUM write-back (best-effort)
  const emp = await prisma.user.findUnique({ where: { id: request.userId } });
  if (emp) {
    const r = await reshum.applyLeaveDeduction(emp.employeeId, request.leaveType.name, request.daysCount);
    if (!r.ok) {
      console.warn(`[RESHUM] write-back failed for ${emp.employeeId}: ${r.error}`);
    }

    await createNotification(
      request.userId,
      requestId,
      'Your leave request has been processed! You can now pick up your file from HR.'
    );

    void sendLeaveNotificationEmail(
      emp.email,
      emp.fullName,
      'Your Leave Request Has Been Processed',
      `Your leave request from ${request.startDate.toLocaleDateString()} to ${request.endDate.toLocaleDateString()} has been fully processed. You can now pick up your file from the HR department.`
    );
  }
}

/**
 * On rejection at any stage, notify employee.
 */
export async function handleRejection(
  requestId: string,
  userId: string,
  rejectedBy: string
) {
  await createNotification(
    userId,
    requestId,
    `Your leave request was rejected by ${rejectedBy}`
  );

  const emp = await prisma.user.findUnique({ where: { id: userId } });
  if (emp) {
    void sendLeaveNotificationEmail(
      emp.email,
      emp.fullName,
      'Your Leave Request Was Rejected',
      `Your leave request was rejected by ${rejectedBy}. Please log in to LeaveRec for more details.`
    );
  }
}
