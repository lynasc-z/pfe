import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
      position: user.position,
      employeeId: user.employeeId,
      gender: user.gender,
    },
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
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
      deletedAt: true,
      manager: { select: { id: true, fullName: true } },
    },
  });

  if (!user || user.deletedAt) {
    res.status(401).json({ error: 'User no longer active' });
    return;
  }

  const { deletedAt, ...safe } = user;
  res.json(safe);
}
