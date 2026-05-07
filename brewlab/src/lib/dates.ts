/**
 * Date utilities for the Planner page (and any other date-grid feature).
 *
 * Verbatim ports of brewlab-desktop.html lines 13511–13516. Kept in their
 * own module so the Planner page can import them cleanly without
 * pulling in everything from utils.ts. The HTML versions used local-time
 * Date construction (`new Date(y, m-1, d)`) so a `2026-05-04` string
 * stays on May 4 regardless of timezone — matched here. Do NOT swap
 * these for `new Date(s)` parsing, which UTC-shifts and can land the
 * picker on the wrong day for users east/west of UTC.
 *
 * `lib/utils.ts:today()` exists separately as a YYYY-MM-DD string
 * helper used elsewhere; this module's `todayDate()` returns a Date
 * object with time zeroed out at local midnight, which the Planner's
 * day-diff math needs.
 */

/** Date → 'YYYY-MM-DD'. Uses ISO slice; safe because we always pass
 *  Dates created at local midnight (no fractional days). */
export function dateToStr(d: Date): string {
  // Pad parts to avoid timezone-sensitive ISO conversion.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' → Date at local midnight. Avoids `new Date(s)`'s UTC
 *  parsing which shifts the day east/west of UTC. */
export function strToDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Returns a new Date n days after d (n may be negative). */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Whole-day difference (b − a). Rounds to handle DST transitions. */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Today's date at local midnight. */
export function todayDate(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** 'D Mon' short label (e.g. "4 May"). */
export function fmtDate(d: Date): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${M[d.getMonth()]}`;
}
