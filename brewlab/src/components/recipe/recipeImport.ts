/**
 * BeerXML recipe import — pure parsing layer. Mirrors the
 * brewlab-desktop.html flow at lines 17232–17321 (`handleRecipeXML` +
 * `confirmRecipeImport`), with these intentional divergences:
 *   • Imports STYLE name + matches against BJCP_2021 keys (HTML doesn't).
 *   • Imports FG (HTML imports OG only).
 *   • Imports NOTES.
 *   • Imports MASH<MASH_STEPS><MASH_STEP> as a per-recipe MashProfile blob
 *     for `lsSet('bl_mash_<id>', ...)` — HTML doesn't import mash either.
 *   • Ingredient `use` field is lowercased to match React convention
 *     (AddIngredientModal stores 'boil'/'whirlpool'/'dry hop' lowercase;
 *     HTML used capital case).
 *   • <NAME> goes to Recipe.beerName; Recipe.name is left empty so the
 *     brewery's tax serial (仕込記号) isn't accidentally seeded.
 *
 * This file is pure: no store imports, no DOM IO. The Desktop.tsx caller
 * does file IO, threads the parsed shape through `addRecipe` +
 * `setIngredients` + lsSet for mash, and triggers UI feedback.
 *
 * BSMX recipe import is intentionally NOT supported here. The HTML's
 * `importBSMX` (17058) is library-only and explicitly rejects recipe
 * exports. A separate task will add BSMX recipe support once a sample
 * .bsmx recipe file is available.
 */

import type { Ingredient, MashProfile, MashStep, MashStepType } from '../../types';
import { BJCP_2021 } from '../../lib/styles';

/** Every BeerXML <RECIPE> in a file becomes one of these. */
export interface ParsedRecipe {
  /** BeerXML <NAME> — display/brand name (Recipe.beerName). */
  name: string;
  /** Raw <STYLE><NAME>; '' if absent. Stored in Recipe.style. */
  styleName: string;
  /** Matched BJCP 2021 key (e.g. '21A') or '' if no match. */
  styleKey: string;
  /** <BATCH_SIZE> in litres (BeerXML stores metric by default). */
  batchL: number;
  /** <BOIL_TIME> in minutes. */
  boilTime: number;
  /** Computed from <OG> SG: ((og-1)*1000)/4. */
  ogPlato: number;
  /** Computed from <FG> SG. */
  fgPlato: number;
  /** <NOTES>; '' if absent. */
  notes: string;
  /** Ingredient rows without ids — caller assigns `${recipeId}_${idx}`. */
  ingredients: Omit<Ingredient, 'id'>[];
  /** Per-recipe mash profile from <MASH><MASH_STEPS><MASH_STEP> nodes,
   *  or null if the file has no MASH element. Stored at bl_mash_<id>. */
  mashProfile: MashProfile | null;
}

const getText = (parent: Element, tag: string): string => {
  const el = parent.querySelector(tag);
  return el ? (el.textContent || '').trim() : '';
};

/** SG → °P (Plato). Mirrors HTML `((og-1)*1000/4).toFixed(1)`. */
const sgToPlato = (sg: number): number => {
  if (!sg || sg <= 0) return 0;
  return Math.round(((sg - 1) * 1000 / 4) * 10) / 10;
};

/** SRM → EBC. Same factor used in libraryImport.ts and HTML. */
const srmToEbc = (srm: number): number => srm * 1.97;

/** Case-insensitive exact name match against BJCP_2021. Falls back to a
 *  CATEGORY_NUMBER + STYLE_LETTER concatenation (e.g. '21A') when the
 *  name fails — covers BeerXML files that use abbreviated style names. */
function matchBjcpKey(styleName: string, categoryNumber: string, styleLetter: string): string {
  const lower = styleName.toLowerCase().trim();
  if (lower) {
    for (const [key, def] of Object.entries(BJCP_2021)) {
      if (def.name.toLowerCase() === lower) return key;
    }
  }
  // Fallback: '21A'-style code.
  const code = (categoryNumber + styleLetter).toUpperCase().trim();
  if (code && BJCP_2021[code]) return code;
  return '';
}

