/**
 * Pure tax-record builders — no DOM, no store reads, no localStorage.
 *
 * Every function takes inputs and returns data; that is the contract that
 * makes the tax flow testable and lets us route every tax-build site
 * through `iterTaxIngredients` from lib/waterChem.ts.
 *
 * Port of brewlab-desktop.html:
 *   - pullIngredientTotals     line 8464
 *   - pullTaxDataFromTabs       line 8590
 *   - recordToTaxMaster snap-*  lines 8802–8861 (the snapshot half;
 *                              `buildSnapshot` is the pure half)
 *   - autoClassifyRecipeById    line 12078
 *
 * snap-* WRITE-ONCE INVARIANT
 * ───────────────────────────
 * Snap fields are produced *only* by `buildSnapshot`. The live-recompute
 * paths (loadTaxRecord on Tax-tab open, updateTaxFromRecipe on the Update
 * button) operate against an explicit allowlist (`LIVE_RECOMPUTE_KEYS`) that
 * is disjoint from `SNAP_KEYS`. The disjointness is asserted at module load
 * — `assertAllowlistsDisjoint()` runs at import time and throws if either
 * set ever drifts into the other.
 */

import type {
  Ingredient,
  TaxRecord,
  Recipe,
  BrewSettings,
  WaterChemData,
  ColdSideData,
  BrewDayData,
  TankCalibration,
  Classification,
  MiscLib,
  MaltLib,
} from '../types';
import { iterTaxIngredients } from './waterChem';
import { fvVolume, platoToSg } from './calculations';

// ═══════════════════════════════════════════════════════════════════
// Allowlist constants — ENFORCE write-once for snap-* fields
// ═══════════════════════════════════════════════════════════════════

/**
 * Tax-record fields recomputed from live ingredients on every Tax-tab open
 * (loadTaxRecord). Mirrors HTML loadTaxPage's `liveIngFields` (line 8522).
 */
export const LIVE_RECOMPUTE_KEYS = [
  'malt',
  'wheat',
  'oats',
  'other',
  'hops',
  'spent-grain',
] as const satisfies readonly (keyof TaxRecord)[];

/**
 * Tax-record fields produced by buildSnapshot. NEVER written by any other
 * function. Mirrors HTML recordToTaxMaster snap writes (lines 8835–8861).
 */
export const SNAP_KEYS = [
  'snap-into-bt',
  'snap-yeast-harvest',
  'snap-can-size-ml',
  'snap-cans',
  'snap-sell-can-l',
  'snap-can-waste-manual',
  'snap-flowmeter',
  'snap-flowmeter-waste',
  'snap-total-can-waste',
  'snap-keg-rows',
  'snap-sell-keg-l',
  'snap-kegs-15',
  'snap-kegs-10',
  'snap-keg-waste',
  'snap-transfer-yes',
  'snap-ut-waste',
  'snap-fv-bt-waste',
  'snap-fv-bt-pct',
  'snap-total-waste-pkg',
  'snap-total-waste',
  'snap-sell-total',
  'snap-pkg-date',
  'snap-transfer-into',
  'snap-bt-mm',
  'snap-pct-can-waste',
  'snap-pct-pkg-waste',
  'snap-pct-total',
] as const satisfies readonly (keyof TaxRecord)[];

/**
 * Module-load assertion: the live-recompute allowlist and the snap-* set
 * MUST be disjoint. If they ever overlap, recompute paths could overwrite a
 * filed snapshot — a legal-compliance bug. Asserted in production too;
 * cheap, catches a refactor that flips a snap-* key into the recompute path.
 */
function assertAllowlistsDisjoint(): void {
  const liveSet = new Set<string>(LIVE_RECOMPUTE_KEYS);
  const overlap = SNAP_KEYS.filter(k => liveSet.has(k));
  if (overlap.length > 0) {
    throw new Error(
      '[lib/tax.ts] LIVE_RECOMPUTE_KEYS and SNAP_KEYS must be disjoint. ' +
      'Overlap: ' + overlap.join(', ')
    );
  }
  for (const k of SNAP_KEYS) {
    if (!String(k).startsWith('snap-')) {
      throw new Error(
        '[lib/tax.ts] SNAP_KEYS may only contain keys starting with "snap-". ' +
        'Offender: ' + k
      );
    }
  }
}
assertAllowlistsDisjoint();

// ═══════════════════════════════════════════════════════════════════
// Pure builders
// ═══════════════════════════════════════════════════════════════════

