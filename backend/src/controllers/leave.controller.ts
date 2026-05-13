import { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import {
  checkDateOverlap,
  checkLeaveBalance,
  createNotification,
  handleManagerApproval,
  handleDRHAssign,
  handleHRAcceptAssignment,
  handleHRDeclineAssignment,
  handleHRTreat,
  handleRejection,
} from '../services/workflow.service.js';
import { validateLeaveRequest } from '../services/leave-validation.service.js';
import { sendCsv, sendStatsPDF } from '../services/export.service.js';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const createLeaveSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid start date'),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid end date'),
  daysCount: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]),
  reason: z.string().max(1000).optional(),
  recoveryDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid recovery date').optional(),
  missionType: z.string().max(200).optional(),
  transport: z.string().max(200).optional(),
  itinerary: z.string().max(1000).optional(),
  destination: z.string().max(200).optional(),
  weddingDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid wedding date').optional(),
  childBirthDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid child birth date').optional(),
  childName: z.string().max(200).optional(),
  relationship: z.string().max(200).optional(),
});

const reviewActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comment: z.string().max(1000).optional(),
});

// ─── Employee: Create leave request ──────────────────────────────────────────

export async function createLeaveRequest(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const parsed = createLeaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const {
    leaveTypeId, startDate, endDate, daysCount, reason,
    recoveryDate, missionType, transport, itinerary,
    destination, weddingDate, childBirthDate, childName, relationship,
  } = parsed.data;

  const start = new Date(startDate);
  const initialEnd = new Date(endDate);

  if (start > initialEnd) {
    res.status(400).json({ error: 'Start date must be before or equal to end date' });
    return;
  }

  // Validate mission recovery date
  if (recoveryDate) {
    const recovery = new Date(recoveryDate);
    if (recovery <= initialEnd) {
      res.status(400).json({ error: 'Recovery date must be after end date for mission leave' });
      return;
    }
  }

  // Lookup leave type for document & rule validation
  const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!leaveType) {
    res.status(400).json({ error: 'Invalid leave type' });
    return;
  }
  if (leaveType.requiresDocument && !req.file) {
    res.status(400).json({ error: `A supporting document (PDF) is required for ${leaveType.name}` });
    return;
  }

  // Centralised per-type rule validation (gender, fixed duration, once-per-career, ...)
  const validation = await validateLeaveRequest({
    userId,
    leaveTypeId,
    startDate: start,
    endDate: initialEnd,
    requestedDays: Number(daysCount),
    extras: {
      destination, missionType, transport, itinerary, recoveryDate,
      weddingDate, childBirthDate, childName, relationship, reason,
    },
  });
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }
  const end = validation.endDate;
  const finalDays = validation.daysCount;
  const finalReason = validation.reason;

  // Check for overlapping leaves (against the rule-resolved end date)
  const hasOverlap = await checkDateOverlap(userId, start, end);
  if (hasOverlap) {
    res.status(400).json({ error: 'You already have a leave request for overlapping dates' });
    return;
  }

  // Check leave balance (pending-aware) — only meaningful for ANNUAL types
  const balance = await checkLeaveBalance(userId, leaveTypeId, finalDays);
  if (!balance.sufficient) {
    res.status(400).json({
      error: `Insufficient leave balance. Remaining: ${balance.remaining} days`,
    });
    return;
  }

  // Handle file upload
  const documentPath = req.file ? req.file.filename : null;

  const request = await prisma.$transaction(async (tx) => {
    const req_ = await tx.leaveRequest.create({
      data: {
        userId,
        leaveTypeId,
        startDate: start,
        endDate: end,
        daysCount: finalDays,
        reason: finalReason,
        recoveryDate: recoveryDate ? new Date(recoveryDate) : null,
        documentPath,
        missionType: missionType || null,
        transport: transport || null,
        itinerary: itinerary || null,
        destination: destination || null,
        weddingDate: weddingDate ? new Date(weddingDate) : null,
        childBirthDate: childBirthDate ? new Date(childBirthDate) : null,
        childName: childName || null,
        relationship: relationship || null,
        status: 'PENDING_MANAGER',
      },
      include: { leaveType: true, user: true },
    });
    await tx.requestAction.create({
      data: { requestId: req_.id, actorId: userId, action: 'APPROVE', comment: 'Request submitted' },
    });
    return req_;
  });

  // Notify the employee's manager (or admin for top-managers)
  const employee = await prisma.user.findUnique({ where: { id: userId } });
  if (employee?.managerId) {
    await createNotification(
      employee.managerId,
      request.id,
      `${employee.fullName} submitted a leave request (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`
    );
  } else {
    // Top-manager or orphan employee — route to all admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null } });
    for (const admin of admins) {
      await createNotification(
        admin.id,
        request.id,
        `${employee?.fullName} (no direct manager) submitted a leave request — manager-level approval needed`
      );
    }
  }

  res.status(201).json(request);
}

// ─── Employee: Get own requests ──────────────────────────────────────────────

export async function getMyRequests(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const status = req.query.status as string | undefined;

  const where: any = { userId };
  if (status) {
    where.status = status;
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      leaveType: true,
      actions: {
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
}

// ─── Employee: Get leave balances ────────────────────────────────────────────

export async function getMyBalances(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

  // Fetch all leave types and the user's existing balance rows
  const [allTypes, existingBalances] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { name: 'asc' } }),
    prisma.leaveBalance.findMany({
      where: { userId, year },
      include: { leaveType: true },
    }),
  ]);

  const balanceMap = new Map(existingBalances.map(b => [b.leaveTypeId, b]));

  // Synthesize missing rows with defaults from leaveType.maxDays
  const balances = allTypes.map(lt => {
    if (balanceMap.has(lt.id)) {
      return balanceMap.get(lt.id)!;
    }
    // Virtual row — not persisted, just for display
    return {
      id: null,
      userId,
      leaveTypeId: lt.id,
      year,
      totalDays: lt.maxDays ?? null,
      usedDays: 0,
      leaveType: lt,
    };
  });

  res.json(balances);
}

