/**
 * Fermentation tab — port of HTML page-ferm (lines 1267–1333) + supporting
 * JS (saveFermMeta 19230 / loadFermMeta 19241 / renderFermLog 19682 /
 * openFermEntryModal 19709 / saveFermEntry 19726 / deleteFermEntry 19745 /
 * updateDryHopSummaries 19255).
 *
 * Layout: left half is the Daily Log + DH buttons + Harvest + Carbonation;
 * right half is the canvas chart.
 *
 * Persistence:
 *   - Ferm log entries write through setFermLog → lsSet → ferm_log table
 *     (upsert, id PK). New entry IDs are crypto.randomUUID() per SYNC.md.
 *   - Ferm meta blob writes through setFermMeta → lsSet → ferm_meta table
 *     (upsert, recipe_id PK). 400ms debounce on user inputs.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../../store';
import { fmtNum } from '../../lib/format';
import type { FermLogEntry, FermMeta } from '../../types';
import {
  fvVolume,
  calcDhPhPrediction,
} from '../../lib/calculations';
import FermChart from './FermChart';
import FermEntryModal from './FermEntryModal';
import DryHopModal from './DryHopModal';
import ChecklistStrip from './ChecklistStrip';
import HarvestYeastModal from '../inventory/HarvestYeastModal';

interface Props { recipeId: string }

export default function FermTab({ recipeId }: Props) {
  // ── Store ─────────────────────────────────────────────────────────────
  const recipe       = useStore(s => s.recipes.find(r => r.id === recipeId));
  const ingredients  = useStore(s => s.ingredientsByRecipe[recipeId] ?? []);
  const getFermLog   = useStore(s => s.getFermLog);
  const setFermLogStore = useStore(s => s.setFermLog);
  const getFermMeta  = useStore(s => s.getFermMeta);
  const setFermMeta  = useStore(s => s.setFermMeta);
  const tankCalib    = useStore(s => s.tankCalib);
  const getWaterChem = useStore(s => s.getWaterChem);
  const pushToast    = useStore(s => s.pushToast);
  const settings     = useStore(s => s.settings);

  // ── Local state ───────────────────────────────────────────────────────
  // Entries kept locally for reactive UI; mutations go through the store
  // (which writes localStorage + dispatches Supabase).
  const [entries, setEntriesLocal] = useState<FermLogEntry[]>(() => getFermLog(recipeId));
  const [meta, setMetaLocal]       = useState<FermMeta>(() => getFermMeta(recipeId));
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [dhModalSlot, setDhModalSlot]       = useState<1 | 2 | 3 | null>(null);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  // Note: re-hydration on recipeId change is handled by the parent passing a
  // key={recipeId} so the component remounts and the lazy useState initialisers
  // re-run. Keeps this body free of setState-in-effect.

  // ── Sorted entries for display ────────────────────────────────────────
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries],
  );

  // ── Ferm log ops ──────────────────────────────────────────────────────
  // Persist immediately on add/delete (discrete events, no debounce).
  const persistEntries = useCallback((next: FermLogEntry[]) => {
    setEntriesLocal(next);
    setFermLogStore(recipeId, next);
  }, [recipeId, setFermLogStore]);

  const handleAddEntry = useCallback((entry: FermLogEntry) => {
    persistEntries([...entries, entry]);
    setEntryModalOpen(false);
  }, [entries, persistEntries]);

  const handleDeleteEntry = useCallback((id: string) => {
    const before = entries;
    const target = entries.find(e => e.id === id);
    persistEntries(entries.filter(e => e.id !== id));
    pushToast({
      message: target ? `Deleted reading ${target.date}` : 'Deleted reading',
      undo: () => persistEntries(before),
    });
  }, [entries, persistEntries, pushToast]);

  // ── Meta updates with 400ms debounce ──────────────────────────────────
  const update = useCallback((patch: Partial<FermMeta>) => {
    setMetaLocal(prev => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setFermMeta(recipeId, meta), 400);
    return () => clearTimeout(id);
  }, [meta, recipeId, setFermMeta]);

  // ── Dry hop save (from modal) ─────────────────────────────────────────
  const handleDhSave = useCallback((patch: Partial<FermMeta>) => {
    // Single immediate write — the user has already deliberately clicked Save.
    setMetaLocal(prev => {
      const next = { ...prev, ...patch };
      setFermMeta(recipeId, next);
      return next;
    });
  }, [recipeId, setFermMeta]);

  const handleDhDelete = useCallback((slot: 1 | 2 | 3) => {
    const k = `dh${slot}` as 'dh1' | 'dh2' | 'dh3';
    setMetaLocal(prev => {
      const before = prev;
      const next: FermMeta = { ...prev };
      delete next[`${k}-date`        as keyof FermMeta];
      delete next[`${k}-temp`        as keyof FermMeta];
      delete next[`${k}-notes`       as keyof FermMeta];
      delete next[`${k}-recorded`    as keyof FermMeta];
      delete next[`${k}-amounts`     as keyof FermMeta];
      delete next[`${k}-extra-hops`  as keyof FermMeta];
      delete next[`${k}-adjuncts`    as keyof FermMeta];
      setFermMeta(recipeId, next);
      pushToast({
        message: `Deleted Dry Hop ${slot}`,
        undo: () => {
          setMetaLocal(before);
          setFermMeta(recipeId, before);
        },
      });
      return next;
    });
  }, [recipeId, setFermMeta, pushToast]);

  // ── DH summaries (date — for the button labels) ───────────────────────
  const dhSummary = (n: 1 | 2 | 3) => {
    const date = meta[`dh${n}-date` as `dh${1 | 2 | 3}-date`];
    return date ? date.slice(5) : '—';  // MM-DD
  };
  const dhRecorded = (n: 1 | 2 | 3) =>
    !!meta[`dh${n}-recorded` as `dh${1 | 2 | 3}-recorded`];

  // ── Chart inputs ──────────────────────────────────────────────────────
  // Pull measured OG from brew day if present (HTML reads bd-meas-og).
  // We don't have a clean store accessor; read from the bd blob directly.
  // Read measured OG from the brew-day blob (raw localStorage — there's no
  // reactive store accessor for the per-recipe blob). Refreshed only on
  // recipe change; sufficient for now since the chart re-uses this lazily.
  const measOG = useMemo(() => {
    try {
      const raw = localStorage.getItem(`bl_bd_${recipeId}`);
      if (!raw) return null;
      const bd = JSON.parse(raw) as { measOg?: string; measuredOG?: string };
      const v = parseFloat(bd.measOg ?? bd.measuredOG ?? '');
      return isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }, [recipeId]);

  const chartDhRecorded = useMemo(() => ({
    1: meta['dh1-recorded'],
    2: meta['dh2-recorded'],
    3: meta['dh3-recorded'],
  }), [meta]);

  // ── Dry-hop pH prediction ─────────────────────────────────────────────
  // FV volume preferred (mm via tank calibration on the selected FV); else
  // batchL fallback. Volume reads from the bd blob in localStorage like
  // measOG does — there's no reactive store accessor for the bd blob and
  // refreshing on recipe change is sufficient for v1.
  const fvVolL = useMemo(() => {
    try {
      const raw = localStorage.getItem(`bl_bd_${recipeId}`);
      if (!raw) return null;
      const bd  = JSON.parse(raw) as { fvCm?: string };
      const mm  = parseFloat(bd.fvCm ?? '');
      if (!isFinite(mm) || mm <= 0) return null;
      const fvId  = recipe?.bdFv;
      const calib = fvId ? tankCalib[fvId] : null;
      if (!calib) return null;
      return fvVolume(mm, calib);
    } catch {
      return null;
    }
  }, [recipeId, recipe?.bdFv, tankCalib]);

  // Acid type/pct: meta override > water-chem blob > defaults (lactic 88%).
  const dhPredVolumeL = fvVolL ?? recipe?.batchL ?? null;
  const wcForAcid = useMemo(() => getWaterChem(recipeId), [getWaterChem, recipeId]);
  const dhAcidType: 'lactic' | 'phosphoric' =
    meta['post-dh-acid-type'] ?? wcForAcid.acidType ?? 'lactic';
  const dhAcidPct = parseFloat(wcForAcid.acidPct ?? '') || 88;

  const targetFinalPhStr = meta['target-post-dh-ph'] ?? '';
  const currentPhStr     = meta['current-post-dh-ph'] ?? '';
  const dhTempStr        = meta['dh-temp-c'] ?? '';
  const targetFinalPh    = parseFloat(targetFinalPhStr) || 4.3;
  const currentPhParsed  = parseFloat(currentPhStr);
  const currentPhInput   = isFinite(currentPhParsed) ? currentPhParsed : null;
  const dhTempParsed     = parseFloat(dhTempStr);
  const dhTempInput      = isFinite(dhTempParsed) ? dhTempParsed : undefined;

  const dhPred = useMemo(() => calcDhPhPrediction({
    ingredients,
    fermMeta:      meta,
    volumeL:       dhPredVolumeL,
    targetFinalPh,
    currentPh:     currentPhInput,
    acidType:      dhAcidType,
    acidPct:       dhAcidPct,
    dhTempC:       dhTempInput,
    beerBufferPhPerMeqL: settings.beerBufferPhPerMeqL,
  }), [ingredients, meta, dhPredVolumeL, targetFinalPh, currentPhInput, dhAcidType, dhAcidPct, dhTempInput, settings.beerBufferPhPerMeqL]);

  // ── Yeast harvest pre-fill ────────────────────────────────────────────
  // Parent generation for the new harvest:
  //   • If the recipe was pitched on harvested yeast, the linked entry's
  //     gen (stored as ad-hoc `yeastGen` on the ingredient by
  //     AddIngredientModal — not in the typed schema, never written to
  //     Supabase, so falls back to fresh on cross-device hydrates).
  //   • Otherwise fresh = Gen 1.
  // New harvest gen = parent + 1.
  type YeastIng = (typeof ingredients)[number] & {
    yeastSource?: string;
    yeastGen?: string | number;
  };
  const yeastIng = ingredients.find(i => i.type === 'yeast') as YeastIng | undefined;
  const parentGen = (() => {
    if (yeastIng?.yeastSource === 'harvested') {
      const g = parseInt(String(yeastIng.yeastGen ?? ''), 10);
      if (isFinite(g) && g > 0) return g;
    }
    return 1;
  })();

  if (!recipe) return null;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="ferm-layout">
        {/* LEFT: Daily Log + DH buttons + Harvest + Carbonation */}
        <div className="ferm-left">
          {/* Header */}
          <div style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--border)', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: 'var(--amber)' }}>Daily Log</span>
            <button className="btn sm" onClick={() => setEntryModalOpen(true)}>＋ Add</button>
          </div>

          {/* Column header */}
          <div className="ferm-log-header">
            <span style={{ width: 72 }}>Date</span>
            <span style={{ width: 48 }}>Plato</span>
            <span style={{ width: 36 }}>pH</span>
            <span style={{ width: 44 }}>Temp</span>
            <span style={{ flex: 1 }}>Notes</span>
            <span style={{ width: 16 }} />
          </div>

          {/* Log entries — scrollable */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sortedEntries.length === 0 ? (
              <div style={{ padding: '16px 10px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' as const }}>
                No entries yet
              </div>
            ) : (
              sortedEntries.map(e => {
                const dateDisp = e.date.length >= 10 ? e.date.slice(5) : e.date;  // MM-DD
                const plato = e.plato != null ? fmtNum(e.plato, { dp: 1 }) : '—';
                const ph    = e.ph    != null ? fmtNum(e.ph,    { dp: 1 }) : '—';
                const temp  = e.temp  != null ? fmtNum(e.temp,  { dp: 1, suffix: '°' }) : '—';
                return (
                  <div key={e.id} className="ferm-log-row">
                    <span className="ferm-cell" style={{ width: 72 }}>{dateDisp}</span>
                    <span className="ferm-cell val" style={{ width: 48 }}>{plato}</span>
                    <span className="ferm-cell" style={{ width: 36 }}>{ph}</span>
                    <span className="ferm-cell" style={{ width: 44 }}>{temp}</span>
                    <span
                      className="ferm-cell"
                      style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={e.notes}
                    >
                      {e.notes || '—'}
                    </span>
                    <span
                      className="ferm-cell"
                      style={{ width: 16, cursor: 'pointer', color: 'var(--text-muted)', textAlign: 'center' as const }}
                      onClick={() => handleDeleteEntry(e.id)}
                      title="Delete"
                    >
                      ✕
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom — DH buttons + Harvest + Carbonation */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
              {([1, 2, 3] as const).map(n => (
                <div
                  key={n}
                  className={`dh-btn${dhRecorded(n) ? ' recorded' : ''}`}
                  onClick={() => setDhModalSlot(n)}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--amber)' }}>
                    DRY HOP {n}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {dhSummary(n)}
                  </span>
                </div>
              ))}
            </div>

            {dhPred.totalDhG > 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'var(--panel2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: 'var(--amber)' }}>
                  DH pH Prediction
                </div>

                {/* Totals row — grams + g/L + temp-aware predicted rise */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                  <span>{fmtNum(dhPred.totalDhG, { dp: 0, suffix: ' g' })}{dhPred.gPerL != null ? ` · ${fmtNum(dhPred.gPerL, { dp: 2, suffix: ' g/L' })}` : ''}</span>
                  <span title={`Coefficient ${fmtNum(dhPred.coefficient, { dp: 4 })} pH/(g/L) at ${fmtNum(dhPred.dhTempC, { dp: 0 })} °C`}>
                    Δ pH {dhPred.predictedRise != null ? `+${fmtNum(dhPred.predictedRise, { dp: 2 })}` : '—'}
                  </span>
                </div>

                {/* Target final pH input */}
                <div className="bd-field">
                  <label>Target final pH</label>
                  <input
                    className="bd-input"
                    placeholder="4.30"
                    style={{ width: 70 }}
                    value={targetFinalPhStr}
                    onChange={e => update({ 'target-post-dh-ph': e.target.value })}
                  />
                </div>

                {/* Current measured pH (optional, for residual correction) */}
                <div className="bd-field">
                  <label>Current beer pH</label>
                  <input
                    className="bd-input"
                    placeholder="—"
                    style={{ width: 70 }}
                    value={currentPhStr}
                    onChange={e => update({ 'current-post-dh-ph': e.target.value })}
                  />
                </div>

                {/* DH temperature input — feeds the temp-aware coefficient */}
                <div className="bd-field">
                  <label title="Affects the predicted rise: 0.020 at 2 °C up to 0.030 at 22 °C, default 12 °C ≈ Janish's flat 0.025.">
                    DH temperature (°C)
                  </label>
                  <input
                    className="bd-input"
                    placeholder="12"
                    style={{ width: 70 }}
                    value={dhTempStr}
                    onChange={e => update({ 'dh-temp-c': e.target.value })}
                  />
                </div>

                {/* Acid type dropdown — mirrors WaterTab */}
                <div className="bd-field">
                  <label>Residual acid</label>
                  <select
                    className="bd-input"
                    style={{ width: 110 }}
                    value={dhAcidType}
                    onChange={e =>
                      update({ 'post-dh-acid-type': e.target.value as 'lactic' | 'phosphoric' })
                    }
                  >
                    <option value="lactic">Lactic</option>
                    <option value="phosphoric">Phosphoric</option>
                  </select>
                </div>

                {/* Suggested acid — only when current beer pH > target */}
                {dhPred.measuredResidualMl != null && (
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--amber)', marginTop: 2 }}
                    title="Estimate based on a finished-beer buffer of ~0.04 pH/(mEq/L). Real beer buffer varies — taste and re-measure before adding."
                  >
                    <span>To hit target ⓘ</span>
                    <span>~{fmtNum(dhPred.measuredResidualMl, { dp: 1, suffix: ' mL' })} · −{fmtNum(dhPred.measuredResidualPh, { dp: 2, suffix: ' pH' })}</span>
                  </div>
                )}

                {fvVolL == null && recipe.batchL && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Using batch volume — log FV mm on Brew Day for a tighter estimate.
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: 'var(--amber)', margin: '8px 0 4px' }}>
              Harvest
            </div>
            <div className="bd-field">
              <label>Amount (L)</label>
              <input
                className="bd-input" placeholder="—" style={{ width: 90 }}
                value={meta['harvest-amt'] ?? ''}
                onChange={e => update({ 'harvest-amt': e.target.value })}
              />
            </div>
            <div className="bd-field">
              <label>Container</label>
              <input
                className="bd-input" placeholder="—" style={{ width: 90, textAlign: 'left' }}
                value={meta['harvest-cont'] ?? ''}
                onChange={e => update({ 'harvest-cont': e.target.value })}
              />
            </div>
            <div style={{ marginTop: 6 }}>
              <button
                className="btn sm"
                disabled={!yeastIng?.name}
                title={yeastIng?.name
                  ? `Log harvest of ${yeastIng.name} (Gen ${parentGen + 1}) to inventory`
                  : 'Add a yeast ingredient first'}
                style={{ width: '100%', ...(!yeastIng?.name ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                onClick={() => setHarvestModalOpen(true)}
              >
                🧫 Log Harvest to Inventory
              </button>
            </div>
            <div className="bd-field">
              <label>Carbonation (vols)</label>
              <input
                className="bd-input" placeholder="2.45" style={{ width: 90 }}
                value={meta.carbonation ?? ''}
                onChange={e => update({ carbonation: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Chart */}
        <div className="ferm-right">
          <div style={{ padding: '10px 14px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: 'var(--amber)' }}>
              Fermentation Chart
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Plato &amp; pH{recipe.bdFv ? ` · ${recipe.bdFv.toUpperCase()}` : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 12, color: '#c07010' }}>— Plato</span>
              <span style={{ fontSize: 12, color: '#4aaa70' }}>— pH</span>
              <span style={{ fontSize: 12, color: 'rgba(160,160,170,0.5)' }}>— Temp °C</span>
            </div>
          </div>
          <div style={{ flex: 1, margin: 12, position: 'relative' }}>
            <FermChart
              entries={entries}
              brewDate={recipe.brewDate}
              measuredOG={measOG}
              dhRecorded={chartDhRecorded}
            />
          </div>
        </div>
      </div>

      {/* Mark complete strip — round-trips through bl_checklist_<id>.ferm */}
      <ChecklistStrip recipeId={recipeId} clKey="ferm" label="Mark Fermentation complete" />

      {/* Modals */}
      {entryModalOpen && (
        <FermEntryModal
          onSave={handleAddEntry}
          onClose={() => setEntryModalOpen(false)}
        />
      )}
      {dhModalSlot != null && (
        <DryHopModal
          slot={dhModalSlot}
          ingredients={ingredients}
          meta={meta}
          onSave={handleDhSave}
          onDelete={() => handleDhDelete(dhModalSlot)}
          onClose={() => setDhModalSlot(null)}
        />
      )}
      {harvestModalOpen && yeastIng?.name && (
        <HarvestYeastModal
          initialStrain={yeastIng.name}
          initialAmount={meta['harvest-amt'] ?? ''}
          initialContainer={meta['harvest-cont'] ?? ''}
          initialFromBatch={recipe.taxBatch ?? ''}
          initialBeerName={(recipe.beerName?.trim() || recipe.name?.trim()) ?? ''}
          initialGeneration={parentGen + 1}
          onClose={() => setHarvestModalOpen(false)}
        />
      )}
    </>
  );
}
