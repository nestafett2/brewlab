/**
 * NTA Submitter math — port of brewlab-desktop.html:11502–11637.
 *
 * The submitter computes a per-1000L normalised view of a recipe so the
 * same beer brewed at any batch size produces identical declaration figures.
 * That normalised view is what the comparison grid measures against the
 * historical submissions register.
 *
 * Note on grain bucketing: ntaNormalise's malt/wheat/oats/other layout is
 * NOT the same as pullIngredientTotals' (lib/tax.ts):
 *   - NTA: maltKg INCLUDES malted wheat + malted oats (HTML lines 11522–11529).
 *          wheatKg/oatsKg are the malted-only sub-totals.
 *          otherGrainKg is unmalted-only.
 *   - Tax: malt counts every malted grain. wheat/oats/other count UNMALTED
 *          grain split by name regex.
 * Don't try to share the rollup — they're genuinely different.
 */

import type {
  Ingredient,
  Recipe,
  WaterChemData,
  ColdSideData,
  BrewDayData,
  MiscLib,
  MaltLib,
} from '../types';
import { iterTaxIngredients, isWaterChem } from './waterChem';
import { waterLitresForTax } from './tax';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface NtaMiscEntry {
  name: string;
  kgRaw: number;        // total kg used in batch (after per-1000L scaling, this becomes per-1000L)
  kgPer1000: number;    // per 1000L
  happoshuTrigger: boolean;
}

export interface NtaRaw {
  maltKg: number;
  wheatKg: number;
  oatsKg: number;
  otherGrainKg: number;
  hopsKg: number;
  yeastKg: number;
  waterL: number;
  miscList: NtaMiscEntry[];
  ogP: number;
  abv: number;
  intoFV: number;
  packaged: number;
  batchL: number;
}

export interface NtaPer1000 extends NtaRaw {
  // Same shape — only numeric values differ. Kept distinct in types for
  // call-site readability (declared/comparison-grid receive NtaPer1000).
}

export interface NtaRatioKey {
  hopRatio: number;
  yeastRatio: number;
  miscNames: string;
}

export interface NtaContext {
  recipe: Recipe;
  ings: Ingredient[];
  brewDay: BrewDayData;
  waterChem: WaterChemData;
  coldSide: ColdSideData;
  miscLib: MiscLib[];
  maltLib: MaltLib[];
}

// ═══════════════════════════════════════════════════════════════════
// Builders
// ═══════════════════════════════════════════════════════════════════

/**
 * Raw recipe totals for NTA submission. No batch-size scaling — the caller
 * applies it via `ntaNormalise1000`. Verbatim port of lines 11508–11597.
 *
 * Water-chem exclusion is applied to the misc list (mirrors HTML lines
 * 11569–11570) BEFORE the happoshu_trigger check (line 11580). The two
 * filters from waterChem.ts run together via isWaterChem — DO NOT inline
 * the regex here.
 */
export function ntaNormalise(ctx: NtaContext): NtaRaw {
  const { recipe, ings, brewDay, waterChem, coldSide, miscLib, maltLib } = ctx;
  const batchL = recipe.batchL || 1000;

  // ── Grain breakdown — different bucketing from pullIngredientTotals ──
  let maltKg = 0, wheatKg = 0, oatsKg = 0, otherGrainKg = 0;
  // iterTaxIngredients yields grain + non-water-chem misc; we want grain only here
  for (const ing of iterTaxIngredients(ings)) {
    if (ing.type !== 'grain') continue;
    const kg = parseFloat(String(ing.amt)) || 0;
    const libE = maltLib.find(e => e.id === ing.libId || e.name === ing.name);
    const name = (ing.name || '').toLowerCase();
    const type = (libE?.malt_type || '').toLowerCase();
    const isMalted = libE ? libE.malted !== false : true;
    if (!isMalted) {
      otherGrainKg += kg;
    } else if (name.includes('wheat') || type.includes('wheat')) {
      wheatKg += kg;
      maltKg += kg;
    } else if (name.includes('oat') || type.includes('oat')) {
      oatsKg += kg;
      maltKg += kg;
    } else {
      maltKg += kg;
    }
  }

  // ── Hops (kg) ──
  let hopsKg = 0;
  for (const h of ings) {
    if (h.type !== 'hop') continue;
    const amt = parseFloat(String(h.amt)) || 0;
    hopsKg += h.unit === 'kg' ? amt : amt / 1000;
  }

  // ── Yeast (kg) ──
  let yeastKg = 0;
  for (const y of ings) {
    if (y.type !== 'yeast') continue;
    const amt = parseFloat(String(y.amt)) || 0;
    yeastKg += y.unit === 'kg' ? amt : amt / 1000;
  }

  // ── Water (three-tier — shared with Tax tab via lib/tax.ts) ──
  const waterL = waterLitresForTax(ings, waterChem) ?? 0;

  // ── Misc list — water-chem filter via isWaterChem, then happoshu lookup ──
  const miscList: NtaMiscEntry[] = [];
  for (const m of ings) {
    if (m.type !== 'misc') continue;
    if (isWaterChem(m)) continue;
    const libE = miscLib.find(e => e.id === m.libId || e.name === m.name);
    const amt = parseFloat(String(m.amt)) || 0;
    const kgRaw = m.unit === 'kg' ? amt : amt / 1000;
    miscList.push({
      name: m.name,
      kgRaw,
      kgPer1000: kgRaw / (batchL || 1000) * 1000,
      happoshuTrigger: !!libE?.happoshu_trigger,
    });
  }

  // ── OG / ABV from recipe stats (already °Plato) ──
  const ogP = recipe.ogPlato || 0;
  const abv = recipe.abv || 0;

  // ── Into FV — prefer brew-day post-boil, else batch size ──
  const postboil = parseFloat(String(brewDay.postboilL ?? ''));
  const intoFV = isFinite(postboil) && postboil > 0 ? postboil : (batchL || 1000);

  // ── Packaged — sum kegs + cans from raw cold-side fields. The HTML
  // reads csData.sellable but that's a derived value computed in PackagingTab.
  // Computing it inline here keeps NTA self-contained and avoids depending
  // on a field that may or may not have been persisted.
  const kegRows = coldSide['cs-keg-rows'] || [];
  const sellKegL = kegRows.reduce(
    (s, r) => s + (parseFloat(r.size) || 0) * (parseFloat(r.qty) || 0),
    0,
  );
  const cans = parseFloat(String(coldSide['cs-cans'] ?? '')) || 0;
  const canSizeMl = parseFloat(String(coldSide['cs-can-size'] ?? '')) || 350;
  const sellCanL = cans * canSizeMl / 1000;
  const packaged = sellKegL + sellCanL;

  return {
    maltKg,
    wheatKg,
    oatsKg,
    otherGrainKg,
    hopsKg,
    yeastKg,
    waterL,
    miscList,
    ogP,
    abv,
    intoFV,
    packaged,
    batchL: batchL || 1000,
  };
}

