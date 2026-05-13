import { Request, Response } from 'express';
import { z } from 'zod';
import { reshum, type ReshumCategory } from '../services/reshum.service.js';

const categoryEnum = z.enum(['annual', 'recovery', 'sick', 'maternity']);

const deductSchema = z.object({
  employeeId: z.string().min(1),
  category: categoryEnum,
  days: z.number().int().positive(),
});

const creditSchema = z.object({
  employeeId: z.string().min(1),
  days: z.number().int().positive(),
});

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const employeeId = req.params.employeeId as string;
  const emp = await reshum.getEmployee(employeeId);
  if (!emp) {
    res.status(404).json({ error: `Employee ${employeeId} not found in RESHUM` });
    return;
  }
  res.json(emp);
}

export async function listEmployees(_req: Request, res: Response): Promise<void> {
  const list = await reshum.list();
  res.json(list);
}

export async function deduct(req: Request, res: Response): Promise<void> {
  const parsed = deductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { employeeId, category, days } = parsed.data;
  const result = await reshum.deduct(employeeId, category as ReshumCategory, days);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.employee);
}

export async function creditRecovery(req: Request, res: Response): Promise<void> {
  const parsed = creditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { employeeId, days } = parsed.data;
  const result = await reshum.creditRecovery(employeeId, days);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.employee);
}

export async function getState(_req: Request, res: Response): Promise<void> {
  const state = await reshum.getState();
  res.json(state);
}

export async function reset(_req: Request, res: Response): Promise<void> {
  const state = await reshum.reset();
  res.json(state);
}
