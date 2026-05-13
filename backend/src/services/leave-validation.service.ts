/**
 * Per-leave-type request validation.
 *
 * Centralises the rules that depend on `LeaveType.quotaScope`,
 * `fixedDuration`, `durationUnit`, `genderRestriction` and `cooldownDays`,
 * plus the supplemental hints from `config/leaveRules.ts`.
 *
 * Used by both `createLeaveRequest` and `editRequest`.
 */

import { prisma } from '../config/db.js';
import { countBusinessDays } from '../lib/businessDays.js';
import { getLeaveRule, type LeaveExtraField } from '../config/leaveRules.js';

export interface RuleExtras {
  destination?: string | null;
  missionType?: string | null;
  transport?: string | null;
  itinerary?: string | null;
  recoveryDate?: string | Date | null;
  weddingDate?: string | Date | null;
  childBirthDate?: string | Date | null;
  childName?: string | null;
  relationship?: string | null;
  reason?: string | null;
}

export interface ValidationOk {
  ok: true;
  /** End date computed/forced by the rule (e.g. fixed-duration types). */
  endDate: Date;
  /** Days count enforced by the rule. */
  daysCount: number;
  /** Cleaned reason (may be auto-prefilled). */
  reason: string | null;
}

export interface ValidationFail {
  ok: false;
  error: string;
}

/** Add `n` calendar days to `d` (returning a new Date). */
function addCalendarDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Add `n` business days (Sun–Thu) to `d`, returning the inclusive end date. */
function addBusinessDays(start: Date, n: number): Date {
  // n must be >= 1; result is a date such that countBusinessDays(start, end) === n
  if (n <= 0) return start;
  const cur = new Date(start);
  let counted = 0;
  // walk forward day-by-day until we have n business days inclusive
  while (counted < n) {
    const day = cur.getDay();
    // Algeria weekend: Friday (5) & Saturday (6)
    if (day !== 5 && day !== 6) counted++;
    if (counted < n) cur.setDate(cur.getDate() + 1);
  }
  return cur;
}

export async function validateLeaveRequest(args: {
  userId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  requestedDays: number;
  extras: RuleExtras;
  excludeRequestId?: string;
}): Promise<ValidationOk | ValidationFail> {
  const { userId, leaveTypeId, startDate, extras, excludeRequestId } = args;

  const [user, leaveType] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.leaveType.findUnique({ where: { id: leaveTypeId } }),
  ]);

  if (!user) return { ok: false, error: 'User not found' };
  if (!leaveType) return { ok: false, error: 'Invalid leave type' };

  const rule = getLeaveRule(leaveType.name);

  // ── 1. Gender restriction ─────────────────────────────────────────────────
  if (leaveType.genderRestriction && leaveType.genderRestriction !== user.gender) {
    return {
      ok: false,
      error: `${leaveType.name} is restricted to ${leaveType.genderRestriction.toLowerCase()} employees`,
    };
  }

  // ── 2. Lead time ─────────────────────────────────────────────────────────
  if (rule.minLeadTimeDays && rule.minLeadTimeDays > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = addCalendarDays(today, rule.minLeadTimeDays);
    if (startDate < earliest) {
      return {
        ok: false,
        error: `${leaveType.name} must be requested at least ${rule.minLeadTimeDays} days in advance`,
      };
    }
  }

  // ── 3. Duration: fixed or open-ended ─────────────────────────────────────
  let endDate = args.endDate;
  let daysCount = args.requestedDays;

  if (leaveType.fixedDuration && leaveType.fixedDuration > 0) {
    // The end date is derived from the rule, not from the client.
    if (leaveType.durationUnit === 'CALENDAR_DAYS') {
      endDate = addCalendarDays(startDate, leaveType.fixedDuration - 1);
      daysCount = leaveType.fixedDuration;
    } else {
      endDate = addBusinessDays(startDate, leaveType.fixedDuration);
      daysCount = leaveType.fixedDuration;
    }
  } else {
    // Variable duration → must be at least 1 business day; client-supplied
    // daysCount must match the count over the range (already validated upstream
    // for business-day types). For unlimited types this is fine as-is.
    if (daysCount < 1) {
      return { ok: false, error: 'Days count must be at least 1' };
    }
    if (leaveType.durationUnit === 'BUSINESS_DAYS') {
      const computed = countBusinessDays(startDate, endDate);
      if (computed === 0) {
        return { ok: false, error: 'Selected range contains no business days (Fri/Sat are weekends in Algeria)' };
      }
      if (daysCount !== computed) {
        return { ok: false, error: `Days count (${daysCount}) doesn't match business days in range (${computed})` };
      }
    }
  }

  // ── 4. Required extras ───────────────────────────────────────────────────
  for (const ex of rule.extras) {
    if (!ex.required) continue;
    const value = (extras as any)[ex.name];
    if (value === undefined || value === null || value === '') {
      return { ok: false, error: `Field "${ex.name}" is required for ${leaveType.name}` };
    }
  }

  // ── 5. Once-per-career ───────────────────────────────────────────────────
  if (leaveType.quotaScope === 'ONCE_PER_CAREER') {
    const prior = await prisma.leaveRequest.findFirst({
      where: {
        userId,
        leaveTypeId,
        status: { notIn: ['REJECTED_BY_MANAGER', 'CANCELLED'] },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
    });
    if (prior) {
      return {
        ok: false,
        error: `${leaveType.name} can only be taken once in your career`,
      };
    }
  }

  // ── 6. Cooldown window (e.g. maternity once per 12 months) ───────────────
  if (leaveType.cooldownDays && leaveType.cooldownDays > 0) {
    const cutoff = addCalendarDays(new Date(), -leaveType.cooldownDays);
    const recent = await prisma.leaveRequest.findFirst({
      where: {
        userId,
        leaveTypeId,
        status: { notIn: ['REJECTED_BY_MANAGER', 'CANCELLED'] },
        startDate: { gte: cutoff },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
    });
    if (recent) {
      return {
        ok: false,
        error: `${leaveType.name} cannot be requested more than once every ${leaveType.cooldownDays} days`,
      };
    }
  }

  // ── 7. Marriage window: startDate within ±15 days of weddingDate ─────────
  if (leaveType.name === 'Marriage Leave' && extras.weddingDate) {
    const wd = new Date(extras.weddingDate as any);
    const diff = Math.abs(startDate.getTime() - wd.getTime()) / (1000 * 60 * 60 * 24);
    if (diff > 15) {
      return { ok: false, error: 'Marriage leave start date must be within 15 days of the wedding date' };
    }
  }

  // ── 8. Paternity window: within 30 days of childBirthDate ────────────────
  if (leaveType.name === 'Paternity Leave' && extras.childBirthDate) {
    const bd = new Date(extras.childBirthDate as any);
    const diff = (startDate.getTime() - bd.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0 || diff > 30) {
      return { ok: false, error: 'Paternity leave must start within 30 days of the child\u2019s birth' };
    }
  }

  // ── 9. Reason handling ───────────────────────────────────────────────────
  let reason = extras.reason ?? null;
  if (rule.reason === 'required' && (!reason || !reason.trim())) {
    return { ok: false, error: `A reason is required for ${leaveType.name}` };
  }
  if (rule.reason === 'hidden' && rule.defaultReason) {
    reason = rule.defaultReason;
  }

  return { ok: true, endDate, daysCount, reason };
}

export type { LeaveExtraField };
