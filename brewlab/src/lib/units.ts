/**
 * Unit-formatting + unit-conversion helpers for Inventory + Order Planner.
 * Verbatim ports of the HTML helpers:
 *   • fmtKg          (brewlab-desktop.html:14551)
 *   • fmtIngAmt      (brewlab-desktop.html:15640)
 *   • toKgForLedger  (brewlab-desktop.html:15649)
 *
 * Tax-ledger storage is always in kg (HTML 15649 toKgForLedger), so the
 * Record Usage modal converts g/ml inputs at write time. Keep these
 * conversions pure; downstream code (running balance, exports) reads
 * the kg-canonical values directly.
 */

/** Pretty-print a kg quantity. 0 / blank → "0"; integers → "5";
 *  fractional → 1 decimal "5.4". Mirrors HTML 14551 verbatim. */
export function fmtKg(v: number | string | null | undefined): string {
  if (v === 0 || v === '' || v == null) return '0';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!isFinite(n) || n === 0) return '0';
  return n % 1 === 0 ? n.toString() : n.toFixed(1);
}

/** Format an ingredient amount for display alongside its unit. Used by
 *  the Record Usage modal's pre-fill so a recipe row's "454 g" reads
 *  cleanly. Matches HTML fmtIngAmt at line 15640. */
export function fmtIngAmt(amt: number | string | null | undefined, unit: string): string {
  const n = typeof amt === 'number' ? amt : parseFloat(String(amt ?? 0));
  if (!isFinite(n)) return '0';
  if (unit === 'g')  return Math.round(n).toString();
  if (unit === 'kg') {
    const r = Math.round(n * 100) / 100;
    return r % 1 === 0 ? r.toFixed(0) : r.toFixed(1);
  }
  if (unit === 'ml') return Math.round(n).toString();
  return (Math.round(n * 10) / 10).toString();
}

/** Convert amount+unit to kg for ledger storage. Rounds to 2 g
 *  precision (g and ml branches) — kg passes through with 2-dp rounding. */
export function toKgForLedger(amt: number | string | null | undefined, unit: string): number {
  const n = typeof amt === 'number' ? amt : parseFloat(String(amt ?? 0));
  if (!isFinite(n)) return 0;
  if (unit === 'g')  return Math.round(n * 100) / 100 / 1000;
  if (unit === 'ml') return Math.round(n * 100) / 100 / 1000;
  return Math.round(n * 100) / 100;
}

// ── Section labels + units (HTML 14223–14224) ──────────────────────────

export const INV_SECTION_LABELS: Record<string, string> = {
  malts: 'MALTS & GRAINS',
  hops:  'HOPS',
  yeast: 'YEAST',
  misc:  'ADJUNCTS',
};

export const INV_UNITS: Record<string, string> = {
  malts: 'kg',
  hops:  'kg',
  yeast: 'pkg',
  misc:  'kg',
};

/** Map an inventory section to the recipe-ingredient `type` column. */
export function sectionToIngType(sec: string): 'grain' | 'hop' | 'yeast' | 'misc' {
  return sec === 'malts' ? 'grain'
       : sec === 'hops'  ? 'hop'
       : sec === 'yeast' ? 'yeast'
       : 'misc';
}
