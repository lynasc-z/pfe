/**
 * Frontend mirror of `backend/src/config/leaveRules.ts` — kept in sync manually.
 * Provides the per-type form metadata that complements the DB rule columns.
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
  extras: { name: LeaveExtraField; required: boolean }[];
  reason: 'optional' | 'required' | 'hidden';
  minLeadTimeDays?: number;
  hint?: string;
  defaultReason?: string;
}

export const LEAVE_TYPE_RULES: Record<string, LeaveTypeRule> = {
  'Annual Leave': { extras: [], reason: 'optional' },
  'Justified Absence': {
    extras: [],
    reason: 'required',
    hint: 'Upload an official justification (medical certificate, summons, etc.).',
  },
  'Death of Close Relative': {
    extras: [{ name: 'relationship', required: false }],
    reason: 'hidden',
    defaultReason: 'Bereavement leave',
    hint: 'Exactly 3 business days. Death certificate required.',
  },
  'Maternity Leave': {
    extras: [],
    reason: 'hidden',
    defaultReason: 'Maternity leave',
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

export function getLeaveRule(name: string): LeaveTypeRule {
  return LEAVE_TYPE_RULES[name] ?? { extras: [], reason: 'optional' };
}

/** Whether the given extra field is part of this leave type's rule (and is required). */
export function ruleHasExtra(name: string, field: LeaveExtraField): { included: boolean; required: boolean } {
  const rule = getLeaveRule(name);
  const found = rule.extras.find(e => e.name === field);
  return { included: !!found, required: found?.required ?? false };
}