const VALID_MASH_STEP_TYPES: ReadonlySet<MashStepType> = new Set([
  'Infusion', 'Temperature', 'Temperature Rest', 'Sparge', 'Mash Out',
]);

function normaliseMashStepType(raw: string): MashStepType {
  const trimmed = raw.trim();
  if (VALID_MASH_STEP_TYPES.has(trimmed as MashStepType)) {
    return trimmed as MashStepType;
  }
  // BeerXML allows 'Decoction' too, which React's union doesn't model —
  // fall back to Infusion (matches the user's typical workflow).
  return 'Infusion';
}

function parseMashProfile(recipe: Element): MashProfile | null {
  const stepNodes = recipe.querySelectorAll('MASH MASH_STEPS MASH_STEP');
  if (!stepNodes.length) return null;
  const steps: MashStep[] = [];
  stepNodes.forEach(n => {
    const temp = parseFloat(getText(n, 'STEP_TEMP'));
    const time = parseInt(getText(n, 'STEP_TIME'));
    if (!isFinite(temp) || !isFinite(time)) return;
    steps.push({
      type: normaliseMashStepType(getText(n, 'TYPE')),
      temp,
      time,
    });
  });
  if (!steps.length) return null;
  // Per-recipe blob convention (MashProfileModal.tsx:127–129): id and
  // name are empty strings; ratio defaults to undefined so the brew-day
  // calc falls back to the equipment ratio. Notes left blank — BeerXML's
  // MASH/NOTES isn't standard.
  return { id: '', name: '', steps };
}

/**
 * Parse a BeerXML file's text content into one or more ParsedRecipe
 * structures. Throws on XML parse errors. Returns [] when the file has
 * no <RECIPE> elements (caller decides whether that's an error toast).
 */