const WHEAT_KW = /wheat|weizen|wit\b|hefeweizen/i;
const OATS_KW = /oat/i;

interface IngredientTotals {
  malt?: string;
  wheat?: string;
  oats?: string;
  other?: string;
  hops?: string;
  'spent-grain'?: string;
}

/**
 * Live ingredient totals for the tax record. Verbatim port of
 * brewlab-desktop.html:8464–8500. Output keys are stringified to match HTML
 * (which fixes decimals and drops zero-buckets), so the result merges
 * cleanly into a TaxRecord whose values are also strings.
 *
 * Water-chem rows (use='water chemistry' or name regex match) are excluded
 * via iterTaxIngredients. Type='water' rows are skipped automatically.
 */
export function pullIngredientTotals(
  ings: Ingredient[],
  settings: BrewSettings,
): IngredientTotals {
  let malt = 0, wheat = 0, oats = 0, other = 0;

  for (const ing of iterTaxIngredients(ings)) {
    if (ing.type === 'grain') {
      const kg = ing.unit === 'kg' ? ing.amt : ing.amt / 1000;
      // HTML: g.malted !== false → defaults to true when undefined
      const isMalted = ing.malted !== false;
      if (isMalted) {
        malt += kg;
      } else {
        const name = ing.name || '';
        if (WHEAT_KW.test(name)) wheat += kg;
        else if (OATS_KW.test(name)) oats += kg;
        else other += kg;
      }
    } else if (ing.type === 'misc') {
      // water-chem already filtered out by iterTaxIngredients
      const kg =
        ing.unit === 'kg' ? (parseFloat(String(ing.amt)) || 0) :
        ing.unit === 'g'  ? (parseFloat(String(ing.amt)) || 0) / 1000 :
        0;
      if (kg > 0) other += kg;
    }
  }

  // Hops total — separate iteration; iterTaxIngredients deliberately skips hops
  let totalHopG = 0;
  for (const h of ings) {
    if (h.type !== 'hop') continue;
    totalHopG += h.unit === 'g' ? h.amt : h.amt * 1000;
  }

  const result: IngredientTotals = {};
  if (malt > 0) result.malt = malt.toFixed(2);
  if (wheat > 0) result.wheat = wheat.toFixed(2);
  if (oats > 0) result.oats = oats.toFixed(2);
  if (other > 0) result.other = other.toFixed(2);
  if (totalHopG > 0) result.hops = (totalHopG / 1000).toFixed(3);

  const totalGrainKg = malt + wheat + oats + other;
  if (totalGrainKg > 0) {
    const grainAbsorb = settings.grainAbsorb ?? 0.75;
    result['spent-grain'] = (totalGrainKg * (1 + grainAbsorb)).toFixed(2);
  }
  return result;
}

/**
 * Total water (litres) used in the brew, for the `water` field on the tax
 * record. Three-tier fallback per CLAUDE.md:
 *
 *   1. A misc row whose name contains "water" and unit is 'L' (legacy,
 *      seeded "OA Water" rows in some old recipes).
 *   2. Water-chem mashVol + spargeVol.
 *   3. Sum of `type='water'` rows' amounts.
 *
 * DELIBERATE DIVERGENCE FROM THE HTML — the HTML's pullTaxDataFromTabs
 * has a fourth tier that estimates water from the equipment-profile boil-off
 * + trub-loss + batch size (line 8692–8697). We drop that tier per the
 * approved port plan §13 question 6: water-chem is always set at recipe
 * creation, so the equipment fallback never fires in practice — and when
 * it would have fired, "approximate from equipment profile" is the wrong
 * number to pre-fill into a legal tax record.
 */
export function waterLitresForTax(
  ings: Ingredient[],
  waterChem: WaterChemData | null | undefined,
): number | null {
  // Tier 1 — misc water row(s) with unit L
  let miscWater = 0;
  for (const ing of ings) {
    if (ing.type !== 'misc') continue;
    if (!/water/i.test(ing.name || '')) continue;
    if (!/^l$/i.test(ing.unit || '')) continue;
    miscWater += parseFloat(String(ing.amt)) || 0;
  }
  if (miscWater > 0) return miscWater;

  // Tier 2 — water_chem mashVol + spargeVol
  if (waterChem) {
    const mash = parseFloat(String(waterChem.mashVol ?? '')) || 0;
    const sparge = parseFloat(String(waterChem.spargeVol ?? '')) || 0;
    if (mash > 0 || sparge > 0) return mash + sparge;
  }

  // Tier 3 — sum of type='water' rows
  let water = 0;
  for (const ing of ings) {
    if (ing.type !== 'water') continue;
    water += parseFloat(String(ing.amt)) || 0;
  }
  return water > 0 ? water : null;
}

