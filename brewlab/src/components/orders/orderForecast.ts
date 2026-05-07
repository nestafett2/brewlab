/**
 * Order Planner forecast — pure projection logic.
 *
 * Mirrors brewlab-desktop.html:
 *   • renderOrderPlanner   (15466) — timeline derivation + per-row math.
 *   • renderSuggestedOrderList (14878) — short-item suggestions.
 *
 * Functions here take in the full plannerBrews / orders / ledger / lib /
 * recipe-ingredient maps and return JSON-shaped data the React table
 * components render directly. No DOM, no React.
 */

import type {
  PlannerBrew, OrderEntry, LedgerData,
  Ingredient, MaltLib, HopLib, YeastLib, MiscLib,
} from '../../types';
import { ingNamesMatch } from '../../lib/ingredient-matcher';
import { sectionToIngType } from '../../lib/units';
import { getLedgerBalance } from '../../lib/ledger';

export type LibSection = 'malts' | 'hops' | 'yeast' | 'misc';
export type LibBySection = {
  malts: MaltLib[]; hops: HopLib[]; yeast: YeastLib[]; misc: MiscLib[];
};

export interface BrewColumn {
  kind: 'brew';
  brew: PlannerBrew;
}

export interface DeliveryColumn {
  kind: 'delivery';
  date: string;
  orders: OrderEntry[];
}

export type TimelineColumn = BrewColumn | DeliveryColumn;

/**
 * Build the forecast's timeline of columns: brews + deliveries
 * interleaved by date. Mirrors HTML 15485–15493.
 *
 * Only brews with `recipeId` are included (freeform brews have no
 * ingredient projection). Only orders with status !== 'received' show
 * up as delivery columns — received orders are already deducted from
 * stock via the ledger IN entry written at confirm-and-log time, so
 * showing them again would double-count.
 */
export function deriveTimeline(
  plannerBrews: PlannerBrew[],
  orders: OrderEntry[],
): TimelineColumn[] {
  const brews = plannerBrews
    .filter(b => b.recipeId)
    .slice()
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  const deliveryDates: Record<string, OrderEntry[]> = {};
  for (const o of orders) {
    if (o.status === 'received') continue;
    const dk = o.delivery || o.orderDate;
    if (!dk) continue;
    if (!deliveryDates[dk]) deliveryDates[dk] = [];
    deliveryDates[dk].push(o);
  }

  const allBrewDates = brews.map(b => b.start);
  const allDates = Array.from(new Set([...allBrewDates, ...Object.keys(deliveryDates)])).sort();

  const out: TimelineColumn[] = [];
  for (const d of allDates) {
    const brew = brews.find(b => b.start === d);
    if (brew) out.push({ kind: 'brew', brew });
    if (deliveryDates[d]) out.push({ kind: 'delivery', date: d, orders: deliveryDates[d] });
  }
  return out;
}

export interface ForecastCell {
  /** Recipe usage in kg/units (deducted unless `recorded`). */
  amt: number;
  /** Incoming amount on a delivery column. */
  incoming: number;
  /** Whether this brew's usage has already been recorded to the ledger
   *  (matched by brew-name prefix in the ledger entry's `beer` field). */
  recorded: boolean;
}

export interface ForecastRow {
  /** Library entry the row represents. */
  entry: { id: string | number; name: string; supplier?: string };
  /** Current ledger balance. */
  stock: number;
  /** Per-column cell data, aligned to timeline order. */
  colAmts: ForecastCell[];
  /** Per-column running balance after this column's net change. */
  balances: number[];
  /** Σ(amt for columns that aren't already recorded) — what still
   *  needs to be ordered. */
  totalNeeded: number;
  /** Σ(amt for all brew columns), used by the row hide-when-zero check. */
  totalRecipe: number;
  /** Σ(incoming for delivery columns). */
  totalIncoming: number;
  /** Final balance after the last column — drives the status indicator. */
  finalBalance: number;
}

export type ForecastStatus = 'DONE' | 'OK' | 'LOW' | 'SHORT';

export function computeRowStatus(row: ForecastRow): ForecastStatus {
  if (row.totalNeeded === 0) return 'DONE';
  if (row.finalBalance < 0) return 'SHORT';
  if (row.totalNeeded > 0 && row.finalBalance < row.totalNeeded * 0.15) return 'LOW';
  return 'OK';
}

/**
 * Build forecast rows for a section. Skips library entries that have
 * neither recipe usage nor incoming deliveries on the timeline (HTML
 * 15532).
 *
 * `getIngredients(recipeId)` should return the recipe's full Ingredient
 * array; the React store provides `ingredientsByRecipe` for this.
 */