/**
 * Per-1000L view. `scale = 1000 / batchL` applied to every numeric field
 * including each misc entry. Same recipe at any batch size produces
 * identical output — the cross-batch matching property the comparison grid
 * relies on. Verbatim port of lines 11601–11617.
 */
export function ntaNormalise1000(raw: NtaRaw): NtaPer1000 {
  const scale = 1000 / (raw.batchL || 1000);
  return {
    ...raw,
    maltKg:       raw.maltKg * scale,
    wheatKg:      raw.wheatKg * scale,
    oatsKg:       raw.oatsKg * scale,
    otherGrainKg: raw.otherGrainKg * scale,
    hopsKg:       raw.hopsKg * scale,
    yeastKg:      raw.yeastKg * scale,
    waterL:       raw.waterL * scale,
    intoFV:       raw.intoFV * scale,
    packaged:     raw.packaged * scale,
    miscList:     raw.miscList.map(m => ({ ...m, kgRaw: m.kgPer1000 / 1000 })),
  };
}

/**
 * Per-malt-kg ratio key for matching. Two recipes with the same hop/yeast
 * ratio and the same misc list are considered the "same beer" for NTA
 * declaration purposes. Verbatim port of lines 11619–11627.
 */
export function ntaRatioKey(norm: NtaRaw | NtaPer1000): NtaRatioKey {
  const malt = norm.maltKg || 1;
  return {
    hopRatio:  norm.hopsKg  / malt,
    yeastRatio: norm.yeastKg / malt,
    miscNames: norm.miscList.map(m => m.name.toLowerCase()).sort().join('|'),
  };
}

/**
 * Tolerance-based match between two ratio keys. Returns true when both
 * the hop and yeast ratios are within ±10% AND the misc-name lists are
 * identical. Verbatim port of lines 11629–11637.
 */
export function ntaMatchScore(a: NtaRatioKey, b: NtaRatioKey): boolean {
  const tol = 0.10;
  const within = (x: number, y: number): boolean =>
    y === 0 ? x === 0 : Math.abs(x - y) / Math.max(x, y) <= tol;
  if (!within(a.hopRatio, b.hopRatio)) return false;
  if (!within(a.yeastRatio, b.yeastRatio)) return false;
  if (a.miscNames !== b.miscNames) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// Field-level status for the comparison grid
// ═══════════════════════════════════════════════════════════════════

export type FieldStatus = 'green' | 'amber' | 'red' | 'grey';

/**
 * Colour-code one numeric field on the comparison grid. Used per-cell:
 *   - within ±10% of declared → green
 *   - within ±25%             → amber
 *   - otherwise               → red
 *   - misc mismatch / no data → grey
 */
export function ntaFieldStatus(declared: number, actual: number): FieldStatus {
  if (declared === 0 && actual === 0) return 'grey';
  const denom = Math.max(Math.abs(declared), Math.abs(actual));
  if (denom === 0) return 'grey';
  const delta = Math.abs(declared - actual) / denom;
  if (delta <= 0.10) return 'green';
  if (delta <= 0.25) return 'amber';
  return 'red';
}