/**
 * Inputs for `pullTaxDataFromTabs`. Replaces the HTML's DOM-reads with a
 * single typed bundle so the function stays pure.
 */
export interface PullTaxContext {
  recipe: Recipe;
  ings: Ingredient[];
  brewDay: BrewDayData;
  waterChem: WaterChemData;
  coldSide: ColdSideData;
  settings: BrewSettings;
  tankCalib: Record<string, TankCalibration>;
}

/**
 * Build a partial TaxRecord from recipe + per-recipe blobs. Port of
 * brewlab-desktop.html:8590–8792, with the equipment-profile water fallback
 * removed (see waterLitresForTax). Output keys are dashed strings; values
 * are strings (DOM input.value semantics).
 *
 * Water-chem exclusion is handled inside pullIngredientTotals — this
 * function only re-derives non-ingredient fields plus the grain/hops/spent-
 * grain rollups.
 */
export function pullTaxDataFromTabs(ctx: PullTaxContext): Partial<TaxRecord> {
  const { recipe, ings, brewDay, waterChem, coldSide, settings, tankCalib } = ctx;
  const pulled: Partial<TaxRecord> = {};

  // ── Recipe meta ──
  pulled['recipe-name'] = recipe.name || '';
  // Tax blob's 'brew-num' dashed key is the LEGACY storage format —
  // unchanged. Source field on the recipe was renamed brewNum → taxBatch
  // (2026-05-06 Option C cleanup). The tax blob keeps 'brew-num' so old
  // bl_tax_<id> blobs and tax_records.brew_num column rows still parse.
  pulled['brew-num']    = recipe.taxBatch || (recipe.name?.match(/^\d+/)?.[0] ?? '');
  pulled['beer-name']   = recipe.beerName || '';
  if (recipe.brewDate) pulled.date = recipe.brewDate;

  // ── Ingredient totals (water-chem filter applied inside) ──
  Object.assign(pulled, pullIngredientTotals(ings, settings));

  // ── Yeast — Brew Day amount overrides recipe ingredient sum ──
  // HTML reads bd-yeast-amount + label (g vs L). The React BrewDayData blob
  // doesn't yet split yeast amount fields; we fall back to ingredient sum.
  // TODO: when BrewDayData adds yeast-amount fields, mirror HTML lines 8662–8667.
  let totalYeastG = 0;
  for (const y of ings) {
    if (y.type !== 'yeast') continue;
    const u = (y.unit || 'g').toLowerCase();
    if (u === 'kg')      totalYeastG += y.amt * 1000;
    else if (u === 'l')  totalYeastG += y.amt * 1000;  // 1 L slurry ≈ 1 kg
    else if (u === 'ml') totalYeastG += y.amt;
    else if (u === 'pkg') totalYeastG += y.amt * 11;   // dry packet ~11g
    else                  totalYeastG += y.amt;        // assume grams
  }
  if (totalYeastG > 0) pulled.yeast = (totalYeastG / 1000).toFixed(3);

  // ── Water (three-tier) ──
  const water = waterLitresForTax(ings, waterChem);
  if (water != null && water > 0) pulled.water = water.toFixed(1);

  // ── Kettle waste = measured post-boil − batch size ──
  const postBoilMeas = parseFloat(String(brewDay.postboilL ?? ''));
  const batchL = recipe.batchL || 0;
  if (isFinite(postBoilMeas) && postBoilMeas > 0 && batchL > 0) {
    const kw = postBoilMeas - batchL;
    if (kw >= 0) pulled['kettle-waste'] = kw.toFixed(1);
  }

  // ── FV vessel name (from recipe.bdFv → tankCalib lookup) ──
  if (recipe.bdFv) {
    const calib = tankCalib[recipe.bdFv];
    pulled['fv-num'] = calib?.name || recipe.bdFv;
  }

  // ── FV mm reading (raw + cone-height offset for tax reporting) ──
  // HTML line 8742: rawMM + (calib.coneHeight || 0). React TankCalibration
  // doesn't carry coneHeight today; we use raw mm. TODO: add coneHeight to
  // TankCalibration if a brewer's tax filings need the offset.
  const rawMM = parseFloat(String(brewDay.fvCm ?? ''));
  if (isFinite(rawMM) && rawMM > 0) {
    pulled['fv-mm'] = rawMM.toFixed(1);
  }

  // ── Cold-side raw fields ──
  if (coldSide['cs-mm-reading']) pulled.mm = coldSide['cs-mm-reading'];
  if (coldSide['cs-fg']) pulled['finish-brix'] = coldSide['cs-fg'];
  if (coldSide['cs-cans']) pulled.cans = coldSide['cs-cans'];

  // ── Cold-side computed: into FV (from mm + tankCalib) ──
  const fvCm = parseFloat(String(brewDay.fvCm ?? ''));
  if (recipe.bdFv && isFinite(fvCm) && fvCm > 0) {
    const fvCalib = tankCalib[recipe.bdFv];
    if (fvCalib) {
      const intoFv = fvVolume(fvCm, fvCalib);
      if (intoFv > 0) pulled['in-fv'] = intoFv.toFixed(1);
    }
  }

  // ── Cold-side computed: into BT (from cs-mm-reading + cs-bt-vessel calib) ──
  const btMm = parseFloat(String(coldSide['cs-mm-reading'] ?? ''));
  const btVesselId = coldSide['cs-bt-vessel'] || '';
  if (btVesselId && isFinite(btMm) && btMm > 0) {
    const btCalib = tankCalib[btVesselId];
    if (btCalib) {
      const intoBt = fvVolume(btMm, btCalib);
      if (intoBt > 0) pulled['in-bt'] = intoBt.toFixed(1);
    }
    const calibName = btCalib?.name || btVesselId;
    pulled.tank = calibName;
  }

  // ── Cold-side computed: ABV from start/finish brix ──
  const startBrix = parseFloat(String(pulled['start-brix'] ?? ''));
  const finishBrix = parseFloat(String(coldSide['cs-fg'] ?? ''));
  if (isFinite(startBrix) && startBrix > 0 && isFinite(finishBrix)) {
    const abv = (platoToSg(startBrix) - platoToSg(finishBrix)) * 131.25;
    if (abv > 0 && isFinite(abv)) pulled.abv = abv.toFixed(2);
  }

  // ── Start brix: prefer cs-og-measured, else recipe target ogPlato ──
  const measuredOG = parseFloat(String(coldSide['cs-og-measured'] ?? ''));
  if (isFinite(measuredOG) && measuredOG > 0) {
    pulled['start-brix'] = measuredOG.toFixed(2);
  } else if (recipe.ogPlato) {
    pulled['start-brix'] = recipe.ogPlato.toFixed(2);
  }

  // ── Can size (HTML stores both ml and L variants) ──
  const canSizeMl = parseFloat(String(coldSide['cs-can-size'] ?? '')) || 350;
  pulled['can-size'] = (canSizeMl / 1000).toFixed(3);
  pulled['can-size-ml'] = String(canSizeMl);

  // ── Keg qty + total ──
  const kegRows = coldSide['cs-keg-rows'] || [];
  if (kegRows.length > 0) {
    const kegParts = kegRows
      .filter(r => parseFloat(r.qty) > 0)
      .map(r => `${r.size}L×${r.qty}`);
    if (kegParts.length) pulled['keg-qty'] = kegParts.join(', ');
    const kegTotalL = kegRows.reduce(
      (s, r) => s + (parseFloat(r.size) || 0) * (parseFloat(r.qty) || 0),
      0,
    );
    if (kegTotalL > 0) pulled['keg-total'] = kegTotalL.toFixed(1);
  }

  // ── Can total + total packaged ──
  const taxCans = parseFloat(String(coldSide['cs-cans'] ?? '')) || 0;
  const canTotalL = taxCans * (canSizeMl / 1000);
  if (canTotalL > 0) pulled['can-total'] = canTotalL.toFixed(1);
  const kegTotal = parseFloat(String(pulled['keg-total'] ?? '')) || 0;
  const totalPackaged = kegTotal + canTotalL;
  if (totalPackaged > 0) pulled['total-packaged'] = totalPackaged.toFixed(1);

  // ── Classification — from recipe.classification (single source of truth) ──
  if (recipe.classification) pulled['class'] = recipe.classification;

  return pulled;
}