// ─── Get single request detail ───────────────────────────────────────────────

export async function getRequestById(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const user = req.user!;

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      user: { select: { id: true, fullName: true, department: true, position: true, employeeId: true, managerId: true } },
      actions: {
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!request) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  // Check access: own request, or manager of employee, or HR, or Admin
  if (
    request.userId !== user.userId &&
    user.role !== 'HR' &&
    user.role !== 'ADMIN' &&
    !(user.role === 'MANAGER' && request.user.managerId === user.userId)
  ) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json(request);
}

// ─── Manager: Get team requests ──────────────────────────────────────────────

export async function getTeamRequests(req: Request, res: Response): Promise<void> {
  const managerId = req.user!.userId;
  const status = req.query.status as string | undefined;

  // Find all employees under this manager
  const employees = await prisma.user.findMany({
    where: { managerId },
    select: { id: true },
  });
  const employeeIds = employees.map((e: { id: string }) => e.id);

  const where: any = { userId: { in: employeeIds } };
  if (status) {
    where.status = status;
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      leaveType: true,
      user: { select: { fullName: true, department: true, position: true, employeeId: true } },
      actions: {
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requests);
}

// ─── Manager: Get a team member's leave balance ──────────────────────────────

export async function getTeamMemberBalance(req: Request, res: Response): Promise<void> {
  const managerId = req.user!.userId;
  const userId = req.params.userId as string;
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

  // Verify this employee actually reports to this manager
  const employee = await prisma.user.findFirst({
    where: { id: userId, managerId, deletedAt: null },
  });
  if (!employee) {
    res.status(403).json({ error: 'This employee is not in your team' });
    return;
  }

  const [allTypes, existingBalances] = await Promise.all([
    prisma.leaveType.findMany({ orderBy: { name: 'asc' } }),
    prisma.leaveBalance.findMany({
      where: { userId, year },
      include: { leaveType: true },
    }),
  ]);

  const balanceMap = new Map(existingBalances.map(b => [b.leaveTypeId, b]));
  const balances = allTypes.map(lt => {
    if (balanceMap.has(lt.id)) return balanceMap.get(lt.id)!;
    return {
      id: null,
      userId,
      leaveTypeId: lt.id,
      year,
      totalDays: lt.maxDays ?? null,
      usedDays: 0,
      leaveType: lt,
    };
  });

  res.json(balances);
}

// ─── Manager: Review (approve/reject) request ───────────────────────────────

export async function reviewRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const parsed = reviewActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { action, comment } = parsed.data;
  const managerId = req.user!.userId;

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!request) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  if (request.status !== 'PENDING_MANAGER') {
    res.status(400).json({ error: 'Request is not pending manager approval' });
    return;
  }

  // Verify this manager manages the employee — or admin acting for top-manager
  const actorRole = req.user!.role;
  const isOwnManager = request.user.managerId === managerId;
  const isAdminFallback = actorRole === 'ADMIN' && request.user.managerId === null;
  if (!isOwnManager && !isAdminFallback) {
    res.status(403).json({ error: 'You are not the manager of this employee' });
    return;
  }

  if (action === 'approve') {
    // Re-check balance at approval time (another request may have been treated since submission)
    const balance = await checkLeaveBalance(request.userId, request.leaveTypeId, request.daysCount, request.id);
    if (!balance.sufficient) {
      res.status(400).json({
        error: `Cannot approve: employee has insufficient leave balance. Remaining: ${balance.remaining ?? 'unlimited'} days`,
      });
      return;
    }

    // Single status write directly to PENDING_ADMIN (skip APPROVED_BY_MANAGER)
    await prisma.$transaction([
      prisma.requestAction.create({
        data: { requestId: id, actorId: managerId, action: 'APPROVE', comment: comment || null },
      }),
      prisma.leaveRequest.update({
        where: { id },
        data: { status: 'PENDING_ADMIN' },
      }),
    ]);
    // Notify admins
    await handleManagerApproval(id, request);
    // Notify employee
    await createNotification(
      request.userId,
      id,
      'Your leave request has been approved by your manager and is being forwarded for HR assignment'
    );
  } else {
    await prisma.$transaction([
      prisma.requestAction.create({
        data: { requestId: id, actorId: managerId, action: 'REJECT', comment: comment || null },
      }),
      prisma.leaveRequest.update({
        where: { id },
        data: { status: 'REJECTED_BY_MANAGER' },
      }),
    ]);
    await handleRejection(id, request.userId, 'Manager');
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true, actions: { include: { actor: { select: { fullName: true, role: true } } } } },
  });

  res.json(updated);
}

// ─── HR: Get all requests ────────────────────────────────────────────────────

