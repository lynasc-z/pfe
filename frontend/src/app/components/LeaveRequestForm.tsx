import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, FileUp, Send, AlertCircle } from 'lucide-react';
import * as api from '../../lib/api';
import { countBusinessDays } from '../../lib/businessDays';
import { useAuth } from '../context/AuthContext';
import { getLeaveRule, ruleHasExtra } from '../../lib/leaveRules';
import type { LeaveType, LeaveBalance, LeaveRequest } from '../../types';

// ── helpers ────────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addCalendarDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function addBusinessDays(start: Date, n: number): Date {
  if (n <= 0) return start;
  const cur = new Date(start);
  let counted = 0;
  while (counted < n) {
    const day = cur.getDay();
    if (day !== 5 && day !== 6) counted++;
    if (counted < n) cur.setDate(cur.getDate() + 1);
  }
  return cur;
}

const PENDING_STATUSES = ['PENDING_MANAGER', 'PENDING_ADMIN', 'PENDING_HR_ACCEPT', 'PENDING_HR', 'RESERVED', 'AWAITING_DOCUMENT'];

export function LeaveRequestForm({
  onBack,
  onSubmit,
  editTarget,
}: {
  onBack: () => void;
  onSubmit: () => void;
  editTarget?: LeaveRequest;
}) {
  const { user } = useAuth();

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [formData, setFormData] = useState({
    leaveTypeId: editTarget?.leaveTypeId ?? '',
    startDate: editTarget?.startDate ? editTarget.startDate.slice(0, 10) : '',
    endDate: editTarget?.endDate ? editTarget.endDate.slice(0, 10) : '',
    recoveryDate: editTarget?.recoveryDate ? editTarget.recoveryDate.slice(0, 10) : '',
    reason: editTarget?.reason ?? '',
    missionType: editTarget?.missionType ?? '',
    transport: editTarget?.transport ?? '',
    itinerary: editTarget?.itinerary ?? '',
    destination: editTarget?.destination ?? '',
    weddingDate: editTarget?.weddingDate ? editTarget.weddingDate.slice(0, 10) : '',
    childBirthDate: editTarget?.childBirthDate ? editTarget.childBirthDate.slice(0, 10) : '',
    childName: editTarget?.childName ?? '',
    relationship: editTarget?.relationship ?? '',
    file: null as File | null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getLeaveTypes().then(setLeaveTypes).catch(() => {});
    api.getMyBalances().then(setBalances).catch(() => {});
    api.getMyRequests().then(setMyRequests).catch(() => {});
  }, []);

  const selectedLeaveType = leaveTypes.find(t => t.id === formData.leaveTypeId);
  const selectedRule = useMemo(
    () => (selectedLeaveType ? getLeaveRule(selectedLeaveType.name) : null),
    [selectedLeaveType?.name],
  );

  // ── auto-compute end date for fixed-duration types ──────────────────────
  useEffect(() => {
    if (!selectedLeaveType || !selectedLeaveType.fixedDuration) return;
    if (!formData.startDate) return;
    const start = new Date(formData.startDate);
    const computed =
      selectedLeaveType.durationUnit === 'CALENDAR_DAYS'
        ? addCalendarDays(start, selectedLeaveType.fixedDuration - 1)
        : addBusinessDays(start, selectedLeaveType.fixedDuration);
    const next = fmtDate(computed);
    if (next !== formData.endDate) {
      setFormData(prev => ({ ...prev, endDate: next }));
    }
  }, [selectedLeaveType?.id, selectedLeaveType?.fixedDuration, selectedLeaveType?.durationUnit, formData.startDate]);

  // ── derived ─────────────────────────────────────────────────────────────
  const isFixed = !!selectedLeaveType?.fixedDuration;
  const isCalendar = selectedLeaveType?.durationUnit === 'CALENDAR_DAYS';
  const computedDays = useMemo(() => {
    if (!formData.startDate || !formData.endDate) return 0;
    if (selectedLeaveType?.fixedDuration) return selectedLeaveType.fixedDuration;
    if (isCalendar) {
      const days = Math.round((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return Math.max(0, days);
    }
    return countBusinessDays(new Date(formData.startDate), new Date(formData.endDate));
  }, [formData.startDate, formData.endDate, selectedLeaveType?.fixedDuration, isCalendar]);

  // Annual balance display
  const selectedBalance = balances.find(b => b.leaveTypeId === formData.leaveTypeId);
  const pendingDays = myRequests
    .filter(r => r.leaveTypeId === formData.leaveTypeId && PENDING_STATUSES.includes(r.status) && r.id !== editTarget?.id)
    .reduce((sum, r) => sum + r.daysCount, 0);
  const remainingDays =
    selectedLeaveType?.quotaScope === 'ANNUAL' && selectedBalance
      ? (selectedBalance.totalDays ?? 0) - selectedBalance.usedDays - pendingDays
      : null;

  // Once-per-career: check for prior non-rejected/cancelled request of same type
  const onceUsed = useMemo(() => {
    if (selectedLeaveType?.quotaScope !== 'ONCE_PER_CAREER') return false;
    return myRequests.some(
      r =>
        r.leaveTypeId === formData.leaveTypeId &&
        r.status !== 'REJECTED_BY_MANAGER' &&
        r.status !== 'CANCELLED' &&
        r.id !== editTarget?.id,
    );
  }, [selectedLeaveType?.quotaScope, formData.leaveTypeId, myRequests, editTarget?.id]);

  // Gender restriction
  const genderBlocked =
    selectedLeaveType?.genderRestriction && user?.gender && selectedLeaveType.genderRestriction !== user.gender;

  const showField = (field: Parameters<typeof ruleHasExtra>[1]) =>
    selectedLeaveType ? ruleHasExtra(selectedLeaveType.name, field).included : false;

  const requireField = (field: Parameters<typeof ruleHasExtra>[1]) =>
    selectedLeaveType ? ruleHasExtra(selectedLeaveType.name, field).required : false;

  const reasonMode = selectedRule?.reason ?? 'optional';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (genderBlocked) {
        setError(`This leave type is restricted to ${selectedLeaveType!.genderRestriction!.toLowerCase()} employees.`);
        setIsSubmitting(false);
        return;
      }
      if (onceUsed) {
        setError('You have already used this once-in-a-career leave type.');
        setIsSubmitting(false);
        return;
      }

      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (start > end) {
        setError('End date must be after or equal to start date');
        setIsSubmitting(false);
        return;
      }
      if (computedDays === 0) {
        setError('Selected range produces zero days');
        setIsSubmitting(false);
        return;
      }

      // Document required?
      if (selectedLeaveType?.requiresDocument && !formData.file && !editTarget) {
        setError(`A supporting document (PDF) is required for ${selectedLeaveType.name}`);
        setIsSubmitting(false);
        return;
      }

      // Lead time check
      if (selectedRule?.minLeadTimeDays && selectedRule.minLeadTimeDays > 0) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const earliest = addCalendarDays(today, selectedRule.minLeadTimeDays);
        if (start < earliest) {
          setError(`This leave type must be requested at least ${selectedRule.minLeadTimeDays} days in advance.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Reason required?
      const reasonText = (formData.reason || '').trim();
      if (reasonMode === 'required' && !reasonText) {
        setError('Please provide a reason for this leave type.');
        setIsSubmitting(false);
        return;
      }

      // Required extras client-side
      const requiredExtras: { key: keyof typeof formData; label: string }[] = [
        { key: 'destination', label: 'Destination' },
        { key: 'missionType', label: 'Mission type' },
        { key: 'transport', label: 'Transport' },
        { key: 'itinerary', label: 'Itinerary' },
        { key: 'weddingDate', label: 'Wedding date' },
        { key: 'childBirthDate', label: 'Child birth date' },
      ];
      for (const r of requiredExtras) {
        if (requireField(r.key as any) && !formData[r.key]) {
          setError(`${r.label} is required.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Past-date confirmation
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (start < today) {
        const confirmed = window.confirm('The start date is in the past. Are you sure you want to submit this request?');
        if (!confirmed) { setIsSubmitting(false); return; }
      }

      const payloadCommon: Record<string, string | undefined> = {
        leaveTypeId: formData.leaveTypeId,
        startDate: formData.startDate,
        endDate: formData.endDate,
      };
      if (showField('recoveryDate') && formData.recoveryDate) payloadCommon.recoveryDate = formData.recoveryDate;
      if (showField('missionType') && formData.missionType)   payloadCommon.missionType = formData.missionType;
      if (showField('transport')   && formData.transport)     payloadCommon.transport = formData.transport;
      if (showField('itinerary')   && formData.itinerary)     payloadCommon.itinerary = formData.itinerary;
      if (showField('destination') && formData.destination)   payloadCommon.destination = formData.destination;
      if (showField('weddingDate') && formData.weddingDate)   payloadCommon.weddingDate = formData.weddingDate;
      if (showField('childBirthDate') && formData.childBirthDate) payloadCommon.childBirthDate = formData.childBirthDate;
      if (showField('childName')   && formData.childName)     payloadCommon.childName = formData.childName;
      if (showField('relationship') && formData.relationship) payloadCommon.relationship = formData.relationship;
      if (reasonMode !== 'hidden' && reasonText) payloadCommon.reason = reasonText;

      if (editTarget) {
        await api.editRequest(editTarget.id, {
          ...payloadCommon,
          daysCount: computedDays,
        } as any);
      } else {
        const fd = new FormData();
        for (const [k, v] of Object.entries(payloadCommon)) {
          if (v !== undefined) fd.append(k, v);
        }
        fd.append('daysCount', String(computedDays));
        if (formData.file) fd.append('document', formData.file);
        await api.createLeaveRequest(fd);
      }

      onSubmit();
      toast.success(editTarget ? 'Request updated successfully' : 'Leave request submitted');
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 hover:text-[#FF6B00] transition-colors mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>Back to Dashboard</span>
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          {editTarget ? 'Edit Leave Request' : 'New Leave Request'}
        </h1>
        <p className="text-gray-600 mb-8">Fill out the form below to submit your leave request</p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Leave Type */}
          <div>
            <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              Leave Type *
            </label>
            <select
              value={formData.leaveTypeId}
              onChange={(e) => setFormData({ ...formData, leaveTypeId: e.target.value })}
              className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
              required
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((type) => {
                const blocked = type.genderRestriction && user?.gender && type.genderRestriction !== user.gender;
                return (
                  <option key={type.id} value={type.id} disabled={!!blocked}>
                    {type.name}
                    {type.fixedDuration ? ` (${type.fixedDuration} ${type.durationUnit === 'CALENDAR_DAYS' ? 'calendar' : 'business'} days)` : ''}
                    {blocked ? ` — ${type.genderRestriction!.toLowerCase()} only` : ''}
                  </option>
                );
              })}
            </select>
            {selectedLeaveType && (
              <motion.div
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="text-sm text-gray-600 mt-2 space-y-1"
              >
                {selectedRule?.hint && (
                  <p className="flex items-start gap-2"><span className="text-[#FF6B00]">ℹ</span><span>{selectedRule.hint}</span></p>
                )}
                {selectedLeaveType.quotaScope === 'ONCE_PER_CAREER' && (
                  <p className={onceUsed ? 'text-red-600' : 'text-gray-600'}>
                    {onceUsed ? '⚠ Already used — cannot be requested again.' : '⚑ Once in a career.'}
                  </p>
                )}
                {genderBlocked && (
                  <p className="text-red-600">⚠ Restricted to {selectedLeaveType.genderRestriction!.toLowerCase()} employees.</p>
                )}
              </motion.div>
            )}
          </div>

          {/* Date Range */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Start Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                End Date {isFixed ? '(auto)' : '*'}
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  min={formData.startDate || undefined}
                  disabled={isFixed}
                  className="w-full pl-12 pr-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  required={!isFixed}
                />
              </div>
              {(remainingDays !== null || computedDays > 0) && (
                <p className="text-sm text-gray-600 mt-2">
                  <span className="text-[#FF6B00]">ℹ</span>{' '}
                  {remainingDays !== null && (
                    <>
                      {remainingDays} day{remainingDays !== 1 ? 's' : ''} remaining
                      {pendingDays > 0 ? ` (${pendingDays} pending)` : ''}
                      {computedDays > 0 ? ' — ' : ''}
                    </>
                  )}
                  {computedDays > 0 && (
                    <>this request: {computedDays} {isCalendar ? 'calendar' : 'business'} day{computedDays !== 1 ? 's' : ''}</>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Mission destination */}
          {showField('destination') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Destination *
              </label>
              <input
                type="text"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                placeholder="e.g. Hassi Messaoud"
                required
              />
            </div>
          )}

          {/* Mission type / transport / itinerary */}
          {showField('missionType') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Mission Type *
              </label>
              <select
                value={formData.missionType}
                onChange={(e) => setFormData({ ...formData, missionType: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                required
              >
                <option value="">Select mission type</option>
                <option value="Field Inspection">Field Inspection</option>
                <option value="Training">Training</option>
                <option value="Conference">Conference</option>
                <option value="Client Meeting">Client Meeting</option>
                <option value="Site Visit">Site Visit</option>
                <option value="Audit">Audit</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}

          {showField('transport') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Transport *
              </label>
              <select
                value={formData.transport}
                onChange={(e) => setFormData({ ...formData, transport: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                required
              >
                <option value="">Select transport</option>
                <option value="Company Vehicle">Company Vehicle</option>
                <option value="Flight">Flight</option>
                <option value="Train">Train</option>
                <option value="Personal Vehicle">Personal Vehicle</option>
                <option value="Bus">Bus</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}

          {showField('itinerary') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Itinerary *
              </label>
              <textarea
                value={formData.itinerary}
                onChange={(e) => setFormData({ ...formData, itinerary: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all resize-none"
                rows={3}
                placeholder="e.g. Algiers → Hassi Messaoud → Algiers"
                required
              />
            </div>
          )}

          {showField('recoveryDate') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Recovery Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={formData.recoveryDate}
                  onChange={(e) => setFormData({ ...formData, recoveryDate: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">Date you will return to work (optional)</p>
            </div>
          )}

          {/* Marriage: weddingDate */}
          {showField('weddingDate') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Wedding Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={formData.weddingDate}
                  onChange={(e) => setFormData({ ...formData, weddingDate: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                  required
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">Start date must be within 15 days of the wedding.</p>
            </div>
          )}

          {/* Paternity: childBirthDate */}
          {showField('childBirthDate') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Child Birth Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={formData.childBirthDate}
                  onChange={(e) => setFormData({ ...formData, childBirthDate: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                  required
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">Leave must start within 30 days of the birth.</p>
            </div>
          )}

          {/* Circumcision: childName */}
          {showField('childName') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Child Name
              </label>
              <input
                type="text"
                value={formData.childName}
                onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                placeholder="Optional"
              />
            </div>
          )}

          {/* Bereavement: relationship */}
          {showField('relationship') && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Relationship
              </label>
              <input
                type="text"
                value={formData.relationship}
                onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                placeholder="e.g. Father, Mother, Sibling (optional)"
              />
            </div>
          )}

          {/* Reason */}
          {reasonMode !== 'hidden' && (
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Reason / Additional Information {reasonMode === 'required' ? '*' : ''}
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-4 py-3 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all resize-none"
                rows={4}
                placeholder="Provide any additional details..."
                required={reasonMode === 'required'}
              />
            </div>
          )}

          {/* File Upload */}
          <div>
            <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              Supporting Document (PDF) {selectedLeaveType?.requiresDocument ? '*' : ''}
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                required={selectedLeaveType?.requiresDocument === true && !editTarget}
              />
              <label
                htmlFor="file-upload"
                className="flex items-center justify-center gap-3 w-full px-4 py-6 bg-[#FAFAFA] border-2 border-dashed border-gray-300 rounded-lg hover:border-[#FF6B00] hover:bg-white transition-all cursor-pointer"
              >
                <FileUp className="w-6 h-6 text-gray-400" />
                <span className="text-gray-600">
                  {formData.file ? formData.file.name : 'Click to upload PDF document'}
                </span>
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4 pt-6">
            <motion.button
              type="button"
              onClick={onBack}
              className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              disabled={isSubmitting || !!genderBlocked || onceUsed}
              className="flex-1 py-3.5 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E05F00] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
              whileHover={{ scale: isSubmitting ? 1 : 1.01 }}
              whileTap={{ scale: isSubmitting ? 1 : 0.99 }}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {editTarget ? 'Save Changes' : 'Submit Request'}
                </>
              )}
            </motion.button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
