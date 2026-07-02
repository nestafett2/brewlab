/**
 * Brew Day tab — port of brewlab-desktop.html lines 1051–1262 (markup),
 * 7885–8145 (helpers), and 8200–8451 (live targets).
 *
 * Structure:
 *   - Top row: collapsible "Mash Readings" table (5 readings + Pre-Trans)
 *   - Bottom row, three columns:
 *       Left  — read-only Mash card (live targets), Steps, Sparge inputs, Notes
 *       Mid   — Boil section (est/meas pre & post-boil volumes, OG, eff)
 *       Right — Pitch & Oxygen + Fermenter (FV select + mm → L)
 *   - Bottom strip: "Mark Brew Day complete"
 *
 * Persistence: 400ms-debounced write of the full blob (user inputs + cached
 * computed targets) through `setBrewDay → lsSet → sbDispatch → brew_day`
 * upsert with `recipe_id` as the conflict column. See SYNC.md.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../../store';
import { fmtNum } from '../../lib/format';
import {
  calcBrewDayTargets,
  calcBhEfficiencyFromMeasOG,
  calcMashEfficiencyFromGrav,
  calcDhPhPrediction,
  fvVolume,
  L_PER_BBL,
  DEFAULT_MASH_PROFILE,
} from '../../lib/calculations';
import type { BrewDayData, MashReadingCol } from '../../types';
import ChecklistStrip from './ChecklistStrip';
import RecordUsageModal from '../inventory/RecordUsageModal';

interface Props { recipeId: string }

type ReadingRow = 'time' | 'temp' | 'ph' | 'gravity';
const READING_COLS: MashReadingCol[] = ['r1', 'r2', 'r3', 'r4', 'r5', 'pt'];
const COL_HEADERS = ['READING 1', 'READING 2', 'READING 3', 'READING 4', 'READING 5', 'PRE-TRANS'];

export default function BrewDayTab({ recipeId }: Props) {
  // ── Store reads ─────────────────────────────────────────────────────────
  const recipe       = useStore(s => s.recipes.find(r => r.id === recipeId));
  const ingredients  = useStore(s => s.ingredientsByRecipe[recipeId] ?? []);
  const updateRecipe = useStore(s => s.updateRecipe);
  const settings      = useStore(s => s.settings);
  const maltLib       = useStore(s => s.maltLib);
  const hopLib        = useStore(s => s.hopLib);
  const yeastLib      = useStore(s => s.yeastLib);
  const equipProfiles = useStore(s => s.equipProfiles);
  const pitchProfiles = useStore(s => s.pitchProfiles);
  const tankCalib     = useStore(s => s.tankCalib);
  const plannerBrews  = useStore(s => s.plannerBrews);
  const getBrewDay    = useStore(s => s.getBrewDay);
  const setBrewDay    = useStore(s => s.setBrewDay);
  const getFermMeta   = useStore(s => s.getFermMeta);

  // ── Local state ─────────────────────────────────────────────────────────
  const [bd, setBd] = useState<BrewDayData>(() => getBrewDay(recipeId));
  const [readingsOpen, setReadingsOpen] = useState(true);
  // Tracks whether the user has actually edited anything since mount/re-hydrate.
  // Without this, the cached-targets persistence effect below would fire on
  // mount and write a non-`{}` blob to bl_bd_<id> for a recipe the user
  // merely opened — wasteful Supabase writes for no real change.
  // Mirrors WaterTab.tsx:143's pattern.
  const dirtyRef = useRef(false);
  // Record Usage modal — pinned to the brew linked to this recipe.
  // HTML invokes the modal via right-click on Order Planner forecast
  // columns; we expose it as an explicit Brew Day button (matching plan).
  const [recordUsageOpen, setRecordUsageOpen] = useState(false);
  // First brew that's linked to this recipe and not yet fully recorded.
  // If none, the button is disabled with a hint.
  const linkedBrew = plannerBrews.find(b => b.recipeId === recipeId && !b.fullyRecorded)
    ?? plannerBrews.find(b => b.recipeId === recipeId)
    ?? null;

  // Re-hydrate when the recipe changes (parent might keep this component mounted
  // but switch recipeId — same pattern as RecipeTab's selection effect).
  // Reset dirtyRef too so the new recipe doesn't inherit "user touched X" from
  // the previous one.
  useEffect(() => {
    setBd(getBrewDay(recipeId));
    dirtyRef.current = false;
  }, [recipeId, getBrewDay]);

  // ── Active equip profile ─────────────────────────────────────────────────
  // Reads the recipe's selected equipment profile id from the reactive
  // store slice (recipeProfilesByRecipe). The Recipe-tab Profiles bar
  // dropdown writes via setRecipeProfileKind; this useMemo recomputes
  // immediately when the user changes the selection. Fallback chain:
  // explicit selection → first profile in the store → null (HTML defaults).
  const recipeProfiles = useStore(s => s.recipeProfilesByRecipe[recipeId]);
  const activeEquip = useMemo(() => {
    const equipId = recipeProfiles?.equip;
    const byId = equipId ? equipProfiles.find(p => p.id === equipId) : null;
    return byId ?? equipProfiles[0] ?? null;
  }, [equipProfiles, recipeProfiles?.equip]);

  // ── Per-recipe mash profile (reactive — see store.mashByRecipe) ─────────
  // Subscribe to the reactive map so the modal saving while this tab is
  // mounted refreshes targets immediately. Fall back to DEFAULT_MASH_PROFILE
  // when nothing is saved (matches HTML default ratio 3.0, std steps);
  // without it calcBrewDayTargets takes its water-balance path and produces
  // TOTAL water as "Mash Water" with sparge ≈ 0.
  // `undefined` from the selector = not yet cached; `null` = cached, no
  // saved profile. Both fall through to the default via `??`.
  const mashSaved = useStore(s => s.mashByRecipe[recipeId]);
  const getMash   = useStore(s => s.getMash);
  useEffect(() => {
    if (mashSaved === undefined) getMash(recipeId);
  }, [recipeId, mashSaved, getMash]);
  const mashProfile = mashSaved ?? DEFAULT_MASH_PROFILE;

  // ── Live targets ─────────────────────────────────────────────────────────
  // Three Settings → Advanced values flow through here:
  //   - grainAbsorb (L/kg)       → mash water / sparge / strike volume math
  //   - defaultGrainTemp (°C)    → Palmer strike-temp formula
  //   - coolingShrinkage (%)     → pre-boil / post-boil volume targets
  //
  // grainAbsorb matches HTML behaviour (HTML reads `getBrewSettings().grainAbsorb`
  // at lines 7938, 8267, 12209, 18058). The other two were saved in HTML but
  // never consumed; React wires them now.
  const targets = useMemo(() => {
    if (!recipe) return null;
    return calcBrewDayTargets({
      recipe, ingredients, maltLib, hopLib, yeastLib,
      equip: activeEquip, mashProfile,
      grainAbsorbLkg: settings.grainAbsorb && settings.grainAbsorb > 0 ? settings.grainAbsorb : undefined,
      grainTempC: typeof settings.defaultGrainTemp === 'number' && isFinite(settings.defaultGrainTemp)
        ? settings.defaultGrainTemp
        : undefined,
      coolingShrinkagePct: typeof settings.coolingShrinkage === 'number' && settings.coolingShrinkage > 0
        ? settings.coolingShrinkage
        : undefined,
    });
  }, [
    recipe, ingredients, maltLib, hopLib, yeastLib, activeEquip, mashProfile,
    settings.grainAbsorb, settings.defaultGrainTemp, settings.coolingShrinkage,
  ]);

  // ── Measured efficiencies (from user inputs) ─────────────────────────────
  const measBhEff = useMemo(() => {
    if (!recipe || !targets) return null;
    return calcBhEfficiencyFromMeasOG(
      parseFloat(bd.measOg ?? ''),
      recipe.batchL || 0,
      targets.totalGrainKg,
    );
  }, [bd.measOg, recipe, targets]);

  const measMashEff = useMemo(() => {
    if (!recipe) return null;
    return calcMashEfficiencyFromGrav(
      parseFloat(bd.mashReadings?.gravity?.pt ?? ''),
      recipe, ingredients, activeEquip, mashProfile,
      settings.grainAbsorb && settings.grainAbsorb > 0 ? settings.grainAbsorb : undefined,
    );
  }, [bd.mashReadings?.gravity?.pt, recipe, ingredients, activeEquip, mashProfile, settings.grainAbsorb]);

  // ── Kettle waste = measured post-boil L − batch L ────────────────────────
  const kettleWasteL = useMemo(() => {
    const post = parseFloat(bd.postboilL ?? '');
    const batch = recipe?.batchL ?? 0;
    if (!isFinite(post) || post <= 0 || batch <= 0) return null;
    const w = post - batch;
    return w >= 0 ? w : null;
  }, [bd.postboilL, recipe?.batchL]);

  // ── FV mm → litres via tank calibration of the selected FV ───────────────
  const fvVolL = useMemo(() => {
    const mm = parseFloat(bd.fvCm ?? '');
    if (!isFinite(mm) || mm <= 0) return null;
    const fvId = recipe?.bdFv;
    const calib = fvId ? tankCalib[fvId] : null;
    if (!calib) return null;
    return fvVolume(mm, calib);
  }, [bd.fvCm, recipe?.bdFv, tankCalib]);

  // ── Predicted DH pH rise (info only, near Target Pitch pH) ───────────────
  // Brew Day happens before fermentation, so dh-temp-c will almost always
  // be empty here — calcDhPhPrediction falls back to the 12 °C default
  // (which evaluates to Janish's 0.025 coefficient). The Ferm tab handles
  // real-time correction once the actual DH temp is known.
  const dhPredVolumeL = fvVolL ?? recipe?.batchL ?? null;
  const dhPredictedRise = useMemo(() => {
    if (!recipe) return null;
    const fm = getFermMeta(recipeId);
    const tempStr = fm['dh-temp-c'];
    const tempNum = tempStr != null && tempStr !== '' ? parseFloat(tempStr) : NaN;
    return calcDhPhPrediction({
      ingredients,
      fermMeta:      fm,
      volumeL:       dhPredVolumeL,
      targetFinalPh: 4.3,        // unused for predictedRise; placeholder
      acidType:      'lactic',   // unused for predictedRise; placeholder
      acidPct:       88,         // unused for predictedRise; placeholder
      dhTempC:       isFinite(tempNum) ? tempNum : undefined,
      beerBufferPhPerMeqL: settings.beerBufferPhPerMeqL,
    });
  }, [recipe, recipeId, ingredients, dhPredVolumeL, getFermMeta, settings.beerBufferPhPerMeqL]);

  // ── Debounced persistence ────────────────────────────────────────────────
  // Save user inputs + cached computed targets so tablet/mobile can show
  // them without recomputing (matches HTML saveBdData lines 8052–8062).
  useEffect(() => {
    // Don't persist mount-time computed targets on a pristine recipe — see
    // dirtyRef declaration for why.
    if (!dirtyRef.current) return;
    const id = setTimeout(() => {
      // Cache target strings exactly the way the live UI shows them so
      // tablet/mobile see the same numbers without recomputing.
      const fmt1 = (n: number | null | undefined, suffix: string) =>
        n != null && isFinite(n) && n >= 0 ? fmtNum(n, { dp: 1, suffix }) : '';
      const fmt2 = (n: number | null | undefined, suffix: string) =>
        n != null && isFinite(n) && n >= 0 ? fmtNum(n, { dp: 2, suffix }) : '';
      const cached: BrewDayData = {
        ...bd,
        mashWaterL:       fmt1(targets?.mashWaterL,       ' L'),
        spargeVolL:       fmt1(targets?.spargeVolL,       ' L'),
        strikeTempC:      fmt1(targets?.strikeTempC,      ' °C'),
        mashRatio:        fmt2(targets?.mashRatioLkg,     ' L/kg'),
        mashEffPredicted: fmt1(targets?.estMashEffPct,    ' %'),
        targetPreboilL:   fmt1(targets?.preBoilVolL,      ' L'),
        targetPostboilL:  fmt1(targets?.postBoilVolL,     ' L'),
        targetPreboilP:   fmt2(targets?.preBoilGravityP,  ''),
        targetPitchTemp:  fmt1(targets?.targetPitchTempC, ' °C'),
        targetO2ppm:      targets?.targetO2Ppm ?? '',
      };
      setBrewDay(recipeId, cached);
    }, 400);
    return () => clearTimeout(id);
  }, [bd, targets, recipeId, setBrewDay]);

  // ── Update helpers ───────────────────────────────────────────────────────
  // Every user-driven write goes through `update` or `updateReading`; both
  // mark dirtyRef so the persistence effect knows the user has actually
  // engaged with the tab.
  const update = useCallback((patch: Partial<BrewDayData>) => {
    dirtyRef.current = true;
    setBd(prev => ({ ...prev, ...patch }));
  }, []);

  const updateReading = useCallback((row: ReadingRow, col: MashReadingCol, val: string) => {
    dirtyRef.current = true;
    setBd(prev => ({
      ...prev,
      mashReadings: {
        ...prev.mashReadings,
        [row]: { ...(prev.mashReadings?.[row] || {}), [col]: val },
      },
    }));
  }, []);

  // L↔bbl bidirectional sync (mirrors HTML syncVol)
  const onPreboilL = (v: string) => {
    const f = parseFloat(v);
    update({ preboilL: v, preboilBbl: isFinite(f) && f > 0 ? (f / L_PER_BBL).toFixed(2) : '' });
  };
  const onPreboilBbl = (v: string) => {
    const f = parseFloat(v);
    update({ preboilBbl: v, preboilL: isFinite(f) && f > 0 ? (f * L_PER_BBL).toFixed(1) : '' });
  };
  const onPostboilL = (v: string) => {
    const f = parseFloat(v);
    update({ postboilL: v, postboilBbl: isFinite(f) && f > 0 ? (f / L_PER_BBL).toFixed(2) : '' });
  };
  const onPostboilBbl = (v: string) => {
    const f = parseFloat(v);
    update({ postboilBbl: v, postboilL: isFinite(f) && f > 0 ? (f * L_PER_BBL).toFixed(1) : '' });
  };

  // Pitch profile auto-fill (mirrors HTML applyPitchProfileFromBd line 20177).
  // PitchProfile carries o2Target / o2Lpm / o2Time / notes — pitch temp is
  // entered per-brew on the Brew Day form rather than per-profile, matching
  // the HTML editor (brewlab-desktop.html:2824–2842 has no temp field).
  const applyPitchProfile = (id: string) => {
    if (!id) return;
    const p = pitchProfiles.find(x => x.id === id);
    if (!p) return;
    const patch: Partial<BrewDayData> = {};
    if (p.o2Lpm != null) patch.o2Lpm = String(p.o2Lpm);
    if (p.o2Time != null) patch.o2Time = String(p.o2Time);
    update(patch);
  };

  // ── FV options: tank calib keys, fall back to fv1..fv8 ──────────────────
  const fvOptions = useMemo(() => {
    const keys = Object.keys(tankCalib).filter(k => k.startsWith('fv'));
    if (keys.length > 0) {
      return keys.map(k => ({ id: k, name: tankCalib[k]?.name || k.toUpperCase() }));
    }
    return Array.from({ length: 8 }, (_, i) => ({ id: `fv${i + 1}`, name: `FV${i + 1}` }));
  }, [tankCalib]);

  if (!recipe) return null;

  // ── Render helpers ──────────────────────────────────────────────────────
  // `—` only when the value is genuinely missing (null/undefined/NaN).
  // Legitimate zero values (e.g. sparge can be 0 when mash water alone is
  // enough to hit the pre-boil target) render as "0.0 L" so the user can
  // see the calc actually ran.
  const r1 = (n: number | null | undefined, suffix = '') =>
    n != null && isFinite(n) && n >= 0 ? fmtNum(n, { dp: 1, suffix }) : '—';
  const r2 = (n: number | null | undefined, suffix = '') =>
    n != null && isFinite(n) && n >= 0 ? fmtNum(n, { dp: 2, suffix }) : '—';

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="bd-layout">
      {/* TOP: Mash Readings table (collapsible) */}
      <div className="bd-readings-row">
        <div className="bd-section" style={{ padding: 0 }}>
          <div
            onClick={() => setReadingsOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', cursor: 'pointer', userSelect: 'none', borderRadius: 12 }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
              Mash Readings
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: readingsOpen ? '' : 'rotate(180deg)' }}>▲</span>
          </div>
          {readingsOpen && (
            <div style={{ padding: '0 14px 10px', overflowX: 'auto' }}>
              <table className="bd-readings-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', width: 80, borderBottom: '1px solid var(--border)' }}></th>
                    {COL_HEADERS.map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: 'var(--amber)', fontWeight: 700, letterSpacing: '0.08em', border: '1px solid var(--border)', background: 'var(--panel2)', textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['time', 'temp', 'ph', 'gravity'] as ReadingRow[]).map(row => (
                    <tr key={row}>
                      <td className="row-label" style={{ padding: '4px 8px', color: 'var(--text-muted)', background: 'var(--panel2)', border: '1px solid var(--border)' }}>
                        {row === 'time' ? 'Time' : row === 'temp' ? 'Temp' : row === 'ph' ? 'pH' : 'Gravity'}
                      </td>
                      {READING_COLS.map(col => (
                        <td key={col} style={{ border: '1px solid var(--border)' }}>
                          <input
                            className="bd-input"
                            placeholder="—"
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }}
                            value={bd.mashReadings?.[row]?.[col] || ''}
                            onChange={e => updateReading(row, col, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="row-label" style={{ padding: '4px 8px', color: 'var(--text-muted)', background: 'var(--panel2)', border: '1px solid var(--border)' }}>
                      Notes
                    </td>
                    <td colSpan={6} style={{ border: '1px solid var(--border)' }}>
                      <input
                        className="bd-input"
                        placeholder="—"
                        style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', fontSize: 13 }}
                        value={bd.mashReadings?.notes || ''}
                        onChange={e => {
                          dirtyRef.current = true;
                          setBd(prev => ({
                            ...prev,
                            mashReadings: { ...prev.mashReadings, notes: e.target.value },
                          }));
                        }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: three columns */}
      <div className="bd-bottom-row">

        {/* LEFT col: Mash + Steps + Sparge + Notes */}
        <div className="bd-col" style={{ maxWidth: 300, flex: '0 0 280px' }}>
          <div className="bd-section">
            <div className="bd-section-title">Mash</div>
            <div className="bd-field"><label>Mash Water (L)</label><div className="bd-calc">{r1(targets?.mashWaterL)}</div></div>
            <div className="bd-field"><label>Sparge (L)</label><div className="bd-calc">{r1(targets?.spargeVolL)}</div></div>
            <div className="bd-field"><label>Strike Temp (°C)</label><div className="bd-calc">{r1(targets?.strikeTempC)}</div></div>
            <div className="bd-field"><label>Water Ratio (L/kg)</label><div className="bd-calc">{r2(targets?.mashRatioLkg)}</div></div>
            <div className="bd-field"><label>Target pH</label><div className="bd-calc">5.20</div></div>
          </div>

          <div className="bd-section">
            <div className="bd-section-title">Steps</div>
            {mashProfile?.steps?.length ? (
              <div>
                {mashProfile.steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, fontFamily: 'var(--mono)', fontSize: 11, padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)', minWidth: 100 }}>{s.type}</span>
                    <span style={{ color: 'var(--amber)' }}>{s.temp ?? '—'}°C</span>
                    <span style={{ color: 'var(--text-muted)' }}>{s.time ?? '—'} min</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No mash profile saved</div>
            )}
          </div>

          <div className="bd-section">
            <div className="bd-section-title">Sparge</div>
            <div className="bd-field"><label>Sparge Temp (°C)</label><div className="bd-calc">75.6</div></div>
            <div className="bd-field"><label>First Runnings pH</label><input className="bd-input" placeholder="—" value={bd.firstRunPh ?? ''} onChange={e => update({ firstRunPh: e.target.value })} /></div>
            <div className="bd-field"><label>First Runnings Gravity</label><input className="bd-input" placeholder="—" value={bd.firstRunGrav ?? ''} onChange={e => update({ firstRunGrav: e.target.value })} /></div>
            <div className="bd-field"><label>Last Runnings pH</label><input className="bd-input" placeholder="—" value={bd.lastRunPh ?? ''} onChange={e => update({ lastRunPh: e.target.value })} /></div>
            <div className="bd-field"><label>Last Runnings Gravity</label><input className="bd-input" placeholder="—" value={bd.lastRunGrav ?? ''} onChange={e => update({ lastRunGrav: e.target.value })} /></div>
            <div className="bd-field"><label>Sparge Amount (L)</label><input className="bd-input" placeholder="—" value={bd.spargeAmt ?? ''} onChange={e => update({ spargeAmt: e.target.value })} /></div>
          </div>

          <div className="bd-section">
            <div className="bd-section-title">Notes</div>
            <textarea
              style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 11, padding: 6, width: '100%', boxSizing: 'border-box', height: 80, outline: 'none', resize: 'none' }}
              placeholder="Brew day notes..."
              value={bd.notes ?? ''}
              onChange={e => update({ notes: e.target.value })}
            />
          </div>
        </div>

        {/* MIDDLE-RIGHT: Boil + Pitch & Oxygen + Fermenter */}
        <div className="bd-col-right">
          {/* Boil */}
          <div className="bd-col">
            <div className="bd-section">
              <div className="bd-section-title">Boil</div>

              <div className="bd-field">
                <label>Est Pre-Boil Vol</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text)' }}>{r1(targets?.preBoilVolL, ' L')}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>·</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                    {targets?.preBoilVolL != null ? fmtNum(targets.preBoilVolL / L_PER_BBL, { dp: 2, suffix: ' bbl' }) : '—'}
                  </span>
                </div>
              </div>

              <div className="bd-field" style={{ alignItems: 'flex-start' }}>
                <label>Meas Pre-Boil Vol</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input className="bd-input" placeholder="—" style={{ width: 70 }} value={bd.preboilL ?? ''} onChange={e => onPreboilL(e.target.value)} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>L</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input className="bd-input" placeholder="—" style={{ width: 60 }} value={bd.preboilBbl ?? ''} onChange={e => onPreboilBbl(e.target.value)} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>bbl</span>
                  </div>
                </div>
              </div>

              <div className="bd-field"><label>Est Pre-Boil Gravity (P)</label><div className="bd-calc">{r2(targets?.preBoilGravityP)}</div></div>
              <div className="bd-field"><label>Meas Pre-Boil Gravity (P)</label><input className="bd-input" placeholder="—" value={bd.preboilGrav ?? ''} onChange={e => update({ preboilGrav: e.target.value })} /></div>

              <div className="bd-field">
                <label>Est Post-Boil Vol</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber-bright)' }}>{r1(targets?.postBoilVolL, ' L')}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>·</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                    {targets?.postBoilVolL != null ? fmtNum(targets.postBoilVolL / L_PER_BBL, { dp: 2, suffix: ' bbl' }) : '—'}
                  </span>
                </div>
              </div>

              <div className="bd-field" style={{ alignItems: 'flex-start' }}>
                <label>Meas Post-Boil Vol</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input className="bd-input" placeholder="—" style={{ width: 70 }} value={bd.postboilL ?? ''} onChange={e => onPostboilL(e.target.value)} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>L</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input className="bd-input" placeholder="—" style={{ width: 60 }} value={bd.postboilBbl ?? ''} onChange={e => onPostboilBbl(e.target.value)} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>bbl</span>
                  </div>
                </div>
              </div>

              <div className="bd-field"><label>Est OG (P)</label><div className="bd-calc">{r2(targets?.ogPlato)}</div></div>
              <div className="bd-field"><label>Meas OG (P)</label><input className="bd-input" placeholder="—" value={bd.measOg ?? ''} onChange={e => update({ measOg: e.target.value })} /></div>

              <div className="bd-field">
                <label>Est Trub Loss (L)</label>
                <div className="bd-calc">
                  {r1(targets?.trubLossL)}
                  {targets && targets.hopAbsorptionL > 0 ? (
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>
                      {' '}({fmtNum(targets.hopAbsorptionL, { dp: 1 })} hop)
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="bd-field" title="Measured post-boil vol − batch size (into FV)">
                <label>Kettle Waste (L)</label>
                <div className="bd-calc">{r1(kettleWasteL, ' L')}</div>
              </div>

              <div className="bd-field"><label>Est Mash Eff %</label><div className="bd-calc">{r1(targets?.estMashEffPct, ' %')}</div></div>
              <div className="bd-field"><label>Meas Mash Eff %</label><div className="bd-calc">{r1(measMashEff, ' %')}</div></div>
              <div className="bd-field"><label>Meas BH Eff %</label><div className="bd-calc">{r1(measBhEff, ' %')}</div></div>
            </div>
          </div>

          {/* Pitch & Oxygen + Fermenter */}
          <div className="bd-col">
            <div className="bd-section">
              <div className="bd-section-title">Pitch &amp; Oxygen</div>

              <div className="bd-field">
                <label>Profile</label>
                <select
                  style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 4px', outline: 'none' }}
                  defaultValue=""
                  onChange={e => applyPitchProfile(e.target.value)}
                >
                  <option value="">— select —</option>
                  {pitchProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="bd-field"><label>Pitch Temp (°C)</label><input className="bd-input" placeholder="—" value={bd.pitchTemp ?? ''} onChange={e => update({ pitchTemp: e.target.value })} /></div>
              <div className="bd-field"><label>Target Pitch Temp</label><div className="bd-calc">{r1(targets?.targetPitchTempC, ' °C')}</div></div>
              <div className="bd-field"><label>Ferm Temp (°C)</label><input className="bd-input" placeholder="—" value={bd.fermTemp ?? ''} onChange={e => update({ fermTemp: e.target.value })} /></div>
              <div className="bd-field"><label>Pitch pH</label><input className="bd-input" placeholder="—" value={bd.pitchPh ?? ''} onChange={e => update({ pitchPh: e.target.value })} /></div>
              <div className="bd-field"><label>Target Pitch pH</label><div className="bd-calc">5.10</div></div>
              {dhPredictedRise && dhPredictedRise.totalDhG > 0 && dhPredictedRise.predictedRise != null && (
                <div
                  style={{
                    padding: '4px 0',
                    borderBottom: '1px solid var(--border)',
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                  title={`Based on ${fmtNum(dhPredictedRise.totalDhG, { dp: 0 })} g dry hops${dhPredictedRise.gPerL != null ? ` (${fmtNum(dhPredictedRise.gPerL, { dp: 2 })} g/L)` : ''} at ${fmtNum(dhPredictedRise.dhTempC, { dp: 0 })} °C. Lower pitch pH by this much to land at your target final pH after dry-hop rise.`}
                >
                  <span>Predicted DH rise</span>
                  <span style={{ color: 'var(--amber)' }}>+{fmtNum(dhPredictedRise.predictedRise, { dp: 2, suffix: ' pH' })}</span>
                </div>
              )}
              <div className="bd-field"><label>O₂ LPM</label><input className="bd-input" placeholder="—" value={bd.o2Lpm ?? ''} onChange={e => update({ o2Lpm: e.target.value })} /></div>
              <div className="bd-field"><label>O₂ Time (min)</label><input className="bd-input" placeholder="—" value={bd.o2Time ?? ''} onChange={e => update({ o2Time: e.target.value })} /></div>
              <div className="bd-field"><label>Target O₂ (ppm)</label><div className="bd-calc">{targets?.targetO2Ppm ?? '—'}</div></div>
              <div className="bd-field"><label>Measured O₂ (ppm)</label><input className="bd-input" placeholder="—" value={bd.o2Measured ?? ''} onChange={e => update({ o2Measured: e.target.value })} /></div>
            </div>

            <div className="bd-section">
              <div className="bd-section-title">Fermenter</div>

              <div className="bd-field">
                <label>FV #</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 4px', outline: 'none', width: 120 }}
                    value={recipe.bdFv ?? ''}
                    onChange={e => updateRecipe(recipeId, { bdFv: e.target.value })}
                  >
                    <option value="">— select —</option>
                    {fvOptions.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn sm"
                    disabled
                    title="Planner module not built yet — push-to-planner will land later"
                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                  >
                    Update FV
                  </button>
                </div>
              </div>

              <div className="bd-field" style={{ alignItems: 'center' }}>
                <label>Volume in FV (mm)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input className="bd-input" placeholder="—" style={{ width: 70 }} value={bd.fvCm ?? ''} onChange={e => update({ fvCm: e.target.value })} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>mm</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', minWidth: 60 }}>
                    {fvVolL != null ? fmtNum(fvVolL, { dp: 0, suffix: ' L' }) : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Record Usage — opens RecordUsageModal pre-filled for the brew
          linked to this recipe. Disabled with a hint when no planner
          brew references this recipe. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '6px 14px', borderTop: '1px solid var(--border)',
        background: 'var(--panel)', gap: 8,
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginRight: 'auto' }}>
          {linkedBrew
            ? linkedBrew.fullyRecorded
              ? '✓ Usage already recorded for this brew — click to add more.'
              : `Linked to brew: ${linkedBrew.name}`
            : 'No planner brew is linked to this recipe yet.'}
        </span>
        <button
          className="btn sm"
          disabled={!linkedBrew}
          onClick={() => setRecordUsageOpen(true)}
          title="Record ingredient usage to the tax ledger"
        >📝 Record Usage</button>
      </div>

      {/* Mark complete strip — round-trips through bl_checklist_<id>.brewday */}
      <ChecklistStrip recipeId={recipeId} clKey="brewday" label="Mark Brew Day complete" />

      {recordUsageOpen && linkedBrew && (
        <RecordUsageModal
          brewId={linkedBrew.id}
          onClose={() => setRecordUsageOpen(false)}
        />
      )}
    </div>
  );
}
