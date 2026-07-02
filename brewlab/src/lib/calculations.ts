/**
 * BrewLab Calculations — pure functions.
 * All formulas from CALCULATIONS.md.
 */

import type {
  Ingredient, Classification, IngredientType,
  MaltLib, HopLib, YeastLib, MiscLib, MashProfile, EquipmentProfile, Recipe,
  TankCalibration, IbuMethod, BrewSettings,
  WaterIon, WaterMineral, WaterProfile,
  FermMeta,
} from '../types';
import { asNum } from './utils';

// === Constants ===
const METRIC_CONSTANT = 384; // 46 PPG_max * 2.2046 lb/kg / 0.264172 gal/L
export const L_PER_BBL = 117.348; // US beer barrel (matches HTML 7884)

// === Gravity ===

/** Calculate OG in SG from grain bill */
export function calcOG(
  grains: Ingredient[],
  maltLib: MaltLib[],
  batchL: number,
  efficiency: number
): number {
  if (batchL <= 0) return 1.0;
  const effFrac = efficiency / 100;

  let totalPoints = 0;
  for (const g of grains) {
    if (g.type !== 'grain') continue;
    const kg = g.unit === 'g' ? g.amt * 0.001 : g.amt;
    const lib = maltLib.find(m => m.id === g.libId || m.name === g.name);
    let yieldFrac = asNum(lib?.yield_pct, 75) / 100;

    // Yield corrections — asNum handles the LibNum loose union so
    // imported BeerXML/BSMX strings parse correctly here.
    const moisture = asNum(lib?.moisture);
    if (moisture > 0) yieldFrac *= (1 - moisture / 100);
    const dbfg = asNum(lib?.dbfg);
    if (dbfg > 0) yieldFrac *= (1 - dbfg / 100);

    totalPoints += kg * yieldFrac * effFrac * METRIC_CONSTANT;
  }

  return 1 + totalPoints / batchL / 1000;
}

/** SG to Plato (cubic formula) */
export function sgToPlato(sg: number): number {
  return -616.868 + 1111.14 * sg - 630.272 * sg * sg + 135.997 * sg * sg * sg;
}

/** Plato to SG */
export function platoToSg(plato: number): number {
  return 1 + plato / (258.6 - (plato / 258.2 * 227.1));
}

/** Calculate FG in SG from OG and attenuation */
export function calcFG(ogSg: number, attenuation: number): number {
  return ogSg - (ogSg - 1) * (attenuation / 100);
}

// === ABV ===

export function calcABV(ogSg: number, fgSg: number): number {
  return (ogSg - fgSg) * 131.25;
}

// === IBU ===

interface IbuCalcParams {
  method: IbuMethod;
  hops: Ingredient[];
  hopLib: HopLib[];
  batchL: number;
  ogSg: number;
  whirlpoolTemp?: number;
  mashHopAdj?: number;
  leafHopAdj?: number;
  largeBatchUtil?: number;
}

export function calcTotalIBU(params: IbuCalcParams): { total: number; perHop: Map<string, number> } {
  const {
    method, hops, hopLib, batchL, ogSg,
    whirlpoolTemp = 85,
    mashHopAdj = -80,
    leafHopAdj = -10,
    largeBatchUtil = 100,
  } = params;

  const perHop = new Map<string, number>();
  let total = 0;

  for (const hop of hops) {
    if (hop.type !== 'hop') continue;
    // Lowercase `use` once. Existing rows in Supabase were written by the
    // HTML app with capitalized values like 'Boil', 'Whirlpool', 'Dry Hop',
    // 'First Wort', 'Mash'. Newer rows from the React Add modal write
    // lowercase. Defensive normalisation here handles both, matches HTML
    // line 7653, and is what every comparison below relies on.
    const use = (hop.use || '').toLowerCase();
    if (use === 'dry hop') {
      perHop.set(hop.id, 0);
      continue;
    }

    const lib = hopLib.find(h => h.id === hop.libId || h.name === hop.name);
    const aa = parseFloat(hop.extra || '0') / 100;
    const amtG = hop.unit === 'kg' ? hop.amt * 1000 : hop.amt;
    // Mash hops use boilTime = 0 so the boil-factor goes to zero before
    // the mash multiplier applies. Mirrors HTML line 7672.
    const boilTime = use === 'mash' ? 0 : (hop.time ?? 0);

    let ibu = calcSingleHopIBU(method, aa, amtG, batchL, boilTime, ogSg);

    // Whirlpool / flameout adjustment
    if (use === 'whirlpool' || use === 'flameout') {
      ibu *= wpFactor(whirlpoolTemp);
    }

    // Mash hop adjustment
    if (use === 'mash') {
      ibu *= (1 + mashHopAdj / 100);
    }

    // Whole leaf adjustment
    if (lib?.hop_type === 'Whole') {
      ibu *= (1 + leafHopAdj / 100);
    }

    // Large batch adjustment
    if (batchL > 76) {
      ibu *= largeBatchUtil / 100;
    }

    // First wort bonus
    if (use === 'first wort') {
      ibu *= 1.10;
    }

    perHop.set(hop.id, ibu);
    total += ibu;
  }

  return { total, perHop };
}

/**
 * IBU contribution per gram for a single hop, used by the Hop IBUs editing
 * modal for bidirectional IBU↔grams conversion (`ibu = k * amtG`,
 * `amtG = ibu / k`).
 *
 * Includes the boil-time utilisation method (Tinseth / Rager / Daniels) plus
 * the two adjustments the modal supports — whirlpool/flameout temp factor
 * and mash-hop reduction. Deliberately does NOT apply leaf, large-batch, or
 * first-wort adjustments (matches HTML modal at brewlab-desktop.html:18211–18244).
 *
 * Returns 0 when the hop can't contribute (mash with -100% adjustment, dry
 * hop, or zero AA) — caller treats that as "cannot calculate".
 */
export function calcHopIbuPerGram(opts: {
  method: IbuMethod;
  aa: number;            // alpha-acid as a fraction (0.06 not 6)
  use: string;           // hop use, lowercase
  time: number;          // boil/whirlpool time in minutes
  batchL: number;
  ogSg: number;
  whirlpoolTemp: number;
  mashHopAdj: number;    // percent, default -80
}): number {
  const { method, aa, use, time, batchL, ogSg, whirlpoolTemp, mashHopAdj } = opts;
  if (aa <= 0 || batchL <= 0) return 0;
  if (use === 'dry hop') return 0;
  // For mash use the HTML pattern: pass 0 boil time, then apply mash adjustment.
  const effTime = use === 'mash' ? 0 : time;
  // Per-gram IBU = full-amount IBU evaluated at amtG = 1.
  let k = calcSingleHopIBU(method, aa, 1, batchL, effTime, ogSg);
  if (use === 'whirlpool' || use === 'flameout') k *= wpFactor(whirlpoolTemp);
  if (use === 'mash') k *= (1 + mashHopAdj / 100);
  return k;
}

function calcSingleHopIBU(
  method: IbuMethod, aa: number, amtG: number,
  batchL: number, boilTime: number, ogSg: number
): number {
  if (batchL <= 0) return 0;

  switch (method) {
    case 'tinseth': {
      const bigness = 1.65 * Math.pow(0.000125, ogSg - 1);
      const boilFactor = (1 - Math.exp(-0.04 * boilTime)) / 4.15;
      const util = bigness * boilFactor;
      return (aa * util * amtG * 1000) / batchL;
    }
    case 'rager': {
      const util = ragerUtil(boilTime);
      const ga = ogSg > 1.050 ? (ogSg - 1.050) / 0.2 : 0;
      return (amtG * util * aa * 74.89) / (batchL * (1 + ga));
    }
    case 'daniels': {
      const util = danielsUtil(boilTime);
      return (amtG * util * aa * 7489) / (batchL * 10);
    }
  }
}

