// =============================================================================
// Sonatrach Leave Management System — Database Seed
// =============================================================================
//
// Purpose : Populates the database with realistic demo data for development
//           and testing. Safe to re-run: clears all existing data first.
//
// Run     : npx prisma db seed
//        OR: cd backend && npm run db:seed
//
// ── DEMO ACCOUNTS (all passwords: password123) ─────────────────────────────
//
//   Role     Email                        Name
//   ──────── ──────────────────────────── ─────────────────────────────────
//   ADMIN    admin@sonatrach.dz           Mouloud Ouali (HR Director)
//
//   MANAGER  manager1@sonatrach.dz        Karim Hadj-Ahmed      (E&P)
//   MANAGER  manager2@sonatrach.dz        Nour-Eddine Benmansour(Finance)
//   MANAGER  manager3@sonatrach.dz        Leila Hamadouche      (IT)
//   MANAGER  manager4@sonatrach.dz        Mourad Benkhaled      (Legal)
//
//   HR       fatima@sonatrach.dz          Fatima Hadj
//   HR       nadia@sonatrach.dz           Nadia Cherif
//   HR       tarek@sonatrach.dz           Tarek Meziani
//
//   EMPLOYEE ahmed@sonatrach.dz           Ahmed Benali          (E&P)
//   EMPLOYEE sara@sonatrach.dz            Sara Mansouri         (E&P)
//   EMPLOYEE youcef@sonatrach.dz          Youcef Khelifi        (E&P)
//   EMPLOYEE amira@sonatrach.dz           Amira Boudiaf         (E&P)
//   EMPLOYEE khalid@sonatrach.dz          Khalid Ouchen         (E&P)
//   EMPLOYEE bilal@sonatrach.dz           Bilal Ferhat          (Finance)
//   EMPLOYEE lyna@sonatrach.dz            Lyna Ait-Saadi        (Finance)
//   EMPLOYEE hocine@sonatrach.dz          Hocine Taleb          (Finance)
//   EMPLOYEE djamel@sonatrach.dz          Djamel Haddad         (Finance)
//   EMPLOYEE soumia@sonatrach.dz          Soumia Kaci           (Finance)
//   EMPLOYEE rania@sonatrach.dz           Rania Zidane          (IT)
//   EMPLOYEE mehdi@sonatrach.dz           Mehdi Larbi           (IT)
//   EMPLOYEE sofiane@sonatrach.dz         Sofiane Abed          (IT)
//   EMPLOYEE yasmine@sonatrach.dz         Yasmine Djebbar       (IT)
//   EMPLOYEE hamza@sonatrach.dz           Hamza Sellami         (Legal)
//   EMPLOYEE meriem@sonatrach.dz          Meriem Bouzid         (Legal)
//   EMPLOYEE nassim@sonatrach.dz          Nassim Hadjadj        (Legal)
//
// ── SEEDED DATA SUMMARY ────────────────────────────────────────────────────
//   • 25 users  (1 admin + 4 managers + 3 HR + 17 employees)
//   • 9  leave types (Algerian labour law)
//   • Leave balances for all users for 2026
//   • 50+ leave requests spanning Jan–Jul 2026 across all statuses
//   • In-app notifications for managers, admin, and HR officers
//
// =============================================================================

import { PrismaClient, Role, LeaveStatus, ActionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Shorthand to create a Date in 2026 (month is 0-indexed like `new Date`). */
const d = (month: number, day: number) => new Date(2026, month, day);

/**
 * Creates a leave request that has gone through the full workflow and is TREATED.
 * Action chain: manager APPROVE → admin ASSIGN → HR RESERVE → HR TREAT
 */
async function createTreatedRequest(
  userId: string,
  leaveTypeId: string,
  start: Date,
  end: Date,
  days: number,
  reason: string,
  managerId: string,
  adminId: string,
  hrId: string,
  reservedById: string,
  managerComment = 'Approved.',
) {
  const req = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId,
      startDate: start,
      endDate: end,
      daysCount: days,
      reason,
      status: 'TREATED',
      reservedById,
      assignedHrId: hrId,
    },
  });
  await prisma.requestAction.createMany({
    data: [
      { requestId: req.id, actorId: managerId, action: 'APPROVE',  comment: managerComment },
      { requestId: req.id, actorId: adminId,   action: 'ASSIGN',   comment: 'Assigned to HR.' },
      { requestId: req.id, actorId: hrId,      action: 'RESERVE',  comment: null },
      { requestId: req.id, actorId: hrId,      action: 'TREAT',    comment: 'Processed.' },
    ],
  });
  return req;
}

/**
 * Creates a leave request that was rejected by the manager.
 * Action chain: manager REJECT
 */
async function createRejectedRequest(
  userId: string,
  leaveTypeId: string,
  start: Date,
  end: Date,
  days: number,
  reason: string,
  managerId: string,
  rejectComment: string,
) {
  const req = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId,
      startDate: start,
      endDate: end,
      daysCount: days,
      reason,
      status: 'REJECTED_BY_MANAGER',
    },
  });
  await prisma.requestAction.create({
    data: { requestId: req.id, actorId: managerId, action: 'REJECT', comment: rejectComment },
  });
  return req;
}

