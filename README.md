# Sonatrach Leave Management System

Internal HR leave-request portal for Sonatrach employees.
Employees submit leave requests that flow through a multi-step approval pipeline: **Manager → Admin (HR Director) → HR Officer**.

---

## Project Structure

```
pfe2/
├── backend/          Express + Prisma API server (Node.js / TypeScript)
│   ├── prisma/       Database schema, migrations, and seed data
│   ├── src/          Application source (routes, controllers, services…)
│   └── uploads/      Uploaded supporting documents (PDFs)
└── frontend/         React + Vite SPA (TypeScript + Tailwind CSS)
    └── src/          Components, pages, context, API client…
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express 5, TypeScript, tsx |
| Database | PostgreSQL 18 |
| ORM | Prisma 6 |
| Auth | JWT (jsonwebtoken) + bcrypt |

---

## Prerequisites

Install these before anything else:

- **Node.js** v18 or higher — https://nodejs.org
- **npm** v9 or higher (comes with Node.js)
- **PostgreSQL 18** — https://www.postgresql.org/download/  
  During install, set the `postgres` user password to `postgres` (or update `.env` later).

---

## 1 — Database Setup

### 1.1 Create the database

Open a terminal and run:

```bash
# Windows (PostgreSQL installed to default path)
"C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres pfe2_leaves
```

You will be prompted for the `postgres` password.

### 1.2 Configure the environment

```bash
cd backend
copy .env.example .env
```

Open `backend/.env` and verify the connection string matches your setup:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/pfe2_leaves"
JWT_SECRET="change-me-in-production-use-strong-random-key"
PORT=3001
UPLOAD_DIR="./uploads"
CORS_ORIGIN="http://localhost:5173"
```

> **Note:** Use `127.0.0.1` instead of `localhost` — PostgreSQL on Windows may not resolve `localhost` correctly.

### 1.3 Install backend dependencies

```bash
cd backend
npm install
```

### 1.4 Apply migrations

```bash
npm run db:migrate
```

This creates all tables in `pfe2_leaves` based on `prisma/schema.prisma`.

### 1.5 Seed demo data

```bash
npm run db:seed
```

This populates the database with 25 demo accounts, 9 leave types, and 50+ leave requests across all workflow stages.

**All demo accounts use password: `password123`**

| Role | Email |
|---|---|
| Admin (HR Director) | admin@sonatrach.dz |
| Manager — E&P | manager1@sonatrach.dz |
| Manager — Finance | manager2@sonatrach.dz |
| Manager — IT | manager3@sonatrach.dz |
| Manager — Legal | manager4@sonatrach.dz |
| HR Officer | fatima@sonatrach.dz |
| HR Officer | nadia@sonatrach.dz |
| HR Officer | tarek@sonatrach.dz |
| Employee (E&P) | ahmed / sara / youcef / amira / khalid @sonatrach.dz |
| Employee (Finance) | bilal / lyna / hocine / djamel / soumia @sonatrach.dz |
| Employee (IT) | rania / mehdi / sofiane / yasmine @sonatrach.dz |
| Employee (Legal) | hamza / meriem / nassim @sonatrach.dz |

> See `backend/prisma/README.md` for the full accounts table and database reference.

---

## 2 — Run the Backend

```bash
cd backend
npm run dev
```

The API server starts at **http://localhost:3001**

To verify it is running:

```bash
curl http://localhost:3001/health
```

### Other backend commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with auto-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed / re-seed demo data |
| `npm run db:reset` | Drop all tables, re-migrate, re-seed |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## 3 — Run the Frontend

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

The app opens at **http://localhost:5173**

### Other frontend commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Build optimised production bundle to `dist/` |

---

## 4 — Running Everything at Once

Open **two terminals side by side**:

**Terminal 1 — Backend**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## 5 — First-Time Full Setup (Quick Copy-Paste)

```bash
# 1. Create database (run once)
"C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres pfe2_leaves

# 2. Backend
cd backend
copy .env.example .env
npm install
npm run db:migrate
npm run db:seed

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev

# 4. Start backend (new terminal)
cd backend
npm run dev
```

---

## 6 — Resetting the Database

If you need a clean slate (drop everything and re-seed from scratch):

```bash
cd backend
npm run db:reset
```

> This is destructive — all data will be lost and replaced with fresh seed data.

---

## Approval Workflow

```
Employee submits request
        │
        ▼
  PENDING_MANAGER  ──(reject)──▶  REJECTED_BY_MANAGER
        │
   (approve)
        ▼
  PENDING_ADMIN    ──(assign HR)──▶  PENDING_HR
        │
   (HR processes)
        ▼
    RESERVED  ──(finalise)──▶  TREATED ✓

  Any stage: employee may cancel → CANCELLED
```

---

## Ports

| Service | URL |
|---|---|
| Frontend (dev) | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| Prisma Studio | http://localhost:5555 (when running `db:studio`) |
