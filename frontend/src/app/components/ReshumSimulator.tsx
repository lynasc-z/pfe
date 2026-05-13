import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Search, MinusCircle, PlusCircle, RotateCcw, Database, Activity } from 'lucide-react';
import * as api from '../../lib/api';
import type { ReshumEmployee, ReshumCategory } from '../../lib/api';

interface LogEntry {
  ts: string;
  action: string;
  payload: any;
  result: 'ok' | 'error';
  detail?: string;
}

export function ReshumSimulator() {
  const [allEmployees, setAllEmployees] = useState<ReshumEmployee[]>([]);
  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState<ReshumEmployee | null>(null);

  const [deductForm, setDeductForm] = useState<{ employeeId: string; category: ReshumCategory; days: number }>({
    employeeId: '',
    category: 'annual',
    days: 1,
  });

  const [creditForm, setCreditForm] = useState<{ employeeId: string; days: number }>({
    employeeId: '',
    days: 1,
  });

  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const pushLog = (entry: Omit<LogEntry, 'ts'>) =>
    setLog((prev) => [{ ts: new Date().toISOString(), ...entry }, ...prev].slice(0, 20));

  const refreshState = async () => {
    try {
      const state = await api.reshumGetState();
      setAllEmployees(Object.values(state.employees));
      setLastUpdated(state.lastUpdated);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load RESHUM state');
    }
  };

  useEffect(() => { refreshState(); }, []);

  const handleLookup = async () => {
    if (!lookupId) return;
    setLoading(true);
    try {
      const emp = await api.reshumGetEmployee(lookupId);
      setLookupResult(emp);
      pushLog({ action: 'GET employee', payload: { employeeId: lookupId }, result: 'ok' });
    } catch (err: any) {
      setLookupResult(null);
      pushLog({ action: 'GET employee', payload: { employeeId: lookupId }, result: 'error', detail: err.message });
      toast.error(err.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeduct = async () => {
    if (!deductForm.employeeId || deductForm.days < 1) return;
    setLoading(true);
    try {
      const emp = await api.reshumDeduct(deductForm);
      pushLog({ action: 'POST deduct', payload: deductForm, result: 'ok' });
      toast.success(`Deducted ${deductForm.days} ${deductForm.category} day(s) from ${emp.fullName}`);
      await refreshState();
      if (lookupResult?.employeeId === emp.employeeId) setLookupResult(emp);
    } catch (err: any) {
      pushLog({ action: 'POST deduct', payload: deductForm, result: 'error', detail: err.message });
      toast.error(err.message || 'Deduction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCredit = async () => {
    if (!creditForm.employeeId || creditForm.days < 1) return;
    setLoading(true);
    try {
      const emp = await api.reshumCreditRecovery(creditForm);
      pushLog({ action: 'POST credit-recovery', payload: creditForm, result: 'ok' });
      toast.success(`Credited ${creditForm.days} recovery day(s) to ${emp.fullName}`);
      await refreshState();
      if (lookupResult?.employeeId === emp.employeeId) setLookupResult(emp);
    } catch (err: any) {
      pushLog({ action: 'POST credit-recovery', payload: creditForm, result: 'error', detail: err.message });
      toast.error(err.message || 'Credit failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset RESHUM mock data to seed values? This is irreversible.')) return;
    setLoading(true);
    try {
      const state = await api.reshumReset();
      setAllEmployees(Object.values(state.employees));
      setLastUpdated(state.lastUpdated);
      setLookupResult(null);
      pushLog({ action: 'POST reset', payload: {}, result: 'ok' });
      toast.success('RESHUM state reset to seed.');
    } catch (err: any) {
      pushLog({ action: 'POST reset', payload: {}, result: 'error', detail: err.message });
      toast.error(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            RESHUM Simulator
          </h1>
          <p className="text-gray-600">
            Inspect and manipulate the mock RESHUM payroll system used for annual balance sync and recovery credits.
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">Last updated: {new Date(lastUpdated).toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={handleReset}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" /> Reset to seed
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Lookup */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-[#FF6B00]" />
            <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Get Employee</h2>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Employee ID (e.g. EMP001)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !lookupId}
              className="px-4 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E05F00] disabled:opacity-50"
            >
              Get
            </button>
          </div>
          {lookupResult && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
              <p className="font-semibold">{lookupResult.fullName}</p>
              <p className="text-gray-600">{lookupResult.position} — {lookupResult.department}</p>
              <table className="w-full mt-3 text-xs">
                <thead className="text-gray-500"><tr><th className="text-left">Category</th><th className="text-right">Total</th><th className="text-right">Used</th><th className="text-right">Remaining</th></tr></thead>
                <tbody>
                  {(['annual','recovery','sick','maternity'] as ReshumCategory[]).map((c) => {
                    const b = lookupResult.balances[c];
                    return (
                      <tr key={c} className="border-t">
                        <td className="py-1 capitalize">{c}</td>
                        <td className="text-right">{b.total}</td>
                        <td className="text-right">{b.used}</td>
                        <td className="text-right font-semibold">{b.total - b.used}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Deduct */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MinusCircle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Apply Deduction</h2>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={deductForm.employeeId}
              onChange={(e) => setDeductForm({ ...deductForm, employeeId: e.target.value })}
              placeholder="Employee ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
            />
            <select
              value={deductForm.category}
              onChange={(e) => setDeductForm({ ...deductForm, category: e.target.value as ReshumCategory })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
            >
              <option value="annual">annual</option>
              <option value="recovery">recovery</option>
              <option value="sick">sick</option>
              <option value="maternity">maternity</option>
            </select>
            <input
              type="number"
              min={1}
              value={deductForm.days}
              onChange={(e) => setDeductForm({ ...deductForm, days: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
            />
            <button
              onClick={handleDeduct}
              disabled={loading || !deductForm.employeeId}
              className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Apply Deduction
            </button>
          </div>
        </div>

        {/* Credit recovery */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PlusCircle className="w-5 h-5 text-green-600" />
            <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Credit Recovery</h2>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={creditForm.employeeId}
              onChange={(e) => setCreditForm({ ...creditForm, employeeId: e.target.value })}
              placeholder="Employee ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
            />
            <input
              type="number"
              min={1}
              value={creditForm.days}
              onChange={(e) => setCreditForm({ ...creditForm, days: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
            />
            <p className="text-xs text-gray-500">Increases the recovery balance total (e.g., after a Mission Leave).</p>
            <button
              onClick={handleCredit}
              disabled={loading || !creditForm.employeeId}
              className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Credit Recovery Days
            </button>
          </div>
        </div>
      </div>

      {/* All employees table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-[#FF6B00]" />
          <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>RESHUM Store ({allEmployees.length} employees)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-left text-xs uppercase border-b">
              <tr>
                <th className="py-2 pr-3">Employee ID</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3 text-right">Annual T/U</th>
                <th className="py-2 pr-3 text-right">Recovery T/U</th>
                <th className="py-2 pr-3 text-right">Sick T/U</th>
                <th className="py-2 pr-3 text-right">Maternity T/U</th>
              </tr>
            </thead>
            <tbody>
              {allEmployees.map((e) => (
                <tr key={e.employeeId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 font-mono text-xs">{e.employeeId}</td>
                  <td className="py-2 pr-3">{e.fullName}</td>
                  <td className="py-2 pr-3 text-gray-600">{e.department}</td>
                  <td className="py-2 pr-3 text-right">{e.balances.annual.total}/{e.balances.annual.used}</td>
                  <td className="py-2 pr-3 text-right">{e.balances.recovery.total}/{e.balances.recovery.used}</td>
                  <td className="py-2 pr-3 text-right">{e.balances.sick.total}/{e.balances.sick.used}</td>
                  <td className="py-2 pr-3 text-right">{e.balances.maternity.total}/{e.balances.maternity.used}</td>
                </tr>
              ))}
              {allEmployees.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-500">No employees in RESHUM store.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Operations log */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-[#FF6B00]" />
          <h2 className="text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Recent Operations</h2>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-gray-500">No operations yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {log.map((entry, i) => (
              <div key={i} className={`p-3 rounded-lg border text-xs ${entry.result === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">{entry.action}</span>
                  <span className="text-gray-500">{new Date(entry.ts).toLocaleTimeString()}</span>
                </div>
                <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-words">{JSON.stringify(entry.payload, null, 2)}</pre>
                {entry.detail && <p className="text-red-600 mt-1">{entry.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
