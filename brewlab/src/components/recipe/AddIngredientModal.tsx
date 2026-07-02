/**
 * Add Ingredient Modal — full rebuild matching brewlab-desktop.html.
 *
 * Reference: HTML modal at brewlab-desktop.html lines 3813–3948 (markup),
 * 18822+ (open/close/clear), 18886+ (yeast cell math), 18925+ (picker columns),
 * 18940+ (picker render), 18984+ (selectPickerRow), 19017+ (setModalType),
 * 19057+ (addIngredient), 19091+ (addIngredientKeepOpen), 19151+ (updateModalStats).
 *
 * Layout: 860px modal, two columns. Left = stats sidebar (175px) + scrolling
 * list of same-type ingredients. Right = type tabs, library picker, form,
 * footer (Cancel / Add & Keep Open / Add to Recipe).
 *
 * The `type` prop is the *initial* type only — internal state drives the form
 * thereafter, with full per-type field reset on tab switch (the HTML's
 * stale-state bug is intentionally not replicated).
 *
 * Substitute mode: when `substituteMode` is true the modal hides
 * "Add & Keep Open", the primary button reads "Substitute", and clicking it
 * routes the new ingredient through `onClose(newIng)` for the caller to swap.
 * Same contract as the previous placeholder.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../../store';
import { lsGet } from '../../lib/storage';
import { fmtAmt, asNum } from '../../lib/utils';
import { fmtNum } from '../../lib/format';
import { formatPair } from '../../lib/yeastDisplay';
import {
  calcOG, calcFG, calcABV, calcTotalIBU, calcEBC, sgToPlato,
} from '../../lib/calculations';
import type {
  Ingredient, IngredientType, MaltLib, HopLib, YeastLib, MiscLib,
} from '../../types';

interface Props {
  recipeId: string;
  type: IngredientType;
  substituteMode?: boolean;
  onClose: (newIng?: Ingredient) => void;
}

// ── Per-type config ─────────────────────────────────────────────────────────

type LibEntry = MaltLib | HopLib | YeastLib | MiscLib | { id: string; name: string };

const TITLES: Record<IngredientType, string> = {
  grain: 'ADD FERMENTABLE',
  hop:   'ADD HOPS',
  water: 'ADD WATER ADJUSTMENT',
  yeast: 'ADD YEAST',
  misc:  'ADD MISC',
};

// Picker columns (HTML lines 18925–18938)
const PICKER_COLS: Record<IngredientType, string[]> = {
  grain: ['name', 'origin', 'ebc', 'yield_pct'],
  hop:   ['name', 'origin', 'aa', 'beta'],
  water: ['name'],
  yeast: ['name', 'lab', 'atten', 'temp_min'],
  misc:  ['name'],
};
const PICKER_HDRS: Record<IngredientType, string[]> = {
  grain: ['Name', 'Origin', 'EBC', 'Yield%'],
  hop:   ['Name', 'Origin', 'AA%', 'Beta%'],
  water: ['Name'],
  yeast: ['Name', 'Lab', 'Atten%', 'Temp°C'],
  misc:  ['Name'],
};

// Use options
const HOP_USES = ['Boil', 'Whirlpool', 'Dry Hop', 'First Wort', 'Mash'];
const WATER_USES = ['Mash', 'Sparge'];
const MISC_USES = ['Boil', 'Mash', 'Whirlpool', 'Fermentation', 'Cold Side', 'Packaging'];

// Type-switch defaults (called on tab change to fully reset per-type state).
function defaultsFor(t: IngredientType) {
  switch (t) {
    case 'grain': return { unit: 'kg', use: 'Mash',    time: '',   extraLabel: 'EBC' };
    case 'hop':   return { unit: 'g',  use: 'Boil',    time: '60', extraLabel: 'AA%' };
    case 'water': return { unit: 'g',  use: 'Mash',    time: '',   extraLabel: 'ppm' };
    case 'yeast': return { unit: 'L',  use: 'Primary', time: '',   extraLabel: ''    };
    case 'misc':  return { unit: 'g',  use: 'Boil',    time: '60', extraLabel: ''    };
  }
}

// ── Harvested yeast lookup (mirrors HTML getAvailableHarvestedYeast) ────────

interface HarvestEntry {
  id?: string;
  generation?: number;
  harvestedFrom?: string;
  harvestedFromTaxBatch?: string;
  harvestDate?: string;
  got?: number | string;
  used?: number | string;
}

interface AvailableStock {
  idx: number;
  avail: number;
  generation: number;
  /** Pre-formatted "TAX — Beer" pair (or whichever single value exists)
   *  for display in the picker label and the "From Brew" input. */
  harvestedFromLabel: string;
  harvestDate: string;
  label: string;
}