// ═══════════════════════════════════════════════════════════════════
// Snapshot — the only function permitted to write SNAP_KEYS
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute every snap-* field from the cold-side blob and the working tax
 * record's `in-fv` value. Pure — never reads the store, never reaches into
 * other blobs. Output is merged into the tax record by `recordToTaxMaster`.
 *
 * Verbatim port of brewlab-desktop.html:8806–8861 — rounding, percentage
 * helper, transfer/UT logic preserved exactly. Numeric outputs are real
 * numbers (not strings); HTML uses `parseFloat(x.toFixed(N))` so the JSON
 * carries clean numerics, which we mirror.
 */
export function buildSnapshot(
  coldSide: ColdSideData,
  taxRec: TaxRecord,
): Partial<TaxRecord> {
  const cs = coldSide;
  const kegRows = cs['cs-keg-rows'] || [];
  const canSizeMl = parseFloat(String(cs['cs-can-size'] ?? '')) || 350;
  const cans = parseFloat(String(cs['cs-cans'] ?? '')) || 0;
  const sellCanL = cans * canSizeMl / 1000;
  const canWasteManual = parseFloat(String(cs['cs-can-waste-manual'] ?? '')) || 0;
  const flowmeter = parseFloat(String(cs['cs-flowmeter'] ?? '')) || 0;
  const flowmeterWaste =
    flowmeter > 0 && sellCanL > 0
      ? Math.max(0, flowmeter - sellCanL - canWasteManual)
      : 0;
  const totalCanWaste = flowmeterWaste + canWasteManual;
  const sellKegL = kegRows.reduce(
    (s, r) => s + (parseFloat(r.size) || 0) * (parseFloat(r.qty) || 0),
    0,
  );
  const kegs15 = kegRows
    .filter(r => parseFloat(r.size) === 15)
    .reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
  const kegs10 = kegRows
    .filter(r => parseFloat(r.size) === 10)
    .reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
  const kegWaste = parseFloat(String(cs['cs-keg-waste'] ?? '')) || 0;
  const intoBT = parseFloat(String(cs['cs-liters-bt-saved'] ?? '')) || 0;
  const yeastHarvest = parseFloat(String(cs['cs-yeast-harvested'] ?? '')) || 0;
  const transferYes = cs['cs-transfer'] === 'Yes';
  const intoFV = parseFloat(String(taxRec['in-fv'] ?? '')) || 0;
  const sellTotal = sellKegL + sellCanL;
  const utWaste =
    !transferYes && intoFV > 0
      ? Math.max(0, intoFV - sellTotal - kegWaste - totalCanWaste - yeastHarvest)
      : 0;
  const fvBtWaste = intoFV > 0 ? Math.max(0, intoFV - intoBT - yeastHarvest) : 0;
  const totalWastePkg = kegWaste + totalCanWaste + utWaste;
  const totalWaste = fvBtWaste + totalWastePkg;
  const pkgDate =
    cs['cs-keg-date'] || cs['cs-can-date'] || cs['cs-transfer-date'] || '';
  const pct = (n: number, d: number): number =>
    d > 0 ? parseFloat((n / d * 100).toFixed(1)) : 0;

  const snap: Partial<TaxRecord> = {
    'snap-into-bt':          intoBT,
    'snap-yeast-harvest':    yeastHarvest,
    'snap-can-size-ml':      canSizeMl,
    'snap-cans':             cans,
    'snap-sell-can-l':       parseFloat(sellCanL.toFixed(3)),
    'snap-can-waste-manual': canWasteManual,
    'snap-flowmeter':        flowmeter,
    'snap-flowmeter-waste':  parseFloat(flowmeterWaste.toFixed(1)),
    'snap-total-can-waste':  parseFloat(totalCanWaste.toFixed(3)),
    'snap-keg-rows':         kegRows.map(r => ({ size: r.size, qty: r.qty })),
    'snap-sell-keg-l':       parseFloat(sellKegL.toFixed(1)),
    'snap-kegs-15':          kegs15,
    'snap-kegs-10':          kegs10,
    'snap-keg-waste':        kegWaste,
    'snap-transfer-yes':     transferYes,
    'snap-ut-waste':         parseFloat(utWaste.toFixed(1)),
    'snap-fv-bt-waste':      parseFloat(fvBtWaste.toFixed(1)),
    'snap-fv-bt-pct':        pct(fvBtWaste, intoFV),
    'snap-total-waste-pkg':  parseFloat(totalWastePkg.toFixed(3)),
    'snap-total-waste':      parseFloat(totalWaste.toFixed(1)),
    'snap-sell-total':       parseFloat(sellTotal.toFixed(1)),
    'snap-pkg-date':         pkgDate,
    'snap-transfer-into':    cs['cs-bt-vessel'] || '',
    'snap-bt-mm':            cs['cs-mm-reading'] || '',
    'snap-pct-can-waste':    pct(totalCanWaste, sellCanL),
    'snap-pct-pkg-waste':    pct(totalWastePkg, sellTotal),
    'snap-pct-total':        pct(totalWaste, intoFV),
  };

  return snap;
}

