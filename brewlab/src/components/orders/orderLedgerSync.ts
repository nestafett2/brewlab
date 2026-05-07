/**
 * Order ↔ Ledger sync helpers.
 *
 * The invariant: bl_ledger reflects status='received' orders only.
 * These helpers are the single source for finding the ledger entry
 * associated with a given order id, and for building a fresh entry
 * when an order flips into the 'received' state.
 *
 * Manually-entered ledger rows omit `orderId` and are invisible to
 * `findOrderLedgerLocation` — that's intentional. The Edit Order
 * modal only ever touches the entry it created.
 *
 * Pre-fix (Phase 2 initial release) ledger entries written by the old
 * AddOrderModal flow lacked `orderId`. They remain as untagged rows;
 * the Edit Order modal's lookups skip them, so legacy received-orders
 * don't auto-migrate. Brewers can clean those rows up via the Tax
 * Ledger view if they want.
 */

import type {
  LedgerData, LedgerEntry, OrderEntry,
} from '../../types';
import type { LibBySection, LibSection } from './orderForecast';

/** Locate the (key, idx) of a ledger entry tagged with `orderId`,
 *  or null if not found. Walks every key — defensive against the
 *  ingredient being renamed in the library after the entry was tagged. */
export function findOrderLedgerLocation(
  ledgerData: LedgerData,
  orderId: string,
): { key: string; idx: number } | null {
  for (const key of Object.keys(ledgerData)) {
    const list = ledgerData[key];
    if (!list) continue;
    const idx = list.findIndex(e => e.orderId === orderId);
    if (idx >= 0) return { key, idx };
  }
  return null;
}

/** Build the IN ledger entry that represents `order` once received.
 *  Returns null when no library entry matches the order's `ingredient`
 *  (Edit Order surfaces this as a soft warning — the order still flips
 *  to received, just without a ledger record). */
export function buildOrderLedgerEntry(
  order: OrderEntry,
  libBySection: LibBySection,
): { key: string; entry: LedgerEntry } | null {
  const sec = order.type as LibSection;
  const lib = libBySection[sec];
  if (!lib) return null;
  // Exact name match — same lookup HTML used at confirm-and-log time
  // (HTML 15083). Fuzzy matcher would be wrong here; the ingredient
  // string was picked from a library dropdown.
  const libEntry = lib.find(e => e.name === order.ingredient);
  if (!libEntry) return null;

  const key = `${sec}_${libEntry.id}`;
  const date = order.delivery || order.orderDate || '';
  const entry: LedgerEntry = {
    date,
    got: order.qty,
    receivedDate: date,
    supplier: order.supplier,
    beer: order.notes || '',
    orderId: order.id,
  };
  return { key, entry };
}

/** Apply a list of (key, entry) inserts to a copy of ledgerData. */
export function applyLedgerInserts(
  ledgerData: LedgerData,
  inserts: { key: string; entry: LedgerEntry }[],
): LedgerData {
  if (!inserts.length) return ledgerData;
  const next: LedgerData = { ...ledgerData };
  for (const { key, entry } of inserts) {
    next[key] = [...(next[key] ?? []), entry];
  }
  return next;
}