function ragerUtil(mins: number): number {
  if (mins >= 75) return 0.228;
  if (mins >= 60) return 0.202;
  if (mins >= 45) return 0.178;
  if (mins >= 30) return 0.146;
  if (mins >= 20) return 0.122;
  if (mins >= 15) return 0.106;
  if (mins >= 10) return 0.085;
  if (mins >= 5) return 0.053;
  return 0.005;
}

function danielsUtil(mins: number): number {
  if (mins >= 60) return 0.300;
  if (mins >= 45) return 0.261;
  if (mins >= 30) return 0.216;
  if (mins >= 20) return 0.161;
  if (mins >= 10) return 0.100;
  return 0.050;
}

function wpFactor(tempC: number): number {
  if (tempC < 70) return 0;
  if (tempC >= 100) return 1.0;
  if (tempC <= 80) return lerp(70, 80, 0, 0.22, tempC);
  if (tempC <= 85) return lerp(80, 85, 0.22, 0.45, tempC);
  if (tempC <= 90) return lerp(85, 90, 0.45, 0.62, tempC);
  if (tempC <= 95) return lerp(90, 95, 0.62, 0.80, tempC);
  return lerp(95, 100, 0.80, 1.00, tempC);
}

function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

// === EBC / Colour (Morey) ===

export function calcEBC(grains: Ingredient[], maltLib: MaltLib[], batchL: number): number {
  if (batchL <= 0) return 0;
  const batchGal = batchL * 0.264172;
  let mcu = 0;

  for (const g of grains) {
    if (g.type !== 'grain') continue;
    const kg = g.unit === 'g' ? g.amt * 0.001 : g.amt;
    const lbs = kg * 2.20462;
    const lib = maltLib.find(m => m.id === g.libId || m.name === g.name);
    // Prefer library EBC when set; fall back to per-ingredient extra.
    // asNum funnels both branches through the same parser so imported
    // string-typed library values arithmetic-compare correctly.
    const ebc = lib?.ebc != null && lib.ebc !== ''
      ? asNum(lib.ebc)
      : parseFloat(g.extra || '0');
    const srm = ebc / 1.97;
    mcu += (lbs * srm) / batchGal;
  }

  const srm = 1.4922 * Math.pow(mcu, 0.6859);
  return srm * 1.97;
}

// === FV Volume from Dipstick ===

export function fvVolume(mm: number, calib: TankCalibration): number {
  // TankCalibration fields are user-config and optional — they may be
  // empty/undefined if the brewer hasn't filled them in yet. Coerce
  // through asNum so missing values become 0 rather than NaN-propagating
  // through downstream display logic. Call sites already treat 0 as
  // "no calibration / no reading" (see BrewDayTab fvVolL guards).
  const threshold = asNum(calib.threshold);
  const coneVol   = asNum(calib.coneVol);
  const lPerMm    = asNum(calib.lPerMm);
  if (mm <= threshold) return coneVol;
  return coneVol + (mm - threshold) * lPerMm;
}

// === Brewhouse Efficiency Check ===

export function calcActualEfficiency(
  grains: Ingredient[],
  measuredSg: number,
  batchL: number
): number {
  let totalKg = 0;
  for (const g of grains) {
    if (g.type !== 'grain') continue;
    totalKg += g.unit === 'g' ? g.amt * 0.001 : g.amt;
  }
  const theoreticalPts = totalKg * METRIC_CONSTANT;
  if (theoreticalPts <= 0) return 0;
  return ((measuredSg - 1) * 1000 * batchL / theoreticalPts) * 100;
}

// === Classification ===

export function calcClassification(
  ingredients: Ingredient[],
  miscLib: { happoshu_trigger?: boolean; name: string }[]
): Classification {
  // Check happoshu trigger ingredients first
  for (const ing of ingredients) {
    if (ing.type === 'misc') {
      const lib = miscLib.find(m => m.name === ing.name);
      if (lib?.happoshu_trigger) return 'Happoshu';
    }
  }

  // Calculate malt ratio against total fermentables
  let maltKg = 0;
  let totalFermentableKg = 0;
  for (const ing of ingredients) {
    if (ing.type !== 'grain' && ing.type !== 'misc') continue;
    const kg = ing.unit === 'g' ? ing.amt * 0.001 : ing.amt;
    if (ing.type === 'grain') {
      maltKg += kg;
      totalFermentableKg += kg;
    }
    // Sugars/adjuncts in misc also count as fermentables
    // (rebuild improvement over HTML app)
  }

  if (totalFermentableKg <= 0) return 'Beer';
  return (maltKg / totalFermentableKg) >= 0.80 ? 'Beer' : 'Happoshu';
}

// === Grain Bill Percentage ===

export function calcGrainPct(grains: Ingredient[]): Map<string, number> {
  let totalKg = 0;
  for (const g of grains) {
    if (g.type !== 'grain') continue;
    totalKg += g.unit === 'g' ? g.amt * 0.001 : g.amt;
  }

  const pcts = new Map<string, number>();
  for (const g of grains) {
    if (g.type !== 'grain') continue;
    const kg = g.unit === 'g' ? g.amt * 0.001 : g.amt;
    pcts.set(g.id, totalKg > 0 ? (kg / totalKg) * 100 : 0);
  }
  return pcts;
}

// === Recipe Stats (Ingredients-tab totals; also the Prep Sheet source) ===
//
// Single source of truth for the Recipe tab's on-screen totals strip AND
// the Prep Sheet print — both call this so the printed numbers can never
// drift from what's shown on screen. Same "extract so two consumers agree
// by construction" pattern as Tax Master's groupRowsByMonth.

export interface RecipeStats {
  ogSg: number;
  ogPlato: number;
  fgSg: number;
  fgPlato: number;
  abv: number;
  ibu: number;
  ibuSg: number;
  ebc: number;
  grainPcts: Map<string, number>;
  perHop: Map<string, number>;
  totalGrainKg: number;
  totalHopG: number;
  totalCost: number;
}

