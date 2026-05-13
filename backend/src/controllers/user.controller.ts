import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2).max(100),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']),
  department: z.string().min(1).max(100),
  position: z.string().min(1).max(100),
  employeeId: z.string().min(1).max(50),
  managerId: z.string().uuid().nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']).optional(),
  department: z.string().min(1).max(100).optional(),
  position: z.string().min(1).max(100).optional(),
  managerId: z.string().uuid().nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
});

// ─── HR: Get all users with manager info ─────────────────────────────────────

export async function getAllUsers(_req: Request, res: Response): Promise<void> {
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
      gender: true,
      createdAt: true,
      manager: { select: { id: true, fullName: true } },
    },
    orderBy: { fullName: 'asc' },
  });

  res.json(users);
}

// ─── HR: Get managers list (for assignment dropdown) ─────────────────────────

export async function getManagers(_req: Request, res: Response): Promise<void> {
  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER', deletedAt: null },
    select: { id: true, fullName: true, department: true },
    orderBy: { fullName: 'asc' },
  });

  res.json(managers);
}

// ─── HR: Create user ─────────────────────────────────────────────────────────

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { email, password, fullName, role, department, position, employeeId, managerId, gender } = parsed.data;

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'A user with this email already exists' });
    return;
  }

  // Check for duplicate employeeId
  const existingEid = await prisma.user.findUnique({ where: { employeeId } });
  if (existingEid) {
    res.status(400).json({ error: 'A user with this employee ID already exists' });
    return;
  }

  // If managerId is provided, verify the manager exists and is a MANAGER
  if (managerId) {
    const manager = await prisma.user.findUnique({ where: { id: managerId } });
    if (!manager || manager.role !== 'MANAGER') {
      res.status(400).json({ error: 'Invalid manager ID' });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      role,
      department,
      position,
      employeeId,
      managerId: managerId || null,
      gender: gender ?? null,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      department: true,
      position: true,
      employeeId: true,
      managerId: true,
      gender: true,
      createdAt: true,
      manager: { select: { id: true, fullName: true } },
    },
  });

  // Create default annual leave balance for new employee
  const annualLeave = await prisma.leaveType.findFirst({ where: { name: 'Annual Leave' } });
  if (annualLeave) {
    await prisma.leaveBalance.create({
      data: {
        userId: user.id,
        leaveTypeId: annualLeave.id,
        year: new Date().getFullYear(),
        totalDays: 30,
        usedDays: 0,
      },
    });
  }

  res.status(201).json(user);
}

// ─── HR: Update user ─────────────────────────────────────────────────────────

export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const data: any = {};
  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.department !== undefined) data.department = parsed.data.department;
  if (parsed.data.position !== undefined) data.position = parsed.data.position;
  if (parsed.data.managerId !== undefined) data.managerId = parsed.data.managerId;
  if (parsed.data.gender !== undefined) data.gender = parsed.data.gender;

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      department: true,
      position: true,
      employeeId: true,
      managerId: true,
      gender: true,
      createdAt: true,
      manager: { select: { id: true, fullName: true } },
    },
  });

  res.json(user);
}

// ─── HR: Delete user (soft delete) ─────────────────────────────────────────

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Don't allow deleting yourself
  if (id === req.user!.userId) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  res.json({ message: 'User deactivated successfully' });
}

// ─── DRH: RESHUM Import / Sync ───────────────────────────────────────────────

const reshum_employeeSchema = z.object({
  employeeId: z.string().min(1).max(50),
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  department: z.string().min(1).max(100),
  position: z.string().min(1).max(100),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'DRH']).default('EMPLOYEE'),
  managerEmployeeId: z.string().optional(),
  leaveBalances: z.array(z.object({
    leaveTypeName: z.string().min(1),
    total: z.number().int().nonnegative(),
    used: z.number().int().nonnegative(),
    year: z.number().int().optional(),
  })).optional(),
});

const reshum_importSchema = z.array(reshum_employeeSchema).min(1).max(1000);

