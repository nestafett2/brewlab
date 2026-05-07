/**
 * Tax-ledger helpers — port of brewlab-desktop.html:15127 (getLedgerBalance)
 * + the running-balance pattern used in renderLedger / renderInventory.
 *
 * All amounts are kg per HTML convention (toKgForLedger writes kg
 * regardless of the recipe's unit). The ledger is high-stakes — it
 * feeds NTA tax filings — so the balance math is identical to HTML's
 * implementation, including the float-noise round-to-3-decimals at the
 * end of getLedgerBalance.
 */

import type { LedgerData, LedgerEntry } from '../types';

/** Compute the current balance for a ledger key. Identical math to
 *  HTML 15128–15135: opening (from invStock) + sum(got) − sum(used),
 *  rounded to 3 decimal places. */
export function getLedgerBalance(
  inventoryStock: Record<string, number>,
  ledgerData: LedgerData,
  key: string,
): number {
  const opening = parseFloat(String(inventoryStock[key] ?? 0)) || 0;
  const entries = ledgerData[key] ?? [];
  let balance = opening;
  for (const e of entries) {
    if (e.got)  balance += Number(e.got)  || 0;
    if (e.used) balance -= Number(e.used) || 0;
  }
  return Math.round(balance * 1000) / 1000;
}

/** Sort ledger entries by `date` ascending — used for display ordering
 *  and running-balance computation. Returns a new array; does not
 *  mutate. Mirrors HTML's `entries.slice().sort(...)` pattern. */
export function sortLedgerByDate(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * Compute the running balance row-by-row over a sorted entries array.
 * Returns the balance after each entry in the same order as the input.
 * Used by LedgerView for the BALANCE column — not used by
 * getLedgerBalance which only needs the final total.
 */
export function runningBalances(opening: number, entries: LedgerEntry[]): number[] {
  let r = opening;
  const out: number[] = [];
  for (const e of entries) {
    if (e.got)  r += Number(e.got)  || 0;
    if (e.used) r -= Number(e.used) || 0;
    out.push(Math.round(r * 1000) / 1000);
  }
  return out;
}