export function computeRecipeStats(params: {
  recipe: Recipe;
  ingredients: Ingredient[];
  maltLib: MaltLib[];
  hopLib: HopLib[];
  yeastLib: YeastLib[];
  miscLib: MiscLib[];
  settings: BrewSettings;
}): RecipeStats {
  const { recipe, ingredients, maltLib, hopLib, yeastLib, miscLib, settings } = params;
  const grains = ingredients.filter(i => i.type === 'grain');
  const hops = ingredients.filter(i => i.type === 'hop');
  const batchL = recipe.batchL || 0;
  const empty: RecipeStats = {
    ogSg: 1, ogPlato: 0, fgSg: 1, fgPlato: 0,
    abv: 0, ibu: 0, ibuSg: 0, ebc: 0,
    grainPcts: new Map<string, number>(),
    perHop: new Map<string, number>(),
    totalGrainKg: 0, totalHopG: 0, totalCost: 0,
  };
  if (batchL <= 0) return empty;

  // Read BH efficiency and WP temp from recipe (set via meta bar pills)
  const bhEff = recipe.bhEff || 67.60;
  const wpTemp = recipe.whirlpoolTemp ?? settings.whirlpoolTemp ?? 85;

  const ogSg = calcOG(grains, maltLib, batchL, bhEff);
  const ogPlato = ogSg > 1 ? sgToPlato(ogSg) : 0;

  const yeastIng = ingredients.find(i => i.type === 'yeast');
  let atten = 0;
  if (yeastIng) {
    atten = parseFloat(yeastIng.extra || '0');
    if (!atten) {
      const libY = yeastLib.find(y => y.id === yeastIng.libId || y.name === yeastIng.name);
      atten = asNum(libY?.atten, 75);
    }
  }
  if (!atten) atten = 75;
  const fgSg = calcFG(ogSg, atten);
  const fgPlato = fgSg > 1 ? sgToPlato(fgSg) : 0;
  const abv = calcABV(ogSg, fgSg);

  const { total: ibu, perHop } = calcTotalIBU({
    method: settings.ibuMethod, hops: ingredients, hopLib, batchL, ogSg,
    whirlpoolTemp: wpTemp, mashHopAdj: settings.mashHopAdj,
    leafHopAdj: settings.leafHopAdj, largeBatchUtil: settings.largeBatchUtil,
  });
  const ibuSg = ogSg > 1 ? ibu / ((ogSg - 1) * 1000) : 0;
  const ebc = calcEBC(ingredients, maltLib, batchL);
  const grainPcts = calcGrainPct(ingredients);
  const totalGrainKg = grains.reduce((s, g) => s + (g.unit === 'g' ? g.amt * 0.001 : g.amt), 0);
  const totalHopG = hops.reduce((s, h) => s + (h.unit === 'kg' ? h.amt * 1000 : h.amt), 0);

  // Cost: check ingredient cost first, then look up library price.
  // Water rows have no library — skip the lookup, use any explicit cost.
  const totalCost = ingredients.reduce((s, ing) => {
    if (ing.cost > 0) return s + ing.cost;
    if (ing.type === 'water') return s;
    const dataKey = { grain: maltLib, hop: hopLib, yeast: yeastLib, misc: miscLib }[ing.type] as any[];
    const lib = (dataKey || []).find((e: any) => (e.name || '').toLowerCase() === (ing.name || '').toLowerCase() || e.id === ing.libId);
    if (!lib?.price) return s;
    const amtKg = ing.unit === 'g' ? ing.amt * 0.001 : ing.amt;
    return s + (ing.type === 'yeast' ? lib.price : lib.price * amtKg);
  }, 0);

  return { ogSg, ogPlato, fgSg, fgPlato, abv, ibu, ibuSg, ebc, grainPcts, perHop, totalGrainKg, totalHopG, totalCost };
}

// === Recipe Normalisation (per 1000L for NTA) ===

export function normaliseForTax(amount: number, batchL: number): number {
  if (batchL <= 0) return 0;
  return (amount / batchL) * 1000;
}

// === Order Planner Shortfall ===

export function calcOrderQty(shortfall: number, type: IngredientType): number {
  if (shortfall <= 0) return 0;
  switch (type) {
    case 'grain': return Math.ceil(shortfall / 25) * 25;
    case 'hop': return Math.ceil(shortfall);
    default: return Math.ceil(shortfall * 10) / 10;
  }
}

// === Brew Day Targets ===
//
// Mirrors the big targets-block in brewlab-desktop.html (~lines 8200–8451).
// Returns every read-only display value the Brew Day tab shows: mash water,
// sparge volume, strike temp, mash ratio, pre/post-boil volumes (L), pre-boil
// gravity (P), trub loss, est mash eff, target pitch temp, target O₂ ppm.

const MASH_TEMP_DEFAULT_C = 68;
const GRAIN_TEMP_DEFAULT_C = 20;

/**
 * Default mash profile — applied when a recipe has never had its mash
 * profile saved. Shared by `MashProfileModal` (initial form state) and
 * `BrewDayTab` (live-calc fallback) so both render the same numbers
 * before the user explicitly saves anything. Verbatim from HTML
 * `getDefaultMashProfile` (brewlab-desktop.html:17970).
 */
export const DEFAULT_MASH_PROFILE: MashProfile = {
  id: '',
  name: '',
  ratio: 3.0,
  steps: [
    { type: 'Infusion', temp: 68, time: 60 },
    { type: 'Mash Out', temp: 75, time: 10 },
  ],
  notes: '',
};
const TRUB_LOSS_DEFAULT_L = 40;
const BOIL_OFF_RATE_DEFAULT_LH = 45;
const GRAIN_ABSORB_DEFAULT_LKG = 0.75;
const PALMER_GRAIN_SHC = 0.41; // cal/g·°C

/**
 * Whirlpool hop absorption — empirical constant for hops added to a still
 * (post-boil) kettle, where pellets disintegrate and the cone holds wort.
 * Higher than the boil-stage 1.0 L/kg pellet / 3.0 L/kg whole rates because
 * whirlpool contact is longer and less vigorous. Applied to hops with
 * `use === 'whirlpool'` ONLY; flameout / first-wort / boil keep the
 * existing pellet/whole rates.
 *
 * 6 mL absorbed per g of dry whirlpool hop = 6 L/kg.
 */
export const HOP_ABSORPTION_ML_PER_G = 6;

/**
 * Compute effective trub loss = base trub loss + total hot-side hop
 * absorption. Pure — used by `calcBrewDayTargets` and by the Recipe
 * meta-bar pills to avoid duplicating the absorption math in two places.
 *
 * Whirlpool hops absorb at HOP_ABSORPTION_ML_PER_G (6 L/kg); other hot-side
 * hops at 1.0 L/kg (pellet) or 3.0 L/kg (whole) per the lib `hop_type`.
 * Dry hops contribute nothing.
 */
export function calcEffectiveTrubLossL(
  ingredients: Ingredient[],
  hopLib: HopLib[],
  equip?: EquipmentProfile | null,
): number {
  const baseTrubLoss = equip?.trubLoss ?? TRUB_LOSS_DEFAULT_L;
  let hopAbsorptionL = 0;
  for (const ing of ingredients) {
    if (ing.type !== 'hop') continue;
    const use = (ing.use || '').toLowerCase();
    if (use === 'dry hop') continue;
    const amtG = (ing.amt || 0) * (ing.unit === 'kg' ? 1000 : 1);
    if (use === 'whirlpool') {
      hopAbsorptionL += amtG * HOP_ABSORPTION_ML_PER_G / 1000;
    } else {
      const lib = hopLib.find(h => h.id === ing.libId || h.name === ing.name);
      const absorbRate = (lib?.hop_type === 'Whole') ? 3.0 : 1.0;
      hopAbsorptionL += (amtG / 1000) * absorbRate;
    }
  }
  return baseTrubLoss + hopAbsorptionL;
}

/**
 * Total planned dry-hop grams ÷ batch volume. Reads RECIPE planned amounts
 * (`use === 'dry hop'`), not Ferm-tab logged actuals — `totalDryHopGrams`
 * (private, used by `calcDhPhPrediction`) covers the actuals path.
 * Returns null when batchL ≤ 0; the caller renders an em-dash.
 */
export function calcDryHopGperL(
  ingredients: Ingredient[],
  batchL: number,
): number | null {
  if (batchL <= 0) return null;
  let g = 0;
  for (const h of ingredients) {
    if (h.type !== 'hop') continue;
    if ((h.use || '').toLowerCase() !== 'dry hop') continue;
    g += h.unit === 'kg' ? h.amt * 1000 : h.amt;
  }
  return g / batchL;
}

/** Total whirlpool hop grams ÷ batch-into-WP volume (= batchL + trub loss). */
export function calcWhirlpoolGperL(
  ingredients: Ingredient[],
  batchIntoWpL: number,
): number | null {
  if (batchIntoWpL <= 0) return null;
  let g = 0;
  for (const h of ingredients) {
    if (h.type !== 'hop') continue;
    if ((h.use || '').toLowerCase() !== 'whirlpool') continue;
    g += h.unit === 'kg' ? h.amt * 1000 : h.amt;
  }
  return g / batchIntoWpL;
}