/**
 * Creates a leave request that the manager approved but the admin has not yet
 * assigned to an HR officer (status: PENDING_ADMIN).
 * Action chain: manager APPROVE
 */
async function createPendingAdminRequest(
  userId: string,
  leaveTypeId: string,
  start: Date,
  end: Date,
  days: number,
  reason: string,
  managerId: string,
) {
  const req = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId,
      startDate: start,
      endDate: end,
      daysCount: days,
      reason,
      status: 'PENDING_ADMIN',
    },
  });
  await prisma.requestAction.create({
    data: { requestId: req.id, actorId: managerId, action: 'APPROVE', comment: 'Approved.' },
  });
  return req;
}

/**
 * Creates a leave request that has been assigned to an HR officer who is
 * actively processing it (status: PENDING_HR).
 * Action chain: manager APPROVE → admin ASSIGN
 */
async function createPendingHRRequest(
  userId: string,
  leaveTypeId: string,
  start: Date,
  end: Date,
  days: number,
  reason: string,
  managerId: string,
  adminId: string,
  hrId: string,
) {
  const req = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId,
      startDate: start,
      endDate: end,
      daysCount: days,
      reason,
      status: 'PENDING_HR',
      assignedHrId: hrId,
    },
  });
  await prisma.requestAction.createMany({
    data: [
      { requestId: req.id, actorId: managerId, action: 'APPROVE', comment: 'Approved.' },
      { requestId: req.id, actorId: adminId,   action: 'ASSIGN',  comment: 'Assigned to HR.' },
    ],
  });
  return req;
}

/**
 * Creates a leave request where HR has reserved the dates but not yet finalised
 * (status: RESERVED).
 * Action chain: manager APPROVE → admin ASSIGN → HR RESERVE
 */