// ═══════════════════════════════════════════════════════════════════
// Field-level merge (respects manual overrides)
// ═══════════════════════════════════════════════════════════════════

/**
 * Merge updates into a tax record, skipping any fields the user has marked
 * as a manual override (mirrors HTML's data-manualOverride attribute on
 * input elements; in the React port the overrides live in the store as a
 * recipeId → Set of field names map).
 *
 * If `respectOverrides` is true (default), overridden fields keep their
 * previous values. If false, every key in `updates` is applied (used by the
 * "Update from Recipe" path AFTER the user confirms the override warning).
 */
export function mergeTaxFieldUpdate(
  prev: TaxRecord,
  updates: Partial<TaxRecord>,
  manualOverrides: Record<string, true>,
  respectOverrides = true,
): TaxRecord {
  const next: TaxRecord = { ...prev };
  for (const [key, value] of Object.entries(updates) as [keyof TaxRecord, unknown][]) {
    if (respectOverrides && manualOverrides[key as string]) continue;
    // SAFETY: the runtime disjoint check guarantees `updates` callers cannot
    // include snap-* keys via LIVE_RECOMPUTE_KEYS. Code that *does* want to
    // write snap-* (i.e. recordToTaxMaster) bypasses mergeTaxFieldUpdate
    // and merges the buildSnapshot output directly.
    (next as Record<string, unknown>)[key as string] = value;
  }
  return next;
}