export interface BrewDayTargets {
  mashWaterL: number | null;
  spargeVolL: number | null;
  strikeTempC: number | null;
  mashRatioLkg: number | null;
  preBoilVolL: number | null;
  postBoilVolL: number | null;
  preBoilGravityP: number | null;
  trubLossL: number | null;
  hopAbsorptionL: number;
  totalGrainKg: number;
  ogSg: number;
  ogPlato: number;
  estMashEffPct: number | null;
  targetPitchTempC: number | null;
  targetO2Ppm: string | null;   // formatted like "8–10 ppm"
}

export interface BrewDayTargetsInput {
  recipe: Recipe;
  ingredients: Ingredient[];
  maltLib: MaltLib[];
  hopLib: HopLib[];
  yeastLib: YeastLib[];
  /** Active equipment profile if any — falls back to HTML defaults. */
  equip?: EquipmentProfile | null;
  /** Per-recipe mash profile, if set. */
  mashProfile?: MashProfile | null;
  /** Optional grain absorption (L/kg). Falls back to 0.75. */
  grainAbsorbLkg?: number;
  /** Optional grain temp (°C) for strike calc. Falls back to 20. */
  grainTempC?: number;
  /**
   * Cooling shrinkage as a percentage (0–100). Hot wort contracts as it
   * cools to fermentation temperature; the brewer's batchL target is the
   * COOLED volume that ends up in the FV, so the pre-boil and post-boil
   * targets must scale up by 1/(1 − shrinkage/100) to compensate.
   *
   * Default 0 (no compensation) preserves prior behaviour. Typical real
   * value is ~4 % between 100 °C and 20 °C.
   *
   * The HTML's Settings input persists this number but no calc reads it
   * (audit 2026-05-04). React wires it here and through BrewDayTab.
   */
  coolingShrinkagePct?: number;
}

export function calcBrewDayTargets(input: BrewDayTargetsInput): BrewDayTargets {
  const { recipe, ingredients, maltLib, hopLib, yeastLib, equip, mashProfile } = input;
  const batchL = recipe.batchL || 0;
  const bhEffPct = recipe.bhEff || 67.60;
  const bhEffFrac = bhEffPct / 100;

  // ── Grain bill ──
  const grains = ingredients.filter(i => i.type === 'grain');
  const totalGrainKg = grains.reduce(
    (s, g) => s + (g.unit === 'g' ? g.amt * 0.001 : g.amt),
    0,
  );

  // ── OG ──
  const ogSg = calcOG(grains, maltLib, batchL, bhEffPct);
  const ogPlato = ogSg > 1 ? sgToPlato(ogSg) : 0;

  // ── Hop absorption (hot-side hops contribute to trub loss) ──
  // Whirlpool hops at HOP_ABSORPTION_ML_PER_G (6 L/kg); other hot-side hops
  // at 1.0 L/kg pellet / 3.0 L/kg whole (matches HTML lines 8246–8247).
  // Shared with the Recipe meta-bar via calcEffectiveTrubLossL — that
  // helper is the single source of truth for the absorption rule.
  // effectiveTrubLossL replaces base trub loss in every downstream volume
  // formula (pre-boil, post-boil, mash water, sparge) so changing whirlpool
  // hop amount moves every water target.
  const trubLossL = calcEffectiveTrubLossL(ingredients, hopLib, equip);
  const baseTrubLoss = equip?.trubLoss ?? TRUB_LOSS_DEFAULT_L;
  const hopAbsorptionL = trubLossL - baseTrubLoss;

  // ── Volumes ──
  const boilOffRate = equip?.boilOffRate ?? BOIL_OFF_RATE_DEFAULT_LH;
  const boilHrs = (recipe.boilTime || 60) / 60;
  const boilOffL = boilOffRate * boilHrs;
  // Cooling shrinkage compensation: batchL is the brewer's COOLED into-FV
  // target. Hot wort in the kettle must be larger by 1/(1 − s) so it lands
  // at batchL after cooling. Trub stays in the kettle (doesn't shrink with
  // wort), so it's added on TOP of the scaled hot-wort volume.
  //   hotWortL    = batchL / (1 − s)
  //   postBoilVol = hotWortL + trubLoss
  //   preBoilVol  = postBoilVol + boilOff
  // s = 0 reduces to the prior formula (postBoilVol = batchL + trubLoss).
  const shrinkagePct = input.coolingShrinkagePct ?? 0;
  const shrinkageFrac = shrinkagePct > 0 && shrinkagePct < 100 ? shrinkagePct / 100 : 0;
  const hotWortL = batchL > 0 ? batchL / (1 - shrinkageFrac) : 0;
  const preBoilVolL = batchL > 0 ? hotWortL + boilOffL + trubLossL : 0;
  const postBoilVolL = batchL > 0 ? hotWortL + trubLossL : 0;

  // ── Mash water / ratio / sparge ──
  const grainAbsorbLkg = input.grainAbsorbLkg ?? GRAIN_ABSORB_DEFAULT_LKG;
  const grainAbsorbTotL = totalGrainKg * grainAbsorbLkg;
  // Ratio: prefer per-recipe mash profile, else solve from pre-boil vol
  const ratioFromProfile = mashProfile && (mashProfile as { ratio?: number }).ratio;
  const mashRatioLkg = totalGrainKg > 0
    ? (ratioFromProfile && ratioFromProfile > 0
        ? ratioFromProfile
        : (preBoilVolL + grainAbsorbTotL) / totalGrainKg)
    : null;
  const mashWaterL = mashRatioLkg != null ? mashRatioLkg * totalGrainKg : null;
  const spargeVolL = (mashWaterL != null && totalGrainKg > 0)
    ? Math.max(0, preBoilVolL - (mashWaterL - grainAbsorbTotL))
    : null;

  // ── Pre-boil gravity (mass balance) ──
  const preBoilGravityP = (ogSg > 1 && batchL > 0 && preBoilVolL > 0)
    ? (() => {
        const preboilSg = 1 + (ogSg - 1) * batchL / preBoilVolL;
        return preboilSg > 1 ? sgToPlato(preboilSg) : 0;
      })()
    : null;

  // ── Strike temp (Palmer) ──
  const grainTempC = input.grainTempC ?? GRAIN_TEMP_DEFAULT_C;
  const firstStep = mashProfile?.steps?.[0];
  const mashTempTarget = firstStep?.temp ?? MASH_TEMP_DEFAULT_C;
  const strikeTempC = (totalGrainKg > 0 && mashWaterL && mashWaterL > 0)
    ? (PALMER_GRAIN_SHC * totalGrainKg / mashWaterL) * (mashTempTarget - grainTempC) + mashTempTarget
    : null;

  // ── Mash efficiency: BH eff / lauter (~96%) ──
  const estMashEffPct = totalGrainKg > 0
    ? Math.min(bhEffFrac / 0.96 * 100, 100)
    : null;

  // ── Target pitch temp from yeast lib min ──
  const yeastIng = ingredients.find(i => i.type === 'yeast');
  let targetPitchTempC: number | null = null;
  if (yeastIng) {
    const libY = yeastLib.find(y =>
      y.id === yeastIng.libId
      || (y.name || '').toLowerCase() === (yeastIng.name || '').toLowerCase()
    );
    const minT = (libY as { temp_min?: number } | undefined)?.temp_min;
    if (typeof minT === 'number' && isFinite(minT)) targetPitchTempC = minT;
  }

  // ── Target O₂ by yeast type and OG ──
  let targetO2Ppm: string | null = null;
  if (ogPlato > 0 && yeastIng) {
    const libY = yeastLib.find(y =>
      y.id === yeastIng.libId
      || (y.name || '').toLowerCase() === (yeastIng.name || '').toLowerCase()
    );
    const yeastType = String((libY as { type?: string; yeast_type?: string } | undefined)?.type
                          || (libY as { yeast_type?: string } | undefined)?.yeast_type
                          || '').toLowerCase();
    let lo: number, hi: number;
    if (yeastType.includes('kveik'))                                 { lo = 5;  hi = 8; }
    else if (yeastType.includes('lager') || yeastType.includes('bottom')) { lo = 10; hi = 12; }
    else if (ogPlato > 18)                                           { lo = 12; hi = 15; }
    else                                                              { lo = 8;  hi = 10; }
    targetO2Ppm = `${lo}–${hi} ppm`;
  }

  return {
    mashWaterL, spargeVolL, strikeTempC, mashRatioLkg,
    preBoilVolL: preBoilVolL > 0 ? preBoilVolL : null,
    postBoilVolL: postBoilVolL > 0 ? postBoilVolL : null,
    preBoilGravityP,
    trubLossL: batchL > 0 ? trubLossL : null,
    hopAbsorptionL,
    totalGrainKg,
    ogSg, ogPlato,
    estMashEffPct,
    targetPitchTempC,
    targetO2Ppm,
  };
}

