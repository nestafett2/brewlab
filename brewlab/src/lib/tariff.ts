/**
 * Tariff Reduction (関税割当) — pure helpers.
 *
 * Port of brewlab-desktop.html lines 8910–9034 minus dead code:
 *   • calcReservationBalances (8997) — reads `data.orders` which is
 *     never written; not routed from renderTariffPage.
 *   • getMaltedLibEntries (8929) — trivial filter; inlined at use sites.
 *
 * Naming notes:
 *   • `bl_tariff_<year>` is the persistence key. Lazy-loaded into the
 *     store as `tariffByYear[year]`.
 *   • PlanRow.classification uses the lower-case 'beer' / 'happoshu'
 *     wire format from the HTML data shape — different from React's
 *     `Classification` ('Beer' | 'Happoshu'). Calc helpers normalise.
 *   • TRQ flags are NEVER read off the data row; they're always re-derived
 *     from the malt library at call time. HTML's `m.tariff` write was
 *     dead-on-write — see TariffReservationMalt comment in types/index.ts.
 */

import { lsGet } from './storage';
import type {
  Ingredient, MaltLib, Template, TaxMasterRow,
  TariffPlanRow, TariffReservation, NeekyuuData, NeekyuuBlock, MonthOverride,
  MaltUsageMap, NeekyuuMonthRow,
} from '../types';

// ── Fiscal year (Japan: Apr–Mar) ────────────────────────────────────────

/** HTML brewlab-desktop.html:8913 — Japanese FY runs Apr–Mar. If we're in
 *  Jan/Feb/Mar (month index < 3), the FY started the previous calendar year. */
export function currentFiscalYear(date: Date = new Date()): number {
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
}

/** "2026–2027". */
export function fiscalYearLabel(y: number): string {
  return `${y}–${y + 1}`;
}

/**
 * Twelve {year, month} pairs for the FY, Apr (year) → Mar (year+1).
 * `month` is the JS month index (0–11). Convenience for buildMonthlyLedger
 * iteration order.
 */
export function fyMonths(y: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let m = 3; m <= 11; m++) out.push({ year: y, month: m });        // Apr–Dec
  for (let m = 0; m <= 2; m++)  out.push({ year: y + 1, month: m });    // Jan–Mar
  return out;
}

// ── Internal helpers ───────────────────────────────────────────────────

const monthStr = (y: number, m: number): string => `${y}-${String(m + 1).padStart(2, '0')}`;

const monthLabel = (y: number, m: number): string =>
  new Date(y, m, 1).toLocaleString('en', { month: 'short', year: 'numeric' });

/** Look up the TRQ flag for a malt name in the library. */
function isTariffMalt(name: string, maltLib: MaltLib[]): boolean {
  const e = maltLib.find(m => m.name === name);
  return !!e?.tariff;
}

/** Tax-master row has 'date', 'classification', 'recipeId' as dashed keys. */
function recDate(rec: TaxMasterRow): string {
  return ((rec as unknown as Record<string, unknown>)['date'] as string) || '';
}
function recIsBeer(rec: TaxMasterRow): boolean {
  const cls = ((rec as unknown as Record<string, unknown>)['classification'] as string) || '';
  return !cls.toLowerCase().includes('happoshu');
}
function recPackagedL(rec: TaxMasterRow): number {
  const v = (rec as unknown as Record<string, unknown>)['total-packaged'];
  return parseFloat(String(v ?? '')) || 0;
}

/**
 * Pull recipe ingredients with cache-then-fallback. The store's
 * ingredientsByRecipe is the cache; if a recipe hasn't been opened this
 * session it may be missing, so we fall back to localStorage. Helpers
 * stay pure — caller passes the cache map as input.
 */
function getIngs(
  recipeId: string,
  cache: Record<string, Ingredient[]>,
): Ingredient[] {
  return cache[recipeId] ?? lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
}

// ── Malt usage from Tax Master ─────────────────────────────────────────

/**
 * Aggregate malted-grain usage from committed Tax Master rows in [from, to].
 * Mirrors HTML brewlab-desktop.html:8937. Date strings are inclusive YYYY-MM-DD.
 *
 * Filters:
 *   • Only rows with date in [from, to] (empty string = no bound).
 *   • Only ingredients with type === 'grain' AND malted !== false.
 */