export function buildForecastRows(
  sec: LibSection,
  timeline: TimelineColumn[],
  libBySection: LibBySection,
  inventoryStock: Record<string, number>,
  ledgerData: LedgerData,
  getIngredients: (recipeId: string) => Ingredient[],
): ForecastRow[] {
  const ingType = sectionToIngType(sec);
  const entries = libBySection[sec];
  const out: ForecastRow[] = [];

  for (const entry of entries) {
    const ledgerKey = `${sec}_${entry.id}`;
    const stock = getLedgerBalance(inventoryStock, ledgerData, ledgerKey);

    const colAmts: ForecastCell[] = timeline.map(col => {
      if (col.kind === 'brew') {
        const recipeId = col.brew.recipeId;
        if (!recipeId) return { amt: 0, incoming: 0, recorded: false };
        const ings = getIngredients(recipeId);
        const matched = ings.filter(i =>
          i.type === ingType && ingNamesMatch(entry.name, i.name, i.libId, entry.id));
        const recipeAmt = Math.round(
          matched.reduce((s, i) => s + (parseFloat(String(i.amt ?? 0)) || 0), 0) * 1000,
        ) / 1000;
        if (!recipeAmt) return { amt: 0, incoming: 0, recorded: false };
        const brewTag = col.brew.name.toLowerCase().split(' ').slice(0, 3).join(' ');
        const alreadyRecorded = (ledgerData[ledgerKey] ?? []).some(
          e => e.used != null && (e.beer ?? '').toLowerCase().includes(brewTag),
        );
        return { amt: recipeAmt, incoming: 0, recorded: alreadyRecorded };
      } else {
        // Delivery column — sum order qty for this exact entry name.
        // HTML uses an exact-name compare here (15524), not ingNamesMatch.
        let incoming = 0;
        for (const o of col.orders) {
          if (o.type === sec && o.ingredient === entry.name) {
            incoming += parseFloat(String(o.qty ?? 0)) || 0;
          }
        }
        return { amt: 0, incoming, recorded: false };
      }
    });

    const totalNeeded = colAmts.reduce((s, c) => s + (c.recorded ? 0 : c.amt), 0);
    const totalRecipe = colAmts.reduce((s, c) => s + c.amt, 0);
    const totalIncoming = colAmts.reduce((s, c) => s + c.incoming, 0);
    if (totalRecipe === 0 && totalIncoming === 0) continue;

    // Running balance.
    let running = stock;
    const balances: number[] = colAmts.map(c => {
      if (c.incoming > 0) running = Math.round((running + c.incoming) * 1000) / 1000;
      if (!c.recorded) running = Math.round((running - c.amt) * 1000) / 1000;
      return running;
    });
    const finalBalance = balances.length ? balances[balances.length - 1] : stock;

    out.push({
      entry: {
        id: entry.id,
        name: entry.name,
        supplier: (entry as { supplier?: string }).supplier,
      },
      stock,
      colAmts,
      balances,
      totalNeeded,
      totalRecipe,
      totalIncoming,
      finalBalance,
    });
  }

  return out;
}

// ── Suggestion logic for the Add Order modal ─────────────────────────

/**
 * Round-up increment per section (HTML 14911).
 * Malts buy in 25 kg sacks; hops in 1 kg; everything else 0.1.
 */
export function sectionRoundIncrement(sec: LibSection): number {
  return sec === 'malts' ? 25 : sec === 'hops' ? 1 : 0.1;
}

export interface Suggestion {
  type: LibSection;
  ingredient: string;
  qty: number;
  supplier: string;
  /** Magnitude of the deficit that triggered this suggestion (kg). */
  shortfall: number;
  delivery: string;
  status: 'pending';
  notes: string;
}

/**
 * Walk every library entry across all four sections; if the selected
 * brews would deplete stock to negative, suggest an order rounded up
 * to the section increment. Mirrors HTML 14893–14916.
 */
export function suggestShortItems(
  selectedBrews: PlannerBrew[],
  libBySection: LibBySection,
  inventoryStock: Record<string, number>,
  ledgerData: LedgerData,
  getIngredients: (recipeId: string) => Ingredient[],
): Suggestion[] {
  const sections: LibSection[] = ['malts', 'hops', 'yeast', 'misc'];
  const out: Suggestion[] = [];
  for (const sec of sections) {
    const ingType = sectionToIngType(sec);
    for (const entry of libBySection[sec]) {
      const stock = getLedgerBalance(inventoryStock, ledgerData, `${sec}_${entry.id}`);
      const brewUsage = selectedBrews.map(brew => {
        if (!brew.recipeId) return 0;
        const ings = getIngredients(brew.recipeId);
        const matched = ings.filter(i =>
          i.type === ingType && ingNamesMatch(entry.name, i.name, i.libId, entry.id));
        return matched.reduce((s, i) => s + (parseFloat(String(i.amt ?? 0)) || 0), 0);
      });
      const totalNeeded = brewUsage.reduce((s, u) => s + u, 0);
      if (!totalNeeded) continue;
      let running = stock;
      for (const u of brewUsage) running -= u;
      if (running >= 0) continue;
      const shortfall = Math.ceil(Math.abs(running) * 10) / 10;
      const incr = sectionRoundIncrement(sec);
      const orderQty = Math.ceil(shortfall / incr) * incr;
      const supplier = (entry as { supplier?: string }).supplier ?? '';
      out.push({
        type: sec,
        ingredient: entry.name,
        qty: orderQty,
        supplier,
        shortfall,
        delivery: '',
        status: 'pending',
        notes: `Short by ${shortfall.toFixed(1)} kg`,
      });
    }
  }
  return out;
}