/**
 * Measured BH efficiency from the OG into FV (Plato).
 * Mirrors HTML updateMeasEfficiency lines 7923–7931.
 */
export function calcBhEfficiencyFromMeasOG(
  measOgPlato: number,
  batchL: number,
  totalGrainKg: number,
): number | null {
  if (!isFinite(measOgPlato) || measOgPlato <= 0) return null;
  if (batchL <= 0 || totalGrainKg <= 0) return null;
  const sg = platoToSg(measOgPlato);
  const gravPts = (sg - 1) * 1000;
  const theoreticalPts = totalGrainKg * METRIC_CONSTANT;
  if (theoreticalPts <= 0) return null;
  return Math.min((gravPts * batchL) / theoreticalPts * 100, 100);
}

/**
 * Measured mash efficiency from the final mash gravity (PRE-TRANS column).
 * Uses wort-in-mash = mash water − grain absorption. Mirrors HTML 7935–7956.
 */
export function calcMashEfficiencyFromGrav(
  mashGravPlato: number,
  recipe: Recipe,
  ingredients: Ingredient[],
  equip?: EquipmentProfile | null,
  mashProfile?: MashProfile | null,
  grainAbsorbLkg?: number,
): number | null {
  if (!isFinite(mashGravPlato) || mashGravPlato <= 0) return null;
  const batchL = recipe.batchL || 0;
  if (batchL <= 0) return null;
  const totalGrainKg = ingredients
    .filter(i => i.type === 'grain')
    .reduce((s, g) => s + (g.unit === 'g' ? g.amt * 0.001 : g.amt), 0);
  if (totalGrainKg <= 0) return null;

  const absorb = grainAbsorbLkg ?? GRAIN_ABSORB_DEFAULT_LKG;
  const grainAbsorbTotL = totalGrainKg * absorb;
  const boilOffRate = equip?.boilOffRate ?? BOIL_OFF_RATE_DEFAULT_LH;
  const baseTrubLoss = equip?.trubLoss ?? TRUB_LOSS_DEFAULT_L;
  const boilHrs = (recipe.boilTime || 60) / 60;
  const preBoilVol = batchL + boilOffRate * boilHrs + baseTrubLoss;

  const ratioFromProfile = mashProfile && (mashProfile as { ratio?: number }).ratio;
  const mashRatio = ratioFromProfile && ratioFromProfile > 0
    ? ratioFromProfile
    : (preBoilVol + grainAbsorbTotL) / totalGrainKg;
  const mashWaterL = mashRatio * totalGrainKg;
  const wortInMashL = Math.max(mashWaterL - grainAbsorbTotL, 1);

  const sg = platoToSg(mashGravPlato);
  const gravPts = (sg - 1) * 1000;
  const theoreticalPts = totalGrainKg * METRIC_CONSTANT;
  if (theoreticalPts <= 0) return null;
  return Math.min((gravPts * wortInMashL) / theoreticalPts * 100, 100);
}

// === Water Chemistry =======================================================
//
// Mirrors brewlab-desktop.html's water-chem helpers (lines 11459-12502).
// Field names match the HTML's wcSave shape verbatim.

/**
 * Mineral ion contributions per gram per litre (ppm·L/g).
 * For G grams in V litres: ppm_added = (G/V) × contrib.
 * Verbatim from HTML line 11459.
 */
export const WC_MINERALS: Record<WaterMineral, Record<WaterIon, number>> = {
  gypsum: { ca: 61.5,  mg: 0,    na: 0,     so4: 147.4, cl: 0,     hco3: 0     },
  cacl2:  { ca: 72.6,  mg: 0,    na: 0,     so4: 0,     cl: 127.5, hco3: 0     },
  epsom:  { ca: 0,     mg: 26.1, na: 0,     so4: 103.0, cl: 0,     hco3: 0     },
  mgcl2:  { ca: 0,     mg: 51.3, na: 0,     so4: 0,     cl: 148.6, hco3: 0     },
  nacl:   { ca: 0,     mg: 0,    na: 104.0, so4: 0,     cl: 160.3, hco3: 0     },
  nahco3: { ca: 0,     mg: 0,    na: 72.3,  so4: 0,     cl: 0,     hco3: 190.7 },
};

/** Recommended ion ranges (ppm). `warn` = upper alarm threshold. HTML line 11468. */
export const WC_ION_RANGES: Record<WaterIon, { lo: number; hi: number; warn: number }> = {
  ca:   { lo: 50, hi: 150, warn: 250 },
  mg:   { lo: 0,  hi: 30,  warn: 60  },
  na:   { lo: 0,  hi: 75,  warn: 150 },
  so4:  { lo: 50, hi: 350, warn: 500 },
  cl:   { lo: 50, hi: 250, warn: 400 },
  hco3: { lo: 0,  hi: 150, warn: 300 },
};

/** Preset target profiles by beer style. HTML line 11478. */
export const WC_PRESETS: Record<string, Record<WaterIon, number>> = {
  pale:  { ca: 100, mg: 10, na: 30, so4: 150, cl: 75,  hco3: 50  },
  hazy:  { ca: 100, mg: 10, na: 30, so4: 75,  cl: 150, hco3: 50  },
  lager: { ca: 50,  mg: 5,  na: 20, so4: 75,  cl: 50,  hco3: 100 },
  stout: { ca: 75,  mg: 10, na: 30, so4: 75,  cl: 75,  hco3: 150 },
  wheat: { ca: 50,  mg: 10, na: 20, so4: 50,  cl: 75,  hco3: 100 },
};

/**
 * Mash pH shift coefficient — Δ pH per (mEq/L Residual Alkalinity × L/kg mash thickness).
 * Derived from Palmer/Kaiser's qt/lb formulation, converted to L/kg units.
 * Used as: ΔpH = WC_PH_RA_COEFF × RA_mEq_L × (mashWaterL / grainKg)
 *
 * Replaces the older WC_PH_PER_MEQ_L = 0.1 constant which was a fixed
 * "pH per mEq/L" that ignored mash thickness. Thicker mashes carry more
 * total alkalinity per kg grain, so should shift pH MORE per mEq/L of RA —
 * the new coefficient × thickness captures that.
 */