export function calcMaltUsageFromMaster(
  taxMaster: TaxMasterRow[],
  ingredientsByRecipe: Record<string, Ingredient[]>,
  maltLib: MaltLib[],
  fromDate: string,
  toDate: string,
): MaltUsageMap {
  const result: MaltUsageMap = {};

  const inRange = taxMaster.filter(r => {
    const d = recDate(r);
    return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  });

  for (const rec of inRange) {
    if (!rec.recipeId) continue;
    const isBeer = recIsBeer(rec);
    const ings = getIngs(rec.recipeId, ingredientsByRecipe);
    for (const ing of ings) {
      if (ing.type !== 'grain') continue;
      if (ing.malted === false) continue;
      const name = ing.name || '?';
      const kg = Number(ing.amt) || 0;
      if (!result[name]) {
        result[name] = { beer: 0, happoshu: 0, total: 0, tariff: isTariffMalt(name, maltLib) };
      }
      if (isBeer) result[name].beer += kg;
      else        result[name].happoshu += kg;
      result[name].total += kg;
    }
  }
  return result;
}

// ── Planned malt usage from Annual Planner rows ────────────────────────

/**
 * Aggregate planned malted-grain usage from Annual Planner rows.
 * Mirrors HTML brewlab-desktop.html:8972 with the templates-not-recipes
 * mapping (see CLAUDE.md / Template type docs).
 *
 * Each planner row scales the template's grain bill by
 * (row.batchL || tpl.batchL) / tpl.batchL, then attributes the kg to
 * Beer or Happoshu based on row.classification.
 */
export function calcPlannedMaltUsage(
  planner: TariffPlanRow[],
  templates: Template[],
  maltLib: MaltLib[],
): MaltUsageMap {
  const result: MaltUsageMap = {};
  for (const row of planner) {
    const tpl = templates.find(t => t.id === row.templateId);
    if (!tpl) continue; // orphaned templateId — skip silently (HTML 8977)
    const tplBatch = Number(tpl.batchL) || 1000;
    const rowBatch = parseFloat(row.batchL) || tplBatch;
    const scale = rowBatch / tplBatch;
    const isBeer = row.classification !== 'happoshu';
    for (const ing of (tpl.ingredients || [])) {
      if (ing.type !== 'grain') continue;
      if (ing.malted === false) continue;
      const name = ing.name || '?';
      const kg = (Number(ing.amt) || 0) * scale;
      if (!result[name]) {
        result[name] = { beer: 0, happoshu: 0, total: 0, tariff: isTariffMalt(name, maltLib) };
      }
      if (isBeer) result[name].beer += kg;
      else        result[name].happoshu += kg;
      result[name].total += kg;
    }
  }
  return result;
}

// ── Monthly ledger for 需給表 ────────────────────────────────────────

/**
 * Build the 12-row monthly ledger for the FY. Mirrors HTML's
 * renderNeekyuuHyo monthly-row build (brewlab-desktop.html:9433–9486).
 *
 * Per month:
 *   • purchases: reservations whose dateReceived falls in the month, summed
 *     by TRQ vs Standard from the malt library.
 *   • usage: tax-master brews in the month, walking each recipe's grain
 *     ingredients and bucketing by Beer vs Happoshu.
 *   • production: total-packaged on the same brews (kL = L / 1000).
 *
 * Manual overrides take precedence per field. Running stock chains
 * forward from neekyuu.openingStock.
 */
export function buildMonthlyLedger(
  year: number,
  neekyuu: NeekyuuData | undefined,
  reservations: TariffReservation[],
  taxMaster: TaxMasterRow[],
  ingredientsByRecipe: Record<string, Ingredient[]>,
  maltLib: MaltLib[],
): NeekyuuMonthRow[] {
  const months = fyMonths(year);
  const overrides = neekyuu?.overrides ?? {};
  const today = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  let runStock = parseFloat(neekyuu?.openingStock ?? '') || 0;

  return months.map(({ year: y, month: m }) => {
    const ms = monthStr(y, m);

    // Auto-derive purchases from reservations received in this month.
    let purchTrq = 0;
    let purchStd = 0;
    for (const res of reservations) {
      if (!res.dateReceived || res.dateReceived.slice(0, 7) !== ms) continue;
      for (const rm of (res.malts || [])) {
        const kg = parseFloat(rm.kgReceived || rm.kgReserved) || 0;
        if (isTariffMalt(rm.malt, maltLib)) purchTrq += kg;
        else                                purchStd += kg;
      }
    }

    // Auto-derive usage + production from tax-master rows brewed in this month.
    let usageBeer = 0;
    let usageHap = 0;
    let beerKL = 0;
    let hapKL = 0;
    for (const rec of taxMaster) {
      if (recDate(rec).slice(0, 7) !== ms) continue;
      const isBeer = recIsBeer(rec);
      const ings = getIngs(rec.recipeId, ingredientsByRecipe);
      for (const ing of ings) {
        if (ing.type !== 'grain') continue;
        if (ing.malted === false) continue;
        const kg = Number(ing.amt) || 0;
        if (isBeer) usageBeer += kg;
        else        usageHap += kg;
      }
      const kL = recPackagedL(rec) / 1000;
      if (isBeer) beerKL += kL;
      else        hapKL += kL;
    }

    // Apply manual overrides per field.
    const ov = overrides[ms] || {} as MonthOverride;
    const ovNum = (key: keyof MonthOverride, fallback: number): number => {
      const v = ov[key];
      return v !== undefined && v !== '' ? (parseFloat(v) || 0) : fallback;
    };
    purchTrq  = ovNum('purchTrq',  purchTrq);
    purchStd  = ovNum('purchStd',  purchStd);
    usageBeer = ovNum('usageBeer', usageBeer);
    usageHap  = ovNum('usageHap',  usageHap);
    beerKL    = ovNum('beerKL',    beerKL);
    hapKL     = ovNum('hapKL',     hapKL);

    const openStock = runStock;
    const purch = purchTrq + purchStd;
    const usage = usageBeer + usageHap;
    runStock = openStock + purch - usage;

    return {
      ms,
      label: monthLabel(y, m),
      isPast: ms <= today,
      openStock,
      purchTrq,
      purchStd,
      usageBeer,
      usageHap,
      beerKL,
      hapKL,
      purch,
      usage,
      closeStock: runStock,
    };
  });
}

