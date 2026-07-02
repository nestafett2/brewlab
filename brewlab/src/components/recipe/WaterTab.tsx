/**
 * Water Chemistry tab — port of HTML page-water (lines 1962-2167) and the
 * supporting wc* JS (11459-12562).
 *
 * Persistence: the HTML originally stored bl_water_chem_<id> in localStorage
 * only (not in its sbSet routing). React routes it to the new water_chem
 * JSONB blob table — recipe_id PK, same pattern as brew_day / ferm_meta /
 * cold_side. Wired in supabase.ts (sbDispatch, sbHydrate, sbWipeAll).
 *
 * Pre-fill behaviour matches HTML wcAutoFillVolumes: if mash/sparge volumes
 * are empty AND brew-day targets are computable, populate the input values
 * with the brew-day numbers but DO NOT auto-save. The user has to type or
 * click Save explicitly to persist.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { fmtNum } from '../../lib/format';
import {
  WC_IONS, WC_MINERAL_KEYS, WC_ION_RANGES, WC_PRESETS,
  acidMeqPerMl, calcWaterIons, estimateMashPh, solveMashAcidMEqPerL,
  solveMineralsForTargets,
  findWaterProfile, calcBrewDayTargets, DEFAULT_MASH_PROFILE,
} from '../../lib/calculations';
import type {
  WaterChemData, WaterIon, WaterMineral, WaterProfile,
} from '../../types';

interface Props { recipeId: string }

/** Source-water → ion ppm map (defensive zeros if any field is missing). */
function profileIons(p: WaterProfile | null): Record<WaterIon, number> {
  return {
    ca:   p?.ca   ?? 0,
    mg:   p?.mg   ?? 0,
    na:   p?.na   ?? 0,
    so4:  p?.so4  ?? 0,
    cl:   p?.cl   ?? 0,
    hco3: p?.hco3 ?? 0,
  };
}

/** Convert WaterChemData.minerals to a number map for `calcWaterIons`. */
function mineralsAsNumbers(
  m: WaterChemData['minerals'] | undefined,
): Partial<Record<WaterMineral, { mash: number; sparge: number }>> {
  const out: Partial<Record<WaterMineral, { mash: number; sparge: number }>> = {};
  if (!m) return out;
  for (const key of WC_MINERAL_KEYS) {
    const slot = m[key];
    if (!slot) continue;
    const mash   = parseFloat(slot.mash   ?? '') || 0;
    const sparge = parseFloat(slot.sparge ?? '') || 0;
    if (mash > 0 || sparge > 0) out[key] = { mash, sparge };
  }
  return out;
}

const PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: '',       label: '— or enter manually —' },
  { value: 'pale',   label: 'Pale Ale / IPA' },
  { value: 'hazy',   label: 'Hazy / NEIPA' },
  { value: 'lager',  label: 'Lager / Pilsner' },
  { value: 'stout',  label: 'Stout / Porter' },
  { value: 'wheat',  label: 'Wheat / Witbier' },
  { value: 'custom', label: 'Custom (manual)' },
];

const MINERAL_DISPLAY: { key: WaterMineral; name: string; sub: string }[] = [
  { key: 'gypsum', name: 'Gypsum',       sub: 'CaSO₄' },
  { key: 'cacl2',  name: 'Cal Chloride', sub: 'CaCl₂' },
  { key: 'epsom',  name: 'Epsom',        sub: 'MgSO₄' },
  { key: 'mgcl2',  name: 'Mag Chloride', sub: 'MgCl₂' },
  { key: 'nacl',   name: 'Table Salt',   sub: 'NaCl' },
  { key: 'nahco3', name: 'Baking Soda',  sub: 'NaHCO₃' },
];

const ION_DISPLAY: { key: WaterIon; name: string }[] = [
  { key: 'ca',   name: 'Calcium' },
  { key: 'mg',   name: 'Magnesium' },
  { key: 'na',   name: 'Sodium' },
  { key: 'so4',  name: 'Sulfate' },
  { key: 'cl',   name: 'Chloride' },
  { key: 'hco3', name: 'Bicarbonate' },
];

