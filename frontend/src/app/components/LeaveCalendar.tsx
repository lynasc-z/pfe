import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import * as api from '../../lib/api';
import type { CalendarLeave } from '../../types';
import { useAuth } from '../context/AuthContext';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function leaveColor(status: string) {
  if (status === 'TREATED') return 'bg-green-200 text-green-800 border-green-300';
  if (status === 'RESERVED') return 'bg-blue-200 text-blue-800 border-blue-300';
  if (status === 'PENDING_HR' || status === 'APPROVED_BY_MANAGER') return 'bg-orange-200 text-orange-800 border-orange-300';
  if (status === 'CANCELLED') return 'bg-gray-200 text-gray-800 border-gray-300';
  if (status.startsWith('REJECTED')) return 'bg-red-200 text-red-800 border-red-300';
  return 'bg-yellow-200 text-yellow-800 border-yellow-300';
}

function dayCellBg(dayLeaves: CalendarLeave[]) {
  if (dayLeaves.length === 0) return '';
  const hasTreated = dayLeaves.some(l => l.status === 'TREATED');
  const hasReserved = dayLeaves.some(l => l.status === 'RESERVED');
  const hasPendingHR = dayLeaves.some(l => l.status === 'PENDING_HR' || l.status === 'APPROVED_BY_MANAGER');
  const hasPendingMgr = dayLeaves.some(l => l.status === 'PENDING_MANAGER');
  if (hasTreated) return 'bg-green-50';
  if (hasReserved) return 'bg-blue-50';
  if (hasPendingHR) return 'bg-orange-50';
  if (hasPendingMgr) return 'bg-yellow-50';
  return '';
}

export function LeaveCalendar({ onBack, userRole }: { onBack: () => void; userRole?: string }) {
  const { user } = useAuth();
  const role = userRole ?? user?.role;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [leaves, setLeaves] = useState<CalendarLeave[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const isPrivileged = role === 'HR' || role === 'DRH' || role === 'MANAGER';

  useEffect(() => {
    api.getCalendarLeaves(year, month, departmentFilter || undefined)
      .then(data => setLeaves(data))
      .catch(() => {});
  }, [year, month, departmentFilter]);

  const visibleLeaves = leaves.filter(l => {
    if (statusFilter.length > 0 && !statusFilter.includes(l.status)) return false;
    return true;
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  // getDay() returns 0=Sun, convert to 0=Mon
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Map leaves to days
  const getLeavesForDay = (day: number): CalendarLeave[] => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return visibleLeaves.filter(l => {
      const start = l.startDate.split('T')[0];
      const end = l.endDate.split('T')[0];
      return dateStr >= start && dateStr <= end;
    });
  };

  const isToday = (day: number) => {
    return day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 hover:text-[#FF6B00] transition-colors mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>Back to Dashboard</span>
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Leave Calendar
          </h1>
          <div className="flex items-center gap-4">
            {isPrivileged && (
              <input
                type="text"
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value)}
                placeholder="Filter by department…"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
              />
            )}
            <motion.button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg" whileTap={{ scale: 0.9 }}>
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
            <span className="text-lg min-w-[200px] text-center" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <motion.button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg" whileTap={{ scale: 0.9 }}>
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Legend + Status Filter */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          {[
            { label: 'Treated', status: 'TREATED', className: 'bg-green-200' },
            { label: 'Reserved', status: 'RESERVED', className: 'bg-blue-200' },
            { label: 'Pending HR', status: 'PENDING_HR', className: 'bg-orange-200' },
            { label: 'Pending Manager', status: 'PENDING_MANAGER', className: 'bg-yellow-200' },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => setStatusFilter(prev =>
                prev.includes(item.status) ? prev.filter(s => s !== item.status) : [...prev, item.status]
              )}
              className={`flex items-center gap-2 text-sm px-2 py-1 rounded-lg border transition-colors ${
                statusFilter.includes(item.status) ? 'border-gray-400 bg-gray-100' : 'border-transparent hover:bg-gray-50'
              } text-gray-600`}
            >
              <div className={`w-3 h-3 rounded ${item.className}`} />
              {item.label}
            </button>
          ))}
          {statusFilter.length > 0 && (
            <button onClick={() => setStatusFilter([])} className="text-xs text-gray-400 hover:text-gray-600 ml-2">
              Clear filters
            </button>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {/* Day headers */}
          {DAY_NAMES.map(d => (
            <div key={d} className="bg-gray-50 py-3 text-center text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              {d}
            </div>
          ))}

          {/* Date cells */}
          {cells.map((day, i) => {
            const dayLeaves = day ? getLeavesForDay(day) : [];
            const cellBg = day ? dayCellBg(dayLeaves) : '';
            const dayOfWeek = day ? new Date(year, month - 1, day).getDay() : -1;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            return (
              <div
                key={i}
                className={`min-h-[100px] p-2 ${!day ? 'bg-gray-50' : isWeekend ? 'bg-gray-100' : cellBg || 'bg-white'} ${isToday(day!) ? 'ring-2 ring-inset ring-[#FF6B00]' : ''}`}
              >
                {day && (
                  <>
                    <span className={`text-sm ${isToday(day) ? 'text-[#FF6B00] font-bold' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayLeaves.slice(0, 3).map(leave => (
                        <div
                          key={leave.id}
                          className={`text-xs px-1.5 py-0.5 rounded border truncate ${leaveColor(leave.status)}`}
                          title={`${leave.user.fullName} — ${leave.leaveType.name}`}
                        >
                          {leave.user.fullName.split(' ')[0]}
                        </div>
                      ))}
                      {dayLeaves.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">+{dayLeaves.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
