/**
 * RESHUM ↔ local DB synchronisation helpers.
 *
 * The mock RESHUM service holds the authoritative annual leave allowance
 * for each employee. On the first annual leave request of a given year we
 * pull that allowance into the local `LeaveBalance` so that subsequent
 * checks (which are pending-aware and frequent) can run against the DB.
 *
 * An admin can also force a refresh via the "Sync from RESHUM" button.
 */

import { prisma } from '../config/db.js';
import { reshum } from './reshum.service.js';

const ANNUAL_LEAVE_NAME = 'Annual Leave';

/**
 * Ensure the user's annual `LeaveBalance` for the given year is seeded
 * from RESHUM. Returns the (possibly created) balance row, or `null`
 * when the user is not registered in RESHUM.
 *
 * - If a row already exists for that year, it is returned untouched
 *   unless `force=true`, in which case its `totalDays` is refreshed
 *   from RESHUM (and `usedDays` left intact).
 */
export async function syncAnnualBalanceFromReshum(
  userId: string,
  year: number = new Date().getFullYear(),
  force = false,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const annualType = await prisma.leaveType.findUnique({ where: { name: ANNUAL_LEAVE_NAME } });
  if (!annualType) return null;

  const existing = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId: annualType.id, year } },
  });

  if (existing && !force) return existing;

  const remoteEmployee = await reshum.getEmployee(user.employeeId);
  if (!remoteEmployee) return existing ?? null;

  const total = remoteEmployee.balances.annual.total;
  const used = remoteEmployee.balances.annual.used;

  if (existing) {
    return prisma.leaveBalance.update({
      where: { id: existing.id },
      data: { totalDays: total },
    });
  }

  return prisma.leaveBalance.create({
    data: {
      userId,
      leaveTypeId: annualType.id,
      year,
      totalDays: total,
      usedDays: used,
    },
  });
}