export async function getAllRequests(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(500, parseInt(req.query.limit as string, 10) || 50);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) {
    where.status = status;
  }

  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        leaveType: true,
        user: { select: { fullName: true, department: true, position: true, employeeId: true } },
        reservedBy: { select: { id: true, fullName: true } },
        actions: {
          include: { actor: { select: { fullName: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  res.json({ data: requests, total, page, pageSize: limit, pages: Math.ceil(total / limit) || 1 });
}

// ─── HR: Reserve a request ───────────────────────────────────────────────────

export async function reserveRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const hrUserId = req.user!.userId;

  try {
    // Atomic claim: re-check status inside a transaction so two HRs can't grab the same request
    await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({
        where: { id },
        include: { user: true },
      });

      if (!request) throw Object.assign(new Error('Request not found'), { statusCode: 404 });
      if (request.status !== 'PENDING_HR' || request.reservedById !== null) {
        throw Object.assign(new Error('Request has already been claimed by another HR agent'), { statusCode: 409 });
      }

      await tx.requestAction.create({
        data: { requestId: id, actorId: hrUserId, action: 'RESERVE', comment: null },
      });

      await tx.leaveRequest.update({
        where: { id },
        data: { status: 'RESERVED', reservedById: hrUserId },
      });

      await tx.notification.create({
        data: { userId: request.userId, requestId: id, message: 'Your leave request is being processed by HR' },
      });
    });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' });
    return;
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      actions: { include: { actor: { select: { fullName: true, role: true } } } },
      reservedBy: { select: { id: true, fullName: true } },
    },
  });

  res.json(updated);
}

// ─── HR: Treat (mark as processed) a reserved request ────────────────────────

export async function treatRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const hrUserId = req.user!.userId;
  const comment = req.body.comment as string | undefined;

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!request) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  if (request.status !== 'RESERVED') {
    res.status(400).json({ error: 'Request is not reserved' });
    return;
  }

  // Only the HR who reserved it can treat it
  if (request.reservedById !== hrUserId) {
    res.status(403).json({ error: 'Only the HR agent who reserved this request can treat it' });
    return;
  }

  // Record the action
  await prisma.requestAction.create({
    data: {
      requestId: id,
      actorId: hrUserId,
      action: 'TREAT',
      comment: comment || null,
    },
  });

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'TREATED' },
  });

  await handleHRTreat(id);

  // Notify manager too
  if (request.user.managerId) {
    await createNotification(
      request.user.managerId,
      id,
      `${request.user.fullName}'s leave request has been processed by HR`
    );
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      actions: { include: { actor: { select: { fullName: true, role: true } } } },
      reservedBy: { select: { id: true, fullName: true } },
    },
  });

  res.json(updated);
}

// ─── Get all leave types ─────────────────────────────────────────────────────

export async function getLeaveTypes(req: Request, res: Response): Promise<void> {
  const types = await prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
  res.json(types);
}

// ─── Stats endpoints ─────────────────────────────────────────────────────────

export async function getEmployeeStats(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const year = new Date().getFullYear();

  const [balances, requests] = await Promise.all([
    prisma.leaveBalance.findMany({
      where: { userId, year },
      include: { leaveType: true },
    }),
    prisma.leaveRequest.findMany({
      where: { userId },
      select: { status: true, daysCount: true, createdAt: true },
    }),
  ]);

  const statusCounts = { approved: 0, pending: 0, rejected: 0 };
  for (const r of requests) {
    if (r.status === 'TREATED') statusCounts.approved++;
    else if (r.status === 'REJECTED_BY_MANAGER' || r.status === 'CANCELLED') statusCounts.rejected++;
    else statusCounts.pending++;
  }

  res.json({ balances, statusCounts, totalRequests: requests.length });
}

export async function getManagerStats(req: Request, res: Response): Promise<void> {
  const managerId = req.user!.userId;

  const employees = await prisma.user.findMany({
    where: { managerId },
    select: { id: true },
  });
  const employeeIds = employees.map((e: { id: string }) => e.id);

  const requests = await prisma.leaveRequest.findMany({
    where: { userId: { in: employeeIds } },
    select: { status: true, daysCount: true, createdAt: true },
  });

  const statusCounts = { pending_manager: 0, pending_hr: 0, approved: 0, rejected: 0 };
  for (const r of requests) {
    if (r.status === 'PENDING_MANAGER') statusCounts.pending_manager++;
    else if (r.status === 'PENDING_HR' || r.status === 'APPROVED_BY_MANAGER' || r.status === 'RESERVED') statusCounts.pending_hr++;
    else if (r.status === 'TREATED') statusCounts.approved++;
    else statusCounts.rejected++;
  }

  // Monthly leave distribution
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, days: 0 }));
  for (const r of requests) {
    const month = r.createdAt.getMonth();
    monthlyData[month].count++;
    monthlyData[month].days += r.daysCount;
  }

  res.json({
    teamSize: employeeIds.length,
    statusCounts,
    totalRequests: requests.length,
    monthlyData,
  });
}

export async function getHRStats(req: Request, res: Response): Promise<void> {
  const requests = await prisma.leaveRequest.findMany({
    include: { user: { select: { department: true } }, leaveType: { select: { name: true } } },
  });

  const statusCounts = { pending_manager: 0, pending_hr: 0, reserved: 0, treated: 0, rejected: 0 };
  const departmentStats: Record<string, number> = {};
  const typeStats: Record<string, number> = {};

  for (const r of requests) {
    if (r.status === 'PENDING_MANAGER') statusCounts.pending_manager++;
    else if (r.status === 'PENDING_HR' || r.status === 'APPROVED_BY_MANAGER') statusCounts.pending_hr++;
    else if (r.status === 'RESERVED') statusCounts.reserved++;
    else if (r.status === 'TREATED') statusCounts.treated++;
    else statusCounts.rejected++;

    departmentStats[r.user.department] = (departmentStats[r.user.department] || 0) + 1;
    typeStats[r.leaveType.name] = (typeStats[r.leaveType.name] || 0) + 1;
  }

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, days: 0 }));
  for (const r of requests) {
    const month = r.createdAt.getMonth();
    monthlyData[month].count++;
    monthlyData[month].days += r.daysCount;
  }

  const totalEmployees = await prisma.user.count({ where: { role: 'EMPLOYEE' } });

  res.json({
    totalEmployees,
    statusCounts,
    totalRequests: requests.length,
    departmentStats,
    typeStats,
    monthlyData,
  });
}

