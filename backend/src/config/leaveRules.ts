/**
 * Per-leave-type metadata not stored in the database.
 *
 * The DB columns (`quotaScope`, `fixedDuration`, `durationUnit`,
 * `genderRestriction`, `cooldownDays`, `requiresDocument`) carry the
 * machine-enforced rules. This file complements them with form-extras,
 * UI hints and lead-time requirements that don't deserve dedicated columns.
 *
 * Keyed by `LeaveType.name` so it stays usable even if IDs change between
 * environments.
 */

export type LeaveExtraField =
  | 'destination'
  | 'missionType'
  | 'transport'
  | 'itinerary'
  | 'recoveryDate'
  | 'weddingDate'
  | 'childBirthDate'
  | 'childName'
  | 'relationship';

export interface LeaveTypeRule {
  /** Extra request fields this type collects (rendered by the dynamic form). */
  extras: { name: LeaveExtraField; required: boolean }[];
  /** Reason field requirement: 'optional' | 'required' | 'hidden'. */
  reason: 'optional' | 'required' | 'hidden';
  /** Minimum days between today and startDate (server-side enforced). */
  minLeadTimeDays?: number;
  /** Short hint shown beside the type description. */
  hint?: string;
  /** Pre-filled reason when reason is hidden / suggested. */
  defaultReason?: string;
}

export const LEAVE_TYPE_RULES: Record<string, LeaveTypeRule> = {
  'Annual Leave': {
    extras: [],
    reason: 'optional',
  },
  'Justified Absence': {
    extras: [],
    reason: 'required',
    hint: 'Upload an official justification (medical certificate, summons, etc.).',
  },
  'Death of Close Relative': {
    extras: [{ name: 'relationship', required: false }],
    reason: 'hidden',
    defaultReason: 'Bereavement leave',
    hint: 'Exactly 3 business days. Upload the death certificate.',
  },
  'Maternity Leave': {
    extras: [],
    reason: 'hidden',
    defaultReason: 'Maternity leave',
    minLeadTimeDays: 0,
    hint: 'Exactly 150 calendar days. Medical certificate required. One per 12 months.',
  },
  'Paternity Leave': {
    extras: [{ name: 'childBirthDate', required: true }],
    reason: 'hidden',
    defaultReason: 'Paternity leave',
    hint: 'Exactly 3 business days within 30 days of the child\u2019s birth.',
  },
  'Mission Leave': {
    extras: [
      { name: 'destination', required: true },
      { name: 'missionType', required: true },
      { name: 'transport',   required: true },
      { name: 'itinerary',   required: true },
      { name: 'recoveryDate', required: false },
    ],
    reason: 'required',
    hint: 'Mission order required. Recovery days credited to RESHUM on treat.',
  },
  'Pilgrimage Leave': {
    extras: [],
    reason: 'hidden',
    defaultReason: 'Pilgrimage (Hajj)',
    minLeadTimeDays: 60,
    hint: 'Exactly 30 business days. Once in a career. Submit at least 60 days ahead.',
  },
  'Marriage Leave': {
    extras: [{ name: 'weddingDate', required: true }],
    reason: 'hidden',
    defaultReason: 'Marriage leave',
    hint: 'Exactly 15 business days. Once in a career. Marriage certificate required.',
  },
  'Circumcision Leave': {
    extras: [{ name: 'childName', required: false }],
    reason: 'hidden',
    defaultReason: 'Circumcision leave',
    hint: 'Exactly 3 business days. Birth certificate of the child required.',
  },
};

/** Safe lookup that returns sensible defaults for unknown types. */
export function getLeaveRule(name: string): LeaveTypeRule {
  return (
    LEAVE_TYPE_RULES[name] ?? {
      extras: [],
      reason: 'optional',
    }
  );
}