// ── Standard 需給表 report-block layout ──────────────────────────────

/**
 * Standard NTA 需給表 structure — 8 blocks in fixed month spans, year
 * placeholders auto-fill. Mirrors HTML brewlab-desktop.html:9621.
 *
 * Layout:
 *   • Left column (4 malt blocks):
 *       prevY Apr–Sep   |   prevY Oct – curY Mar
 *       curY Apr–Sep    |   curY Apr – curY+1 Mar
 *   • Right column (4 production blocks):
 *       prevY Jul–Dec   |   curY Jan–Jun
 *       curY Jul–Dec    |   curY Jul – curY+1 Jun
 */
export function seedNeekyuuBlocks(year: number): NeekyuuBlock[] {
  const prevY = year - 1;
  const curY  = year;
  const fmt = (y: number, m: number): string => `${y}-${String(m).padStart(2, '0')}`;
  const lbl = (y1: number, m1: number, y2: number, m2: number): string => {
    const mn = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return `${y1}.${mn[m1 - 1]}~${y2}.${mn[m2 - 1]}`;
  };
  return [
    { label: lbl(prevY, 4, prevY, 9),    type: 'malt',       from: fmt(prevY, 4),  to: fmt(prevY, 9)   },
    { label: lbl(prevY, 10, curY, 3),    type: 'malt',       from: fmt(prevY, 10), to: fmt(curY, 3)    },
    { label: lbl(curY, 4, curY, 9),      type: 'malt',       from: fmt(curY, 4),   to: fmt(curY, 9)    },
    { label: lbl(curY, 4, curY + 1, 3),  type: 'malt',       from: fmt(curY, 4),   to: fmt(curY + 1, 3)},
    { label: lbl(prevY, 7, prevY, 12),   type: 'production', from: fmt(prevY, 7),  to: fmt(prevY, 12)  },
    { label: lbl(curY, 1, curY, 6),      type: 'production', from: fmt(curY, 1),   to: fmt(curY, 6)    },
    { label: lbl(curY, 7, curY, 12),     type: 'production', from: fmt(curY, 7),   to: fmt(curY, 12)   },
    { label: lbl(curY, 7, curY + 1, 6),  type: 'production', from: fmt(curY, 7),   to: fmt(curY + 1, 6)},
  ];
}

// ── Range sums on the monthly ledger ───────────────────────────────────

/**
 * Sum a numeric field on monthly rows whose `ms` is inside [from, to]
 * (inclusive, lexicographic — works because ms is always YYYY-MM).
 */
export function sumLedgerRange(
  rows: NeekyuuMonthRow[],
  from: string,
  to: string,
  field: keyof NeekyuuMonthRow,
): number {
  let s = 0;
  for (const r of rows) {
    if (r.ms < from || r.ms > to) continue;
    const v = r[field];
    if (typeof v === 'number') s += v;
  }
  return s;
}

/** Opening stock at the row whose `ms` matches `from`. 0 if not in range. */
export function ledgerOpeningAt(rows: NeekyuuMonthRow[], from: string): number {
  return rows.find(r => r.ms === from)?.openStock ?? 0;
}

/** Closing stock at the row whose `ms` matches `to`. 0 if not in range. */
export function ledgerClosingAt(rows: NeekyuuMonthRow[], to: string): number {
  return rows.find(r => r.ms === to)?.closeStock ?? 0;
}
