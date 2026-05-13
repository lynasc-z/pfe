/**
 * Algeria business-day calculator.
 * Weekend = Friday (5) + Saturday (6).
 */
export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 5 || day === 6;
}

/** Inclusive count of business days in [start, end]. */
export function countBusinessDays(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    if (!isWeekend(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
