import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../../data/reshum-mock.json');
const SEED_FILE = path.resolve(__dirname, '../../../reshum-import.json');

export type ReshumCategory = 'annual' | 'recovery' | 'sick' | 'maternity';
export interface ReshumBalance { total: number; used: number; }
export interface ReshumEmployee {
  employeeId: string;
  fullName: string;
  department: string;
  position: string;
  managerEmployeeId: string | null;
  balances: Record<ReshumCategory, ReshumBalance>;
}

interface Store {
  employees: Record<string, ReshumEmployee>;
  lastUpdated: string;
}

let cache: Store | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function ensureLoaded(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    cache = JSON.parse(raw);
    return cache!;
  } catch {
    cache = await seed();
    await persist(cache);
    return cache;
  }
}

async function seed(): Promise<Store> {
  try {
    const raw = await fs.readFile(SEED_FILE, 'utf8');
    const seedData = JSON.parse(raw);
    const employees: Record<string, ReshumEmployee> = {};
    const rows = Array.isArray(seedData) ? seedData : (seedData.employees ?? []);
    for (const row of rows) {
      employees[row.employeeId] = {
        employeeId: row.employeeId,
        fullName: row.fullName,
        department: row.department ?? '',
        position: row.position ?? '',
        managerEmployeeId: row.managerEmployeeId ?? null,
        balances: {
          annual:    { total: row.annualTotal    ?? 30, used: row.annualUsed    ?? 0 },
          recovery:  { total: row.recoveryTotal  ??  5, used: row.recoveryUsed  ?? 0 },
          sick:      { total: row.sickTotal      ?? 15, used: row.sickUsed      ?? 0 },
          maternity: { total: row.maternityTotal ??  0, used: row.maternityUsed ?? 0 },
        },
      };
    }
    return { employees, lastUpdated: new Date().toISOString() };
  } catch {
    return { employees: {}, lastUpdated: new Date().toISOString() };
  }
}

async function persist(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

function categoryFromName(name: string): ReshumCategory | null {
  const n = name.toLowerCase();
  if (n.includes('annual') || n.includes('conge') || n.includes('congé')) return 'annual';
  if (n.includes('mission') || n.includes('recovery') || n.includes('recup')) return 'recovery';
  if (n.includes('sick') || n.includes('maladie')) return 'sick';
  if (n.includes('maternity') || n.includes('maternit')) return 'maternity';
  return null;
}

export const reshum = {
  async getEmployee(employeeId: string): Promise<ReshumEmployee | null> {
    const store = await ensureLoaded();
    return store.employees[employeeId] ?? null;
  },

  async getBalances(employeeId: string): Promise<Record<ReshumCategory, ReshumBalance> | null> {
    return (await reshum.getEmployee(employeeId))?.balances ?? null;
  },

  async list(): Promise<ReshumEmployee[]> {
    const store = await ensureLoaded();
    return Object.values(store.employees);
  },

  async applyLeaveDeduction(
    employeeId: string,
    leaveTypeName: string,
    days: number,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const cat = categoryFromName(leaveTypeName);
      if (!cat) return { ok: true }; // no RESHUM category — no-op
      const store = await ensureLoaded();
      const emp = store.employees[employeeId];
      if (!emp) return { ok: false, error: `Unknown employeeId ${employeeId}` };
      emp.balances[cat].used = Math.min(
        emp.balances[cat].total,
        emp.balances[cat].used + days,
      );
      store.lastUpdated = new Date().toISOString();
      writeChain = writeChain.then(() => persist(store));
      await writeChain;
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'unknown' };
    }
  },

  async reload(): Promise<void> {
    cache = null;
    await ensureLoaded();
  },

  async deduct(
    employeeId: string,
    category: ReshumCategory,
    days: number,
  ): Promise<{ ok: true; employee: ReshumEmployee } | { ok: false; error: string }> {
    const store = await ensureLoaded();
    const emp = store.employees[employeeId];
    if (!emp) return { ok: false, error: `Unknown employeeId ${employeeId}` };
    if (!emp.balances[category]) return { ok: false, error: `Unknown category ${category}` };
    emp.balances[category].used = Math.min(
      emp.balances[category].total,
      emp.balances[category].used + days,
    );
    store.lastUpdated = new Date().toISOString();
    writeChain = writeChain.then(() => persist(store));
    await writeChain;
    return { ok: true, employee: emp };
  },

  async creditRecovery(
    employeeId: string,
    days: number,
  ): Promise<{ ok: true; employee: ReshumEmployee } | { ok: false; error: string }> {
    const store = await ensureLoaded();
    const emp = store.employees[employeeId];
    if (!emp) return { ok: false, error: `Unknown employeeId ${employeeId}` };
    emp.balances.recovery.total += days;
    store.lastUpdated = new Date().toISOString();
    writeChain = writeChain.then(() => persist(store));
    await writeChain;
    return { ok: true, employee: emp };
  },

  async getState(): Promise<Store> {
    return await ensureLoaded();
  },

  async reset(): Promise<Store> {
    cache = await seed();
    await persist(cache);
    return cache;
  },
};