// ─── Calendar: Get all leaves for calendar view ──────────────────────────────

export async function getCalendarLeaves(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month as string, 10) - 1 : undefined;

  let startRange: Date;
  let endRange: Date;

  if (month !== undefined) {
    startRange = new Date(year, month, 1);
    endRange = new Date(year, month + 1, 0); // last day of month
  } else {
    startRange = new Date(year, 0, 1);
    endRange = new Date(year, 11, 31);
  }

  const where: any = {
    startDate: { lte: endRange },
    endDate: { gte: startRange },
    status: { notIn: ['REJECTED_BY_MANAGER', 'CANCELLED'] },
  };

  const department = req.query.department as string | undefined;

  // Employees see only their own; managers see team; HR and DRH see all
  if (user.role === 'EMPLOYEE') {
    where.userId = user.userId;
  } else if (user.role === 'MANAGER') {
    const employees = await prisma.user.findMany({
      where: { managerId: user.userId },
      select: { id: true },
    });
    where.userId = { in: [user.userId, ...employees.map((e: { id: string }) => e.id)] };
  } else if (department) {
    where.user = { department };
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      leaveType: { select: { name: true } },
      user: { select: { fullName: true, department: true } },
    },
    orderBy: { startDate: 'asc' },
  });

  res.json(requests);
}

// ─── User endpoints ──────────────────────────────────────────────────────────

export async function getTeamMembers(req: Request, res: Response): Promise<void> {
  const managerId = req.user!.userId;

  const employees = await prisma.user.findMany({
    where: { managerId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      department: true,
      position: true,
      employeeId: true,
    },
    orderBy: { fullName: 'asc' },
  });

  res.json(employees);
}

export async function getAllEmployees(req: Request, res: Response): Promise<void> {
  const employees = await prisma.user.findMany({
    where: { role: { notIn: ['HR', 'ADMIN'] }, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      department: true,
      position: true,
      employeeId: true,
      role: true,
    },
    orderBy: { fullName: 'asc' },
  });

  res.json(employees);
}

export async function getAllBalances(req: Request, res: Response): Promise<void> {
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

  const balances = await prisma.leaveBalance.findMany({
    where: { year },
    include: {
      user: { select: { fullName: true, department: true, employeeId: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { user: { fullName: 'asc' } },
  });

  res.json(balances);
}

// ─── Employee: Cancel a pending request ──────────────────────────────────────

export async function cancelRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!request) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  // Only the owner can cancel
  if (request.userId !== userId) {
    res.status(403).json({ error: 'You can only cancel your own requests' });
    return;
  }

  // Can only cancel if leave hasn't started yet and is still pending or reserved
  const now = new Date();
  if (request.startDate <= now) {
    res.status(400).json({ error: 'Cannot cancel a leave that has already started' });
    return;
  }

  if (request.status !== 'PENDING_MANAGER' && request.status !== 'PENDING_ADMIN' && request.status !== 'PENDING_HR_ACCEPT' && request.status !== 'PENDING_HR' && request.status !== 'RESERVED' && request.status !== 'AWAITING_DOCUMENT') {
    res.status(400).json({ error: 'Only pending or reserved requests can be cancelled' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.requestAction.create({
      data: { requestId: id, actorId: userId, action: 'CANCEL', comment: null },
    });

    await tx.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Refund balance if the leave was already RESERVED (balance not yet deducted — deduction happens at TREAT)
    // Nothing to refund since balance is only deducted at TREAT stage. Still notify manager.

    if (request.user.managerId) {
      await tx.notification.create({
        data: {
          userId: request.user.managerId,
          requestId: id,
          message: `${request.user.fullName} cancelled their leave request`,
        },
      });
    }
  });

  res.json({ message: 'Request cancelled successfully' });
}

// ─── HR: Batch reserve multiple requests ─────────────────────────────────────

const batchReserveSchema = z.object({
  requestIds: z.array(z.string().uuid()).min(1),
});

export async function batchReserveRequests(req: Request, res: Response): Promise<void> {
  const parsed = batchReserveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { requestIds } = parsed.data;
  const hrUserId = req.user!.userId;

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const id of requestIds) {
    try {
      const request = await prisma.leaveRequest.findUnique({
        where: { id },
        include: { user: true },
      });

      if (!request) {
        results.push({ id, success: false, error: 'Not found' });
        continue;
      }

      if (request.status !== 'PENDING_HR') {
        results.push({ id, success: false, error: 'Not pending HR' });
        continue;
      }

      await prisma.requestAction.create({
        data: {
          requestId: id,
          actorId: hrUserId,
          action: 'RESERVE',
          comment: null,
        },
      });

      await prisma.leaveRequest.update({
        where: { id },
        data: { status: 'RESERVED', reservedById: hrUserId },
      });

      await prisma.notification.create({
        data: { userId: request.userId, requestId: id, message: 'Your leave request is being processed by HR' },
      });

      results.push({ id, success: true });
    } catch (err) {
      results.push({ id, success: false, error: 'Internal error' });
    }
  }

  res.json({ results });
}

// ─── Admin: Get all users info ──────────────────────────────────────────────

export async function getDRHUsers(_req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      department: true,
      position: true,
      employeeId: true,
      managerId: true,
      createdAt: true,
      manager: { select: { id: true, fullName: true } },
    },
    orderBy: { fullName: 'asc' },
  });

  res.json(users);
}

// ─── Admin: Get HR agent statistics (supports ?from= &to= date range) ───────