export default function WaterTab({ recipeId }: Props) {
  // ── Store ────────────────────────────────────────────────────────────
  const recipe       = useStore(s => s.recipes.find(r => r.id === recipeId));
  const ingredients  = useStore(s => s.ingredientsByRecipe[recipeId] ?? []);
  const settings     = useStore(s => s.settings);
  const maltLib      = useStore(s => s.maltLib);
  const hopLib       = useStore(s => s.hopLib);
  const yeastLib     = useStore(s => s.yeastLib);
  const equipProfiles = useStore(s => s.equipProfiles);
  const waterProfiles = useStore(s => s.waterProfiles);
  const getWaterChem = useStore(s => s.getWaterChem);
  const setWaterChem = useStore(s => s.setWaterChem);

  // ── Per-recipe profile fallback (HTML wcLoadPage 12174-12179) ────────
  // If the saved water-chem blob has no sourceProfileId, fall back to the
  // recipe's water profile from the reactive recipeProfilesByRecipe slice
  // (set by the Recipe tab's Profiles bar). Reactive — picks up new
  // selections without a tab remount.
  const recipeProfiles = useStore(s => s.recipeProfilesByRecipe[recipeId]);
  const recipeWaterProfileId = recipeProfiles?.water || '';
  const pushToast = useStore(s => s.pushToast);

  // ── Per-recipe mash profile (reactive — same pattern as BrewDayTab) ─
  // Was passing literal `null` to calcBrewDayTargets, which forced the
  // water-balance fallback and produced wrong sparge prefills. Now subscribes
  // to mashByRecipe so the modal saving while this tab is mounted refreshes
  // the prefill effect below.
  const mashSaved = useStore(s => s.mashByRecipe[recipeId]);
  const getMash   = useStore(s => s.getMash);
  useEffect(() => {
    if (mashSaved === undefined) getMash(recipeId);
  }, [recipeId, mashSaved, getMash]);
  const mashProfile = mashSaved ?? DEFAULT_MASH_PROFILE;

  // ── Local state — initialize from persisted blob only ────────────────
  // Volume prefill moved into the useEffect below so it can react to
  // mashProfile / settings changes after mount. The dirtyRef gate keeps
  // prefill non-persistent: setWaterChem only fires after a user edit.
  const [wc, setWc] = useState<WaterChemData>(() => getWaterChem(recipeId));
  const [saveStatus, setStatus] = useState<string>('');
  // Track whether the user has actually edited anything since mount. The
  // prefill effect runs only while this is false — once the user touches
  // a field, prefill stops overwriting their work, and the debounced save
  // takes over.
  const dirtyRef = useRef(false);

  // ── Volume prefill (matches HTML wcAutoFillVolumes 12209) ────────────
  // Re-runs when mashProfile or relevant settings change while the user
  // hasn't yet edited anything. Only writes to empty slots; never to ones
  // the user has already filled.
  useEffect(() => {
    if (dirtyRef.current) return;
    if (!recipe) return;
    const activeEquip = equipProfiles[0] ?? null;
    const targets = calcBrewDayTargets({
      recipe, ingredients, maltLib, hopLib, yeastLib,
      equip: activeEquip, mashProfile,
      grainAbsorbLkg: settings.grainAbsorb && settings.grainAbsorb > 0 ? settings.grainAbsorb : undefined,
      coolingShrinkagePct: typeof settings.coolingShrinkage === 'number' && settings.coolingShrinkage > 0
        ? settings.coolingShrinkage
        : undefined,
    });
    setWc(prev => {
      const out: WaterChemData = { ...prev };
      let changed = false;
      if (!out.mashVol && targets.mashWaterL && targets.mashWaterL > 0) {
        out.mashVol = targets.mashWaterL.toFixed(1); changed = true;
      }
      if (!out.spargeVol && targets.spargeVolL && targets.spargeVolL > 0) {
        out.spargeVol = targets.spargeVolL.toFixed(1); changed = true;
      }
      return changed ? out : prev;
    });
  }, [mashProfile, recipe, ingredients, maltLib, hopLib, yeastLib,
      equipProfiles, settings.grainAbsorb, settings.coolingShrinkage]);

  // The effective source-profile id used for source ion values + dropdown
  // value — pulls from saved blob, then falls back to the recipe's water
  // profile (HTML wcLoadPage 12174-12179).
  const effectiveSourceId = wc.sourceProfileId || recipeWaterProfileId || '';

  // ── 400ms-debounced save — only fires after a real user edit ─────────
  useEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => setWaterChem(recipeId, wc), 400);
    return () => clearTimeout(id);
  }, [wc, recipeId, setWaterChem]);

  // ── Update helpers — every user-driven write goes through `update` ───
  const update = useCallback((patch: Partial<WaterChemData>) => {
    dirtyRef.current = true;
    setWc(prev => ({ ...prev, ...patch }));
  }, []);
  const updateTarget = useCallback((ion: WaterIon, val: string) => {
    dirtyRef.current = true;
    setWc(prev => ({ ...prev, targets: { ...(prev.targets || {}), [ion]: val } }));
  }, []);
  const updateMineral = useCallback((min: WaterMineral, slot: 'mash' | 'sparge', val: string) => {
    dirtyRef.current = true;
    setWc(prev => ({
      ...prev,
      minerals: {
        ...(prev.minerals || {}),
        [min]: { ...((prev.minerals || {})[min] || {}), [slot]: val },
      },
    }));
  }, []);

  // ── Source ions / volumes / resulting ions ───────────────────────────
  const sourceProfile = useMemo(
    () => findWaterProfile(waterProfiles, effectiveSourceId),
    [waterProfiles, effectiveSourceId],
  );
  const sourceIons = useMemo(() => profileIons(sourceProfile), [sourceProfile]);

  const mashVolL   = parseFloat(wc.mashVol   ?? '') || 0;
  const spargeVolL = parseFloat(wc.spargeVol ?? '') || 0;
  const totalVolL  = mashVolL + spargeVolL;

  const resultIons = useMemo(() => {
    if (!sourceProfile || totalVolL === 0) return null;
    return calcWaterIons({
      source: sourceIons,
      mashVol: mashVolL,
      spargeVol: spargeVolL,
      mineralGrams: mineralsAsNumbers(wc.minerals),
    });
  }, [sourceProfile, sourceIons, mashVolL, spargeVolL, totalVolL, wc.minerals]);

  // SO4:Cl ratio badge
  const ratioBadge = useMemo(() => {
    if (!resultIons || resultIons.cl <= 0) return null;
    const r = resultIons.so4 / resultIons.cl;
    let label = 'Balanced', color = 'var(--text-dim)';
    if (r > 2) { label = '🍺 Hoppy';      color = '#5ab568'; }
    if (r > 4) { label = '🍺 Very Hoppy'; color = '#5ab568'; }
    if (r < 0.5) { label = '🍺 Malty';     color = '#e6a817'; }
    return { text: `SO₄:Cl = ${fmtNum(r, { dp: 2 })} · ${label}`, color };
  }, [resultIons]);

  // ── Mash pH estimate + acid math ─────────────────────────────────────
  const targetPh    = parseFloat(wc.targetPh ?? '') || 5.4;
  const acidType    = wc.acidType || 'lactic';
  const acidPct     = parseFloat(wc.acidPct ?? '') || 88;
  const acidMashMl  = parseFloat(wc.acidMashMl   ?? '') || 0;
  const meqPerMl    = useMemo(() => acidMeqPerMl(acidType, acidPct), [acidType, acidPct]);

  const grains = useMemo(() => ingredients.filter(i => i.type === 'grain'), [ingredients]);

  const phEstimates = useMemo(() => {
    if (!resultIons || mashVolL <= 0) return null;
    const acidMashMEq = acidMashMl > 0 ? acidMashMl * meqPerMl : 0;
    // Two estimates — without acid (for the "starting" pH and gap) and with
    // user-entered acid (for the displayed "final" pH).
    const ph0 = estimateMashPh({ grains, maltLib, resultIons, mashWaterL: mashVolL, acidMashMEq: 0 });
    const phAcid = estimateMashPh({ grains, maltLib, resultIons, mashWaterL: mashVolL, acidMashMEq });
    const acidEffect = ph0.mashPh - phAcid.mashPh;

    // Suggested acid: same mEq/L concentration applied to mash and sparge.
    const acidMEqPerL = solveMashAcidMEqPerL({
      grains, maltLib, resultIons, mashWaterL: mashVolL, targetPh,
    });
    let suggestedMashMl: number | null = null;
    let suggestedSpargeMl: number | null = null;
    if (acidMEqPerL > 0 && meqPerMl > 0) {
      suggestedMashMl   = (acidMEqPerL * mashVolL) / meqPerMl;
      suggestedSpargeMl = spargeVolL > 0 ? (acidMEqPerL * spargeVolL) / meqPerMl : 0;
    }
    return {
      baseEstPh: ph0.mashPh,
      finalPh:   phAcid.mashPh,
      acidEffect,
      ra:        ph0.ra,
      suggestedMashMl,
      suggestedSpargeMl,
    };
  }, [resultIons, mashVolL, spargeVolL, grains, maltLib, acidMashMl, meqPerMl, targetPh]);

  // (HTML wcRecalc 12459-12461 also auto-fills the acid mash/sparge inputs
  // when empty. We deliberately don't replicate that here — the "Suggested
  // mash" / "Suggested sparge" cards already display the live numbers, and
  // letting the inputs stay empty keeps the user's typed value distinguishable
  // from the suggestion. Users who want to commit the suggestion type or copy
  // the value into the input.)

  // ── Apply preset target profile ──────────────────────────────────────
  const applyPreset = useCallback((presetKey: string) => {
    update({ targetProfileId: presetKey });
    if (!presetKey || presetKey === 'custom') return;
    const preset = WC_PRESETS[presetKey];
    if (!preset) return;
    const targets: Partial<Record<WaterIon, string>> = {};
    for (const ion of WC_IONS) targets[ion] = String(preset[ion]);
    setWc(prev => ({ ...prev, targetProfileId: presetKey, targets }));
  }, [update]);

  // ── Calculate Minerals — write all six mineral mash/sparge slots ─────
  const calcMinerals = useCallback(() => {
    if (!sourceProfile) { pushToast({ message: 'Set source water profile and volumes first.', variant: 'info' }); return; }
    if (totalVolL === 0) { pushToast({ message: 'Set source water profile and volumes first.', variant: 'info' }); return; }
    const targets: Record<WaterIon, number> = {
      ca:   parseFloat(wc.targets?.ca   ?? '') || 0,
      mg:   parseFloat(wc.targets?.mg   ?? '') || 0,
      na:   parseFloat(wc.targets?.na   ?? '') || 0,
      so4:  parseFloat(wc.targets?.so4  ?? '') || 0,
      cl:   parseFloat(wc.targets?.cl   ?? '') || 0,
      hco3: parseFloat(wc.targets?.hco3 ?? '') || 0,
    };
    const solved = solveMineralsForTargets({
      source: sourceIons, targets, mashVol: mashVolL, spargeVol: spargeVolL,
    });
    const newMinerals: WaterChemData['minerals'] = {};
    for (const min of WC_MINERAL_KEYS) {
      const s = solved[min];
      newMinerals[min] = {
        mash:   s.mash   > 0.05 ? s.mash.toFixed(1)   : '',
        sparge: s.sparge > 0.05 ? s.sparge.toFixed(1) : '',
      };
    }
    dirtyRef.current = true;
    setWc(prev => ({ ...prev, minerals: newMinerals }));
  }, [sourceProfile, totalVolL, sourceIons, mashVolL, spargeVolL, wc.targets, pushToast]);

  // ── Save / Reset ────────────────────────────────────────────────────
  const saveExplicit = useCallback(() => {
    dirtyRef.current = true;
    setWaterChem(recipeId, wc);
    setStatus('Saved ✓');
    setTimeout(() => setStatus(''), 2000);
  }, [recipeId, setWaterChem, wc]);

  const reset = useCallback(() => {
    const before = wc;
    dirtyRef.current = true;
    const cleared: WaterChemData = {
      acidType: 'lactic',
      acidPct:  '88',
      targetPh: '5.4',
    };
    setWc(cleared);
    setWaterChem(recipeId, cleared);
    pushToast({
      message: 'Cleared water chemistry',
      undo: () => {
        setWc(before);
        setWaterChem(recipeId, before);
      },
    });
  }, [recipeId, setWaterChem, wc, pushToast]);

  if (!recipe) return null;

  // ── Render helpers ──────────────────────────────────────────────────
  const fmtIon = (n: number | undefined) =>
    n != null && isFinite(n) && n > 0 ? fmtNum(n, { dp: 1 }) : '—';
  const ionRange = (ion: WaterIon) => {
    const r = WC_ION_RANGES[ion];
    return `${r.lo}–${r.hi}`;
  };
  const barColor = (ion: WaterIon, val: number): string => {
    const r = WC_ION_RANGES[ion];
    if (val > r.warn) return '#e05252';
    if (val > r.hi)   return '#e6a817';
    return '#5ab568';
  };

  // pH delta + colours (matches HTML 12433-12440)
  const finalPh = phEstimates?.finalPh ?? null;
  const phDeltaColor = (() => {
    if (finalPh == null) return '';
    const diff = Math.abs(finalPh - targetPh);
    return diff < 0.1 ? '#5ab568' : diff < 0.2 ? '#e6a817' : '#e05252';
  })();

  const sectionStyle: React.CSSProperties = {
    background: 'var(--panel2)', border: '1px solid var(--border2)',
    borderRadius: 8, padding: '10px 14px',
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8,
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ROW 1 — Source + Target Ion Profile (left, stacked) | Volumes (right) */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Source Water strip */}
            <div style={{ ...sectionStyle, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ ...sectionTitle, marginBottom: 0, whiteSpace: 'nowrap' as const }}>Source Water</div>
              <select
                value={effectiveSourceId}
                onChange={e => update({ sourceProfileId: e.target.value })}
                style={{ background: 'var(--panel)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, padding: '4px 8px', borderRadius: 5, outline: 'none', minWidth: 160 }}
              >
                <option value="">— select profile —</option>
                {waterProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                {WC_IONS.map(ion => (
                  <span key={ion} className="wc-strip-ion">
                    <span className="wc-strip-lbl">
                      {ion === 'so4' ? <>SO<sub>4</sub></> : ion === 'hco3' ? <>HCO<sub>3</sub></> : ion.charAt(0).toUpperCase() + ion.slice(1)}
                    </span>
                    <span className="wc-strip-val">{fmtIon(sourceIons[ion])}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Target Ion Profile */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ ...sectionTitle, marginBottom: 0 }}>Target Ion Profile</div>
                <select
                  value={wc.targetProfileId ?? ''}
                  onChange={e => applyPreset(e.target.value)}
                  style={{ background: 'var(--panel)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, padding: '3px 8px', borderRadius: 5, outline: 'none', minWidth: 150 }}
                >
                  {PRESET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="btn sm" onClick={calcMinerals} style={{ marginLeft: 'auto' }}>⚗ Calculate Minerals</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                {ION_DISPLAY.map(({ key, name }) => (
                  <div key={key} className="wc-tgt-col">
                    <div className="wc-tgt-lbl">{name} (ppm)</div>
                    <input
                      type="number" step="1" min="0" placeholder="0"
                      className="wc-tgt-input"
                      value={wc.targets?.[key] ?? ''}
                      onChange={e => updateTarget(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Water Volumes */}
          <div style={{ ...sectionStyle, minWidth: 210 }}>
            <div style={sectionTitle}>Water Volumes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="wc-vol-row">
                <label className="wc-vol-label">Mash Water (L)</label>
                <input
                  type="number" step="0.5" min="0" placeholder="auto"
                  className="wc-vol-input"
                  value={wc.mashVol ?? ''}
                  onChange={e => update({ mashVol: e.target.value })}
                />
              </div>
              <div className="wc-vol-row">
                <label className="wc-vol-label">Sparge Water (L)</label>
                <input
                  type="number" step="0.5" min="0" placeholder="auto"
                  className="wc-vol-input"
                  value={wc.spargeVol ?? ''}
                  onChange={e => update({ spargeVol: e.target.value })}
                />
              </div>
              <div className="wc-vol-row" style={{ borderTop: '1px solid var(--border2)', paddingTop: 6 }}>
                <label className="wc-vol-label" style={{ color: 'var(--text-dim)' }}>Total (L)</label>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
                  {totalVolL > 0 ? fmtNum(totalVolL, { dp: 1, suffix: ' L' }) : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2 — Mineral Additions */}
        <div style={{ ...sectionStyle, padding: '12px 14px' }}>
          <div style={{ ...sectionTitle, marginBottom: 10 }}>Mineral Additions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {MINERAL_DISPLAY.map(({ key, name, sub }) => {
              const slot = wc.minerals?.[key];
              return (
                <div key={key} className="wc-mineral-col">
                  <div className="wc-mineral-name">{name}</div>
                  <div className="wc-mineral-sub">{sub}</div>
                  <div className="wc-mineral-vol-label">Mash (g)</div>
                  <input
                    type="number" step="0.1" min="0" placeholder="0"
                    className="wc-mineral-input"
                    value={slot?.mash ?? ''}
                    onChange={e => updateMineral(key, 'mash', e.target.value)}
                  />
                  <div className="wc-mineral-vol-label">Sparge (g)</div>
                  <input
                    type="number" step="0.1" min="0" placeholder="0"
                    className="wc-mineral-input"
                    value={slot?.sparge ?? ''}
                    onChange={e => updateMineral(key, 'sparge', e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ROW 3 — Resulting Ion Profile + SO4:Cl ratio badge */}
        <div style={{ ...sectionStyle, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ ...sectionTitle, marginBottom: 0 }}>Resulting Ion Profile (Total Water)</div>
            <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--panel)', border: '1px solid var(--border2)', color: ratioBadge?.color ?? 'var(--text-dim)' }}>
              {ratioBadge?.text ?? ''}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {ION_DISPLAY.map(({ key, name }) => {
              const val = resultIons?.[key] ?? null;
              const range = WC_ION_RANGES[key];
              const pct = val != null ? Math.min(100, (val / range.warn) * 100) : 0;
              const color = val != null ? barColor(key, val) : 'var(--border2)';

              // Target tick + delta line — only shown when the user has
              // entered a non-zero target for this ion.
              const target = parseFloat(wc.targets?.[key] ?? '') || 0;
              const showTarget = target > 0;
              const tickPct = showTarget
                ? Math.max(0, Math.min(100, (target / range.warn) * 100))
                : 0;
              const delta = val != null && showTarget ? val - target : null;
              const deltaColor = delta != null
                ? Math.abs(delta) / target < 0.10 ? '#5ab568'   // green
                : Math.abs(delta) / target < 0.25 ? '#e6a817'   // amber
                :                                   '#e05252'   // red
                : 'var(--text-muted)';

              return (
                <div key={key} className="wc-res-col">
                  <div className="wc-res-header">
                    {name}<br />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>(ppm)</span>
                  </div>
                  <div className="wc-res-val" style={{ color: val != null ? color : 'var(--text)' }}>
                    {val != null ? fmtNum(val, { dp: 1 }) : '—'}
                  </div>
                  {showTarget && delta != null && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, lineHeight: 1.15, marginTop: 2, color: 'var(--text-muted)' }}>
                      target {target} · <span style={{ color: deltaColor }}>{delta >= 0 ? '+' : ''}{fmtNum(delta, { dp: 0 })}</span>
                    </div>
                  )}
                  <div className="wc-res-bar-wrap" style={{ position: 'relative' }}>
                    <div className="wc-res-bar" style={{ width: `${pct}%`, background: color }} />
                    {showTarget && (
                      <div
                        title={`Target ${target} ppm`}
                        style={{
                          position: 'absolute',
                          top: 0, bottom: 0,
                          left: `${tickPct}%`,
                          width: 2,
                          background: 'rgba(255,255,255,0.6)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </div>
                  <div className="wc-res-range">{ionRange(key)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ROW 4 — Acid + pH side by side */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>

          {/* Acid Addition */}
          <div style={{ ...sectionStyle, flex: 2, padding: '12px 14px' }}>
            <div style={{ ...sectionTitle, marginBottom: 10 }}>Acid Addition</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div className="wc-vol-label" style={{ marginBottom: 4 }}>Acid Type</div>
                <select
                  value={acidType}
                  onChange={e => update({ acidType: e.target.value as 'lactic' | 'phosphoric' })}
                  style={{ background: 'var(--panel)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, padding: '5px 8px', borderRadius: 5, outline: 'none' }}
                >
                  <option value="lactic">Lactic Acid</option>
                  <option value="phosphoric">Phosphoric Acid</option>
                </select>
              </div>
              <div>
                <div className="wc-vol-label" style={{ marginBottom: 4 }}>Concentration (%)</div>
                <input
                  type="number" step="1" min="1" max="100"
                  className="wc-vol-input" style={{ width: 60 }}
                  value={wc.acidPct ?? '88'}
                  onChange={e => update({ acidPct: e.target.value })}
                />
              </div>
              <div>
                <div className="wc-vol-label" style={{ marginBottom: 4 }}>Mash (mL)</div>
                <input
                  type="number" step="0.1" min="0" placeholder="auto"
                  className="wc-vol-input" style={{ width: 72 }}
                  value={wc.acidMashMl ?? ''}
                  onChange={e => update({ acidMashMl: e.target.value })}
                />
              </div>
              <div>
                <div className="wc-vol-label" style={{ marginBottom: 4 }}>Sparge (mL)</div>
                <input
                  type="number" step="0.1" min="0" placeholder="auto"
                  className="wc-vol-input" style={{ width: 72 }}
                  value={wc.acidSpargeMl ?? ''}
                  onChange={e => update({ acidSpargeMl: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px' }}>
                  <div className="wc-vol-label" style={{ marginBottom: 2 }}>Suggested mash</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--amber)' }}>
                    {phEstimates?.suggestedMashMl != null && phEstimates.suggestedMashMl > 0
                      ? fmtNum(phEstimates.suggestedMashMl, { dp: 1, suffix: ' mL' })
                      : (phEstimates && (phEstimates.baseEstPh - targetPh) <= 0 ? 'pH OK' : '— mL')}
                  </div>
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 12px' }}>
                  <div className="wc-vol-label" style={{ marginBottom: 2 }}>Suggested sparge</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--amber)' }}>
                    {phEstimates?.suggestedSpargeMl != null && phEstimates.suggestedSpargeMl > 0
                      ? fmtNum(phEstimates.suggestedSpargeMl, { dp: 1, suffix: ' mL' })
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mash pH */}
          <div style={{ ...sectionStyle, flex: 1, minWidth: 200, padding: '12px 14px' }}>
            <div style={{ ...sectionTitle, marginBottom: 10 }}>Mash pH</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div>
                <div className="wc-vol-label" style={{ marginBottom: 4 }}>Target pH</div>
                <input
                  type="number" step="0.05" min="4.8" max="6.0"
                  className="wc-vol-input" style={{ width: 70 }}
                  value={wc.targetPh ?? '5.4'}
                  onChange={e => update({ targetPh: e.target.value })}
                />
              </div>
              <div style={{ fontSize: 18, color: 'var(--border2)', marginTop: 16 }}>→</div>
              <div>
                <div className="wc-vol-label" style={{ marginBottom: 4 }}>Estimated pH</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: finalPh != null ? phDeltaColor : 'var(--amber)' }}>
                  {finalPh != null ? fmtNum(finalPh, { dp: 2 }) : '—'}
                </div>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: phDeltaColor || 'var(--text-muted)' }}>
              {finalPh != null ? `vs target: ${finalPh - targetPh >= 0 ? '+' : ''}${fmtNum(finalPh - targetPh, { dp: 2 })}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
              {phEstimates
                ? `Residual Alkalinity: ${fmtNum(phEstimates.ra.mEq, { dp: 2, suffix: ' mEq/L' })} · ${fmtNum(phEstimates.ra.ppm, { dp: 0, suffix: ' ppm CaCO₃' })}`
                : ''}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
              {phEstimates && phEstimates.acidEffect > 0
                ? `Acid lowers pH by ${fmtNum(phEstimates.acidEffect, { dp: 2 })}`
                : phEstimates ? 'No acid added' : ''}
            </div>
          </div>
        </div>

        {/* ROW 5 — Save / Reset */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>{saveStatus}</span>
          <button className="btn" onClick={saveExplicit}>💾 Save to Recipe</button>
          <button className="btn sm" onClick={reset}>Reset</button>
        </div>

      </div>
    </div>
  );
}