export const WC_PH_RA_COEFF = 0.040;

export const WC_IONS: WaterIon[] = ['ca', 'mg', 'na', 'so4', 'cl', 'hco3'];
export const WC_MINERAL_KEYS: WaterMineral[] =
  ['gypsum', 'cacl2', 'epsom', 'mgcl2', 'nacl', 'nahco3'];

/**
 * mEq of acid per millilitre of stock solution.
 * - Lactic: density ≈ 1.206 g/mL @ 88%, MW=90.08, 1 proton
 * - Phosphoric: density scales linearly with %; 1.685 g/mL @ 85%; MW=98;
 *   monoprotic at mash pH (pKa₂ = 7.20, so at pH ~5.4 only ~1.6% of the
 *   second proton has dissociated and it contributes negligibly).
 *
 * NOTE: HTML wcAcidMeqPerMl (line 11489) multiplies the phosphoric branch
 * by ×2, treating it as diprotic. That overestimates phosphoric strength
 * ~2× and was making the suggested phosphoric mL come out roughly half
 * the correct value. Fixed in the React port — DO NOT mirror that ×2.
 */
export function acidMeqPerMl(type: 'lactic' | 'phosphoric', pct: number): number {
  const p = (pct || 88) / 100;
  if (type === 'lactic') return p * 1.206 * 1000 / 90.08;
  const density = 1 + (0.685 / 0.85) * p;
  return p * density * 1000 / 98;
}

/**
 * Compute the resulting ion profile (ppm) given the source water plus per-
 * mash and per-sparge mineral additions, blended by volume.
 * Mirrors the loop in HTML wcRecalc lines 12366-12381.
 */
export function calcWaterIons(opts: {
  source: Record<WaterIon, number>;
  mashVol: number;
  spargeVol: number;
  mineralGrams: Partial<Record<WaterMineral, { mash: number; sparge: number }>>;
}): Record<WaterIon, number> {
  const { source, mashVol, spargeVol, mineralGrams } = opts;
  const totalVol = mashVol + spargeVol;
  const result: Record<WaterIon, number> = {
    ca: source.ca || 0, mg: source.mg || 0, na: source.na || 0,
    so4: source.so4 || 0, cl: source.cl || 0, hco3: source.hco3 || 0,
  };
  if (totalVol <= 0) return result;
  for (const min of WC_MINERAL_KEYS) {
    const m = mineralGrams[min];
    if (!m) continue;
    const gMash = m.mash || 0;
    const gSparge = m.sparge || 0;
    const contrib = WC_MINERALS[min];
    for (const ion of WC_IONS) {
      let add = 0;
      if (mashVol > 0)   add += (gMash   / mashVol)   * contrib[ion] * (mashVol   / totalVol);
      if (spargeVol > 0) add += (gSparge / spargeVol) * contrib[ion] * (spargeVol / totalVol);
      result[ion] += add;
    }
  }
  return result;
}

/**
 * Kolbach Residual Alkalinity (RA) — the brewing-relevant measure of
 * how much alkalinity remains effective in the mash after Ca²⁺ and Mg²⁺
 * partially neutralise it via phosphate precipitation.
 *
 *   alkalinity = HCO3_ppm / 61            (mEq HCO3⁻ per L)
 *   hardness   = (Ca/20)/3.5 + (Mg/12.15)/7
 *   RA_mEq_L   = alkalinity − hardness
 *
 * The /3.5 and /7 divisors are Kolbach's empirical factors for Ca and Mg
 * partial precipitation in the mash. Reference: Kolbach (1953).
 *
 * Returns both mEq/L (for math) and ppm CaCO₃ (for human display).
 */
export function calcKolbachRA(ions: Record<WaterIon, number>): {
  ra_mEq_L: number; ra_ppm_caco3: number;
} {
  const alkalinity = (ions.hco3 || 0) / 61;
  const hardness   = ((ions.ca || 0) / 20) / 3.5 + ((ions.mg || 0) / 12.15) / 7;
  const ra_mEq_L = alkalinity - hardness;
  return { ra_mEq_L, ra_ppm_caco3: ra_mEq_L * 50.04 };
}

/**
 * Distilled-water mash pH for a single grain. Priority order:
 *   1. lib.di_pH if explicitly set in the malt library
 *   2. Acidulated malt name match (/acid|sauer/i) → 4.30
 *   3. Piecewise EBC heuristic — handles base / crystal / roasted differently
 *      since a single linear fit understates pH drop in dark malts:
 *        base    (EBC < 6):     5.75 − 0.005  × EBC
 *        crystal (6 ≤ EBC ≤ 150): 5.65 − 0.0035 × EBC
 *        roasted (EBC > 150):    max(4.40, 5.00 − 0.001 × EBC)
 * Final value clamped to [4.30, 5.85].
 */
export function grainDiPh(grain: Ingredient, maltLib: MaltLib[]): number {
  const lib = maltLib.find(m => m.id === grain.libId || m.name === grain.name);
  if (typeof lib?.di_pH === 'number' && isFinite(lib.di_pH) && lib.di_pH > 0) {
    return Math.max(4.30, Math.min(5.85, lib.di_pH));
  }
  const name = (grain.name || '').toLowerCase();
  if (/acid|sauer/.test(name)) return 4.30;
  // EBC source priority: library value (parsed via asNum so legacy
  // string values work), then the per-ingredient extra fallback.
  const libEbc = asNum(lib?.ebc);
  const ebc = libEbc > 0 ? libEbc : (parseFloat(grain.extra || '0') || 0);
  let di: number;
  if (ebc < 6)        di = 5.75 - 0.005  * ebc;
  else if (ebc <= 150) di = 5.65 - 0.0035 * ebc;
  else                 di = Math.max(4.40, 5.00 - 0.001 * ebc);
  return Math.max(4.30, Math.min(5.85, di));
}

/**
 * Estimate mash pH using Kolbach RA and a Palmer/Kaiser-style mash-thickness-
 * aware Δ pH coefficient.
 *
 *   gristDiPh = kg-weighted mean of grainDiPh(grain) over all grains
 *   ra_mEq_L  = calcKolbachRA(resultIons).ra_mEq_L
 *   acid_mEq  = (acidMashMl × meqPerMl) / mashWaterL          ─ if any
 *   eff_RA    = ra_mEq_L − acid_mEq
 *   thickness = mashWaterL / totalGrainKg
 *   ΔpH       = WC_PH_RA_COEFF × eff_RA × thickness    (= 0.040 × eff_RA × L/kg)
 *   mashPh    = gristDiPh + ΔpH
 *
 * Returns the breakdown so callers can display the components (RA in
 * particular is useful to surface in the UI).
 */