export async function getDRHStats(req: Request, res: Response): Promise<void> {
  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;

  const dateFilter: any = {};
  if (fromParam) dateFilter.gte = new Date(fromParam);
  if (toParam) {
    const toDate = new Date(toParam);
    toDate.setHours(23, 59, 59, 999);
    dateFilter.lte = toDate;
  }

  const requestWhere: any = {};
  if (Object.keys(dateFilter).length) requestWhere.createdAt = dateFilter;

  // Get all HR users
  const hrUsers = await prisma.user.findMany({
    where: { role: 'HR' },
    select: { id: true, fullName: true, email: true },
  });

  const allRequests = await prisma.leaveRequest.findMany({
    where: requestWhere,
    include: {
      user: { select: { department: true } },
      leaveType: { select: { name: true } },
      reservedBy: { select: { id: true, fullName: true } },
    },
  });

  const statusCounts = { pending_manager: 0, pending_hr: 0, reserved: 0, treated: 0, rejected: 0, cancelled: 0 };
  const departmentStats: Record<string, number> = {};
  const typeStats: Record<string, number> = {};

  for (const r of allRequests) {
    if (r.status === 'PENDING_MANAGER') statusCounts.pending_manager++;
    else if (r.status === 'PENDING_HR' || r.status === 'APPROVED_BY_MANAGER') statusCounts.pending_hr++;
    else if (r.status === 'RESERVED') statusCounts.reserved++;
    else if (r.status === 'TREATED') statusCounts.treated++;
    else if (r.status === 'CANCELLED') statusCounts.cancelled++;
    else statusCounts.rejected++;

    departmentStats[r.user.department] = (departmentStats[r.user.department] || 0) + 1;
    typeStats[r.leaveType.name] = (typeStats[r.leaveType.name] || 0) + 1;
  }

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0, days: 0 }));
  for (const r of allRequests) {
    const month = r.createdAt.getMonth();
    monthlyData[month].count++;
    monthlyData[month].days += r.daysCount;
  }

  const hrAgentStats = hrUsers.map(hr => {
    const reserved = allRequests.filter(r => r.reservedById === hr.id);
    const treated = reserved.filter(r => r.status === 'TREATED');
    const inProgress = reserved.filter(r => r.status === 'RESERVED');
    return {
      id: hr.id,
      fullName: hr.fullName,
      email: hr.email,
      totalReserved: reserved.length,
      treated: treated.length,
      inProgress: inProgress.length,
    };
  });

  const totalEmployees = await prisma.user.count();

  res.json({
    totalEmployees,
    statusCounts,
    totalRequests: allRequests.length,
    departmentStats,
    typeStats,
    monthlyData,
    hrAgentStats,
  });
}

// ─── Admin: Get requests assigned to a specific HR agent ────────────────────

export async function getDRHAgentRequests(req: Request, res: Response): Promise<void> {
  const hrId = req.params.hrId as string;

  const requests = await prisma.leaveRequest.findMany({
    where: { reservedById: hrId },
    include: {
      leaveType: true,
      user: { select: { fullName: true, department: true, position: true, employeeId: true } },
      reservedBy: { select: { id: true, fullName: true } },
      actions: {
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json(requests);
}

// ─── DRH: Reassign a reserved request to another HR agent ────────────────────

const reassignSchema = z.object({
  hrId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});

export async function reassignRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const adminUserId = req.user!.userId;
  const parsed = reassignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { hrId, comment } = parsed.data;

  const [request, newHR] = await Promise.all([
    prisma.leaveRequest.findUnique({ where: { id }, include: { user: true, reservedBy: true } }),
    prisma.user.findUnique({ where: { id: hrId } }),
  ]);

  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (!newHR || newHR.role !== 'HR') { res.status(400).json({ error: 'Target user is not an HR agent' }); return; }
  if (request.status !== 'RESERVED' && request.status !== 'PENDING_HR') {
    res.status(400).json({ error: 'Only RESERVED or PENDING_HR requests can be reassigned' });
    return;
  }

  const previousHRId = request.reservedById;

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id },
      data: { reservedById: hrId, status: 'RESERVED' },
    });

    await tx.requestAction.create({
      data: { requestId: id, actorId: adminUserId, action: 'REASSIGN', comment: comment || null },
    });

    // Notify new HR
    await tx.notification.create({
      data: { userId: hrId, requestId: id, message: `A leave request from ${request.user.fullName} has been assigned to you by Admin` },
    });

    // Notify old HR (if any)
    if (previousHRId && previousHRId !== hrId) {
      await tx.notification.create({
        data: { userId: previousHRId, requestId: id, message: `Leave request from ${request.user.fullName} has been reassigned by Admin` },
      });
    }

    // Notify employee
    await tx.notification.create({
      data: { userId: request.userId, requestId: id, message: 'Your leave request has been reassigned to another HR agent' },
    });
  });

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      user: { select: { fullName: true, department: true, position: true, employeeId: true } },
      reservedBy: { select: { id: true, fullName: true } },
      actions: { include: { actor: { select: { fullName: true, role: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });

  res.json(updated);
}

// ─── DRH: Manually adjust a user's leave balance ─────────────────────────────

const adjustBalanceSchema = z.object({
  leaveTypeId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  deltaTotal: z.number().int().optional().default(0),
  deltaUsed: z.number().int().optional().default(0),
  reason: z.string().min(1).max(500),
});

export async function adjustBalance(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId as string;
  const adminUserId = req.user!.userId;
  const parsed = adjustBalanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { leaveTypeId, year, deltaTotal, deltaUsed, reason } = parsed.data;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) { res.status(404).json({ error: 'User not found' }); return; }

  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
  });
  if (!balance) { res.status(404).json({ error: 'Balance record not found for this user/leave-type/year' }); return; }

  const newTotal = balance.totalDays + (deltaTotal ?? 0);
  const newUsed = balance.usedDays + (deltaUsed ?? 0);
  if (newTotal < 0 || newUsed < 0) {
    res.status(400).json({ error: 'Adjustment would result in negative balance' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      data: { totalDays: newTotal, usedDays: newUsed },
    });

    await tx.balanceAdjustment.create({
      data: {
        userId,
        adjustedBy: adminUserId,
        year,
        deltaTotal: deltaTotal ?? 0,
        deltaUsed: deltaUsed ?? 0,
        reason,
      },
    });

    await tx.requestAction.create({
      data: {
        requestId: (await tx.leaveRequest.findFirst({ where: { userId }, select: { id: true }, orderBy: { createdAt: 'desc' } }))?.id ?? userId,
        actorId: adminUserId,
        action: 'ADJUST_BALANCE',
        comment: reason,
      },
    });
  });

  const updated = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
    include: { leaveType: true },
  });

  res.json(updated);
}