async function createReservedRequest(
  userId: string,
  leaveTypeId: string,
  start: Date,
  end: Date,
  days: number,
  reason: string,
  managerId: string,
  adminId: string,
  hrId: string,
) {
  const req = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId,
      startDate: start,
      endDate: end,
      daysCount: days,
      reason,
      status: 'RESERVED',
      reservedById: hrId,
      assignedHrId: hrId,
    },
  });
  await prisma.requestAction.createMany({
    data: [
      { requestId: req.id, actorId: managerId, action: 'APPROVE', comment: 'Approved.' },
      { requestId: req.id, actorId: adminId,   action: 'ASSIGN',  comment: 'Assigned to HR.' },
      { requestId: req.id, actorId: hrId,      action: 'RESERVE', comment: 'Dates reserved.' },
    ],
  });
  return req;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Sonatrach Leave System — Database Seed');
  console.log('═══════════════════════════════════════════════════════════════');

  // ── 1. CLEAN EXISTING DATA ─────────────────────────────────────────────────
  // Delete in dependency order (children before parents) to avoid FK violations.
  console.log('\n[1/5] Clearing existing data...');
  await prisma.balanceAdjustment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.requestAction.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.user.deleteMany();
  console.log('      ✓ All tables cleared');

  const passwordHash = await bcrypt.hash('password123', 12);

  // ── 2. USERS ───────────────────────────────────────────────────────────────
  console.log('\n[2/5] Creating users...');

  // ── Admin (HR Director) ─────────────────────────────────────────────────────
  const adminUser = await prisma.user.create({
    data: {
      email:      'admin@sonatrach.dz',
      passwordHash,
      fullName:   'Mouloud Ouali',
      role:       Role.ADMIN,
      department: 'Human Resources',
      position:   'Director of Human Resources',
      employeeId: 'SH-ADMIN-001',
      gender:     'MALE',
    },
  });

  // ── Managers ────────────────────────────────────────────────────────────────
  const manager1 = await prisma.user.create({
    data: {
      email: 'manager1@sonatrach.dz', passwordHash,
      fullName: 'Karim Hadj-Ahmed', role: Role.MANAGER,
      department: 'Exploration & Production', position: 'E&P Operations Manager',
      employeeId: 'SH-MGR-0001', gender: 'MALE',
    },
  });
  const manager2 = await prisma.user.create({
    data: {
      email: 'manager2@sonatrach.dz', passwordHash,
      fullName: 'Nour-Eddine Benmansour', role: Role.MANAGER,
      department: 'Finance & Accounting', position: 'Finance Manager',
      employeeId: 'SH-MGR-0002', gender: 'MALE',
    },
  });
  const manager3 = await prisma.user.create({
    data: {
      email: 'manager3@sonatrach.dz', passwordHash,
      fullName: 'Leila Hamadouche', role: Role.MANAGER,
      department: 'Information Technology', position: 'IT Manager',
      employeeId: 'SH-MGR-0003', gender: 'FEMALE',
    },
  });
  const manager4 = await prisma.user.create({
    data: {
      email: 'manager4@sonatrach.dz', passwordHash,
      fullName: 'Mourad Benkhaled', role: Role.MANAGER,
      department: 'Legal & Compliance', position: 'Legal Affairs Manager',
      employeeId: 'SH-MGR-0004', gender: 'MALE',
    },
  });

  // ── HR Officers ─────────────────────────────────────────────────────────────
  const hrUser1 = await prisma.user.create({
    data: {
      email: 'fatima@sonatrach.dz', passwordHash,
      fullName: 'Fatima Hadj', role: Role.HR,
      department: 'Human Resources', position: 'HR Officer',
      employeeId: 'SH-HR-0001', gender: 'FEMALE',
    },
  });
  const hrUser2 = await prisma.user.create({
    data: {
      email: 'nadia@sonatrach.dz', passwordHash,
      fullName: 'Nadia Cherif', role: Role.HR,
      department: 'Human Resources', position: 'HR Officer',
      employeeId: 'SH-HR-0002', gender: 'FEMALE',
    },
  });
  const hrUser3 = await prisma.user.create({
    data: {
      email: 'tarek@sonatrach.dz', passwordHash,
      fullName: 'Tarek Meziani', role: Role.HR,
      department: 'Human Resources', position: 'HR Officer',
      employeeId: 'SH-HR-0003', gender: 'MALE',
    },
  });

  // ── Employees — Exploration & Production (reports to manager1) ───────────────
  const ahmed  = await prisma.user.create({ data: { email: 'ahmed@sonatrach.dz',   passwordHash, fullName: 'Ahmed Benali',      role: Role.EMPLOYEE, department: 'Exploration & Production', position: 'Senior Petroleum Engineer', employeeId: 'SH-EP-0892', managerId: manager1.id, gender: 'MALE'   } });
  const sara   = await prisma.user.create({ data: { email: 'sara@sonatrach.dz',    passwordHash, fullName: 'Sara Mansouri',     role: Role.EMPLOYEE, department: 'Exploration & Production', position: 'Geologist',                employeeId: 'SH-EP-0456', managerId: manager1.id, gender: 'FEMALE' } });
  const youcef = await prisma.user.create({ data: { email: 'youcef@sonatrach.dz',  passwordHash, fullName: 'Youcef Khelifi',    role: Role.EMPLOYEE, department: 'Exploration & Production', position: 'Field Engineer',           employeeId: 'SH-EP-0789', managerId: manager1.id, gender: 'MALE'   } });
  const amira  = await prisma.user.create({ data: { email: 'amira@sonatrach.dz',   passwordHash, fullName: 'Amira Boudiaf',     role: Role.EMPLOYEE, department: 'Exploration & Production', position: 'Drilling Engineer',        employeeId: 'SH-EP-0321', managerId: manager1.id, gender: 'FEMALE' } });
  const khalid = await prisma.user.create({ data: { email: 'khalid@sonatrach.dz',  passwordHash, fullName: 'Khalid Ouchen',     role: Role.EMPLOYEE, department: 'Exploration & Production', position: 'Reservoir Engineer',       employeeId: 'SH-EP-0543', managerId: manager1.id, gender: 'MALE'   } });

  // ── Employees — Finance & Accounting (reports to manager2) ──────────────────
  const bilal  = await prisma.user.create({ data: { email: 'bilal@sonatrach.dz',   passwordHash, fullName: 'Bilal Ferhat',      role: Role.EMPLOYEE, department: 'Finance & Accounting', position: 'Financial Analyst',  employeeId: 'SH-FIN-0101', managerId: manager2.id, gender: 'MALE'   } });
  const lyna   = await prisma.user.create({ data: { email: 'lyna@sonatrach.dz',    passwordHash, fullName: 'Lyna Ait-Saadi',    role: Role.EMPLOYEE, department: 'Finance & Accounting', position: 'Accountant',         employeeId: 'SH-FIN-0102', managerId: manager2.id, gender: 'FEMALE' } });
  const hocine = await prisma.user.create({ data: { email: 'hocine@sonatrach.dz',  passwordHash, fullName: 'Hocine Taleb',      role: Role.EMPLOYEE, department: 'Finance & Accounting', position: 'Budget Controller',  employeeId: 'SH-FIN-0103', managerId: manager2.id, gender: 'MALE'   } });
  const djamel = await prisma.user.create({ data: { email: 'djamel@sonatrach.dz',  passwordHash, fullName: 'Djamel Haddad',     role: Role.EMPLOYEE, department: 'Finance & Accounting', position: 'Treasury Officer',   employeeId: 'SH-FIN-0104', managerId: manager2.id, gender: 'MALE'   } });
  const soumia = await prisma.user.create({ data: { email: 'soumia@sonatrach.dz',  passwordHash, fullName: 'Soumia Kaci',       role: Role.EMPLOYEE, department: 'Finance & Accounting', position: 'Audit Officer',      employeeId: 'SH-FIN-0105', managerId: manager2.id, gender: 'FEMALE' } });

  // ── Employees — Information Technology (reports to manager3) ────────────────
  const rania   = await prisma.user.create({ data: { email: 'rania@sonatrach.dz',   passwordHash, fullName: 'Rania Zidane',    role: Role.EMPLOYEE, department: 'Information Technology', position: 'Full Stack Developer',  employeeId: 'SH-IT-0201', managerId: manager3.id, gender: 'FEMALE' } });
  const mehdi   = await prisma.user.create({ data: { email: 'mehdi@sonatrach.dz',   passwordHash, fullName: 'Mehdi Larbi',     role: Role.EMPLOYEE, department: 'Information Technology', position: 'Systems Administrator', employeeId: 'SH-IT-0202', managerId: manager3.id, gender: 'MALE'   } });
  const sofiane = await prisma.user.create({ data: { email: 'sofiane@sonatrach.dz', passwordHash, fullName: 'Sofiane Abed',    role: Role.EMPLOYEE, department: 'Information Technology', position: 'Network Engineer',      employeeId: 'SH-IT-0203', managerId: manager3.id, gender: 'MALE'   } });
  const yasmine = await prisma.user.create({ data: { email: 'yasmine@sonatrach.dz', passwordHash, fullName: 'Yasmine Djebbar', role: Role.EMPLOYEE, department: 'Information Technology', position: 'Cybersecurity Analyst', employeeId: 'SH-IT-0204', managerId: manager3.id, gender: 'FEMALE' } });

  // ── Employees — Legal & Compliance (reports to manager4) ────────────────────
  const hamza  = await prisma.user.create({ data: { email: 'hamza@sonatrach.dz',   passwordHash, fullName: 'Hamza Sellami',   role: Role.EMPLOYEE, department: 'Legal & Compliance', position: 'Legal Counsel',       employeeId: 'SH-LEG-0301', managerId: manager4.id, gender: 'MALE'   } });
  const meriem = await prisma.user.create({ data: { email: 'meriem@sonatrach.dz',  passwordHash, fullName: 'Meriem Bouzid',   role: Role.EMPLOYEE, department: 'Legal & Compliance', position: 'Compliance Officer',  employeeId: 'SH-LEG-0302', managerId: manager4.id, gender: 'FEMALE' } });
  const nassim = await prisma.user.create({ data: { email: 'nassim@sonatrach.dz',  passwordHash, fullName: 'Nassim Hadjadj', role: Role.EMPLOYEE, department: 'Legal & Compliance', position: 'Contract Specialist', employeeId: 'SH-LEG-0303', managerId: manager4.id, gender: 'MALE'   } });

  console.log('      ✓ 25 users created (1 admin + 4 managers + 3 HR + 17 employees)');

  // ── 3. LEAVE TYPES ─────────────────────────────────────────────────────────
  // Based on Algerian labour law. Fixed-duration types have `fixedDuration` set;
  // annual quota types use `maxDays`; unlimited types have both as null.
  console.log('\n[3/5] Creating leave types...');

  const [
    annualLeave,        // 30 business days / year
    justifiedAbsence,   // Unlimited, requires certificate
    deathLeave,         // 3 business days per bereavement
    maternityLeave,     // 150 calendar days, females only
    paternityLeave,     // 3 business days, males only
    missionLeave,       // Unlimited, requires official mission order
    pilgrimageLeave,    // 30 business days, once per career
    marriageLeave,      // 15 business days, once per career
    circumcisionLeave,  // 3 business days per occurrence
  ] = await Promise.all([
    prisma.leaveType.create({ data: { name: 'Annual Leave',            maxDays: 30,   requiresDocument: false, quotaScope: 'ANNUAL',          durationUnit: 'BUSINESS_DAYS' } }),
    prisma.leaveType.create({ data: { name: 'Justified Absence',       maxDays: null, requiresDocument: true,  quotaScope: 'UNLIMITED',       durationUnit: 'BUSINESS_DAYS' } }),
    prisma.leaveType.create({ data: { name: 'Death of Close Relative', maxDays: null, requiresDocument: true,  quotaScope: 'PER_OCCURRENCE',  fixedDuration: 3,   durationUnit: 'BUSINESS_DAYS' } }),
    prisma.leaveType.create({ data: { name: 'Maternity Leave',         maxDays: null, requiresDocument: true,  quotaScope: 'PER_OCCURRENCE',  fixedDuration: 150, durationUnit: 'CALENDAR_DAYS', genderRestriction: 'FEMALE', cooldownDays: 365 } }),
    prisma.leaveType.create({ data: { name: 'Paternity Leave',         maxDays: null, requiresDocument: true,  quotaScope: 'PER_OCCURRENCE',  fixedDuration: 3,   durationUnit: 'BUSINESS_DAYS', genderRestriction: 'MALE' } }),
    prisma.leaveType.create({ data: { name: 'Mission Leave',           maxDays: null, requiresDocument: true,  quotaScope: 'UNLIMITED',       durationUnit: 'BUSINESS_DAYS' } }),
    prisma.leaveType.create({ data: { name: 'Pilgrimage Leave',        maxDays: null, requiresDocument: true,  quotaScope: 'ONCE_PER_CAREER', fixedDuration: 30,  durationUnit: 'BUSINESS_DAYS' } }),
    prisma.leaveType.create({ data: { name: 'Marriage Leave',          maxDays: null, requiresDocument: true,  quotaScope: 'ONCE_PER_CAREER', fixedDuration: 15,  durationUnit: 'BUSINESS_DAYS' } }),
    prisma.leaveType.create({ data: { name: 'Circumcision Leave',      maxDays: null, requiresDocument: true,  quotaScope: 'PER_OCCURRENCE',  fixedDuration: 3,   durationUnit: 'BUSINESS_DAYS' } }),
  ]);

  console.log('      ✓ 9 leave types created');

  // ── 4. LEAVE BALANCES ──────────────────────────────────────────────────────
  // Only quota-bounded types get balance rows (UNLIMITED types are excluded).
  // All employees, managers, HR, and admin receive a balance for 2026.
  console.log('\n[4/5] Creating leave balances...');

  const YEAR = 2026;
  const allUsers = [
    ahmed, sara, youcef, amira, khalid,          // E&P
    bilal, lyna, hocine, djamel, soumia,          // Finance
    rania, mehdi, sofiane, yasmine,               // IT
    hamza, meriem, nassim,                        // Legal
    manager1, manager2, manager3, manager4,       // Managers
    hrUser1, hrUser2, hrUser3,                    // HR
    adminUser,                                    // Admin
  ];

  // Leave types that have a finite quota (UNLIMITED types are excluded)
  const quotaBoundedTypes = [
    annualLeave, deathLeave, maternityLeave, paternityLeave,
    pilgrimageLeave, marriageLeave, circumcisionLeave,
  ];

  // Create a balance row for every user × bounded leave type
  for (const user of allUsers) {
    for (const lt of quotaBoundedTypes) {
      const total = lt.maxDays ?? lt.fixedDuration ?? 0;
      await prisma.leaveBalance.create({
        data: { userId: user.id, leaveTypeId: lt.id, year: YEAR, totalDays: total, usedDays: 0 },
      });
    }
  }

  // Apply realistic used-day totals to match the leave request history below
  const usageOverrides: { userId: string; leaveTypeId: string; usedDays: number }[] = [
    // Annual leave consumption
    { userId: ahmed.id,    leaveTypeId: annualLeave.id, usedDays: 8  },
    { userId: sara.id,     leaveTypeId: annualLeave.id, usedDays: 15 },
    { userId: youcef.id,   leaveTypeId: annualLeave.id, usedDays: 12 },
    { userId: amira.id,    leaveTypeId: annualLeave.id, usedDays: 3  },
    { userId: khalid.id,   leaveTypeId: annualLeave.id, usedDays: 5  },
    { userId: bilal.id,    leaveTypeId: annualLeave.id, usedDays: 7  },
    { userId: lyna.id,     leaveTypeId: annualLeave.id, usedDays: 15 },
    { userId: hocine.id,   leaveTypeId: annualLeave.id, usedDays: 2  },
    { userId: djamel.id,   leaveTypeId: annualLeave.id, usedDays: 4  },
    { userId: soumia.id,   leaveTypeId: annualLeave.id, usedDays: 6  },
    { userId: rania.id,    leaveTypeId: annualLeave.id, usedDays: 10 },
    { userId: mehdi.id,    leaveTypeId: annualLeave.id, usedDays: 6  },
    { userId: sofiane.id,  leaveTypeId: annualLeave.id, usedDays: 9  },
    { userId: yasmine.id,  leaveTypeId: annualLeave.id, usedDays: 3  },
    { userId: hamza.id,    leaveTypeId: annualLeave.id, usedDays: 11 },
    { userId: meriem.id,   leaveTypeId: annualLeave.id, usedDays: 7  },
    { userId: nassim.id,   leaveTypeId: annualLeave.id, usedDays: 2  },
    { userId: manager1.id, leaveTypeId: annualLeave.id, usedDays: 4  },
    { userId: hrUser1.id,  leaveTypeId: annualLeave.id, usedDays: 9  },
    { userId: adminUser.id,leaveTypeId: annualLeave.id, usedDays: 2  },
    // Special leave consumption
    { userId: lyna.id,   leaveTypeId: marriageLeave.id,    usedDays: 15 }, // Got married Feb
    { userId: hamza.id,  leaveTypeId: marriageLeave.id,    usedDays: 15 }, // Got married Jan
    { userId: youcef.id, leaveTypeId: paternityLeave.id,   usedDays: 3  }, // Child born Feb
    { userId: sara.id,   leaveTypeId: maternityLeave.id,   usedDays: 98 }, // Maternity ongoing
    { userId: rania.id,  leaveTypeId: pilgrimageLeave.id,  usedDays: 30 }, // Pilgrimage completed
  ];

  for (const override of usageOverrides) {
    await prisma.leaveBalance.updateMany({
      where: { userId: override.userId, leaveTypeId: override.leaveTypeId, year: YEAR },
      data:  { usedDays: override.usedDays },
    });
  }

  console.log('      ✓ Leave balances created and usage applied');

  // ── 5. LEAVE REQUESTS & NOTIFICATIONS ─────────────────────────────────────
  // Requests span January–July 2026, covering every possible status.
  // Shortcuts for readability:
  console.log('\n[5/5] Creating leave requests and notifications...');

  const A  = adminUser.id;
  const M1 = manager1.id, M2 = manager2.id, M3 = manager3.id, M4 = manager4.id;
  const H1 = hrUser1.id,  H2 = hrUser2.id,  H3 = hrUser3.id;

  const AL  = annualLeave.id;
  const JA  = justifiedAbsence.id;
  const DL  = deathLeave.id;
  const ML  = maternityLeave.id;
  const PL  = paternityLeave.id;
  const MIS = missionLeave.id;
  const PIL = pilgrimageLeave.id;
  const MAR = marriageLeave.id;
  const CIR = circumcisionLeave.id;

  // ── January — all treated (historical) ──────────────────────────────────────
  await createTreatedRequest(ahmed.id,   AL,  d(0,8),  d(0,17), 8,  'Winter family trip to Tizi Ouzou',   M1, A, H1, H1, 'No conflicts. Approved.');
  await createTreatedRequest(bilal.id,   AL,  d(0,6),  d(0,10), 5,  'New Year break',                      M2, A, H3, H3);
  await createTreatedRequest(rania.id,   PIL, d(0,12), d(0,31), 20, 'Pilgrimage – partial',                M3, A, H2, H2, 'Documents verified.');
  await createTreatedRequest(hamza.id,   MAR, d(0,15), d(0,29), 15, 'Wedding ceremony',                    M4, A, H1, H1, 'Marriage certificate received.');
  await createTreatedRequest(sofiane.id, AL,  d(0,20), d(0,24), 5,  'Personal matters',                    M3, A, H2, H2);

  // ── February — treated ──────────────────────────────────────────────────────
  await createTreatedRequest(sara.id,    ML,  d(1,3),  d(1,28), 26, 'Maternity – first month',             M1, A, H2, H2, 'Medical certificate attached.');
  await createTreatedRequest(youcef.id,  PL,  d(1,10), d(1,12), 3,  'Birth of first child',                M1, A, H1, H1, 'Birth certificate verified.');
  await createTreatedRequest(lyna.id,    MAR, d(1,20), d(2,6),  15, 'Wedding',                             M2, A, H2, H2, 'All documents provided.');
  await createTreatedRequest(hocine.id,  AL,  d(1,3),  d(1,7),  5,  'Short break',                         M2, A, H3, H3);
  await createTreatedRequest(khalid.id,  DL,  d(1,14), d(1,16), 3,  'Passing of grandfather',              M1, A, H1, H1, 'Condolences. Approved.');
  await createTreatedRequest(meriem.id,  AL,  d(1,10), d(1,14), 5,  'Family visit to Constantine',         M4, A, H3, H3);
  await createTreatedRequest(djamel.id,  AL,  d(1,17), d(1,21), 5,  'Personal affairs',                    M2, A, H2, H2);

  // ── March — treated ─────────────────────────────────────────────────────────
  await createTreatedRequest(ahmed.id,   MIS, d(2,3),  d(2,7),  5,  'Field inspection at Hassi Messaoud',  M1, A, H1, H1, 'Mission validated.');
  await createTreatedRequest(bilal.id,   AL,  d(2,17), d(2,21), 5,  'Spring break',                        M2, A, H3, H3);
  await createTreatedRequest(rania.id,   AL,  d(2,9),  d(2,13), 5,  'Rest days',                           M3, A, H2, H2);
  await createTreatedRequest(nassim.id,  AL,  d(2,2),  d(2,6),  5,  'Vacation',                            M4, A, H1, H1);
  await createTreatedRequest(soumia.id,  JA,  d(2,20), d(2,20), 1,  'Medical consultation',                M2, A, H2, H2, 'Certificate provided.');
  await createTreatedRequest(yasmine.id, AL,  d(2,23), d(2,27), 5,  'Family trip',                         M3, A, H3, H3);

  // ── April — treated ─────────────────────────────────────────────────────────
  await createTreatedRequest(amira.id,   MIS, d(3,7),  d(3,11), 5,  'Drilling site visit at In Amenas',    M1, A, H1, H1, 'Mission confirmed.');
  await createTreatedRequest(mehdi.id,   AL,  d(3,1),  d(3,5),  5,  'End of Q1 break',                     M3, A, H2, H2);
  await createTreatedRequest(sara.id,    ML,  d(3,1),  d(3,30), 30, 'Maternity leave continued',           M1, A, H2, H2, 'Ongoing leave confirmed.');
  await createTreatedRequest(hamza.id,   AL,  d(3,14), d(3,18), 5,  'Spring holiday',                      M4, A, H3, H3);
  await createTreatedRequest(khalid.id,  AL,  d(3,21), d(3,25), 5,  'Rest days',                           M1, A, H1, H1);
  await createTreatedRequest(lyna.id,    AL,  d(3,7),  d(3,11), 5,  'Personal matters',                    M2, A, H2, H2);
  await createTreatedRequest(sofiane.id, MIS, d(3,14), d(3,18), 5,  "Data center upgrade at Hassi R'Mel",  M3, A, H3, H3, 'Mission approved.');

  // ── Rejected (past) ──────────────────────────────────────────────────────────
  await createRejectedRequest(youcef.id,  AL,  d(2,1),  d(2,5),  5, 'Rest',                    M1, 'Critical drilling phase – reschedule after April.');
  await createRejectedRequest(lyna.id,    JA,  d(3,14), d(3,14), 1, 'Medical appointment',     M2, 'Insufficient justification. Please resubmit with a certificate.');
  await createRejectedRequest(nassim.id,  AL,  d(2,23), d(2,27), 5, 'Short break',             M4, 'Contract negotiation period – cannot be absent.');
  await createRejectedRequest(djamel.id,  MIS, d(3,3),  d(3,5),  3, 'Audit trip to Oran',      M2, 'Mission not yet validated by Finance Director.');
  await createRejectedRequest(sofiane.id, AL,  d(1,27), d(1,31), 5, 'Vacation',                M3, 'Critical security patch deployment this week.');

  // ── Cancelled ───────────────────────────────────────────────────────────────
  const cancelledReq = await prisma.leaveRequest.create({
    data: { userId: mehdi.id, leaveTypeId: AL, startDate: d(3,21), endDate: d(3,25), daysCount: 5, reason: 'Trip to Algiers – cancelled', status: 'CANCELLED' },
  });
  await prisma.requestAction.create({
    data: { requestId: cancelledReq.id, actorId: mehdi.id, action: 'CANCEL', comment: 'Plans changed.' },
  });

  // ── RESERVED — HR is finalising (May 2026) ──────────────────────────────────
  await createReservedRequest(rania.id,  AL,  d(4,5),  d(4,14), 10, 'Family trip to Taghit',      M3, A, H1);
  await createReservedRequest(amira.id,  AL,  d(4,12), d(4,18), 7,  'Rest and recovery',          M1, A, H2);
  await createReservedRequest(soumia.id, AL,  d(4,19), d(4,23), 5,  'Personal travel',            M2, A, H3);
  await createReservedRequest(hamza.id,  MIS, d(4,5),  d(4,9),  5,  'Legal conference in Oran',   M4, A, H1);

  // ── PENDING_HR — assigned to HR, being processed (May 2026) ────────────────
  await createPendingHRRequest(mehdi.id,   AL,  d(5,1),  d(5,5),  5, 'Personal matters',            M3, A, H3);
  await createPendingHRRequest(youcef.id,  AL,  d(5,10), d(5,16), 7, 'Family vacation to Skikda',   M1, A, H1);
  await createPendingHRRequest(nassim.id,  MIS, d(5,12), d(5,16), 5, 'Contract review in Annaba',   M4, A, H2);
  await createPendingHRRequest(djamel.id,  AL,  d(5,19), d(5,23), 5, 'Spring break',                M2, A, H3);

  // ── PENDING_ADMIN — approved by manager, awaiting HR assignment (May 2026) ──
  await createPendingAdminRequest(hocine.id,  AL,  d(5,8),  d(5,10), 3,  'Short break',               M2);
  await createPendingAdminRequest(khalid.id,  AL,  d(5,19), d(5,23), 5,  'Fishing trip with family',  M1);
  await createPendingAdminRequest(yasmine.id, PIL, d(5,15), d(6,13), 30, 'Pilgrimage to Mecca',       M3);
  await createPendingAdminRequest(meriem.id,  AL,  d(5,26), d(5,30), 5,  'Visit to family in Setif',  M4);
  await createPendingAdminRequest(sofiane.id, CIR, d(5,20), d(5,22), 3,  'Circumcision ceremony',     M3);

  // ── PENDING_MANAGER — freshly submitted, awaiting manager (June–July 2026) ──
  const pm1 = await prisma.leaveRequest.create({ data: { userId: ahmed.id,   leaveTypeId: AL,  startDate: d(6,1),  endDate: d(6,5),  daysCount: 5, reason: 'Summer vacation',                    status: 'PENDING_MANAGER' } });
  const pm2 = await prisma.leaveRequest.create({ data: { userId: bilal.id,   leaveTypeId: AL,  startDate: d(6,10), endDate: d(6,16), daysCount: 7, reason: 'Family holiday to Biskra',           status: 'PENDING_MANAGER' } });
  const pm3 = await prisma.leaveRequest.create({ data: { userId: mehdi.id,   leaveTypeId: MIS, startDate: d(6,5),  endDate: d(6,9),  daysCount: 5, reason: 'Data center upgrade at Skikda',      status: 'PENDING_MANAGER' } });
  const pm4 = await prisma.leaveRequest.create({ data: { userId: nassim.id,  leaveTypeId: AL,  startDate: d(6,15), endDate: d(6,19), daysCount: 5, reason: 'Summer break',                       status: 'PENDING_MANAGER' } });
  const pm5 = await prisma.leaveRequest.create({ data: { userId: lyna.id,    leaveTypeId: AL,  startDate: d(6,22), endDate: d(6,26), daysCount: 5, reason: 'Family trip to Oran',                status: 'PENDING_MANAGER' } });
  const pm6 = await prisma.leaveRequest.create({ data: { userId: hamza.id,   leaveTypeId: AL,  startDate: d(7,7),  endDate: d(7,11), daysCount: 5, reason: 'Holiday',                            status: 'PENDING_MANAGER' } });

  // ── Notifications ────────────────────────────────────────────────────────────
  // Managers: alerted about new PENDING_MANAGER requests
  // Admin: alerted about PENDING_ADMIN requests that need HR assignment
  // HR: alerted about requests assigned to them
  const pendingAdminHocine  = await prisma.leaveRequest.findFirst({ where: { userId: hocine.id,  status: 'PENDING_ADMIN' }, orderBy: { createdAt: 'desc' } });
  const pendingAdminKhalid  = await prisma.leaveRequest.findFirst({ where: { userId: khalid.id,  status: 'PENDING_ADMIN' } });
  const pendingAdminYasmine = await prisma.leaveRequest.findFirst({ where: { userId: yasmine.id, status: 'PENDING_ADMIN' } });
  const pendingHRMehdi      = await prisma.leaveRequest.findFirst({ where: { userId: mehdi.id,   status: 'PENDING_HR'    } });
  const pendingHRYoucef     = await prisma.leaveRequest.findFirst({ where: { userId: youcef.id,  status: 'PENDING_HR'    } });

  await prisma.notification.createMany({
    data: [
      // Manager inboxes
      { userId: M1, requestId: pm1.id,                 message: 'Ahmed Benali submitted a leave request (Annual Leave)',          isRead: false },
      { userId: M2, requestId: pm2.id,                 message: 'Bilal Ferhat submitted a leave request (Annual Leave)',           isRead: false },
      { userId: M3, requestId: pm3.id,                 message: 'Mehdi Larbi submitted a mission leave request',                  isRead: false },
      { userId: M4, requestId: pm4.id,                 message: 'Nassim Hadjadj submitted a leave request (Annual Leave)',        isRead: false },
      { userId: M2, requestId: pm5.id,                 message: 'Lyna Ait-Saadi submitted a leave request (Annual Leave)',        isRead: false },
      { userId: M4, requestId: pm6.id,                 message: 'Hamza Sellami submitted a leave request (Annual Leave)',         isRead: false },
      // Admin inbox
      { userId: A,  requestId: pendingAdminHocine!.id,  message: "Hocine Taleb's request is awaiting HR assignment",              isRead: false },
      { userId: A,  requestId: pendingAdminKhalid!.id,  message: "Khalid Ouchen's request is awaiting HR assignment",             isRead: false },
      { userId: A,  requestId: pendingAdminYasmine!.id, message: "Yasmine Djebbar's pilgrimage request is awaiting HR assignment",isRead: false },
      // HR inboxes
      { userId: H3, requestId: pendingHRMehdi!.id,      message: "Mehdi Larbi's request has been assigned to you",                isRead: false },
      { userId: H1, requestId: pendingHRYoucef!.id,     message: "Youcef Khelifi's request has been assigned to you",             isRead: false },
    ],
  });

  console.log('      ✓ Leave requests created (50+ across all statuses)');
  console.log('      ✓ Notifications created');

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ✅ Seed complete!');
  console.log('  All accounts use password: password123');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  ADMIN    admin@sonatrach.dz');
  console.log('  MANAGER  manager1@sonatrach.dz  (Exploration & Production)');
  console.log('  MANAGER  manager2@sonatrach.dz  (Finance & Accounting)');
  console.log('  MANAGER  manager3@sonatrach.dz  (Information Technology)');
  console.log('  MANAGER  manager4@sonatrach.dz  (Legal & Compliance)');
  console.log('  HR       fatima@sonatrach.dz');
  console.log('  HR       nadia@sonatrach.dz');
  console.log('  HR       tarek@sonatrach.dz');
  console.log('  EMPLOYEE ahmed / sara / youcef / amira / khalid @sonatrach.dz');
  console.log('  EMPLOYEE bilal / lyna / hocine / djamel / soumia @sonatrach.dz');
  console.log('  EMPLOYEE rania / mehdi / sofiane / yasmine @sonatrach.dz');
  console.log('  EMPLOYEE hamza / meriem / nassim @sonatrach.dz');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

main()
  .catch((e) => {
    console.error('');
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