export function estimateMashPh(opts: {
  grains: Ingredient[];
  maltLib: MaltLib[];
  resultIons: Record<WaterIon, number>;
  mashWaterL: number;
  /** mEq of acid added directly to the mash (already accounting for acid type/pct). */
  acidMashMEq?: number;
}): {
  mashPh: number;
  gristDiPh: number;
  ra: { mEq: number; ppm: number };
  thicknessLkg: number | null;
} {
  const { grains, maltLib, resultIons, mashWaterL, acidMashMEq = 0 } = opts;

  const totalKg = grains.reduce((s, g) =>
    s + (g.unit === 'g' ? g.amt * 0.001 : g.amt), 0);

  // Grist DI pH — kg-weighted mean (or default 5.72 with no grist)
  let gristDiPh = 5.72;
  if (totalKg > 0) {
    let weighted = 0;
    for (const g of grains) {
      const kg = g.unit === 'g' ? g.amt * 0.001 : g.amt;
      weighted += grainDiPh(g, maltLib) * (kg / totalKg);
    }
    gristDiPh = weighted;
  }

  const { ra_mEq_L, ra_ppm_caco3 } = calcKolbachRA(resultIons);
  const ra = { mEq: ra_mEq_L, ppm: ra_ppm_caco3 };

  // Without mash water or grist, we can't apply the thickness-aware shift.
  // Return grist DI pH as the best estimate available.
  if (mashWaterL <= 0 || totalKg <= 0) {
    return { mashPh: gristDiPh, gristDiPh, ra, thicknessLkg: null };
  }

  const thickness = mashWaterL / totalKg;
  const acid_mEq_L = acidMashMEq > 0 ? acidMashMEq / mashWaterL : 0;
  const eff_RA = ra_mEq_L - acid_mEq_L;
  const deltaPh = WC_PH_RA_COEFF * eff_RA * thickness;
  return {
    mashPh: gristDiPh + deltaPh,
    gristDiPh,
    ra,
    thicknessLkg: thickness,
  };
}

/**
 * Inverse of estimateMashPh — given a target mash pH, returns the mEq of
 * acid per litre of water needed to hit it. The same per-litre value is
 * what the UI scales by mash and sparge volumes for the suggested-mL cards.
 *
 *   At zero acid: pH₀ = gristDiPh + WC_PH_RA_COEFF × ra × thickness
 *   We need:      target = pH₀ − WC_PH_RA_COEFF × acid_mEq_L × thickness
 *   So:           acid_mEq_L = (pH₀ − target) / (WC_PH_RA_COEFF × thickness)
 *
 * Returns 0 if pH is already at or below target (no acid needed).
 */
export function solveMashAcidMEqPerL(opts: {
  grains: Ingredient[];
  maltLib: MaltLib[];
  resultIons: Record<WaterIon, number>;
  mashWaterL: number;
  targetPh: number;
}): number {
  const { mashWaterL, targetPh } = opts;
  if (mashWaterL <= 0) return 0;
  const ph0 = estimateMashPh({ ...opts, acidMashMEq: 0 });
  const thickness = ph0.thicknessLkg;
  if (thickness == null || thickness <= 0) return 0;
  const gap = ph0.mashPh - targetPh;
  if (gap <= 0) return 0;
  return gap / (WC_PH_RA_COEFF * thickness);
}

/**
 * Solve for mineral gram additions to hit target ion deltas above source.
 * Greedy strategy (HTML wcCalcMinerals line 12261):
 *   1. Mg     → Epsom    (also adds SO4)
 *   2. SO4    → Gypsum   (also adds Ca)
 *   3. Ca     → CaCl2    (also adds Cl)
 *   4. Cl     → MgCl2
 *   5. Na     → NaCl
 *   6. HCO3   → Baking soda
 * Result is then split mash/sparge proportional to volume.
 *
 * Returns total grams + the mash/sparge split per mineral.
 */
export function solveMineralsForTargets(opts: {
  source:    Record<WaterIon, number>;
  targets:   Record<WaterIon, number>;
  mashVol:   number;
  spargeVol: number;
}): Record<WaterMineral, { mash: number; sparge: number; total: number }> {
  const { source, targets, mashVol, spargeVol } = opts;
  const totalVol = mashVol + spargeVol;
  const empty: Record<WaterMineral, { mash: number; sparge: number; total: number }> =
    Object.fromEntries(WC_MINERAL_KEYS.map(k => [k, { mash: 0, sparge: 0, total: 0 }])) as Record<WaterMineral, { mash: number; sparge: number; total: number }>;
  if (totalVol <= 0) return empty;

  const delta: Record<WaterIon, number> = {
    ca:   Math.max(0, (targets.ca   || 0) - (source.ca   || 0)),
    mg:   Math.max(0, (targets.mg   || 0) - (source.mg   || 0)),
    na:   Math.max(0, (targets.na   || 0) - (source.na   || 0)),
    so4:  Math.max(0, (targets.so4  || 0) - (source.so4  || 0)),
    cl:   Math.max(0, (targets.cl   || 0) - (source.cl   || 0)),
    hco3: Math.max(0, (targets.hco3 || 0) - (source.hco3 || 0)),
  };

  // grams = delta_ppm × totalVol / contrib_ppm_per_g_per_L
  const g = (deltaPpm: number, vol: number, contrib: number) =>
    contrib > 0 ? (deltaPpm * vol) / contrib : 0;
  const totals: Record<WaterMineral, number> = {
    gypsum: 0, cacl2: 0, epsom: 0, mgcl2: 0, nacl: 0, nahco3: 0,
  };

  if (delta.mg > 0) {
    totals.epsom = g(delta.mg, totalVol, WC_MINERALS.epsom.mg);
    delta.so4 = Math.max(0, delta.so4 - (totals.epsom / totalVol) * WC_MINERALS.epsom.so4);
    delta.mg = 0;
  }
  if (delta.so4 > 0) {
    totals.gypsum = g(delta.so4, totalVol, WC_MINERALS.gypsum.so4);
    delta.ca = Math.max(0, delta.ca - (totals.gypsum / totalVol) * WC_MINERALS.gypsum.ca);
    delta.so4 = 0;
  }
  if (delta.ca > 0) {
    totals.cacl2 = g(delta.ca, totalVol, WC_MINERALS.cacl2.ca);
    delta.cl = Math.max(0, delta.cl - (totals.cacl2 / totalVol) * WC_MINERALS.cacl2.cl);
    delta.ca = 0;
  }
  if (delta.cl > 0) {
    totals.mgcl2 = g(delta.cl, totalVol, WC_MINERALS.mgcl2.cl);
    delta.cl = 0;
  }
  if (delta.na > 0) {
    totals.nacl = g(delta.na, totalVol, WC_MINERALS.nacl.na);
    delta.na = 0;
  }
  if (delta.hco3 > 0) {
    totals.nahco3 = g(delta.hco3, totalVol, WC_MINERALS.nahco3.hco3);
    delta.hco3 = 0;
  }

  const mashFrac = totalVol > 0 ? mashVol / totalVol : 0.5;
  const out = empty;
  for (const min of WC_MINERAL_KEYS) {
    const total = totals[min];
    out[min] = {
      mash:   total * mashFrac,
      sparge: total * (1 - mashFrac),
      total,
    };
  }
  return out;
}

/**
 * Lookup a source water profile by id from the user's water profiles list.
 * Returns null if not found or id empty. Convenience wrapper for the page.
 */
export function findWaterProfile(
  profiles: WaterProfile[],
  id: string | undefined,
): WaterProfile | null {
  if (!id) return null;
  return profiles.find(p => p.id === id) ?? null;
}

// === Dry-Hop pH Prediction ================================================
//
// Base coefficient (0.025 pH per g/L) from Scott Janish, "A Look at pH in
// Hoppy Beers". The temperature scaling layered on top of it is empirical —
// see `janishCoefficientForTemp` below. Used by the Ferm tab's prediction
// card and the Brew Day tab's predicted-rise readout.

/**
 * Estimated finished-beer buffer capacity, in pH units per mEq/L of acid.
 * NOT well-validated in the literature — real beer buffer ranges roughly
 * 0.02–0.06 pH/(mEq/L) depending on protein content, residual extract, CO₂
 * saturation, and other factors. The residual-acid suggestion built on this
 * is labelled as an estimate in the UI.
 *
 * Now user-overridable via Settings → Advanced → Calculation Constants
 * (`bl_brew_settings.beerBufferPhPerMeqL`). This constant is the fallback
 * when the setting is unset and is passed in by callers via `calcDhPhPrediction`.
 */