// ─── DRH: Get audit log of all RequestActions ────────────────────────────────

export async function getAuditLog(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 50);
  const skip = (page - 1) * limit;
  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;
  const actorId = req.query.actorId as string | undefined;
  const actionType = req.query.type as string | undefined;

  const where: any = {};
  if (actorId) where.actorId = actorId;
  if (actionType) where.action = actionType;
  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) where.createdAt.gte = new Date(fromParam);
    if (toParam) { const t = new Date(toParam); t.setHours(23, 59, 59, 999); where.createdAt.lte = t; }
  }

  const [actions, total] = await Promise.all([
    prisma.requestAction.findMany({
      where,
      include: {
        actor: { select: { id: true, fullName: true, role: true } },
        request: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            user: { select: { fullName: true, employeeId: true } },
            leaveType: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.requestAction.count({ where }),
  ]);

  res.json({ actions, total, page, limit, pages: Math.ceil(total / limit) });
}

// ─── DRH: Export requests as CSV ─────────────────────────────────────────────

export async function exportRequestsCsv(req: Request, res: Response): Promise<void> {
  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;
  const statusParam = req.query.status as string | undefined;
  const hrIdParam = req.query.hrId as string | undefined;

  const where: any = {};
  if (statusParam) where.status = statusParam;
  if (hrIdParam) where.reservedById = hrIdParam;
  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) where.createdAt.gte = new Date(fromParam);
    if (toParam) { const t = new Date(toParam); t.setHours(23, 59, 59, 999); where.createdAt.lte = t; }
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      leaveType: { select: { name: true } },
      user: { select: { fullName: true, department: true, employeeId: true } },
      reservedBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const headers = ['ID', 'Employee', 'Employee ID', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Reserved By', 'Submitted'];
  const rows = requests.map(r => [
    r.id,
    r.user.fullName,
    r.user.employeeId,
    r.user.department,
    r.leaveType.name,
    r.startDate.toLocaleDateString(),
    r.endDate.toLocaleDateString(),
    r.daysCount,
    r.status,
    r.reservedBy?.fullName ?? '',
    r.createdAt.toLocaleDateString(),
  ]);

  sendCsv(res, 'leave-requests.csv', headers, rows);
}

// ─── DRH: Export balances as CSV ─────────────────────────────────────────────

export async function exportBalancesCsv(req: Request, res: Response): Promise<void> {
  const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();

  const balances = await prisma.leaveBalance.findMany({
    where: { year },
    include: {
      user: { select: { fullName: true, department: true, employeeId: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { user: { fullName: 'asc' } },
  });

  const headers = ['Employee', 'Employee ID', 'Department', 'Leave Type', 'Year', 'Total Days', 'Used Days', 'Remaining'];
  const rows = balances.map(b => [
    b.user.fullName,
    b.user.employeeId,
    b.user.department,
    b.leaveType.name,
    b.year,
    b.totalDays,
    b.usedDays,
    b.totalDays - b.usedDays,
  ]);

  sendCsv(res, `leave-balances-${year}.csv`, headers, rows);
}

// ─── Admin: Get pending Admin requests ────────────────────────────────────────

export async function getDRHPendingRequests(req: Request, res: Response): Promise<void> {
  const requests = await prisma.leaveRequest.findMany({
    where: { status: { in: ['PENDING_ADMIN', 'APPROVED_BY_MANAGER'] } },
    include: {
      leaveType: true,
      user: { select: { fullName: true, department: true, position: true, employeeId: true, managerId: true } },
      actions: {
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  res.json(requests);
}

// ─── Admin: Get all HR agents list ──────────────────────────────────────────

export async function getHRAgents(req: Request, res: Response): Promise<void> {
  const agents = await prisma.user.findMany({
    where: { role: 'HR' },
    select: {
      id: true,
      fullName: true,
      email: true,
      department: true,
      position: true,
      employeeId: true,
    },
    orderBy: { fullName: 'asc' },
  });

  // Count pending requests for each HR agent
  const counts = await prisma.leaveRequest.groupBy({
    by: ['assignedHrId'],
    where: { status: 'PENDING_HR', assignedHrId: { not: null } },
    _count: true,
  });

  const countMap: Record<string, number> = {};
  for (const c of counts) {
    if (c.assignedHrId) countMap[c.assignedHrId] = c._count;
  }

  const result = agents.map(a => ({ ...a, pendingCount: countMap[a.id] ?? 0 }));
  res.json(result);
}

// ─── Admin: Assign request to HR agent ──────────────────────────────────────

const assignSchema = z.object({
  hrId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});

export async function assignRequestToHR(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const adminId = req.user!.userId;
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { hrId, comment } = parsed.data;

  const request = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: true } });
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (request.status !== 'PENDING_ADMIN' && request.status !== 'APPROVED_BY_MANAGER') {
    res.status(400).json({ error: 'Request is not awaiting Admin assignment' });
    return;
  }

  const hrAgent = await prisma.user.findUnique({ where: { id: hrId } });
  if (!hrAgent || hrAgent.role !== 'HR') {
    res.status(400).json({ error: 'Target user is not an HR agent' });
    return;
  }

  // Prevent assigning the leave requester to their own request
  if (request.userId === hrId) {
    res.status(400).json({ error: 'Cannot assign an HR agent to their own leave request' });
    return;
  }

  await prisma.requestAction.create({
    data: { requestId: id, actorId: adminId, action: 'ASSIGN', comment: comment || null },
  });

  await handleDRHAssign(id, hrId, adminId);

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: true,
      user: { select: { fullName: true, department: true, position: true, employeeId: true } },
      assignedHr: { select: { id: true, fullName: true } },
      actions: { include: { actor: { select: { fullName: true, role: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });

  res.json(updated);
}

// ─── HR: Accept or decline an assignment ──────────────────────────────────────

export async function acceptAssignment(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const hrId = req.user!.userId;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (request.status !== 'PENDING_HR_ACCEPT') {
    res.status(400).json({ error: 'Request is not awaiting your acceptance' });
    return;
  }
  if (request.assignedHrId !== hrId) {
    res.status(403).json({ error: 'This request is not assigned to you' });
    return;
  }

  await prisma.requestAction.create({
    data: { requestId: id, actorId: hrId, action: 'APPROVE', comment: 'Assignment accepted' },
  });
  await handleHRAcceptAssignment(id, hrId);

  res.json({ success: true });
}

export async function declineAssignment(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const hrId = req.user!.userId;
  const comment = (req.body?.comment as string | undefined) || undefined;

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (request.status !== 'PENDING_HR_ACCEPT') {
    res.status(400).json({ error: 'Request is not awaiting your acceptance' });
    return;
  }
  if (request.assignedHrId !== hrId) {
    res.status(403).json({ error: 'This request is not assigned to you' });
    return;
  }

  await prisma.requestAction.create({
    data: { requestId: id, actorId: hrId, action: 'REJECT', comment: comment || 'Assignment declined' },
  });
  await handleHRDeclineAssignment(id, hrId);

  res.json({ success: true });
}

// ─── DRH: Export company stats as PDF ────────────────────────────────────────

export async function exportStatsPdf(req: Request, res: Response): Promise<void> {
  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;

  const dateFilter: any = {};
  if (fromParam) dateFilter.gte = new Date(fromParam);
  if (toParam) { const t = new Date(toParam); t.setHours(23, 59, 59, 999); dateFilter.lte = t; }

  const requestWhere: any = {};
  if (Object.keys(dateFilter).length) requestWhere.createdAt = dateFilter;

  const hrUsers = await prisma.user.findMany({ where: { role: 'HR' }, select: { id: true, fullName: true } });
  const allRequests = await prisma.leaveRequest.findMany({
    where: requestWhere,
    include: { user: { select: { department: true } }, leaveType: { select: { name: true } } },
  });

  const statusCounts: Record<string, number> = { pending_manager: 0, pending_hr: 0, reserved: 0, treated: 0, rejected: 0, cancelled: 0 };
  const departmentStats: Record<string, number> = {};
  const typeStats: Record<string, number> = {};

  for (const r of allRequests) {
    if (r.status === 'PENDING_MANAGER') statusCounts.pending_manager++;
    else if (r.status === 'PENDING_HR' || r.status === 'APPROVED_BY_MANAGER') statusCounts.pending_hr++;
    else if (r.status === 'RESERVED') statusCounts.reserved++;
    else if (r.status === 'TREATED') statusCounts.treated++;
    else if (r.status === 'CANCELLED') statusCounts.cancelled++;
    else statusCounts.rejected++;
    departmentStats[r.user.department] = (departmentStats[r.user.department] || 0) + 1;
    typeStats[r.leaveType.name] = (typeStats[r.leaveType.name] || 0) + 1;
  }

  const hrAgentStats = hrUsers.map(hr => {
    const reserved = allRequests.filter(r => r.reservedById === hr.id);
    return {
      fullName: hr.fullName,
      totalReserved: reserved.length,
      inProgress: reserved.filter(r => r.status === 'RESERVED').length,
      treated: reserved.filter(r => r.status === 'TREATED').length,
    };
  });

  const totalEmployees = await prisma.user.count();

  sendStatsPDF(res, {
    from: fromParam,
    to: toParam,
    totalEmployees,
    totalRequests: allRequests.length,
    statusCounts,
    departmentStats,
    typeStats,
    hrAgentStats,
  });
}

// ─── Employee: Edit a pending request ────────────────────────────────────────

export async function editRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  const parsed = createLeaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Request not found' }); return; }
  if (existing.userId !== userId) { res.status(403).json({ error: 'Not your request' }); return; }
  if (existing.status !== 'PENDING_MANAGER') {
    res.status(400).json({ error: 'Only pending requests can be edited' });
    return;
  }

  const start = new Date(parsed.data.startDate);
  const initialEnd = new Date(parsed.data.endDate);
  if (start > initialEnd) { res.status(400).json({ error: 'Start date must be before or equal to end date' }); return; }

  // Centralised per-type rule validation (also enforces fixed duration)
  const validation = await validateLeaveRequest({
    userId,
    leaveTypeId: parsed.data.leaveTypeId,
    startDate: start,
    endDate: initialEnd,
    requestedDays: Number(parsed.data.daysCount),
    extras: {
      destination: parsed.data.destination,
      missionType: parsed.data.missionType,
      transport: parsed.data.transport,
      itinerary: parsed.data.itinerary,
      recoveryDate: parsed.data.recoveryDate,
      weddingDate: parsed.data.weddingDate,
      childBirthDate: parsed.data.childBirthDate,
      childName: parsed.data.childName,
      relationship: parsed.data.relationship,
      reason: parsed.data.reason,
    },
    excludeRequestId: id,
  });
  if (!validation.ok) { res.status(400).json({ error: validation.error }); return; }
  const end = validation.endDate;
  const finalDays = validation.daysCount;
  const finalReason = validation.reason;

  const overlap = await checkDateOverlap(userId, start, end, id);
  if (overlap) { res.status(400).json({ error: 'Overlaps another request' }); return; }

  const balance = await checkLeaveBalance(userId, parsed.data.leaveTypeId, finalDays, id);
  if (!balance.sufficient) {
    res.status(400).json({ error: `Insufficient balance. Remaining: ${balance.remaining} days` });
    return;
  }

  const employee = await prisma.user.findUnique({ where: { id: userId } });

  await prisma.$transaction([
    prisma.leaveRequest.update({
      where: { id },
      data: {
        leaveTypeId: parsed.data.leaveTypeId,
        startDate: start,
        endDate: end,
        daysCount: finalDays,
        reason: finalReason,
        recoveryDate: parsed.data.recoveryDate ? new Date(parsed.data.recoveryDate) : null,
        missionType: parsed.data.missionType ?? null,
        transport: parsed.data.transport ?? null,
        itinerary: parsed.data.itinerary ?? null,
        destination: parsed.data.destination ?? null,
        weddingDate: parsed.data.weddingDate ? new Date(parsed.data.weddingDate) : null,
        childBirthDate: parsed.data.childBirthDate ? new Date(parsed.data.childBirthDate) : null,
        childName: parsed.data.childName ?? null,
        relationship: parsed.data.relationship ?? null,
      },
    }),
    prisma.requestAction.create({
      data: { requestId: id, actorId: userId, action: 'EDIT', comment: null },
    }),
  ]);

  // Re-notify manager
  if (employee?.managerId) {
    await createNotification(
      employee.managerId, id,
      `${employee.fullName} edited their leave request — please re-review`
    );
  } else {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null } });
    for (const a of admins) {
      await createNotification(a.id, id, `${employee?.fullName} (manager) edited their leave request`);
    }
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true, actions: { include: { actor: { select: { fullName: true, role: true } } } } },
  });
  res.json(updated);
}

// ─── Manager: Cancel a team member's pending request ─────────────────────────

export async function cancelByManager(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const managerId = req.user!.userId;
  const comment = (req.body?.comment as string | undefined)?.trim() || null;

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (request.user.managerId !== managerId) {
    res.status(403).json({ error: 'Not your team member' });
    return;
  }
  if (request.status !== 'PENDING_MANAGER') {
    res.status(400).json({ error: 'Only pending requests can be cancelled by manager' });
    return;
  }

  await prisma.$transaction([
    prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } }),
    prisma.requestAction.create({ data: { requestId: id, actorId: managerId, action: 'CANCEL', comment } }),
  ]);

  await createNotification(
    request.userId, id,
    comment
      ? `Your manager cancelled your leave request: "${comment}"`
      : 'Your manager cancelled your leave request'
  );

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true, actions: { include: { actor: { select: { fullName: true, role: true } } } } },
  });
  res.json(updated);
}