export function parseRecipeXML(xmlText: string): ParsedRecipe[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  // DOMParser surfaces parse errors as a <parsererror> node rather than
  // throwing — promote it so the caller can show a toast.
  const errNode = doc.querySelector('parsererror');
  if (errNode) {
    throw new Error('Invalid XML: ' + (errNode.textContent || '').slice(0, 200));
  }

  const recipeNodes = doc.querySelectorAll('RECIPE');
  const out: ParsedRecipe[] = [];

  recipeNodes.forEach(recipe => {
    const name      = getText(recipe, 'NAME') || 'Imported Recipe';
    const batchL    = parseFloat(getText(recipe, 'BATCH_SIZE')) || 0;
    const boilTime  = parseInt(getText(recipe, 'BOIL_TIME')) || 60;
    const og        = parseFloat(getText(recipe, 'OG')) || 1.050;
    const fg        = parseFloat(getText(recipe, 'FG')) || 0;
    const notes     = getText(recipe, 'NOTES');

    // Style — both name and code attempted.
    const styleEl       = recipe.querySelector('STYLE');
    const styleName     = styleEl ? getText(styleEl, 'NAME') : '';
    const catNumber     = styleEl ? getText(styleEl, 'CATEGORY_NUMBER') : '';
    const styleLetter   = styleEl ? getText(styleEl, 'STYLE_LETTER') : '';
    const styleKey      = matchBjcpKey(styleName, catNumber, styleLetter);

    const ingredients: Omit<Ingredient, 'id'>[] = [];
    let sortOrder = 0;

    // ── Fermentables ──────────────────────────────────────────────────
    recipe.querySelectorAll('FERMENTABLES FERMENTABLE').forEach(n => {
      const ingName = getText(n, 'NAME');
      if (!ingName) return;
      const amtKg = parseFloat(getText(n, 'AMOUNT')) || 0;
      const colorSrm = parseFloat(getText(n, 'COLOR')) || 0;
      const ebc = srmToEbc(colorSrm);
      const fermType = getText(n, 'TYPE') || 'Grain';
      // Adjuncts and sugars are unmalted — set malted:false so they go
      // to the right NTA bucket. Mirrors HTML 17262.
      const malted = !/(adjunct|sugar|fruit|juice)/i.test(fermType);
      ingredients.push({
        type: 'grain',
        name: ingName,
        amt: amtKg,
        unit: 'kg',
        use: 'mash',
        time: null,
        extra: ebc.toFixed(1),
        ibu: null,
        pct: null,
        libId: '',
        cost: 0,
        sortOrder: sortOrder++,
        malted,
      });
    });

    // ── Hops ──────────────────────────────────────────────────────────
    recipe.querySelectorAll('HOPS HOP').forEach(n => {
      const ingName = getText(n, 'NAME');
      if (!ingName) return;
      const amtKg = parseFloat(getText(n, 'AMOUNT')) || 0;
      const amtG  = amtKg * 1000;
      const aa    = parseFloat(getText(n, 'ALPHA')) || 0;
      const time  = parseInt(getText(n, 'TIME')) || 0;
      const useRaw = getText(n, 'USE') || 'Boil';
      // HTML 17270–17274 use mapping. React stores lowercase.
      let useStr = 'boil';
      if (/dry/i.test(useRaw))         useStr = 'dry hop';
      else if (/whirl|flame/i.test(useRaw)) useStr = 'whirlpool';
      else if (/first/i.test(useRaw))  useStr = 'first wort';
      // Tinseth-ish IBU for boil hops (HTML 17276–17279).
      let ibu: number | null = null;
      if (useStr === 'boil' && time > 0 && amtG > 0 && batchL > 0) {
        const util = (1 - Math.exp(-0.04 * time)) / 4.15;
        ibu = Math.round(((aa / 100) * util * amtG * 1000) / batchL * 10) / 10;
      }
      ingredients.push({
        type: 'hop',
        name: ingName,
        amt: amtG,
        unit: 'g',
        use: useStr,
        time: time || null,
        extra: aa ? String(aa) : '',
        ibu,
        pct: null,
        libId: '',
        cost: 0,
        sortOrder: sortOrder++,
      });
    });

    // ── Yeasts ────────────────────────────────────────────────────────
    recipe.querySelectorAll('YEASTS YEAST').forEach(n => {
      const ingName = getText(n, 'NAME');
      if (!ingName) return;
      const amtL  = parseFloat(getText(n, 'AMOUNT')) || 0;
      const atten = parseFloat(getText(n, 'ATTENUATION')) || 75;
      ingredients.push({
        type: 'yeast',
        name: ingName,
        amt: amtL * 1000,            // L → ml (matches HTML 17285)
        unit: 'ml',
        use: 'primary',
        time: null,
        extra: String(atten),
        ibu: null,
        pct: null,
        libId: '',
        cost: 0,
        sortOrder: sortOrder++,
      });
    });

    // ── Misc ──────────────────────────────────────────────────────────
    // Try standard BeerXML nesting first, then fall back to flat MISC
    // elements (matches HTML 17288–17290).
    const miscNodes = recipe.querySelectorAll('MISCS MISC').length
      ? recipe.querySelectorAll('MISCS MISC')
      : recipe.querySelectorAll('MISC');
    miscNodes.forEach(n => {
      const ingName = getText(n, 'NAME');
      if (!ingName) return;
      const amtKg = parseFloat(getText(n, 'AMOUNT')) || 0;
      const useRaw = getText(n, 'USE') || 'Boil';
      const time = parseInt(getText(n, 'TIME')) || null;
      ingredients.push({
        type: 'misc',
        name: ingName,
        amt: amtKg * 1000,           // kg → g (matches HTML 17295)
        unit: 'g',
        use: useRaw.toLowerCase(),
        time,
        extra: '',
        ibu: null,
        pct: null,
        libId: '',
        cost: 0,
        sortOrder: sortOrder++,
      });
    });

    out.push({
      name,
      styleName,
      styleKey,
      batchL,
      boilTime,
      ogPlato: sgToPlato(og),
      fgPlato: sgToPlato(fg),
      notes,
      ingredients,
      mashProfile: parseMashProfile(recipe),
    });
  });

  return out;
}
