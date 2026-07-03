/**
 * Packaging tab (cold side) — port of HTML page-cold (lines 1444–1566)
 * + supporting JS (updateColdSide 12605, saveColdSide 12726, keg-row helpers
 * 12565+, toggleCsTransfer 12599, setStarRating 6486, setBrewAgain 6505).
 *
 * Three columns:
 *   - Left:  Fermentation snapshot, Transfer / Conditioning, Final Readings
 *   - Mid:   Packaging, Volume Tracking summary
 *   - Right: Recipe Rating, Brew Again, Tasting Notes preview/modal
 *
 * State: one local cs blob hydrated from getColdSide(recipeId), debounced
 * 400ms write through setColdSide → lsSet → cold_side upsert (recipe_id PK,
 * already wired). Recipe-switch handled by key={recipeId} in the parent.
 *
 * Note on key stability: the cs-* dashed names are the HTML schema. Several
 * are snapshotted into tax_records.snap_* later by the Tax tab — do not
 * rename without a migration.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../../store';
import { lsGet } from '../../lib/storage';
import { fmtNum } from '../../lib/format';
import { fvVolume, platoToSg } from '../../lib/calculations';
import type {
  ColdSideData, ColdKegRow, BrewAgain, BrewDayData, FermMeta,
} from '../../types';
import TastingNotesModal from './TastingNotesModal';
import ChecklistStrip from './ChecklistStrip';

interface Props { recipeId: string }

const STAR_LABELS: Record<number, string> = {
  1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Outstanding',
};

const BREW_AGAIN_OPTS: { val: BrewAgain; icon: string; label: string }[] = [
  { val: 'no',     icon: '✗', label: "Don't make again" },
  { val: 'tweaks', icon: '↻', label: 'Make again with tweaks' },
  { val: 'yes',    icon: '✓', label: 'Make again as-is' },
];

export default function PackagingTab({ recipeId }: Props) {
  // ── Store ────────────────────────────────────────────────────────────
  const recipe       = useStore(s => s.recipes.find(r => r.id === recipeId));
  const updateRecipe = useStore(s => s.updateRecipe);
  const tankCalib    = useStore(s => s.tankCalib);
  const plannerBrews = useStore(s => s.plannerBrews);
  const getColdSide  = useStore(s => s.getColdSide);
  const setColdSide  = useStore(s => s.setColdSide);

  // ── Local state ──────────────────────────────────────────────────────
  const [cs, setCs] = useState<ColdSideData>(() => {
    const saved = getColdSide(recipeId);
    // Pre-fill planned carbonation from the recipe default when the field is empty
    if ((saved['cs-carb-planned'] == null || saved['cs-carb-planned'] === '') && recipe?.plannedCarb != null) {
      return { ...saved, 'cs-carb-planned': String(recipe.plannedCarb) };
    }
    return saved;
  });
  const [hoverStar, setHoverStar]               = useState<number>(0);
  const [tastingModalOpen, setTastingModalOpen] = useState(false);
  // Without dirtyRef the persistence effect would write a non-`{}` blob on
  // mount (it always sets cs-liters-bt-saved), causing wasteful Supabase
  // writes for a recipe the user merely opened. Mirrors WaterTab.
  const dirtyRef = useRef(false);

  // ── External blobs (read-only refs from other tabs) ──────────────────
  const bd        = useMemo(() => lsGet<BrewDayData>(`bl_bd_${recipeId}`, {}), [recipeId]);
  const fermMeta  = useMemo(() => lsGet<FermMeta>(`bl_ferm_meta_${recipeId}`, {}), [recipeId]);

  // ── Helpers ──────────────────────────────────────────────────────────
  // Every user-driven write goes through `update` and marks dirtyRef.
  const update = useCallback((patch: Partial<ColdSideData>) => {
    dirtyRef.current = true;
    setCs(prev => ({ ...prev, ...patch }));
  }, []);

  // Stable refs of fields off `recipe` so the memo deps below are unambiguous
  // (the React Compiler lint rule otherwise flags `recipe?.bdFv` as "less
  // specific" than the body's access pattern).
  const recipeBdFv = recipe?.bdFv ?? '';
  const recipeOgP  = recipe?.ogPlato ?? 0;

  // FV id — mirrors HTML loadBdFv (line 8134): the planner's vessel
  // assignment for this recipe takes precedence; falls back to recipe.bdFv.
  // This is why a recipe with a planner entry shows "FV1" even before the
  // user opens the React Brew Day tab.
  const fvId = useMemo(() => {
    const planBrew = plannerBrews.find(b => b.recipeId === recipeId);
    if (planBrew?.vessel) return planBrew.vessel;
    return recipeBdFv;
  }, [plannerBrews, recipeId, recipeBdFv]);

  // FV vessel display name
  const fvDisplay = fvId ? (tankCalib[fvId]?.name || fvId.toUpperCase()) : '—';

  // OG (P) — matches HTML's display source (cs-og-display reads bd-og at
  // line 12631, which is the recipe's *estimated* OG from grain bill, i.e.
  // recipe.ogPlato). The cs-og-measured legacy override (no UI in React)
  // takes precedence if set. We deliberately do NOT read bd.measOg here —
  // that's the brew-day-day-of measured OG, which has different semantics
  // and HTML doesn't use it for the cold-side display.
  const ogP = useMemo(() => {
    const override = parseFloat(cs['cs-og-measured'] ?? '');
    if (isFinite(override) && override > 0) return override;
    return recipeOgP > 0 ? recipeOgP : null;
  }, [cs, recipeOgP]);

  // Liters in FV — from brew-day fvCm + tank calib, same formula as Brew Day.
  // Uses fvId (planner-aware), not just recipe.bdFv.
  const litersInFV = useMemo(() => {
    const mm = parseFloat(bd.fvCm ?? '');
    if (!isFinite(mm) || mm <= 0) return null;
    const calib = fvId ? tankCalib[fvId] : null;
    if (!calib) return null;
    return fvVolume(mm, calib);
  }, [bd.fvCm, fvId, tankCalib]);

  // Liters in BT — cold-side MM reading + selected BT vessel calib
  const litersInBT = useMemo(() => {
    const mm = parseFloat(cs['cs-mm-reading'] ?? '');
    const vesselId = cs['cs-bt-vessel'] || '';
    if (!isFinite(mm) || mm <= 0 || !vesselId) return null;
    const calib = tankCalib[vesselId];
    if (!calib) return null;
    return fvVolume(mm, calib);
  }, [cs, tankCalib]);

  // ABV — (ogSg − fgSg) × 131.25 (CALCULATIONS.md). `ogP` already honors the
  // cs-og-measured override → recipe.ogPlato fallback chain (see above).
  const abvPct = useMemo(() => {
    const fgP = parseFloat(cs['cs-fg'] ?? '');
    if (!ogP || !isFinite(fgP) || fgP <= 0 || ogP <= fgP) return null;
    return (platoToSg(ogP) - platoToSg(fgP)) * 131.25;
  }, [cs, ogP]);

  // Yeast harvested — modern source is ferm_meta['harvest-amt'], legacy
  // fallback to cs-yeast-harvested.
  const yeastHarvestedL = useMemo(() => {
    const fm = parseFloat(fermMeta['harvest-amt'] ?? '');
    if (isFinite(fm) && fm >= 0) return fm;
    const legacy = parseFloat(cs['cs-yeast-harvested'] ?? '');
    return isFinite(legacy) && legacy >= 0 ? legacy : 0;
  }, [fermMeta, cs]);

  // ── Packaging volume math ────────────────────────────────────────────
  const kegRows: ColdKegRow[] = useMemo(
    () => cs['cs-keg-rows'] ?? [{ size: '15', qty: '' }, { size: '10', qty: '' }],
    [cs],
  );
  const canSizeMl = parseFloat(cs['cs-can-size'] ?? '') || 350;
  const cans      = parseFloat(cs['cs-cans']     ?? '') || 0;
  const flowmeter = parseFloat(cs['cs-flowmeter']?? '') || 0;
  const canWasteManual = parseFloat(cs['cs-can-waste-manual'] ?? '') || 0;
  const kegWaste  = parseFloat(cs['cs-keg-waste'] ?? '') || 0;
  const transferYes = (cs['cs-transfer'] || 'No') === 'Yes';

  const canSizeL  = canSizeMl / 1000;
  const canTotalL = cans * canSizeL;
  const kegTotalL = kegRows.reduce(
    (s, r) => s + (parseFloat(r.size) || 0) * (parseFloat(r.qty) || 0), 0,
  );
  const sellable = kegTotalL + canTotalL;

  const flowmeterWasteL = flowmeter > 0 && canTotalL > 0 ? Math.max(0, flowmeter - canTotalL) : null;
  const totalCanWasteL  = (flowmeterWasteL ?? 0) + canWasteManual;

  const batchL = recipe?.batchL ?? 0;
  const intoFV = litersInFV ?? (batchL > 0 ? batchL : null);
  const intoBT = transferYes
    ? (litersInBT ?? (intoFV != null ? intoFV - yeastHarvestedL : null))
    : null;
  const fvBtWaste = transferYes && intoFV != null && intoBT != null
    ? Math.max(0, intoFV - intoBT - yeastHarvestedL)
    : (intoFV != null ? yeastHarvestedL : null);

  // BT waste auto-fill: if user hasn't manually entered cs-bt-waste, suggest fvBtWaste
  const btWasteVal = cs['cs-bt-waste'];
  const btWasteAuto = !btWasteVal && transferYes && fvBtWaste != null && litersInBT != null
    ? fvBtWaste.toFixed(1) : '';
  const btWasteEffective = parseFloat(btWasteVal || btWasteAuto) || 0;

  const btPkgWaste    = btWasteEffective + (flowmeterWasteL ?? 0) + kegWaste;
  const totalPackaged = sellable;
  const totalWaste    = intoFV != null && totalPackaged > 0
    ? Math.max(0, intoFV - totalPackaged) : null;

  // ── Persistence — debounced 400ms write of full blob ─────────────────
  // Cache the computed BT liters so Tax Master can read without recomputing.
  // Gated on dirtyRef so a draft recipe whose Packaging tab the user merely
  // opened doesn't get a stub blob written — see dirtyRef declaration.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const id = setTimeout(() => {
      const cached: ColdSideData = {
        ...cs,
        'cs-liters-bt-saved': litersInBT != null ? litersInBT : 0,
      };
      setColdSide(recipeId, cached);
    }, 400);
    return () => clearTimeout(id);
  }, [cs, litersInBT, recipeId, setColdSide]);

  // ── Keg row ops ──────────────────────────────────────────────────────
  const setKegRows = (rows: ColdKegRow[]) => update({ 'cs-keg-rows': rows });
  const addKegRow    = () => setKegRows([...kegRows, { size: '', qty: '' }]);
  const removeKegRow = (idx: number) => setKegRows(kegRows.filter((_, i) => i !== idx));
  const updKegRow    = (idx: number, patch: Partial<ColdKegRow>) =>
    setKegRows(kegRows.map((r, i) => i === idx ? { ...r, ...patch } : r));

  // ── Star rating ──────────────────────────────────────────────────────
  // Click same value to clear (matches HTML setStarRating line 6487).
  const rating = recipe?.rating ?? 0;
  const setStar = (val: number) => {
    if (!recipe) return;
    updateRecipe(recipeId, { rating: rating === val ? 0 : val });
  };
  const starLabel = STAR_LABELS[hoverStar || rating] || '';

  // ── BT vessel options ────────────────────────────────────────────────
  // Prefer entries from tank calib whose id starts with 'bt'; fall back to
  // a generic bt1..bt8 list.
  const btVesselOptions = useMemo(() => {
    const fromCalib = Object.keys(tankCalib)
      .filter(k => k.startsWith('bt'))
      .map(k => ({ id: k, name: tankCalib[k]?.name || k.toUpperCase() }));
    if (fromCalib.length > 0) return fromCalib;
    return Array.from({ length: 8 }, (_, i) => ({ id: `bt${i + 1}`, name: `BT${i + 1}` }));
  }, [tankCalib]);

  if (!recipe) return null;

  // ── Render helpers ──────────────────────────────────────────────────
  const fmt1 = (n: number | null | undefined, suffix = '') =>
    n != null && isFinite(n) && n >= 0 ? fmtNum(n, { dp: 1, suffix }) : '—';

  const sectionTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase' as const, color: 'var(--amber)', marginBottom: 6,
  };

  // Tasting notes preview — first 80 chars of tasting → fall back to process
  const tastingPreview = (() => {
    const t = (cs['cs-tasting-notes'] || '').trim();
    if (t) return t.length > 80 ? t.slice(0, 80) + '…' : t;
    const p = (cs['cs-process-notes'] || '').trim();
    if (p) return p.length > 60 ? p.slice(0, 60) + '…' : p;
    return 'No notes yet — tap to add';
  })();

  return (
    <>
      <div className="cold-layout">

        {/* ═══ LEFT: Fermentation / Transfer / Final Readings ═══ */}
        <div className="cold-left">
          <div style={sectionTitle}>Fermentation</div>
          <div className="bd-section">
            <div className="bd-field"><label>FV #</label><div className="bd-calc">{fvDisplay}</div></div>
            <div className="bd-field"><label>OG (P)</label><div className="bd-calc">{ogP != null ? fmtNum(ogP, { dp: 2, suffix: ' P' }) : '—'}</div></div>
            <div className="bd-field"><label>Liters in FV</label><div className="bd-calc">{fmt1(litersInFV)}</div></div>
          </div>

          <div style={sectionTitle}>Transfer / Conditioning</div>
          <div className="bd-section">
            <div className="bd-field">
              <label>Transfer?</label>
              <select
                value={cs['cs-transfer'] ?? 'No'}
                onChange={e => update({ 'cs-transfer': e.target.value })}
                style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 4px', outline: 'none', width: 90 }}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            {transferYes && (
              <>
                <div className="bd-field">
                  <label>Transfer Date</label>
                  <input
                    className="bd-input" placeholder="YYYY-MM-DD"
                    style={{ width: 120, textAlign: 'left' as const }}
                    value={cs['cs-transfer-date'] ?? ''}
                    onChange={e => update({ 'cs-transfer-date': e.target.value })}
                  />
                </div>
                <div className="bd-field">
                  <label>Transfer Into</label>
                  <select
                    value={cs['cs-bt-vessel'] ?? ''}
                    onChange={e => update({ 'cs-bt-vessel': e.target.value })}
                    style={{ background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 4px', outline: 'none', width: 130 }}
                  >
                    <option value="">— select —</option>
                    {btVesselOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="bd-field">
                  <label>MM Reading</label>
                  <input className="bd-input" placeholder="—"
                    value={cs['cs-mm-reading'] ?? ''}
                    onChange={e => update({ 'cs-mm-reading': e.target.value })} />
                </div>
                <div className="bd-field"><label>Liters in Tank</label><div className="bd-calc">{fmt1(litersInBT)}</div></div>
                <div className="bd-field">
                  <label>Tank Waste (L)</label>
                  <input
                    className="bd-input"
                    placeholder={btWasteAuto || 'auto'}
                    value={cs['cs-bt-waste'] ?? ''}
                    onChange={e => update({ 'cs-bt-waste': e.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          <div style={sectionTitle}>Final Readings</div>
          <div className="bd-section">
            <div className="bd-field">
              <label>FG (P)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-fg'] ?? ''}
                onChange={e => update({ 'cs-fg': e.target.value })} />
            </div>
            <div className="bd-field"><label>ABV</label><div className="bd-calc">{abvPct != null ? fmtNum(abvPct, { dp: 1, suffix: '%' }) : '—'}</div></div>
            <div className="bd-field">
              <label>pH</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-ph'] ?? ''}
                onChange={e => update({ 'cs-ph': e.target.value })} />
            </div>
            <div className="bd-field">
              <label>Planned Carbonation (vol)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-carb-planned'] ?? ''}
                onChange={e => update({ 'cs-carb-planned': e.target.value })} />
            </div>
            <div className="bd-field">
              <label>Actual Carbonation (vol)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-carb-actual'] ?? ''}
                onChange={e => update({ 'cs-carb-actual': e.target.value })} />
            </div>
          </div>
        </div>

        {/* ═══ MID: Packaging / Volume Tracking ═══ */}
        <div className="cold-mid">
          <div style={sectionTitle}>Packaging</div>
          <div className="bd-section">
            <div className="bd-field">
              <label>Keg Date</label>
              <input className="bd-input" placeholder="YYYY-MM-DD"
                style={{ width: 120, textAlign: 'left' as const }}
                value={cs['cs-keg-date'] ?? ''}
                onChange={e => update({ 'cs-keg-date': e.target.value })} />
            </div>
            <div className="bd-field">
              <label>Can Date</label>
              <input className="bd-input" placeholder="same as keg"
                style={{ width: 120, textAlign: 'left' as const }}
                value={cs['cs-can-date'] ?? ''}
                onChange={e => update({ 'cs-can-date': e.target.value })} />
            </div>

            {/* Dynamic keg rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '4px 0' }}>
              {kegRows.map((row, idx) => (
                <div key={idx} className="cs-keg-row">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>Keg</span>
                  <input
                    type="number" placeholder="15" className="bd-input"
                    style={{ width: 50, fontSize: 13, flexShrink: 0 }}
                    value={row.size}
                    onChange={e => updKegRow(idx, { size: e.target.value })}
                  />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>L ×</span>
                  <input
                    type="number" placeholder="0" className="bd-input"
                    style={{ width: 50, fontSize: 13, flexShrink: 0 }}
                    value={row.qty}
                    onChange={e => updKegRow(idx, { qty: e.target.value })}
                  />
                  <button
                    className="btn sm"
                    style={{ color: 'var(--red)', borderColor: 'var(--red)', padding: '3px 6px', fontSize: 14, flexShrink: 0, marginLeft: 'auto' }}
                    onClick={() => removeKegRow(idx)}
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
            <button className="btn sm" onClick={addKegRow} style={{ marginBottom: 4 }}>+ Add Keg Size</button>

            <div className="bd-field">
              <label>Can Size (ml)</label>
              <input className="bd-input" placeholder="350"
                value={cs['cs-can-size'] ?? ''}
                onChange={e => update({ 'cs-can-size': e.target.value })} />
            </div>
            <div className="bd-field">
              <label>Cans</label>
              <input className="bd-input" placeholder="0"
                value={cs['cs-cans'] ?? ''}
                onChange={e => update({ 'cs-cans': e.target.value })} />
            </div>
            <div className="bd-field"><label>Sellable Liters</label><div className="bd-calc">{sellable > 0 ? fmt1(sellable, ' L') : ''}</div></div>
            <div className="bd-field">
              <label>Canning Machine Flowmeter (L)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-flowmeter'] ?? ''}
                onChange={e => update({ 'cs-flowmeter': e.target.value })} />
            </div>
            <div className="bd-field" title="Flowmeter − (Cans × Can size)">
              <label>Flowmeter Waste (L)</label>
              <div className="bd-calc">{fmt1(flowmeterWasteL, ' L')}</div>
            </div>
            <div className="bd-field">
              <label>Can Waste / Low Fills (L)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-can-waste-manual'] ?? ''}
                onChange={e => update({ 'cs-can-waste-manual': e.target.value })} />
            </div>
            <div className="bd-field"><label>Total Canning Waste (L)</label><div className="bd-calc">{totalCanWasteL > 0 ? fmt1(totalCanWasteL, ' L') : '—'}</div></div>
            <div className="bd-field">
              <label>Avg Can DO (ppb)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-can-do'] ?? ''}
                onChange={e => update({ 'cs-can-do': e.target.value })} />
            </div>
            <div className="bd-field">
              <label>Keg Waste (L)</label>
              <input className="bd-input" placeholder="—"
                value={cs['cs-keg-waste'] ?? ''}
                onChange={e => update({ 'cs-keg-waste': e.target.value })} />
            </div>
          </div>

          <div style={sectionTitle}>Volume Tracking</div>
          <div className="bd-section">
            <div className="bd-field"><label>Into FV (L)</label><div className="bd-calc">{fmt1(intoFV)}</div></div>
            <div className="bd-field"><label>FV → Tank Waste (L)</label><div className="bd-calc">{fmt1(fvBtWaste)}</div></div>
            <div className="bd-field"><label>Into Tank (L)</label><div className="bd-calc">{transferYes ? fmt1(intoBT) : '—'}</div></div>
            <div className="bd-field"><label>Tank → Package Waste (L)</label><div className="bd-calc">{btPkgWaste > 0 ? fmt1(btPkgWaste, ' L') : '—'}</div></div>
            <div className="bd-field"><label>Total Packaged (L)</label><div className="bd-calc">{totalPackaged > 0 ? fmt1(totalPackaged, ' L') : '—'}</div></div>
            <div className="bd-field"><label>Total Waste (L)</label><div className="bd-calc">{fmt1(totalWaste, ' L')}</div></div>
          </div>
        </div>

        {/* ═══ RIGHT: Rating + Tasting Notes ═══ */}
        <div className="cold-right">
          <div style={sectionTitle}>Rating &amp; Review</div>
          <div className="bd-section" style={{ marginBottom: 8 }}>
            <div className="bd-section-title">Recipe Rating</div>
            <div className="bd-field" style={{ flexDirection: 'column' as const, alignItems: 'flex-start', gap: 6, padding: '6px 0' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
                Overall Score
              </label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[1, 2, 3, 4, 5].map(n => {
                  const filled = n <= rating;
                  const previewing = hoverStar > 0 && n <= hoverStar;
                  return (
                    <span
                      key={n}
                      className={`cold-star${previewing ? ' preview' : filled ? ' filled' : ''}`}
                      onClick={() => setStar(n)}
                      onMouseEnter={() => setHoverStar(n)}
                      onMouseLeave={() => setHoverStar(0)}
                    >★</span>
                  );
                })}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>{starLabel}</span>
              </div>
            </div>
            <div className="bd-field" style={{ flexDirection: 'column' as const, alignItems: 'flex-start', gap: 5, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
                Brew Again?
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                {BREW_AGAIN_OPTS.map(opt => (
                  <div
                    key={opt.val}
                    className={`brew-again-opt${cs.brewAgain === opt.val ? ' active' : ''}`}
                    onClick={() => update({ brewAgain: cs.brewAgain === opt.val ? '' : opt.val })}
                  >
                    <span style={{ fontSize: 14 }}>{opt.icon}</span> {opt.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={sectionTitle}>Tasting Notes</div>
          <div className="bd-section" style={{ flex: 1 }}>
            <div className="bd-section-title">Analysis</div>
            <button className="btn" style={{ width: '100%', marginBottom: 6 }} onClick={() => setTastingModalOpen(true)}>
              📝 Open Tasting Notes
            </button>
            <div
              style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, cursor: 'pointer' }}
              onClick={() => setTastingModalOpen(true)}
            >{tastingPreview}</div>
          </div>
        </div>

      </div>

      {/* Mark complete strip — round-trips through bl_checklist_<id>.cold */}
      <ChecklistStrip recipeId={recipeId} clKey="cold" label="Mark Packaging complete" />

      {/* Tasting Notes modal */}
      {tastingModalOpen && (
        <TastingNotesModal
          processNotes={cs['cs-process-notes'] ?? ''}
          tastingNotes={cs['cs-tasting-notes'] ?? ''}
          changesNotes={cs['cs-changes-notes'] ?? ''}
          onChange={patch => update({
            ...(patch.processNotes !== undefined ? { 'cs-process-notes': patch.processNotes } : {}),
            ...(patch.tastingNotes !== undefined ? { 'cs-tasting-notes': patch.tastingNotes } : {}),
            ...(patch.changesNotes !== undefined ? { 'cs-changes-notes': patch.changesNotes } : {}),
          })}
          onClose={() => setTastingModalOpen(false)}
        />
      )}
    </>
  );
}