// ═══════════════════════════════════════════════════════════════════
// Auto-classification (single source of truth)
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the auto-classified Beer/Happoshu value for a recipe. Pure — does
 * not write to the recipe; the caller (setRecipeClassification action) is
 * the only writer. Verbatim port of brewlab-desktop.html:12078–12099.
 *
 * Rules:
 *   1. Any misc ingredient flagged `happoshu_trigger` in the misc library
 *      forces Happoshu.
 *   2. Else, if (malted grain kg / total grain kg) < 0.80 → Happoshu.
 *   3. Else → Beer.
 *
 * The malted check looks up MaltLib.malted (NOT Ingredient.malted) so the
 * library is the canonical source for classification, matching HTML
 * line 12094.
 */
export function applyAutoClassification(
  ings: Ingredient[],
  miscLib: MiscLib[],
  maltLib: MaltLib[],
): Classification {
  // Rule 1 — happoshu_trigger flag in misc library
  for (const ing of ings) {
    if (ing.type !== 'misc') continue;
    const libE = miscLib.find(e => e.id === ing.libId || e.name === ing.name);
    if (libE?.happoshu_trigger === true) return 'Happoshu';
  }

  // Rule 2 — malt ratio < 80%
  let totalGrainKg = 0;
  let maltedKg = 0;
  for (const ing of ings) {
    if (ing.type !== 'grain') continue;
    const kg = parseFloat(String(ing.amt)) || 0;
    totalGrainKg += kg;
    const libE = maltLib.find(e => e.id === ing.libId || e.name === ing.name);
    const isMalted = libE ? libE.malted !== false : true;
    if (isMalted) maltedKg += kg;
  }
  if (totalGrainKg > 0 && (maltedKg / totalGrainKg) * 100 < 80) {
    return 'Happoshu';
  }
  return 'Beer';
}

// ═══════════════════════════════════════════════════════════════════
// Display helpers — single source of truth for label vs. wire-format ID
// ═══════════════════════════════════════════════════════════════════

/** Human-facing label: brand name with a fallback to the tax identifier. */
export function displayLabel(recipe: Pick<Recipe, 'beerName' | 'name'>): string {
  return recipe.beerName || recipe.name || '';
}

/** Wire-format identifier (仕込記号). The `recipe-name` field on every
 *  tax record uses this. Never fall back to beerName here — tax filings
 *  must stay keyed by the official symbol. */
export function taxIdentifier(recipe: Pick<Recipe, 'name'>): string {
  return recipe.name || '';
}
