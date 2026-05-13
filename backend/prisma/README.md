# Database — Setup & Reference

## Prerequisites

- PostgreSQL 18 running on `127.0.0.1:5432`
- Database `pfe2_leaves` created (`createdb -U postgres pfe2_leaves`)
- `backend/.env` configured (copy from `.env.example`)

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/pfe2_leaves"
```

---

## Commands

Run all commands from the `backend/` directory.

| Action | Command |
|---|---|
| Apply migrations (dev) | `npm run db:migrate` |
| Seed demo data | `npm run db:seed` |
| Reset DB + re-seed | `npm run db:reset` |
| Open Prisma Studio | `npm run db:studio` |

> **Re-seeding is safe** — the seed script deletes all existing data before inserting.

---

## Schema Overview

```
User
 ├── LeaveBalance[]       (quota per type per year)
 ├── LeaveRequest[]       (requests submitted by this user)
 ├── RequestAction[]      (audit log entries made by this user)
 └── Notification[]       (alerts sent to this user)

LeaveType
 ├── LeaveBalance[]
 └── LeaveRequest[]

LeaveRequest
 ├── RequestAction[]      (full audit trail for this request)
 └── Notification[]       (alerts triggered by this request)

BalanceAdjustment         (admin manual balance corrections)
```

### Approval Workflow

```
[Employee submits]
       │
       ▼
 PENDING_MANAGER  ──(reject)──▶  REJECTED_BY_MANAGER
       │
  (approve)
       │
       ▼
 PENDING_ADMIN    ──(assign HR)──▶  PENDING_HR_ACCEPT
       │                                    │
       │                              (HR accepts)
       ▼                                    │
 PENDING_HR  ◀──────────────────────────────┘
       │
  (process)
       ├──(needs doc)──▶  AWAITING_DOCUMENT ──(received)──┐
       │                                                    │
       ▼◀───────────────────────────────────────────────────┘
   RESERVED
       │
  (finalise)
       ▼
   TREATED  ✓

   Any stage: CANCEL → CANCELLED
```

---

## Leave Types (Algerian Labour Law)

| Name | Days | Scope | Gender | Unit |
|---|---|---|---|---|
| Annual Leave | 30 | Annual | All | Business days |
| Justified Absence | Unlimited | Unlimited | All | Business days |
| Death of Close Relative | 3 | Per occurrence | All | Business days |
| Maternity Leave | 150 | Per occurrence | Female | Calendar days |
| Paternity Leave | 3 | Per occurrence | Male | Business days |
| Mission Leave | Unlimited | Unlimited | All | Business days |
| Pilgrimage Leave | 30 | Once per career | All | Business days |
| Marriage Leave | 15 | Once per career | All | Business days |
| Circumcision Leave | 3 | Per occurrence | All | Business days |

---

## Demo Accounts

All accounts use password: **`password123`**

### Admin

| Email | Name | Role |
|---|---|---|
| admin@sonatrach.dz | Mouloud Ouali | ADMIN (HR Director) |

### Managers

| Email | Name | Department |
|---|---|---|
| manager1@sonatrach.dz | Karim Hadj-Ahmed | Exploration & Production |
| manager2@sonatrach.dz | Nour-Eddine Benmansour | Finance & Accounting |
| manager3@sonatrach.dz | Leila Hamadouche | Information Technology |
| manager4@sonatrach.dz | Mourad Benkhaled | Legal & Compliance |

### HR Officers

| Email | Name |
|---|---|
| fatima@sonatrach.dz | Fatima Hadj |
| nadia@sonatrach.dz | Nadia Cherif |
| tarek@sonatrach.dz | Tarek Meziani |

### Employees

| Email | Name | Department | Manager |
|---|---|---|---|
| ahmed@sonatrach.dz | Ahmed Benali | Exploration & Production | manager1 |
| sara@sonatrach.dz | Sara Mansouri | Exploration & Production | manager1 |
| youcef@sonatrach.dz | Youcef Khelifi | Exploration & Production | manager1 |
| amira@sonatrach.dz | Amira Boudiaf | Exploration & Production | manager1 |
| khalid@sonatrach.dz | Khalid Ouchen | Exploration & Production | manager1 |
| bilal@sonatrach.dz | Bilal Ferhat | Finance & Accounting | manager2 |
| lyna@sonatrach.dz | Lyna Ait-Saadi | Finance & Accounting | manager2 |
| hocine@sonatrach.dz | Hocine Taleb | Finance & Accounting | manager2 |
| djamel@sonatrach.dz | Djamel Haddad | Finance & Accounting | manager2 |
| soumia@sonatrach.dz | Soumia Kaci | Finance & Accounting | manager2 |
| rania@sonatrach.dz | Rania Zidane | Information Technology | manager3 |
| mehdi@sonatrach.dz | Mehdi Larbi | Information Technology | manager3 |
| sofiane@sonatrach.dz | Sofiane Abed | Information Technology | manager3 |
| yasmine@sonatrach.dz | Yasmine Djebbar | Information Technology | manager3 |
| hamza@sonatrach.dz | Hamza Sellami | Legal & Compliance | manager4 |
| meriem@sonatrach.dz | Meriem Bouzid | Legal & Compliance | manager4 |
| nassim@sonatrach.dz | Nassim Hadjadj | Legal & Compliance | manager4 |

---

## Seeded Request Distribution

| Status | Count | Description |
|---|---|---|
| TREATED | ~28 | Jan–Apr 2026 — fully processed historical requests |
| REJECTED_BY_MANAGER | 5 | Past rejections with comments |
| CANCELLED | 1 | Employee cancelled before processing |
| RESERVED | 4 | May 2026 — HR has reserved the dates |
| PENDING_HR | 4 | May 2026 — assigned to HR, being processed |
| PENDING_ADMIN | 5 | May 2026 — manager approved, admin must assign HR |
| PENDING_MANAGER | 6 | Jun–Jul 2026 — freshly submitted, awaiting manager |

---

## Migrations

Migration files are located in `prisma/migrations/`. They are applied in order by `prisma migrate dev` or `prisma migrate deploy` (for production).

To create a new migration after editing `schema.prisma`:
```bash
npx prisma migrate dev --name describe_your_change
```