// ─── HR: Request additional document from employee ───────────────────────────

export async function requestDocument(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const hrUserId = req.user!.userId;
  const schema = z.object({ comment: z.string().trim().min(1).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Comment is required' }); return; }

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (request.status !== 'RESERVED') {
    res.status(400).json({ error: 'Only reserved requests can have document requests' });
    return;
  }
  if (request.reservedById !== hrUserId) {
    res.status(403).json({ error: 'Only the reserving HR can request a document' });
    return;
  }

  await prisma.$transaction([
    prisma.leaveRequest.update({ where: { id }, data: { status: 'AWAITING_DOCUMENT' } }),
    prisma.requestAction.create({ data: { requestId: id, actorId: hrUserId, action: 'REQUEST_DOCUMENT', comment: parsed.data.comment } }),
  ]);

  await createNotification(
    request.userId, id,
    `HR requested an additional document: "${parsed.data.comment}"`
  );

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true, actions: { include: { actor: { select: { fullName: true, role: true } } } } },
  });
  res.json(updated);
}

// ─── Employee: Upload additional document ────────────────────────────────────

export async function uploadAdditionalDocument(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  if (!req.file) { res.status(400).json({ error: 'PDF file required' }); return; }

  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }
  if (request.userId !== userId) { res.status(403).json({ error: 'Not your request' }); return; }
  if (request.status !== 'AWAITING_DOCUMENT') {
    res.status(400).json({ error: 'No document was requested for this leave' });
    return;
  }

  const previousPath = request.documentPath;

  await prisma.leaveRequest.update({
    where: { id },
    data: { documentPath: req.file.filename, status: 'RESERVED' },
  });

  if (previousPath) {
    fs.unlink(path.resolve(env.UPLOAD_DIR, previousPath)).catch(() => {});
  }

  if (request.reservedById) {
    await createNotification(
      request.reservedById, id,
      'Employee uploaded the requested document — ready to continue processing'
    );
  }

  const updated = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true, actions: { include: { actor: { select: { fullName: true, role: true } } } } },
  });
  res.json(updated);
}

// ─── Admin: Get pending top-manager requests (no managerId) ──────────────────

export async function getManagerApprovals(_req: Request, res: Response): Promise<void> {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: 'PENDING_MANAGER',
      user: { managerId: null },
    },
    include: {
      leaveType: true,
      user: { select: { fullName: true, department: true, position: true, employeeId: true } },
      actions: {
        include: { actor: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
}
