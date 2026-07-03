/**
 * NTA Submitter (Recipe Submitter) — port of HTML page-nta (line 2214) +
 * supporting JS (renderNtaPage 11639, ntaFillChecker 11688, ntaCheck 11744,
 * ntaSubmitNew 11844, ntaPrintForm 12000, ntaShowRegisterDetail 11932,
 * ntaOpenBasisModal 11912).
 *
 * Top-level page (not a recipe-editor sub-tab) — picked from the desktop
 * tab bar.
 *
 * Beer-name dropdown source: `recipes[].beerName` (HTML line 11648). The
 * actual submission record's `recipe-name` field is `recipe.name` (仕込記号);
 * the dropdown picks the human label, the submission stores the symbol.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import {
  ntaNormalise, ntaNormalise1000, ntaRatioKey, ntaMatchScore,
  type NtaPer1000, type NtaRatioKey,
} from '../../lib/nta';
import { lsGet } from '../../lib/storage';
import { printHtml, escapeHtml } from '../../lib/print';
import type {
  Ingredient, BrewDayData, ColdSideData, WaterChemData,
  NtaSubmission,
} from '../../types';

type CellStatus = 'green' | 'amber' | 'red' | 'grey';

// Tolerance constants from HTML lines 11756–11758.
const TOL_TIGHT = 0.10;
const TOL_LOOSE = 0.25;

function withinTol(x: number, y: number, tol: number): boolean {
  const mx = Math.max(Math.abs(x || 0), Math.abs(y || 0));
  if (mx === 0) return true;
  return Math.abs((x || 0) - (y || 0)) / mx <= tol;
}

function statusFor(declared: number, actual: number): CellStatus {
  if (withinTol(declared, actual, TOL_TIGHT)) return 'green';
  if (withinTol(declared, actual, TOL_LOOSE)) return 'amber';
  return 'red';
}

const COLOUR: Record<CellStatus, string> = {
  green: '#5ab568',
  amber: '#e0a020',
  red:   'var(--red)',
  grey:  'var(--text-dim)',
};

const f1 = (v: number): string => v > 0 ? v.toFixed(1) : '—';
const f2 = (v: number): string => v > 0 ? v.toFixed(2) : '—';
const f3 = (v: number): string => v > 0 ? v.toFixed(3) : '—';
const fAbv = (v: number): string => v > 0 ? v.toFixed(1) + '%' : '—';

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export default function NtaPage() {
  const recipes        = useStore(s => s.recipes);
  const miscLib        = useStore(s => s.miscLib);
  const maltLib        = useStore(s => s.maltLib);
  const ntaRegister    = useStore(s => s.ntaRegister);
  const ntaBasisDefault = useStore(s => s.ntaBasisDefault);
  const addNtaSubmission = useStore(s => s.addNtaSubmission);
  const deleteNtaSubmission = useStore(s => s.deleteNtaSubmission);
  const setNtaRegister      = useStore(s => s.setNtaRegister);
  const pushToast           = useStore(s => s.pushToast);
  const setNtaBasisDefault  = useStore(s => s.setNtaBasisDefault);
  const setNtaBasisCurrent  = useStore(s => s.setNtaBasisCurrent);

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  // Two-step flow (matches HTML ntaFillChecker / ntaCheck split, lines
  // 11688 + 11744): selecting a beer fills the Raw + Per-1000L rows; the
  // comparison grid + result banner + Submit button stay hidden until the
  // user clicks Check. Reset to null on every dropdown change.
  const [checkedRecipeId, setCheckedRecipeId]   = useState<string | null>(null);
  const [basisModalOpen, setBasisModalOpen]     = useState(false);
  const [detailIdx, setDetailIdx]               = useState<number | null>(null);
  // Print-selection flow — user picks a subset of the register to print
  // rather than always printing everything.
  const [printSelecting, setPrintSelecting] = useState(false);
  const [printSelected, setPrintSelected]   = useState<Set<number>>(new Set());

  const handleSelectRecipe = (newId: string) => {
    setSelectedRecipeId(newId);
    setCheckedRecipeId(null);
  };

  const handleCheck = () => {
    if (!selectedRecipeId) {
      pushToast({ message: 'Select a beer first.', variant: 'info' });
      return;
    }
    setCheckedRecipeId(selectedRecipeId);
  };

  const isChecked = !!checkedRecipeId && checkedRecipeId === selectedRecipeId;

  // ── Derived: per-1000L view of the selected recipe (the "Declared" row) ──
  const declared = useMemo<NtaPer1000 | null>(() => {
    if (!selectedRecipeId) return null;
    const recipe = recipes.find(r => r.id === selectedRecipeId);
    if (!recipe) return null;
    const ings      = lsGet<Ingredient[]>(`bl_recipe_ings_${selectedRecipeId}`, []);
    const brewDay   = lsGet<BrewDayData>(`bl_bd_${selectedRecipeId}`, {});
    const waterChem = lsGet<WaterChemData>(`bl_water_chem_${selectedRecipeId}`, {});
    const coldSide  = lsGet<ColdSideData>(`bl_cold_${selectedRecipeId}`, {});
    const raw = ntaNormalise({ recipe, ings, brewDay, waterChem, coldSide, miscLib, maltLib });
    return ntaNormalise1000(raw);
  }, [selectedRecipeId, recipes, miscLib, maltLib]);

  const declaredKey = useMemo<NtaRatioKey | null>(
    () => declared ? ntaRatioKey(declared) : null,
    [declared],
  );

  // Match status against existing register
  const matches = useMemo(() => {
    if (!declaredKey) return [];
    return ntaRegister
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => ntaMatchScore(declaredKey, ratioKeyOfSubmission(r)));
  }, [declaredKey, ntaRegister]);

  const handleSubmit = () => {
    if (!declared || !selectedRecipeId) return;
    const recipe = recipes.find(r => r.id === selectedRecipeId);
    if (!recipe) return;
    const defaultCode = recipe.name || recipe.beerName || '';
    const code = window.prompt('Enter recipe name (仕込記号) for tax records:', defaultCode);
    if (code === null) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = ntaRatioKey(declared);
    const entry: NtaSubmission = {
      code,
      date: today,
      recipeId: selectedRecipeId,
      classification: recipe.classification,
      maltKg: declared.maltKg,
      wheatKg: declared.wheatKg,
      oatsKg: declared.oatsKg,
      otherGrainKg: declared.otherGrainKg,
      hopsKg: declared.hopsKg,
      yeastKg: declared.yeastKg,
      waterL: declared.waterL,
      miscList: declared.miscList,
      ogP: declared.ogP,
      abv: declared.abv,
      intoFV: declared.intoFV,
      packaged: declared.packaged,
      basis: ntaBasisDefault,
      miscNames: key.miscNames,
    };
    addNtaSubmission(entry);
  };

  const handlePrintForm = () => {
    const selectedEntries = [...printSelected].sort((a, b) => a - b).map(i => ntaRegister[i]);
    printNtaForm(selectedEntries);
    setPrintSelecting(false);
    setPrintSelected(new Set());
  };

  const handleSelectAllPrint = () => {
    setPrintSelected(new Set(ntaRegister.map((_, i) => i)));
  };

  const handleTogglePrint = (idx: number) => {
    setPrintSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCancelPrintSelect = () => {
    setPrintSelecting(false);
    setPrintSelected(new Set());
  };

  const handleDelete = (idx: number) => {
    const before = ntaRegister;
    deleteNtaSubmission(idx);
    pushToast({
      message: 'Removed submission',
      undo: () => setNtaRegister(before),
    });
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--border2)',
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
          RECIPE SUBMITTER
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          ビール・発泡酒の１仕込製造方法 (CC1-5610-6)
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {printSelecting ? (
            <>
              <button className="btn sm" onClick={handleSelectAllPrint}>Select All</button>
              <button className="btn primary" disabled={printSelected.size === 0} onClick={handlePrintForm}>Print Selected</button>
              <button className="btn sm" onClick={handleCancelPrintSelect}>Cancel</button>
            </>
          ) : (
            isChecked && matches.length > 0 && (
              <button className="btn" onClick={() => setPrintSelecting(true)}>🖨 Print Form</button>
            )
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── 1. Recipe Checker — the beer you're checking ── */}
        <div style={{
          background: 'var(--panel2)', border: '1px solid var(--border2)',
          borderRadius: 10, padding: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14,
          }}>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 1,
            }}>
              Recipe Checker
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>Select Beer</span>
              <select
                value={selectedRecipeId}
                onChange={e => handleSelectRecipe(e.target.value)}
                style={{
                  background: 'var(--panel)', border: '1px solid var(--border2)', color: 'var(--text)',
                  fontFamily: 'var(--mono)', fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  outline: 'none', minWidth: 180,
                }}
              >
                <option value="">— select beer —</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.id}>{r.beerName || '(no beer name)'}</option>
                ))}
              </select>
              <button className="btn" onClick={handleCheck}>🔍 Check</button>
              <button className="btn sm" onClick={() => setBasisModalOpen(true)}>📋 Basis</button>
              {/* Submit only appears AFTER a Check that returned no matches —
                  matches HTML ntaCheck line 11770. */}
              {isChecked && declared && matches.length === 0 && (
                <button className="btn primary" onClick={handleSubmit}>✓ Mark as Submitted</button>
              )}
            </div>
          </div>

          {/* Raw + per-1000L checker rows */}
          {selectedRecipeId && declared ? (
            <CheckerTable
              recipeId={selectedRecipeId}
              recipes={recipes}
              miscLib={miscLib}
              maltLib={maltLib}
              declared={declared}
            />
          ) : (
            <div style={{
              padding: 16, textAlign: 'center', color: 'var(--text-muted)',
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
            }}>
              SELECT A BEER TO CHECK
            </div>
          )}
        </div>

        {/* ── 2. Match Results — banner + comparison grid (post-Check) ── */}
        {isChecked && declared && declaredKey && (
          <div style={{
            background: 'var(--panel2)', border: '1px solid var(--border2)',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14,
            }}>
              Match Results
            </div>
            <CheckResult
              declared={declared}
              declaredKey={declaredKey}
              register={ntaRegister}
              onShowDetail={i => setDetailIdx(i)}
            />
          </div>
        )}

        {/* ── 3. Submitted Recipes Register ── */}
        <SubmittedRegister
          rows={ntaRegister}
          onDelete={handleDelete}
          onShowDetail={i => setDetailIdx(i)}
          printSelecting={printSelecting}
          printSelected={printSelected}
          onTogglePrint={handleTogglePrint}
          onPrintAll={() => printNtaForm(ntaRegister)}
        />
      </div>

      {basisModalOpen && (
        <BasisModal
          initial={ntaBasisDefault}
          onClose={() => setBasisModalOpen(false)}
          onSave={text => { setNtaBasisCurrent(text); setBasisModalOpen(false); }}
          onSaveDefault={text => { setNtaBasisDefault(text); setBasisModalOpen(false); }}
        />
      )}

      {detailIdx != null && (
        <RegisterDetailModal
          submission={ntaRegister[detailIdx]}
          onClose={() => setDetailIdx(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Submitted Register
// ═══════════════════════════════════════════════════════════════════

function SubmittedRegister({
  rows, onDelete, onShowDetail, printSelecting, printSelected, onTogglePrint, onPrintAll,
}: {
  rows: NtaSubmission[];
  onDelete: (idx: number) => void;
  onShowDetail: (idx: number) => void;
  printSelecting: boolean;
  printSelected: Set<number>;
  onTogglePrint: (idx: number) => void;
  onPrintAll: () => void;
}) {
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const sortedRows = [...rows]
    .map((r, i) => ({ r, origIdx: i }))
    .sort((a, b) => sortOrder === 'desc'
      ? b.r.date.localeCompare(a.r.date)
      : a.r.date.localeCompare(b.r.date));

  return (
    <div style={{
      background: 'var(--panel2)', border: '1px solid var(--border2)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderBottom: '1px solid var(--border2)',
      }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Submitted Recipes Register
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
          — all amounts per 1000L batch
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn sm"
            onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
          >
            {sortOrder === 'desc' ? '↑ Oldest first' : '↓ Newest first'}
          </button>
          <button className="btn sm" onClick={onPrintAll}>🖨 Print All</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontFamily: 'var(--mono)', fontSize: 10,
        }}>
          <thead>
            <tr style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border2)' }}>
              {printSelecting && <th style={{ padding: '6px 10px', width: 28 }}></th>}
              {['Recipe','Submitted','Malt (kg)','Wheat (kg)','Oats (kg)','Other (kg)','Hops (kg)','Water (L)','Yeast (kg)','OG (P)','Into FV (L)','Packaged (L)','ABV','Misc',''].map((h, i) => (
                <th key={i} style={{
                  padding: '6px 10px',
                  textAlign: i >= 2 && i <= 12 ? 'right' : 'left',
                  color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={printSelecting ? 16 : 15} style={{
                padding: 20, textAlign: 'center', color: 'var(--text-muted)',
                fontSize: 9, letterSpacing: 1,
              }}>NO SUBMISSIONS YET</td></tr>
            ) : sortedRows.map(({ r, origIdx }, i) => (
              <tr key={origIdx}
                  onDoubleClick={() => onShowDetail(origIdx)}
                  style={{
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: i % 2 ? 'rgba(255,255,255,0.01)' : undefined,
                  }}
                  title="Double-click for details">
                {printSelecting && (
                  <td style={{ padding: '5px 10px' }}>
                    <input
                      type="checkbox"
                      checked={printSelected.has(origIdx)}
                      onChange={() => onTogglePrint(origIdx)}
                    />
                  </td>
                )}
                <td style={{ padding: '5px 10px', color: 'var(--amber)', fontWeight: 600 }}>{r.code || '—'}</td>
                <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{r.date || '—'}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(r.maltKg)}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{r.wheatKg > 0 ? f1(r.wheatKg) : '—'}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{r.oatsKg > 0 ? f1(r.oatsKg) : '—'}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{r.otherGrainKg > 0 ? f1(r.otherGrainKg) : '—'}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f2(r.hopsKg)}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(r.waterL)}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f2(r.yeastKg)}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(r.ogP)}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(r.intoFV)}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{r.packaged > 0 ? f1(r.packaged) : '—'}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right' }}>{fAbv(r.abv)}</td>
                <td style={{
                  padding: '5px 10px', color: 'var(--text-dim)', fontSize: 9,
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.miscList.map(m => m.name).join(', ') || '—'}</td>
                <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                  <button className="btn sm danger" onClick={() => onDelete(origIdx)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Checker table (Raw + Per-1000L rows)
// ═══════════════════════════════════════════════════════════════════

function CheckerTable({
  recipeId, recipes, miscLib, maltLib, declared,
}: {
  recipeId: string;
  recipes: ReturnType<typeof useStore.getState>['recipes'];
  miscLib: ReturnType<typeof useStore.getState>['miscLib'];
  maltLib: ReturnType<typeof useStore.getState>['maltLib'];
  declared: NtaPer1000;
}) {
  // Raw view (pre-scaling) for the user to compare against per-1000L
  const raw = useMemo(() => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return null;
    const ings      = lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const brewDay   = lsGet<BrewDayData>(`bl_bd_${recipeId}`, {});
    const waterChem = lsGet<WaterChemData>(`bl_water_chem_${recipeId}`, {});
    const coldSide  = lsGet<ColdSideData>(`bl_cold_${recipeId}`, {});
    return ntaNormalise({ recipe, ings, brewDay, waterChem, coldSide, miscLib, maltLib });
  }, [recipeId, recipes, miscLib, maltLib]);

  if (!raw) return null;

  const renderRow = (label: string, d: NtaPer1000, separator?: boolean) => (
    <tr style={separator ? { borderTop: '1px solid var(--border2)' } : undefined}>
      <td style={{
        padding: '5px 10px', fontFamily: 'var(--mono)', fontSize: 9,
        color: 'var(--text-muted)', whiteSpace: 'nowrap',
      }}>{label}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(d.maltKg)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{f2(d.wheatKg)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{f2(d.oatsKg)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{f2(d.otherGrainKg)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f3(d.hopsKg)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(d.waterL)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f3(d.yeastKg)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(d.ogP)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{f1(d.intoFV)}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{d.packaged > 0 ? Math.floor(d.packaged) : '—'}</td>
      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{fAbv(d.abv)}</td>
      <td style={{
        padding: '5px 10px', color: 'var(--text-dim)', fontSize: 9,
        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{d.miscList.map(m => m.name).join(', ') || '—'}</td>
    </tr>
  );

  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'var(--mono)', fontSize: 10,
      }}>
        <thead>
          <tr style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border2)' }}>
            {['','MALT (kg)','WHEAT (kg)','OATS (kg)','OTHER (kg)','HOPS (kg)','WATER (L)','YEAST (kg)','OG (P)','INTO FV (L)','PACKAGED (L)','ABV','MISC'].map((h, i) => (
              <th key={i} style={{
                padding: '5px 10px',
                textAlign: i === 0 || i === 12 ? 'left' : 'right',
                color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap',
                minWidth: i === 0 ? 90 : undefined,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* "Raw" row uses the per-1000L scaling factor of 1.0 — i.e. original raw fields */}
          {renderRow('Raw (' + raw.batchL + 'L)', { ...raw } as NtaPer1000)}
          {renderRow('Per 1000L', declared, true)}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Check result + comparison grid
// ═══════════════════════════════════════════════════════════════════

function ratioKeyOfSubmission(r: NtaSubmission): NtaRatioKey {
  return {
    maltKg:    r.maltKg  ?? 0,
    hopsKg:    r.hopsKg  ?? 0,
    yeastKg:   r.yeastKg ?? 0,
    waterL:    r.waterL  ?? 0,
    ogP:       r.ogP     ?? 0,
    abv:       r.abv     ?? 0,
    // Prefer the cached match key; old register rows without it recompute
    // from the stored misc list (matches ntaRatioKey's own derivation).
    miscNames: r.miscNames ?? r.miscList.map(m => m.name.toLowerCase()).sort().join('|'),
  };
}

function CheckResult({
  declared, declaredKey, register, onShowDetail,
}: {
  declared: NtaPer1000;
  declaredKey: NtaRatioKey;
  register: NtaSubmission[];
  onShowDetail: (idx: number) => void;
}) {
  const matches = register
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => ntaMatchScore(declaredKey, ratioKeyOfSubmission(r)));

  const cellColour = (declaredVal: number, actualVal: number, isMisc: boolean): string => {
    if (isMisc) {
      return declaredVal === actualVal ? COLOUR.green : COLOUR.red;
    }
    return COLOUR[statusFor(declaredVal, actualVal)];
  };

  return (
    <>
      {/* Summary banner */}
      {matches.length > 0 ? (
        <div style={{
          background: 'rgba(90,181,104,0.15)', border: '1px solid #5ab568',
          color: '#5ab568', fontFamily: 'var(--mono)', fontSize: 11,
          padding: '6px 12px', borderRadius: 6, marginBottom: 10,
        }}>
          {matches.map(m => (
            <span key={m.idx} style={{ display: 'inline-block', marginRight: 8 }}>
              ✓ Matches <strong>{m.r.code}</strong> ({m.r.date})
            </span>
          ))}
        </div>
      ) : (
        <div style={{
          background: 'rgba(224,82,82,0.12)', border: '1px solid var(--red)',
          color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11,
          padding: '6px 12px', borderRadius: 6, marginBottom: 10,
        }}>
          ⚠ No matching submission found
        </div>
      )}

      {/* Comparison grid */}
      {register.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: 'var(--mono)', fontSize: 10,
            }}>
              <thead>
                <tr style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border2)' }}>
                  {['RECIPE','DATE','MALT','WHEAT','OATS','OTHER','HOPS','WATER','YEAST','OG','FV','PKG','ABV','MISC'].map((h, i) => (
                    <th key={i} style={{
                      padding: '4px 10px',
                      textAlign: i === 0 || i === 1 || i === 13 ? 'left' : 'right',
                      color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {register.map((r, i) => {
                  const isMatch = ntaMatchScore(declaredKey, ratioKeyOfSubmission(r));
                  const rowBg = isMatch ? 'rgba(90,181,104,0.07)' : undefined;
                  const td = (decVal: number, actVal: number, fmt: (v: number) => string, isMisc: boolean) => (
                    <td style={{
                      padding: '4px 10px', textAlign: 'right',
                      color: cellColour(decVal, actVal, isMisc),
                    }}>{fmt(actVal)}</td>
                  );
                  const miscMatch = declaredKey.miscNames === ratioKeyOfSubmission(r).miscNames;
                  return (
                    <tr key={i}
                        onDoubleClick={() => onShowDetail(i)}
                        style={{
                          borderBottom: '1px solid var(--border)', cursor: 'pointer',
                          background: rowBg,
                        }}
                        title="Double-click for details">
                      <td style={{ padding: '4px 10px', color: 'var(--amber)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.code || '—'}</td>
                      <td style={{ padding: '4px 10px', color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap' }}>{r.date || '—'}</td>
                      {td(declared.maltKg,       r.maltKg,       f1, false)}
                      {td(declared.wheatKg,      r.wheatKg,      f2, false)}
                      {td(declared.oatsKg,       r.oatsKg,       f2, false)}
                      {td(declared.otherGrainKg, r.otherGrainKg, f2, false)}
                      {td(declared.hopsKg,       r.hopsKg,       f3, false)}
                      {td(declared.waterL,       r.waterL,       f1, false)}
                      {td(declared.yeastKg,      r.yeastKg,      f3, false)}
                      {td(declared.ogP,          r.ogP,          f1, false)}
                      {td(declared.intoFV,       r.intoFV,       f1, false)}
                      <td style={{
                        padding: '4px 10px', textAlign: 'right',
                        color: cellColour(declared.packaged, r.packaged, false),
                      }}>{r.packaged > 0 ? Math.floor(r.packaged) : '—'}</td>
                      <td style={{ padding: '4px 10px', textAlign: 'right', color: 'var(--text-dim)', fontSize: 9 }}>{fAbv(r.abv)}</td>
                      <td style={{
                        padding: '4px 10px', fontSize: 9,
                        color: miscMatch ? COLOUR.green : COLOUR.red,
                      }}>{r.miscList.map(m => m.name).join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 6,
          }}>
            <span style={{ color: COLOUR.green }}>■</span> match&nbsp;&nbsp;
            <span style={{ color: COLOUR.amber }}>■</span> within 25%&nbsp;&nbsp;
            <span style={{ color: COLOUR.red }}>■</span> outside tolerance &nbsp;·&nbsp;
            double-click row for recipe detail
          </div>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Modals
// ═══════════════════════════════════════════════════════════════════

function BasisModal({
  initial, onClose, onSave, onSaveDefault,
}: {
  initial: string;
  onClose: () => void;
  onSave: (text: string) => void;
  onSaveDefault: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div style={modalBackdrop}>
      <div style={modalPanel}>
        <h3 style={{
          margin: 0, marginBottom: 4, color: 'var(--amber)',
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1,
          textTransform: 'uppercase',
        }}>製造見込数量の算出根拠等</h3>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
          marginBottom: 10,
        }}>Basis for production estimate — appears on CC1-5610-6 form</div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          placeholder="e.g. Based on previous brewing results — average brewhouse efficiency 75%, batch size 1200L"
          style={{
            width: '100%', resize: 'vertical', padding: 8, boxSizing: 'border-box',
            background: 'var(--panel)', color: 'var(--text)',
            border: '1px solid var(--border2)', borderRadius: 6,
            fontFamily: 'var(--mono)', fontSize: 11,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          {/* Order matches HTML modal (line 2178–2182): Save as Default,
              Cancel, Save. */}
          <button className="btn sm" onClick={() => onSaveDefault(text)}
                  style={{ color: 'var(--text-muted)' }}>
            💾 Save as Default
          </button>
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(text)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function RegisterDetailModal({
  submission, onClose,
}: {
  submission: NtaSubmission;
  onClose: () => void;
}) {
  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={{ ...modalPanel, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0, marginBottom: 4, color: 'var(--amber)' }}>{submission.code || 'RECIPE DETAIL'}</h3>
        <div style={{
          color: 'var(--text-muted)', fontSize: 10, marginBottom: 12,
          fontFamily: 'var(--mono)',
        }}>
          {submission.date} {submission.classification ? '· ' + submission.classification : ''}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12 }}>
          <tbody>
            {[
              ['麦芽 Malt',   f1(submission.maltKg)       + ' kg'],
              ['　Wheat',     f2(submission.wheatKg)      + ' kg'],
              ['　Oats',      f2(submission.oatsKg)       + ' kg'],
              ['Other grain', f2(submission.otherGrainKg) + ' kg'],
              ['ホップ Hops', f3(submission.hopsKg)       + ' kg'],
              ['水 Water',    f1(submission.waterL)       + ' L'],
              ['酵母 Yeast',  f3(submission.yeastKg)      + ' kg'],
              ['OG',          f1(submission.ogP)          + ' °P'],
              ['ABV',         fAbv(submission.abv)],
              ['Into FV',     f1(submission.intoFV)       + ' L'],
              ['Misc',        submission.miscList.map(m => m.name).join(', ') || '—'],
            ].map(([k, v], i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{k}</td>
                <td style={{ padding: '4px 8px' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {submission.basis && (
          <>
            <h4 style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1 }}>Basis</h4>
            <p style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{submission.basis}</p>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalPanel: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  borderRadius: 10, padding: 20, width: '90%', maxWidth: 640,
  maxHeight: '90vh', overflow: 'auto',
};

// ═══════════════════════════════════════════════════════════════════
// Print form (CC1-5610-6)
// ═══════════════════════════════════════════════════════════════════

function printNtaForm(register: NtaSubmission[]): void {
  const fmt1 = (v: unknown): string => {
    const n = parseFloat(String(v));
    return isFinite(n) ? n.toFixed(1) : '—';
  };
  const fmt2 = (v: unknown): string => {
    const n = parseFloat(String(v));
    return isFinite(n) ? n.toFixed(2) : '—';
  };
  const fmt3 = (v: unknown): string => {
    const n = parseFloat(String(v));
    return isFinite(n) ? n.toFixed(3) : '—';
  };

  // 4 submissions per CC1-5610-6 page (HTML line 12010)
  const pages: (NtaSubmission | null)[][] = [];
  for (let i = 0; i < register.length; i += 4) {
    const slice: (NtaSubmission | null)[] = register.slice(i, i + 4);
    while (slice.length < 4) slice.push(null);
    pages.push(slice);
  }

  const cell = (g: NtaSubmission | null, content: string): string =>
    g
      ? `<td style="border:1px solid #999;padding:4px 8px;text-align:center;">${escapeHtml(content)}</td>`
      : '<td style="border:1px solid #999;padding:4px 8px;"></td>';

  const buildRow = (label: string, vals: (string | null)[]): string =>
    `<tr><td style="border:1px solid #999;padding:4px 8px;font-size:10px;white-space:nowrap;">${escapeHtml(label)}</td>` +
    vals.map(v => v != null ? `<td style="border:1px solid #999;padding:4px 8px;text-align:center;">${escapeHtml(v)}</td>` : cell(null, '')).join('') +
    '</tr>';

  const pageHtml = pages.map(group => {
    const allMisc = new Set<string>();
    for (const g of group) if (g) for (const m of g.miscList) allMisc.add(m.name);
    const miscRows = [...allMisc].map(name =>
      buildRow(name + '　㎏', group.map(g => {
        if (!g) return null;
        const m = g.miscList.find(x => x.name === name);
        return m ? fmt2(m.kgPer1000) : null;
      }))
    ).join('');

    return `
<div style="page-break-after:always;padding:20px;font-family:'MS Mincho',serif;font-size:10px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <span style="font-size:9px;">CC1-5610-6</span>
    <span style="border:1px solid #000;padding:2px 10px;font-size:12px;font-weight:bold;letter-spacing:2px;">酒 税</span>
  </div>
  <div style="margin-bottom:4px;font-size:9px;">申告順号 _______________</div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <td style="border:1px solid #000;padding:4px 8px;width:38%;"></td>
        <td colspan="4" style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;font-size:11px;">ビール・発泡酒の１仕込製造方法</td>
      </tr>
    </thead>
    <tbody>
      ${buildRow('仕込記号', group.map(g => g?.code ?? null))}
      ${buildRow('仕込個数', group.map(g => g ? '1' : null))}
      <tr><td colspan="5" style="border:1px solid #000;padding:2px 8px;font-size:9px;background:#f0f0f0;">原　料</td></tr>
      ${buildRow('麦 芽　㎏', group.map(g => g ? fmt1(g.maltKg) : null))}
      ${buildRow('米　㎏', group.map(() => null))}
      ${buildRow('でん粉　㎏', group.map(() => null))}
      ${miscRows}
      ${buildRow('ホップ　㎏', group.map(g => g ? fmt3(g.hopsKg) : null))}
      ${buildRow('水　ｌ', group.map(g => g ? fmt1(g.waterL) : null))}
      ${buildRow('酵 母　ｇ', group.map(g => g ? Math.round(g.yeastKg * 1000).toString() : null))}
      ${buildRow('仕込即時見込数量　ｌ', group.map(g => g && g.intoFV > 0 ? fmt1(g.intoFV) : null))}
      ${buildRow('見込糖度', group.map(g => g && g.ogP > 0 ? fmt1(g.ogP) : null))}
      ${buildRow('見込アルコール分', group.map(g => g && g.abv > 0 ? g.abv.toFixed(1) + '%' : null))}
      ${buildRow('製 造 見 込 数 量　ｌ', group.map(g => g && g.packaged > 0 ? Math.floor(g.packaged).toString() : null))}
      ${buildRow('同一仕込方法による製造見込数量計　ｌ', group.map(g => g && g.packaged > 0 ? Math.floor(g.packaged).toString() : null))}
      <tr>
        <td style="border:1px solid #000;padding:4px 8px;font-size:10px;vertical-align:top;">製 造 見 込 数 量<br>の 算 出 根 基 等</td>
        ${group.map(g => `<td style="border:1px solid #000;padding:4px 8px;font-size:9px;vertical-align:top;min-height:44px;">${escapeHtml(g?.basis ?? '')}</td>`).join('')}
      </tr>
    </tbody>
  </table>
</div>`;
  }).join('');

  printHtml(pageHtml, {
    title: 'NTA Declaration CC1-5610-6',
    pageSize: 'A4',
    landscape: false,
    extraStyles: `
      body { font-family: 'MS Mincho', serif; }
    `,
  });
}