function getAvailableHarvestedYeast(strain: string): AvailableStock[] {
  if (!strain) return [];
  const data = lsGet<unknown>('bl_harvested_yeast', null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const sd = (data as Record<string, { generation?: number; entries?: HarvestEntry[] }>)[strain];
  if (!sd || !Array.isArray(sd.entries)) return [];
  const out: AvailableStock[] = [];
  sd.entries.forEach((e, i) => {
    const got = parseFloat(String(e.got ?? '')) || 0;
    const used = parseFloat(String(e.used ?? '')) || 0;
    const avail = got - used;
    if (avail > 0) {
      const gen = e.generation ?? sd.generation ?? 1;
      const fromLabel = formatPair(e.harvestedFromTaxBatch, e.harvestedFrom);
      out.push({
        idx: i,
        avail,
        generation: gen,
        harvestedFromLabel: fromLabel,
        harvestDate: e.harvestDate || '',
        label: `${fmtNum(avail, { dp: 1, suffix: 'L' })} — Gen ${gen} (from ${fromLabel}, ${e.harvestDate || '?'})`,
      });
    }
  });
  return out;
}

// ── Yeast atten validation (mirrors HTML selectPickerRow lines 19000–19006) ─
function validateAtten(raw: unknown): number | null {
  let v = parseFloat(String(raw ?? ''));
  if (!isFinite(v)) return null;
  if (v < 2) v = v * 100;
  if (v < 50 || v > 100) return null;
  return v;
}

// ── Cells billions formatter (matches HTML fmtB) ────────────────────────────
function fmtB(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1000) return fmtNum(v / 1000, { dp: 2, suffix: ' T' });
  return fmtNum(v, { dp: 1, suffix: ' B' });
}

// ════════════════════════════════════════════════════════════════════════════