export const BEER_BUFFER_PH_PER_MEQ_L = 0.04;

/**
 * Default DH temperature when the user hasn't entered one (Brew Day always
 * hits this default; Ferm uses it as a placeholder). 12 °C × the temp scaling
 * formula evaluates to exactly 0.025 — parity with Janish's flat coefficient.
 */
export const DH_DEFAULT_TEMP_C = 12;

/**
 * Temperature-aware Janish coefficient.
 *
 * Janish's published value is a flat 0.025 pH/(g/L) measured in commercial
 * hoppy beer at typical fermentation/dry-hop temperatures. We layer a linear
 * temperature adjustment on top: 0.020 at 2 °C (cold crash) up to 0.030 at
 * 22 °C (active warm DH), clamped at the ends.
 *
 * Physical motivation: hop wettability, alpha-/iso-alpha-acid extraction,
 * and resin solubility all increase with temperature, so warmer dry hops
 * pull more pH-raising species out of the cone material. Cold-crashed DHs
 * release less. This is empirically motivated but NOT in the peer-reviewed
 * literature — treat as a refinement of Janish's value, not a replacement.
 *
 * Slope = (0.030 − 0.020) / (22 − 2) = 0.0005 pH/(g/L)/°C.
 * At 12 °C → 0.025 (matches Janish exactly).
 */
export function janishCoefficientForTemp(tempC: number): number {
  if (!isFinite(tempC) || tempC <= 2)  return 0.020;
  if (tempC >= 22)                     return 0.030;
  return 0.020 + (tempC - 2) * 0.0005;
}

export interface DhPhPrediction {
  /** Total grams of dry hops counted (recipe + Ferm-card actuals + extras). */
  totalDhG:           number;
  /** Grams per litre of finished beer. null when no FV / batch volume. */
  gPerL:              number | null;
  /** Temp-aware Janish coefficient actually applied (pH per g/L). */
  coefficient:        number;
  /** DH temperature used to derive the coefficient (°C). */
  dhTempC:            number;
  /** Predicted pH rise from DH (coefficient × g/L). null when no g/L. */
  predictedRise:      number | null;
  /** User's target final pH (after DH). */
  targetFinalPh:      number;

  // Measured-pH residual path — fires when the user has supplied a current
  // beer pH greater than their target. Uses BEER_BUFFER_PH_PER_MEQ_L and
  // is therefore labelled as an estimate in the UI.

  /** Measured beer pH input. null when blank or invalid. */
  currentPh:           number | null;
  /** currentPh − target, clamped ≥ 0. */
  measuredResidualPh:  number;
  /** mL of acid stock to drop the beer to target. null when no residual or no volume. */
  measuredResidualMl:  number | null;
}

/**
 * Compute total dry-hop grams that should drive the prediction.
 *
 * Resolution per recipe DH hop:
 *   - If any of dh1/dh2/dh3 amounts contain a value for this hop's id,
 *     sum those actuals across slots and use that total.
 *   - Else use the recipe's planned amount.
 * Plus: all Ferm-card extra-hops (ad-hoc additions), unconditionally summed.
 * Adjuncts are NOT counted — they don't follow the Janish coefficient.
 */
function totalDryHopGrams(ingredients: Ingredient[], fermMeta: FermMeta): number {
  let totalG = 0;

  const recipeDh = ingredients.filter(i =>
    i.type === 'hop' && (i.use || '').toLowerCase() === 'dry hop'
  );

  for (const hop of recipeDh) {
    const plannedG = hop.unit === 'kg' ? (hop.amt || 0) * 1000 : (hop.amt || 0);
    let actualSum = 0;
    let hasActual = false;
    for (const slot of [1, 2, 3] as const) {
      const amounts = fermMeta[`dh${slot}-amounts`];
      const raw = amounts?.[hop.id];
      if (raw == null || raw === '') continue;
      const n = parseFloat(raw);
      if (isFinite(n) && n >= 0) { actualSum += n; hasActual = true; }
    }
    totalG += hasActual ? actualSum : plannedG;
  }

  for (const slot of [1, 2, 3] as const) {
    const extras = fermMeta[`dh${slot}-extra-hops`] || [];
    for (const e of extras) {
      const n = parseFloat(e.amt ?? '');
      if (isFinite(n) && n > 0) totalG += n;
    }
  }

  return totalG;
}

/**
 * Compute the residual mL of acid stock needed to drop a beer of `volumeL`
 * by `deltaPh` pH units, using `bufferPhPerMeqL`. Caller chooses the acid
 * type/pct and supplies the buffer capacity (pH per mEq/L) — typically
 * `settings.beerBufferPhPerMeqL`, falling back to `BEER_BUFFER_PH_PER_MEQ_L`.
 */
function acidMlForPhDrop(
  deltaPh: number,
  volumeL: number,
  acidType: 'lactic' | 'phosphoric',
  acidPct: number,
  bufferPhPerMeqL: number,
): number | null {
  if (deltaPh <= 0 || volumeL <= 0 || bufferPhPerMeqL <= 0) return null;
  const acidMEqL    = deltaPh / bufferPhPerMeqL;
  const totalMEq    = acidMEqL * volumeL;
  const meqPerMl    = acidMeqPerMl(acidType, acidPct);
  if (meqPerMl <= 0) return null;
  return totalMEq / meqPerMl;
}

/**
 * DH pH prediction. Pure function — caller composes inputs from recipe
 * ingredients, ferm_meta blob, FV/batch volume, DH temperature, and acid
 * choice (acid choice only matters when `currentPh` is supplied).
 *
 * The Brew Day tab consumes only `predictedRise`; the Ferm tab also uses
 * the measured-residual fields. There is no longer a "recommended post-boil
 * pH" or floor-cap concept — the brewer reads the predicted rise on Brew
 * Day and sets pitch pH manually.
 */
export function calcDhPhPrediction(opts: {
  ingredients:         Ingredient[];
  fermMeta:            FermMeta;
  volumeL:             number | null;
  targetFinalPh:       number;
  currentPh?:          number | null;
  acidType:            'lactic' | 'phosphoric';
  acidPct:             number;
  dhTempC?:            number;
  /** Beer buffer capacity (pH/(mEq/L)). Defaults to BEER_BUFFER_PH_PER_MEQ_L. */
  beerBufferPhPerMeqL?: number;
}): DhPhPrediction {
  const {
    ingredients, fermMeta, volumeL,
    targetFinalPh, currentPh = null,
    acidType, acidPct,
    dhTempC = DH_DEFAULT_TEMP_C,
    beerBufferPhPerMeqL = BEER_BUFFER_PH_PER_MEQ_L,
  } = opts;

  const totalDhG    = totalDryHopGrams(ingredients, fermMeta);
  const gPerL       = volumeL && volumeL > 0 ? totalDhG / volumeL : null;
  const coefficient = janishCoefficientForTemp(dhTempC);
  const predictedRise = gPerL != null ? coefficient * gPerL : null;

  // Measured-pH residual — fires when current beer pH > target.
  const measuredResidualPh = currentPh != null && isFinite(currentPh) && currentPh > targetFinalPh
    ? currentPh - targetFinalPh
    : 0;
  const measuredResidualMl = acidMlForPhDrop(
    measuredResidualPh, volumeL ?? 0, acidType, acidPct, beerBufferPhPerMeqL,
  );

  return {
    totalDhG,
    gPerL,
    coefficient,
    dhTempC,
    predictedRise,
    targetFinalPh,
    currentPh: currentPh != null && isFinite(currentPh) ? currentPh : null,
    measuredResidualPh,
    measuredResidualMl,
  };
}