async function processRESHUMImport(
  employees: z.infer<typeof reshum_importSchema>,
  skipPasswordRehash: boolean,
  res: Response
) {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const errors: { employeeId: string; error: string }[] = [];

  const currentYear = new Date().getFullYear();

  // Build a map of employeeId -> internal id for manager resolution
  const existingUsers = await prisma.user.findMany({ select: { id: true, employeeId: true } });
  const empIdMap: Record<string, string> = {};
  for (const u of existingUsers) empIdMap[u.employeeId] = u.id;

  // First pass: upsert users (without manager link)
  for (const emp of employees) {
    try {
      const existing = await prisma.user.findFirst({ where: { employeeId: emp.employeeId } });

      const userData: any = {
        fullName: emp.fullName,
        email: emp.email,
        department: emp.department,
        position: emp.position,
        role: emp.role === 'DRH' ? 'ADMIN' : emp.role,
      };

      if (existing) {
        if (!skipPasswordRehash && emp.password) {
          userData.passwordHash = await bcrypt.hash(emp.password, 12);
        }
        await prisma.user.update({ where: { id: existing.id }, data: userData });
        empIdMap[emp.employeeId] = existing.id;
        updated.push(emp.employeeId);
      } else {
        const rawPassword = emp.password ?? emp.employeeId; // default password = employeeId
        userData.passwordHash = await bcrypt.hash(rawPassword, 12);
        userData.employeeId = emp.employeeId;
        const created_user = await prisma.user.create({ data: userData });
        empIdMap[emp.employeeId] = created_user.id;
        created.push(emp.employeeId);
      }
    } catch (err: any) {
      errors.push({ employeeId: emp.employeeId, error: err.message ?? 'Unknown error' });
    }
  }

  // Second pass: resolve manager links
  for (const emp of employees) {
    if (!emp.managerEmployeeId) continue;
    const userId = empIdMap[emp.employeeId];
    const managerId = empIdMap[emp.managerEmployeeId];
    if (!userId || !managerId) continue;
    try {
      await prisma.user.update({ where: { id: userId }, data: { managerId } });
    } catch {
      // Non-fatal
    }
  }

  // Third pass: upsert leave balances
  for (const emp of employees) {
    if (!emp.leaveBalances?.length) continue;
    const userId = empIdMap[emp.employeeId];
    if (!userId) continue;

    for (const bal of emp.leaveBalances) {
      try {
        const leaveType = await prisma.leaveType.findFirst({ where: { name: bal.leaveTypeName } });
        if (!leaveType) continue;
        const year = bal.year ?? currentYear;
        await prisma.leaveBalance.upsert({
          where: { userId_leaveTypeId_year: { userId, leaveTypeId: leaveType.id, year } },
          create: { userId, leaveTypeId: leaveType.id, year, totalDays: bal.total, usedDays: bal.used },
          update: { totalDays: bal.total, usedDays: bal.used },
        });
      } catch {
        // Non-fatal
      }
    }
  }

  res.json({ created: created.length, updated: updated.length, skipped: skipped.length, errors });
}

// ─── RESHUM: Return configured endpoint info (no secrets) ────────────────────

export function getReshumConfig(_req: Request, res: Response): void {
  const configured = !!env.RESHUM_API_URL;
  res.json({
    configured,
    url: configured ? env.RESHUM_API_URL : null,
    hasApiKey: !!env.RESHUM_API_KEY,
  });
}

// ─── RESHUM: Fetch employees from the configured API URL ─────────────────────

export async function fetchReshumFromApi(_req: Request, res: Response): Promise<void> {
  if (!env.RESHUM_API_URL) {
    res.status(503).json({ error: 'RESHUM_API_URL is not configured on the server' });
    return;
  }

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (env.RESHUM_API_KEY) {
    headers['Authorization'] = `Bearer ${env.RESHUM_API_KEY}`;
  }

  let upstreamRes: globalThis.Response;
  try {
    upstreamRes = await fetch(env.RESHUM_API_URL, { headers, signal: AbortSignal.timeout(15_000) });
  } catch (err: any) {
    res.status(502).json({ error: `Could not reach RESHUM API: ${err.message}` });
    return;
  }

  if (!upstreamRes.ok) {
    res.status(502).json({ error: `RESHUM API returned HTTP ${upstreamRes.status}` });
    return;
  }

  let data: unknown;
  try {
    data = await upstreamRes.json();
  } catch {
    res.status(502).json({ error: 'RESHUM API response is not valid JSON' });
    return;
  }

  const parsed = reshum_importSchema.safeParse(data);
  if (!parsed.success) {
    res.status(422).json({ error: 'RESHUM API response does not match expected format', details: parsed.error.errors });
    return;
  }

  res.json({ employees: parsed.data, count: parsed.data.length });
}

export async function importEmployees(req: Request, res: Response): Promise<void> {
  const parsed = reshum_importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    return;
  }
  await processRESHUMImport(parsed.data, false, res);
}

export async function syncEmployees(req: Request, res: Response): Promise<void> {
  const parsed = reshum_importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    return;
  }
  await processRESHUMImport(parsed.data, true, res);
}