export default function AddIngredientModal({ recipeId, type: initialType, substituteMode, onClose }: Props) {
  // ── Store ─────────────────────────────────────────────────────────────────
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const recipes  = useStore(s => s.recipes);
  const settings = useStore(s => s.settings);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const addIngredientToStore = useStore(s => s.addIngredient);
  const pushToast = useStore(s => s.pushToast);

  const recipe = recipes.find(r => r.id === recipeId);
  // Stable reference — `?? []` would otherwise mint a new array on every
  // render and invalidate every dependent useMemo / useCallback.
  const allIngredients = useMemo(
    () => ingredientsByRecipe[recipeId] ?? [],
    [ingredientsByRecipe, recipeId],
  );

  // ── State ─────────────────────────────────────────────────────────────────
  const [currentType, setCurrentType] = useState<IngredientType>(initialType);
  const [name, setName]   = useState('');
  const [amt, setAmt]     = useState('');
  const [unit, setUnit]   = useState(defaultsFor(initialType).unit);
  const [use, setUse]     = useState(defaultsFor(initialType).use);
  const [time, setTime]   = useState(defaultsFor(initialType).time);
  const [coldDays, setColdDays] = useState('7');
  const [extra, setExtra] = useState('');
  const [cost, setCost]   = useState('');
  const [notes, setNotes] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedLibId, setSelectedLibId] = useState<string>('');

  // Yeast-only
  const [pitchTemp, setPitchTemp] = useState('18');
  const [pitchPh, setPitchPh]     = useState('5.2');
  const [pitchO2, setPitchO2]     = useState('8');
  const [atten, setAtten]         = useState('75');
  const [yeastForm, setYeastForm]     = useState<'liquid' | 'dry'>('liquid');
  const [yeastSource, setYeastSource] = useState<'fresh' | 'harvested'>('fresh');
  const [yeastBatch, setYeastBatch] = useState('');
  const [yeastGen, setYeastGen]     = useState('');
  const [mantissa, setMantissa]     = useState('3');
  const [exponent, setExponent]     = useState('8');
  const [slurryL, setSlurryL]       = useState('');
  const [harvestPickIdx, setHarvestPickIdx] = useState<string>('');

  // For focusing search after open / after Add & Keep Open
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Type-switch reset (the HTML's stale-state bug is NOT replicated) ──────
  // Declared before the effects below — they reference it, and useEffect's
  // dep array is evaluated synchronously during render so any forward
  // reference would hit TDZ. (Setters are stable, so empty deps are fine.)
  const resetForType = useCallback((t: IngredientType) => {
    const d = defaultsFor(t);
    setName('');
    setAmt('');
    setUnit(d.unit);
    setUse(d.use);
    setTime(d.time);
    setColdDays('7');
    setExtra('');
    setCost('');
    setNotes('');
    setPickerSearch('');
    setSelectedLibId('');
    // Yeast block — always reset; harmless when switching to non-yeast
    setPitchTemp('18');
    setPitchPh('5.2');
    setPitchO2('8');
    setAtten('75');
    setYeastForm('liquid');
    setYeastSource('fresh');
    setYeastBatch('');
    setYeastGen('');
    setMantissa('3');
    setExponent('8');
    setSlurryL('');
    setHarvestPickIdx('');
  }, []);

  useEffect(() => { searchRef.current?.focus(); }, [currentType]);

  // If the parent passes a different type prop while we're still mounted
  // (e.g. clicking another Add button without first closing), re-sync.
  useEffect(() => {
    setCurrentType(prev => {
      if (prev === initialType) return prev;
      resetForType(initialType);
      return initialType;
    });
  }, [initialType, resetForType]);

  const switchType = useCallback((t: IngredientType) => {
    if (t === currentType) return;
    setCurrentType(t);
    resetForType(t);
  }, [currentType, resetForType]);

  // ── Library list for current type (water has no library) ──────────────────
  const libList: LibEntry[] = useMemo(() => {
    switch (currentType) {
      case 'grain': return maltLib;
      case 'hop':   return hopLib;
      case 'yeast': return yeastLib;
      case 'misc':  return miscLib;
      case 'water': return [];
    }
  }, [currentType, maltLib, hopLib, yeastLib, miscLib]);

  const filteredLib = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return libList;
    return libList.filter(e => (e.name || '').toLowerCase().includes(q));
  }, [libList, pickerSearch]);

  // ── Library row click (mirrors HTML selectPickerRow) ──────────────────────
  const selectLibRow = useCallback((entry: LibEntry) => {
    // Library ids are `string | number` in the type; selectedLibId is
    // `string`. Stringify here so the cast at the read sites isn't
    // needed.
    setSelectedLibId(String(entry.id));
    setName(entry.name || '');
    // Fill `extra` from EBC / AA / atten in priority order (matches HTML)
    const e = entry as Record<string, unknown>;
    if (e.ebc != null && e.ebc !== '') {
      setExtra(parseFloat(String(e.ebc)).toFixed(1));
    } else if (e.aa != null && e.aa !== '') {
      setExtra(parseFloat(String(e.aa)).toFixed(1));
    } else if (e.atten != null && e.atten !== '') {
      setExtra(parseFloat(String(e.atten)).toFixed(1));
    }
    if (e.price != null && e.price !== '') {
      setCost(String(e.price));
    }
    // Yeast: also fill the dedicated atten field (validated) and form
    if (currentType === 'yeast') {
      const validAtten = validateAtten(e.atten);
      setAtten(validAtten != null ? validAtten.toFixed(1) : '75');
      const formStr = String(e.form || '').toLowerCase();
      if (formStr === 'dry') setYeastForm('dry');
      else if (formStr === 'liquid') setYeastForm('liquid');
    }
  }, [currentType]);

  // ── Available harvested yeast (re-derived when name changes & source=harvested) ─
  const availableHarvest = useMemo(() => {
    if (currentType !== 'yeast' || yeastSource !== 'harvested') return [];
    return getAvailableHarvestedYeast(name.trim());
  }, [currentType, yeastSource, name]);

  // Apply selected harvested stock (mirrors HTML applyAddHarvestPickerSelection)
  const applyHarvestPick = useCallback((idxStr: string) => {
    setHarvestPickIdx(idxStr);
    const idx = parseInt(idxStr, 10);
    if (!isFinite(idx) || !availableHarvest[idx]) return;
    const entry = availableHarvest[idx];
    setYeastBatch(entry.harvestedFromLabel || '');
    setYeastGen(String(entry.generation || 1));
    setSlurryL(entry.avail.toFixed(1));
  }, [availableHarvest]);

  // ── Live "what-if" stats (mirrors HTML updateModalStats — preview push) ───
  // Build a temporary ingredient from current form state, prepend it to the
  // recipe's ingredient list, run the same calc engine the recipe uses.
  const draftStats = useMemo(() => {
    if (!recipe) return null;
    const batchL = recipe.batchL || 0;
    if (batchL <= 0) return null;

    const parsedAmt = parseFloat(amt) || 0;
    let storedAmt = parsedAmt;
    let storedUnit = unit;
    if (currentType === 'grain') {
      // Grain stats expect kg
      storedAmt = unit === 'g' ? parsedAmt / 1000 : parsedAmt;
      storedUnit = 'kg';
    } else if (currentType === 'yeast' && yeastForm === 'liquid') {
      // Liquid yeast stored as ml internally for downstream calcs (matches Edit modal)
      storedAmt = parsedAmt * 1000;
      storedUnit = 'ml';
    }

    const preview: Ingredient = {
      id: '__preview__',
      type: currentType,
      name: name || 'preview',
      amt: storedAmt,
      unit: storedUnit,
      use: use.toLowerCase(),
      time: time ? parseFloat(time) : null,
      extra: currentType === 'yeast' ? atten : extra,
      ibu: null,
      pct: null,
      libId: selectedLibId,
      cost: 0,
      sortOrder: allIngredients.length,
    };

    const patched: Ingredient[] = parsedAmt > 0
      ? [...allIngredients, preview]
      : allIngredients;

    const bhEff = recipe.bhEff || 67.60;
    const wpTemp = recipe.whirlpoolTemp ?? settings.whirlpoolTemp ?? 85;

    const grains = patched.filter(i => i.type === 'grain');
    const ogSg = calcOG(grains, maltLib, batchL, bhEff);
    const ogPlato = ogSg > 1 ? sgToPlato(ogSg) : 0;

    // FG: take attenuation from any yeast row in the (patched) list
    const yeastIng = patched.find(i => i.type === 'yeast');
    let attenPct = 0;
    if (yeastIng) {
      attenPct = parseFloat(yeastIng.extra || '0');
      if (!attenPct) {
        const libY = yeastLib.find(y => y.id === yeastIng.libId || y.name === yeastIng.name);
        attenPct = asNum(libY?.atten, 75);
      }
    }
    if (!attenPct) attenPct = 75;
    const fgSg = calcFG(ogSg, attenPct);
    const fgPlato = fgSg > 1 ? sgToPlato(fgSg) : 0;
    const abv = calcABV(ogSg, fgSg);

    const { total: ibu } = calcTotalIBU({
      method: settings.ibuMethod, hops: patched, hopLib, batchL, ogSg,
      whirlpoolTemp: wpTemp, mashHopAdj: settings.mashHopAdj,
      leafHopAdj: settings.leafHopAdj, largeBatchUtil: settings.largeBatchUtil,
    });
    const ebc = calcEBC(patched, maltLib, batchL);

    const totalGrainKg = grains.reduce((s, g) => s + (g.unit === 'g' ? g.amt * 0.001 : g.amt), 0);
    const totalHopG = patched.filter(i => i.type === 'hop')
      .reduce((s, h) => s + (h.unit === 'kg' ? h.amt * 1000 : h.amt), 0);

    return { ogPlato, fgPlato, abv, ibu, ebc, totalGrainKg, totalHopG };
  }, [
    recipe, allIngredients, currentType, name, amt, unit, use, time, extra,
    atten, yeastForm, selectedLibId, maltLib, hopLib, yeastLib, settings,
  ]);

  // ── Cell math (mirrors HTML updateAddYeastCalc) ───────────────────────────
  // Declared AFTER draftStats so it can read the live ogPlato directly.
  const cellCalc = useMemo(() => {
    if (currentType !== 'yeast') return null;
    const batchL = recipe?.batchL || 20;
    const isDry = yeastForm === 'dry';
    const amtVal = parseFloat(amt);
    let needed: string, available: string, delta: string, deltaColor: string;

    if (isDry) {
      const neededG = 0.75 * batchL; // g
      const availG = isFinite(amtVal) ? amtVal : NaN;
      needed = `${fmtNum(neededG, { dp: 0, suffix: ' g' })} (≈${fmtB(neededG * 10)})`;
      available = isFinite(availG) ? `${fmtNum(availG, { dp: 0, suffix: ' g' })} (≈${fmtB(availG * 10)})` : '—';
      const diff = isFinite(availG) ? availG - neededG : NaN;
      delta = isFinite(diff) ? `${diff >= 0 ? '+' : ''}${fmtNum(diff, { dp: 0, suffix: ' g' })}` : '—';
      deltaColor = isFinite(diff) ? (diff >= 0 ? 'var(--amber-bright)' : '#c03030') : '';
    } else {
      // Liquid — needed in billions of cells. Use the live preview ogPlato
      // if non-zero, else the recipe's stored value, else default 12.
      const ogPlato = (draftStats?.ogPlato || recipe?.ogPlato || 12);
      const neededB = 0.75 * batchL * 1000 * ogPlato / 1e3;
      let availB: number;
      if (yeastSource === 'harvested') {
        const m  = parseFloat(mantissa) || 3;
        const ex = parseFloat(exponent) || 8;
        const sL = parseFloat(slurryL);
        const bPerMl = (m * Math.pow(10, ex)) / 1e9;
        availB = isFinite(sL) ? bPerMl * sL * 1000 : NaN;
      } else {
        availB = isFinite(amtVal) ? amtVal * 1000 : NaN; // L → mL → ~1B/mL
      }
      needed = fmtB(neededB);
      available = isFinite(availB) ? fmtB(availB) : '—';
      const diff = isFinite(availB) ? availB - neededB : NaN;
      delta = isFinite(diff) ? `${diff >= 0 ? '+' : ''}${fmtB(Math.abs(diff))}` : '—';
      deltaColor = isFinite(diff) ? (diff >= 0 ? 'var(--amber-bright)' : '#c03030') : '';
    }
    return { needed, available, delta, deltaColor };
  }, [currentType, yeastForm, amt, yeastSource, mantissa, exponent, slurryL, recipe, draftStats]);

  // ── Same-type ingredient list for the sidebar ─────────────────────────────
  const sameTypeIngs = useMemo(
    () => allIngredients.filter(i => i.type === currentType),
    [allIngredients, currentType],
  );

  // ── Build & validate ingredient on Add ────────────────────────────────────
  const buildIngredient = useCallback((): Ingredient | null => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      pushToast({ message: 'Enter a name.', variant: 'error' });
      return null;
    }
    const parsedAmt = parseFloat(amt) || 0;

    // Yeast-form drives unit (deliberate cleanup over HTML)
    let finalUnit = unit;
    let finalAmt = parsedAmt;
    if (currentType === 'yeast') {
      if (yeastForm === 'dry') {
        finalUnit = 'g';
      } else {
        finalUnit = 'ml';
        finalAmt = parsedAmt * 1000;
      }
    }

    // Use & time per type
    let finalUse = '';
    let finalTime: number | null = null;
    if (currentType === 'grain')      finalUse = 'mash';
    else if (currentType === 'yeast') finalUse = 'primary';
    else                              finalUse = use.toLowerCase();

    if (currentType === 'hop' || currentType === 'misc') {
      if (currentType === 'hop' && use === 'Dry Hop') finalTime = null;
      else if (currentType === 'misc' && use === 'Cold Side') finalTime = null;
      else finalTime = time ? parseFloat(time) : null;
    }

    // Extra: for yeast, atten goes into `extra`; for others use the extra field
    const finalExtra = currentType === 'yeast' ? (atten || '') : (extra || '');

    const idx = allIngredients.length;
    const id = `${recipeId}_${idx}`;

    const ing: Ingredient & Record<string, unknown> = {
      id, type: currentType, name: trimmedName,
      amt: finalAmt, unit: finalUnit, use: finalUse,
      time: finalTime, extra: finalExtra,
      ibu: null, pct: null,
      libId: selectedLibId,
      cost: parseFloat(cost) || 0,
      sortOrder: idx,
    };

    if (notes) (ing as Record<string, unknown>).notes = notes;

    if (currentType === 'misc' && use === 'Cold Side' && coldDays) {
      (ing as Record<string, unknown>).coldDays = parseFloat(coldDays) || null;
    }

    if (currentType === 'yeast') {
      (ing as Record<string, unknown>).pitchTemp   = parseFloat(pitchTemp) || null;
      (ing as Record<string, unknown>).pitchPh     = parseFloat(pitchPh) || null;
      (ing as Record<string, unknown>).pitchO2     = parseFloat(pitchO2) || null;
      (ing as Record<string, unknown>).yeastForm   = yeastForm;
      (ing as Record<string, unknown>).yeastSource = yeastSource;
      if (yeastSource === 'harvested') {
        if (yeastBatch) (ing as Record<string, unknown>).yeastBatch = yeastBatch;
        if (yeastGen)   (ing as Record<string, unknown>).yeastGen = yeastGen;
        (ing as Record<string, unknown>).slurryL  = parseFloat(slurryL) || null;
        (ing as Record<string, unknown>).mantissa = parseFloat(mantissa) || null;
        (ing as Record<string, unknown>).exponent = parseFloat(exponent) || null;
      }
    }

    if (currentType === 'grain') {
      // Library 'malted' flag flows through to the ingredient (matches HTML lines 19084–19086).
      // MaltLib.malted and Ingredient.malted are both formally typed now —
      // the earlier `Record<string, unknown>` casts were a workaround.
      const libM = maltLib.find(m => (m.name || '').toLowerCase() === trimmedName.toLowerCase());
      ing.malted = libM?.malted !== false;
    }

    return ing as Ingredient;
  }, [
    name, amt, unit, use, time, coldDays, extra, atten, cost, notes, currentType,
    yeastForm, yeastSource, yeastBatch, yeastGen, mantissa, exponent, slurryL,
    pitchTemp, pitchPh, pitchO2, selectedLibId, allIngredients, recipeId, maltLib,
    pushToast,
  ]);

  const handleAddAndClose = useCallback(() => {
    const ing = buildIngredient();
    if (!ing) return;
    if (substituteMode) { onClose(ing); return; }
    addIngredientToStore(recipeId, ing);
    onClose();
  }, [buildIngredient, substituteMode, addIngredientToStore, recipeId, onClose]);

  const handleAddKeepOpen = useCallback(() => {
    const ing = buildIngredient();
    if (!ing) return;
    addIngredientToStore(recipeId, ing);
    // Reset form fields but keep type and modal open (mirrors HTML clearModal)
    setName('');
    setAmt('');
    setExtra('');
    setCost('');
    setNotes('');
    setPickerSearch('');
    setSelectedLibId('');
    if (currentType === 'yeast') {
      setYeastSource('fresh');
      setYeastForm('liquid');
      setYeastBatch('');
      setYeastGen('');
      setSlurryL('');
      setHarvestPickIdx('');
    }
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [buildIngredient, addIngredientToStore, recipeId, currentType]);

  // ── Render flags per type ─────────────────────────────────────────────────
  const showUseField   = currentType === 'hop' || currentType === 'water' || currentType === 'misc';
  const showTimeField  = (currentType === 'hop' && use !== 'Dry Hop')
                       || (currentType === 'misc' && use !== 'Cold Side');
  const showColdDays   = currentType === 'misc' && use === 'Cold Side';
  const showExtraField = currentType !== 'yeast' && currentType !== 'misc';
  const showUnitField  = currentType !== 'yeast'; // Yeast unit driven by form
  const showYeastBlock = currentType === 'yeast';
  const extraLabel     = defaultsFor(currentType).extraLabel;

  const useOptions =
    currentType === 'hop'   ? HOP_USES
    : currentType === 'water' ? WATER_USES
    : currentType === 'misc'  ? MISC_USES
    : [];

  // Picker grid template
  const pickerCols = PICKER_COLS[currentType];
  const pickerHdrs = PICKER_HDRS[currentType];
  const pickerGrid = pickerCols.length === 4 ? '1fr 90px 70px 70px' : '1fr';

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay open" onClick={() => onClose()}>
      <div
        className="modal"
        style={{ width: 860, maxWidth: '96vw', display: 'flex', flexDirection: 'row', overflow: 'hidden', borderRadius: 16 }}
        onClick={e => e.stopPropagation()}
      >

        {/* ═══ LEFT: stats sidebar + ingredient list ═══ */}
        <div style={{ width: 175, flexShrink: 0, background: 'var(--panel2)', borderRight: '1px solid var(--border)', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'var(--amber-dim)', marginBottom: 2 }}>Recipe Stats</div>
          <div className="ie-stat-row"><span className="ie-stat-lbl">OG</span>   <span className="ie-stat-val" style={{ color: 'var(--amber)' }}>{draftStats?.ogPlato ? fmtNum(draftStats.ogPlato, { dp: 2, suffix: ' °P' }) : '—'}</span></div>
          <div className="ie-stat-row"><span className="ie-stat-lbl">FG</span>   <span className="ie-stat-val">{draftStats?.fgPlato ? fmtNum(draftStats.fgPlato, { dp: 2, suffix: ' °P' }) : '—'}</span></div>
          <div className="ie-stat-row"><span className="ie-stat-lbl">ABV</span>  <span className="ie-stat-val" style={{ color: 'var(--green)' }}>{draftStats?.abv ? fmtNum(draftStats.abv, { dp: 1, suffix: '%' }) : '—'}</span></div>
          <div className="ie-stat-row"><span className="ie-stat-lbl">IBU</span>  <span className="ie-stat-val">{draftStats?.ibu ? fmtNum(draftStats.ibu, { dp: 1 }) : '—'}</span></div>
          <div className="ie-stat-row"><span className="ie-stat-lbl">EBC</span>  <span className="ie-stat-val">{draftStats?.ebc ? fmtNum(draftStats.ebc, { dp: 1 }) : '—'}</span></div>
          <div className="ie-stat-row"><span className="ie-stat-lbl">Grain</span><span className="ie-stat-val">{draftStats?.totalGrainKg ? fmtNum(draftStats.totalGrainKg, { dp: 2, suffix: ' kg' }) : '—'}</span></div>
          <div className="ie-stat-row" style={{ borderBottom: 'none' }}><span className="ie-stat-lbl">Hops</span><span className="ie-stat-val">{draftStats?.totalHopG ? fmtNum(draftStats.totalHopG, { dp: 0, suffix: ' g' }) : '—'}</span></div>

          <div style={{ fontStyle: 'italic', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 6 }}>Updates live as you add ingredients</div>

          <div style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 8, overflowY: 'auto', maxHeight: 200 }}>
            {sameTypeIngs.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No {currentType}s in recipe yet</div>
              : sameTypeIngs.map(i => {
                  const useLabel = i.use && i.time ? `${i.use} ${i.time}m` : i.use || '';
                  return (
                    <div key={i.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={i.name}>{i.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtAmt(i.amt, i.unit)} {i.unit}</span>
                      </div>
                      {useLabel && <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingBottom: 2 }}>{useLabel}</div>}
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* ═══ RIGHT: header + tabs + picker + form + footer ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Header */}
          <div className="modal-header">
            <span className="modal-title">{TITLES[currentType]}</span>
            <button className="modal-close" onClick={() => onClose()}>&times;</button>
          </div>

          <div className="modal-body" style={{ padding: 0 }}>

            {/* Type selector tabs */}
            <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)' }}>
              <div className="type-selector">
                {(['grain', 'hop', 'water', 'yeast', 'misc'] as IngredientType[]).map(t => (
                  <div
                    key={t}
                    className={`type-opt${currentType === t ? ' active' : ''}`}
                    onClick={() => switchType(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </div>
                ))}
              </div>
            </div>

            {/* Library search */}
            <div style={{ padding: '8px 14px 4px', borderBottom: '1px solid var(--border)' }}>
              <input
                ref={searchRef}
                type="text"
                className="picker-search"
                placeholder="Search library…"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
              />
            </div>

            {/* Library result list */}
            <div style={{ height: 180, overflowY: 'auto', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              {filteredLib.length === 0 ? (
                <div className="picker-empty">No {currentType} in library — import via Libraries menu</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: pickerGrid, padding: '3px 14px', borderBottom: '2px solid var(--border2)', gap: 8, background: 'var(--panel2)' }}>
                    {pickerHdrs.map((h, i) => pickerCols[i] ? (
                      <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</div>
                    ) : null)}
                  </div>
                  {filteredLib.map(entry => {
                    const isSel = entry.id === selectedLibId;
                    return (
                      <div
                        key={entry.id}
                        className={`picker-row${isSel ? ' selected' : ''}`}
                        style={{ gridTemplateColumns: pickerGrid }}
                        onClick={() => selectLibRow(entry)}
                      >
                        {pickerCols.map(col => {
                          const isName = col === 'name';
                          const e = entry as Record<string, unknown>;
                          let val: string = String(e[col] ?? '');
                          if (!isName && val !== '' && !isNaN(parseFloat(val))) {
                            let num = parseFloat(val);
                            if (col === 'atten') {
                              if (num < 2) num = num * 100;
                              val = (num >= 50 && num <= 100) ? fmtNum(num, { dp: 1 }) : '—';
                            } else {
                              val = fmtNum(num, { dp: 1 });
                            }
                          }
                          return <div key={col} className={isName ? 'picker-name' : 'picker-sub'}>{val || '—'}</div>;
                        })}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* ═══ Form ═══ */}
            <div style={{ padding: '10px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Row 1: Name + Amount + Unit */}
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. IREKS Pilsner Malt"
                  />
                </div>
                <div className="form-group">
                  <label>Amount</label>
                  <input
                    type="number"
                    value={amt}
                    onChange={e => setAmt(e.target.value)}
                    placeholder="0.00"
                    step="any"
                  />
                </div>
                {showUnitField && (
                  <div className="form-group" style={{ flex: 0.6 }}>
                    <label>Unit</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)}>
                      {currentType === 'grain' && <><option value="kg">kg</option><option value="g">g</option></>}
                      {currentType === 'hop'   && <><option value="g">g</option><option value="kg">kg</option></>}
                      {currentType === 'water' && <><option value="g">g</option><option value="ml">ml</option><option value="L">L</option></>}
                      {currentType === 'misc'  && <><option value="g">g</option><option value="ml">ml</option><option value="each">each</option></>}
                    </select>
                  </div>
                )}
                {currentType === 'yeast' && (
                  <div className="form-group" style={{ flex: 0.6 }}>
                    <label>Unit</label>
                    {/* Yeast unit driven by form — disabled, display-only */}
                    <input type="text" value={yeastForm === 'dry' ? 'g' : 'L'} disabled style={{ opacity: 0.7 }} />
                  </div>
                )}
              </div>

              {/* Row 2: Use + Time/Days + Extra */}
              {(showUseField || showExtraField) && (
                <div className="form-row">
                  {showUseField && (
                    <div className="form-group">
                      <label>Use</label>
                      <select value={use} onChange={e => setUse(e.target.value)}>
                        {useOptions.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  )}
                  {showTimeField && (
                    <div className="form-group">
                      <label>Time (min)</label>
                      <input type="number" value={time} onChange={e => setTime(e.target.value)} placeholder="60" />
                    </div>
                  )}
                  {showColdDays && (
                    <div className="form-group">
                      <label>Days</label>
                      <input type="number" value={coldDays} onChange={e => setColdDays(e.target.value)} min="1" placeholder="7" />
                    </div>
                  )}
                  {showExtraField && extraLabel && (
                    <div className="form-group">
                      <label>{extraLabel}</label>
                      <input type="number" value={extra} onChange={e => setExtra(e.target.value)} placeholder="0" step="0.1" />
                    </div>
                  )}
                </div>
              )}

              {/* Row 3: Cost + Notes */}
              <div className="form-row" style={{ gap: 14 }}>
                <div className="form-group">
                  <label>Cost (¥)</label>
                  <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Notes</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" />
                </div>
              </div>

              {/* Yeast-specific block */}
              {showYeastBlock && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                  <div className="form-row" style={{ gap: 14 }}>
                    <div className="form-group">
                      <label>Form</label>
                      <select value={yeastForm} onChange={e => { setYeastForm(e.target.value as 'liquid' | 'dry'); setAmt(''); }}>
                        <option value="liquid">Liquid</option>
                        <option value="dry">Dry</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Fresh / Harvested</label>
                      <select value={yeastSource} onChange={e => setYeastSource(e.target.value as 'fresh' | 'harvested')}>
                        <option value="fresh">Fresh</option>
                        <option value="harvested">Harvested</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Pitch Temp (°C)</label>
                      <input type="number" value={pitchTemp} onChange={e => setPitchTemp(e.target.value)} step="0.5" placeholder="18" />
                    </div>
                  </div>
                  <div className="form-row" style={{ gap: 14 }}>
                    <div className="form-group">
                      <label>Pitch pH</label>
                      <input type="number" value={pitchPh} onChange={e => setPitchPh(e.target.value)} step="0.01" placeholder="5.2" />
                    </div>
                    <div className="form-group">
                      <label>Target O₂ (ppm)</label>
                      <input type="number" value={pitchO2} onChange={e => setPitchO2(e.target.value)} step="0.5" placeholder="8" />
                    </div>
                    <div className="form-group">
                      <label>Attenuation %</label>
                      <input type="number" value={atten} onChange={e => setAtten(e.target.value)} step="0.1" placeholder="75" />
                    </div>
                  </div>

                  {/* Harvested slurry sub-block */}
                  {yeastSource === 'harvested' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0', borderTop: '1px dashed var(--border)' }}>
                      <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Select from Harvested Stock</label>
                          <select value={harvestPickIdx} onChange={e => applyHarvestPick(e.target.value)}>
                            <option value="">— select stock —</option>
                            {availableHarvest.map(s => (
                              <option key={s.idx} value={String(s.idx)}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>From Brew</label>
                          <input type="text" value={yeastBatch} onChange={e => setYeastBatch(e.target.value)} placeholder="—" />
                        </div>
                        <div className="form-group">
                          <label>Generation</label>
                          <input type="number" value={yeastGen} onChange={e => setYeastGen(e.target.value)} min="1" step="1" placeholder="1" />
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                        {(() => {
                          const total = availableHarvest.reduce((s, e) => s + e.avail, 0);
                          if (!name.trim()) return 'Enter strain name above to see available stock';
                          return total > 0
                            ? `${fmtNum(total, { dp: 1, suffix: 'L' })} available for ${name.trim()}`
                            : `No harvested stock for ${name.trim()} — log a harvest first`;
                        })()}
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Cells/mL (×10ˣ)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" value={mantissa} onChange={e => setMantissa(e.target.value)} min="0.1" max="9.9" step="0.1" style={{ width: 60 }} />
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>× 10^</span>
                            <input type="number" value={exponent} onChange={e => setExponent(e.target.value)} min="6" max="10" step="1" style={{ width: 50 }} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Slurry Volume (L)</label>
                          <input type="number" value={slurryL} onChange={e => setSlurryL(e.target.value)} step="0.1" placeholder="—" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cell count display panel */}
                  {cellCalc && (
                    <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Cells Needed</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)' }}>{cellCalc.needed}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Cells Available</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)' }}>{cellCalc.available}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Over / Under</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: cellCalc.deltaColor }}>{cellCalc.delta}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button className="btn" onClick={() => onClose()}>Cancel</button>
            {!substituteMode && (
              <button className="btn" onClick={handleAddKeepOpen} title="Add and keep modal open">＋ Add &amp; Keep Open</button>
            )}
            <button className="btn primary" onClick={handleAddAndClose}>
              {substituteMode ? 'Substitute' : 'Add to Recipe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
