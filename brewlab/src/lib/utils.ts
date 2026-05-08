/**
 * Shared utilities.
 */

import type { Recipe } from '../types';

/**
 * Coerce a `LibNum`-style value (number | string | null | undefined) to a
 * concrete number. Library types in this app accept loose unions so legacy
 * localStorage blobs and BeerXML/BSMX-imported strings round-trip without
 * data loss; arithmetic call sites should funnel through this helper to
 * avoid silent string-vs-number comparisons.
 *
 * Returns `fallback` (default 0) when the value is null/undefined/empty
 * string or parses to NaN. Numeric values pass through unchanged.
 */
export function asNum(
  v: number | string | null | undefined,
  fallback = 0,
): number {
  if (typeof v === 'number') return isFinite(v) ? v : fallback;
  if (v == null || v === '') return fallback;
  const n = parseFloat(String(v));
  return isFinite(n) ? n : fallback;
}

/** Detect device type from viewport width */
export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export function detectDevice(): DeviceType {
  const w = window.innerWidth;
  if (w <= 480) return 'mobile';
  if (w <= 1024) return 'tablet';
  return 'desktop';
}

/** Generate a unique recipe ID */
export function newRecipeId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const n = parseInt(id.replace('r', ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `r${max + 1}`;
}

/** Generate an ingredient ID: recipeId + '_' + index */
export function newIngredientId(recipeId: string, existingIds: string[]): string {
  let max = -1;
  for (const id of existingIds) {
    const parts = id.split('_');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${recipeId}_${max + 1}`;
}

/** Format a date for display (YYYY-MM-DD) */
export function formatDate(date: string | Date): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/** Get today as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** Determine ferm status for a recipe */
export type FermStatus = 'Packaged' | 'Fermenting' | 'Brew Day' | 'Planned';

export function getFermStatus(
  brewDate: string,
  packaged: boolean,
  fermLogCount: number
): FermStatus {
  if (packaged) return 'Packaged';

  const brew = new Date(brewDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  brew.setHours(0, 0, 0, 0);

  if (fermLogCount > 0) return 'Fermenting';
  if (brew <= now) return 'Fermenting'; // past date, no readings = Fermenting
  if (brew.getTime() === now.getTime()) return 'Brew Day';
  return 'Planned';
}

/** Check if a brew is active (shows on tablet/mobile) */
export function isActiveBrew(brewDate: string, packaged: boolean): boolean {
  if (packaged) return false;
  const brew = new Date(brewDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  brew.setHours(0, 0, 0, 0);
  return brew <= now;
}

/**
 * Format an ingredient amount for display. Mirrors HTML fmtAmt (auto mode)
 * at brewlab-desktop.html:4271 — does NOT change the unit. Earlier React
 * versions divided grams >= 1000 by 1000 while keeping the 'g' label,
 * which displayed "1.50 g" for a 1500g hop.
 *
 * Behaviour by unit:
 *   - g / kg : integer if whole, otherwise up to 2dp with trailing zeros trimmed
 *   - ml     : integer
 *   - L      : 1dp
 *   - other  : raw String()
 */
export function fmtAmt(amt: number, unit: string): string {
  if (unit === 'g' || unit === 'kg') {
    return amt % 1 === 0 ? amt.toFixed(0) : parseFloat(amt.toFixed(2)).toString();
  }
  if (unit === 'ml') return amt.toFixed(0);
  if (unit === 'L')  return amt.toFixed(1);
  return String(amt);
}

/** Sidebar style line: BJCP-coded styles render as "Name · 5C"; any
 *  other trailing parenthetical (custom-guide tag) is stripped so
 *  the line stays terse. Inverse of formatStyleLabel() in lib/styles.ts
 *  (which produces "Name (BJCP 5C)" / "Name (Custom)"). */
export function formatRecipeStyleLine(style: string | undefined | null): string {
  if (!style) return '';
  const bjcp = style.match(/^(.*?)\s*\(BJCP\s+([^)]+)\)\s*$/i);
  if (bjcp) return `${bjcp[1].trim()} · ${bjcp[2].trim()}`;
  return style.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Deep clone a plain object */
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Short id for profiles / planner brews / etc. Verbatim port of the HTML's
 * `makeId` (brewlab-desktop.html:20070). Produces ~12-char base-36 ids:
 * timestamp prefix + 4 random chars. Easier to read in dev than a full
 * UUID — used for things that don't ride on a database PK.
 */
export function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}


/** Debounce a function */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Recompute brewNumber for every recipe in every lineage in chronological
 * order. Pure function — returns a new array if anything changed, or the
 * input array unchanged otherwise.
 *
 * Per-lineage rule:
 *   • Lineage = recipes sharing `lineageId` (or just the recipe itself
 *     if no lineageId is set — same fall-through pattern as HistoryTab).
 *   • Sort each lineage by `brewDate` ascending, ties broken by `id`
 *     ascending (matches HistoryTab's derived-index logic).
 *   • Reassign brewNumber 1, 2, 3, ... in that order.
 *
 * Called once on first hydrate after the 2026-05-06 brewNumber field
 * landed — before that, the meta-bar pill was a free-text input that
 * could hold any value (e.g. "123" stored as the tax serial). The
 * recompute fixes that historical drift.
 *
 * Ordering note: when two recipes in a lineage share the same
 * brewDate (e.g. two created the same day), `id` ordering wins. Recipe
 * IDs are like 'r1', 'r2', 'r13' — `localeCompare` with default options
 * sorts 'r10' before 'r2' alphabetically (wrong). We strip the 'r'
 * prefix and parse the numeric suffix to sort correctly.
 */
export function recomputeBrewNumbers(recipes: Recipe[]): Recipe[] {
  const groups = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const key = r.lineageId || r.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const idNum = (id: string): number => {
    const m = parseInt(String(id).replace(/^r/, ''), 10);
    return isFinite(m) ? m : 0;
  };

  const updates = new Map<string, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const ad = a.brewDate || '';
      const bd = b.brewDate || '';
      if (ad !== bd) return ad.localeCompare(bd);
      return idNum(a.id) - idNum(b.id);
    });
    group.forEach((r, i) => updates.set(r.id, i + 1));
  }

  let changed = false;
  const next = recipes.map(r => {
    const want = updates.get(r.id);
    if (want !== r.brewNumber) {
      changed = true;
      return { ...r, brewNumber: want };
    }
    return r;
  });
  return changed ? next : recipes;
}
