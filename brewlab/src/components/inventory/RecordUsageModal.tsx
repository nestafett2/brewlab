/**
 * Record Usage modal — port of brewlab-desktop.html lines 15656–15786
 * (openRecordUsageModal / rumCheckAll / closeRecordUsageModal /
 * confirmRecordUsage / checkBrewFullyRecorded).
 *
 * Multi-ingredient checklist for a brew. Pre-checks every recordable
 * ingredient so the typical flow is "Record Usage → Confirm". On
 * confirm, writes one OUT ledger row per checked ingredient, all
 * stamped with the same brew name + date. Sets brew.fullyRecorded
 * when every recipe ingredient has a matching ledger row.
 *
 * Filtering rules (match HTML):
 *   • Skip type='water' rows (HTML 15674).
 *   • For misc, skip rows whose name matches the EXCLUDE_MISC regex
 *     (water-chem additions — phosphoric / sulfuric / lactic /
 *     hydrochloric / caustic / water / h2o). Salts and acids are NOT
 *     ledger-tracked because they're inventory-untracked elsewhere too.
 *   • Skip a checkbox if the brew name already appears in a prior
 *     ledger entry's `beer` field (already logged) — the row stays
 *     visible but greyed out.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { fmtIngAmt, sectionToIngType, toKgForLedger } from '../../lib/units';
import { ingNamesMatch } from '../../lib/ingredient-matcher';
import { dateToStr, todayDate, strToDate } from '../../lib/dates';
import type { LedgerData, LedgerEntry, PlannerBrew } from '../../types';
import type { LibEntry } from '../libraries/libraryShared';

const EXCLUDE_MISC = /phosphoric|sulfuric|lactic|hydrochloric|caustic|water|h2o/i;
const SECTIONS = ['malts', 'hops', 'yeast', 'misc'] as const;
type Section = typeof SECTIONS[number];
const ING_TYPES: Record<Section, 'grain' | 'hop' | 'yeast' | 'misc'> = {
  malts: 'grain', hops: 'hop', yeast: 'yeast', misc: 'misc',
};

interface Props {
  brewId: string;
  onClose: () => void;
}

interface RowData {
  /** Used to track checked / amount state. */
  uid: string;
  section: Section;
  ingName: string;
  ingUnit: string;
  ingAmt: number | string;
  /** Where the ledger entry will be written. */
  ledgerKey: string;
  /** True when a prior ledger entry already references this brew. */
  alreadyLogged: boolean;
}

export default function RecordUsageModal({ brewId, onClose }: Props) {
  const plannerBrews   = useStore(s => s.plannerBrews);
  const setPlannerBrews = useStore(s => s.setPlannerBrews);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const loadIngredients     = useStore(s => s.loadIngredients);
  const ledgerData          = useStore(s => s.ledgerData);
  const setLedgerData       = useStore(s => s.setLedgerData);
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);

  const brew = useMemo(
    () => plannerBrews.find(b => b.id === brewId) ?? null,
    [plannerBrews, brewId],
  );

  // Lazy-load ingredients for the brew's recipe if cache is empty.
  const recipeId = brew?.recipeId ?? '';
  useEffect(() => {
    if (recipeId && ingredientsByRecipe[recipeId] === undefined) {
      loadIngredients(recipeId);
    }
  }, [recipeId, ingredientsByRecipe, loadIngredients]);

  const ings = recipeId ? (ingredientsByRecipe[recipeId] ?? []) : [];

  const libBySection: Record<Section, LibEntry[]> = {
    malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib,
  };

  // Build the row list from the brew's recipe ingredients.
  const rows = useMemo<RowData[]>(() => {
    if (!brew) return [];
    const out: RowData[] = [];
    const brewTag = brew.name.toLowerCase().split(' ').slice(0, 3).join(' ');
    let uidCount = 0;

    for (const sec of SECTIONS) {
      const ingType = ING_TYPES[sec];
      let secIngs = ings.filter(i => i.type === ingType && i.type !== 'water');
      if (sec === 'misc') secIngs = secIngs.filter(i => !EXCLUDE_MISC.test(i.name));
      if (!secIngs.length) continue;
      for (const ing of secIngs) {
        const libEntry = libBySection[sec].find(le => ingNamesMatch(le.name, ing.name, ing.libId, le.id));
        const ledgerKey = libEntry
          ? `${sec}_${libEntry.id}`
          : `nolib_${sec}_${encodeURIComponent(ing.name)}`;
        const alreadyLogged = (ledgerData[ledgerKey] ?? []).some(e =>
          e.used != null && (e.beer ?? '').toLowerCase().includes(brewTag));
        out.push({
          uid: `r-${uidCount++}`,
          section: sec,
          ingName: ing.name,
          ingUnit: ing.unit,
          ingAmt: ing.amt,
          ledgerKey,
          alreadyLogged,
        });
      }
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brew, ings, ledgerData, maltLib, hopLib, yeastLib, miscLib]);

  // Per-row checked + amount state.
  const initialChecked = useMemo<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const r of rows) m[r.uid] = !r.alreadyLogged;
    return m;
  }, [rows]);
  const [checked, setChecked] = useState<Record<string, boolean>>(initialChecked);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState<string>(brew?.start || dateToStr(todayDate()));

  // Re-seed local state when the row set changes (e.g. brew change).
  const lastRowsRef = useRef<RowData[] | null>(null);
  if (lastRowsRef.current !== rows) {
    lastRowsRef.current = rows;
    setChecked(initialChecked);
    const amt: Record<string, string> = {};
    for (const r of rows) amt[r.uid] = fmtIngAmt(r.ingAmt, r.ingUnit);
    setAmounts(amt);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const checkAll = (val: boolean) => {
    setChecked(prev => {
      const next = { ...prev };
      for (const r of rows) if (!r.alreadyLogged) next[r.uid] = val;
      return next;
    });
  };

  const hasNoLibMatch = rows.some(r => r.ledgerKey.startsWith('nolib_'));

  const confirm = () => {
    if (!brew) return;
    const dateStr = date || dateToStr(todayDate());
    const next: LedgerData = { ...ledgerData };
    let recorded = 0;
    const skipped: string[] = [];
    for (const r of rows) {
      if (!checked[r.uid] || r.alreadyLogged) continue;
      const rawAmt = parseFloat(amounts[r.uid] || '') || 0;
      if (rawAmt <= 0) {
        skipped.push(`${r.ingName} (zero amount)`);
        continue;
      }
      const qtyKg = toKgForLedger(rawAmt, r.ingUnit);
      const entry: LedgerEntry = {
        date: dateStr,
        used: qtyKg,
        usedDate: dateStr,
        beer: brew.name,
      };
      next[r.ledgerKey] = [...(next[r.ledgerKey] ?? []), entry];
      recorded++;
    }
    if (recorded > 0) {
      setLedgerData(next);
      // Re-check whether the brew is now fully recorded — if every
      // recipe ingredient has a matching ledger row (per ingNamesMatch +
      // brew-name-prefix match), set brew.fullyRecorded.
      const fullyRecorded = isBrewFullyRecorded(brew, ings, libBySection, next);
      if (fullyRecorded && !brew.fullyRecorded) {
        setPlannerBrews(plannerBrews.map(b =>
          b.id === brew.id ? { ...b, fullyRecorded: true } : b));
      }
    }
    onClose();
    if (skipped.length) window.alert('Skipped (zero amount):\n' + skipped.join('\n'));
  };

  if (!brew) {
    return (
      <div style={overlayStyle} onMouseDown={onClose}>
        <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
          <div style={titleStyle}>RECORD INGREDIENT USAGE</div>
          <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            Brew not found.
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (!brew.recipeId) {
    return (
      <div style={overlayStyle} onMouseDown={onClose}>
        <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
          <div style={titleStyle}>RECORD INGREDIENT USAGE</div>
          <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            This brew isn't linked to a recipe — nothing to record.
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>RECORD INGREDIENT USAGE</div>
        <div style={brewNameStyle}>{brew.name.toUpperCase()}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label style={miniLabelStyle}>BREW DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
        </div>

        <div style={subHeaderStyle}>SELECT INGREDIENTS TO RECORD:</div>

        {hasNoLibMatch && (
          <div style={warnStyle}>
            ⚠ Some ingredients aren't in your library — they'll be recorded under their recipe name.
          </div>
        )}

        <div style={listWrapStyle}>
          {rows.length === 0 ? (
            <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
              No recordable ingredients found.
            </div>
          ) : (() => {
            // Group rendering: section header + rows.
            const elements: React.ReactNode[] = [];
            let lastSec: Section | '' = '';
            for (const r of rows) {
              if (r.section !== lastSec) {
                lastSec = r.section;
                elements.push(
                  <div key={`hdr-${r.section}`} style={sectionHeaderStyle}>
                    {r.section.toUpperCase()}
                  </div>,
                );
              }
              elements.push(
                <label key={r.uid} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 12px', borderBottom: '1px solid var(--border)',
                  opacity: r.alreadyLogged ? 0.45 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={!!checked[r.uid] && !r.alreadyLogged}
                    disabled={r.alreadyLogged}
                    onChange={e => setChecked(prev => ({ ...prev, [r.uid]: e.target.checked }))}
                    style={{ accentColor: 'var(--amber)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ingNameStyle}>{r.ingName}</div>
                    {r.ledgerKey.startsWith('nolib_') && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#f09420' }}>
                        ⚠ not in library
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <input
                      type="number" min={0} step={0.1}
                      disabled={r.alreadyLogged}
                      value={amounts[r.uid] ?? fmtIngAmt(r.ingAmt, r.ingUnit)}
                      onChange={e => setAmounts(prev => ({ ...prev, [r.uid]: e.target.value }))}
                      style={amtInputStyle}
                    />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                      {r.ingUnit}
                    </span>
                  </div>
                  {r.alreadyLogged && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#3a8a3a', flexShrink: 0 }}>
                      ✓ logged
                    </span>
                  )}
                </label>,
              );
            }
            return elements;
          })()}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn sm" onClick={() => checkAll(true)}>Check All</button>
          <button className="btn sm" onClick={() => checkAll(false)}>Check None</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={confirm}>RECORD USAGE</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isBrewFullyRecorded(
  brew: PlannerBrew,
  ings: { type: string; name: string; libId?: string }[],
  libBySection: Record<Section, LibEntry[]>,
  ledgerData: LedgerData,
): boolean {
  const sectionMap: Record<string, Section> = { grain: 'malts', hop: 'hops', yeast: 'yeast', misc: 'misc' };
  const tag = brew.name.toLowerCase().split(' ').slice(0, 2).join(' ');
  return ings.every(ing => {
    const sec = sectionMap[ing.type];
    if (!sec) return true; // unknown type skipped
    const lib = libBySection[sec].find(le => ingNamesMatch(le.name, ing.name, ing.libId, le.id));
    if (!lib) return true; // un-matchable rows skipped (HTML 15776)
    const key = `${sec}_${lib.id}`;
    return (ledgerData[key] ?? []).some(e =>
      e.used != null && (e.beer ?? '').toLowerCase().includes(tag));
  });
}

// strToDate is intentionally imported to keep the modal's date logic
// consistent with the rest of the planner — used implicitly via brew.start.
void strToDate;

// ─── Styles ──────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 460, maxWidth: '95vw',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
  paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const brewNameStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)',
  letterSpacing: 1, margin: '12px 0',
};

const miniLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase',
};

const dateInputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 8px', outline: 'none',
};

const subHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
  color: 'var(--text-muted)', margin: '10px 0 6px',
};

const warnStyle: React.CSSProperties = {
  padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 9,
  background: 'rgba(240,148,32,0.12)', border: '1px solid rgba(240,148,32,0.3)',
  color: '#f09420', marginBottom: 10,
};

const listWrapStyle: React.CSSProperties = {
  flex: 1, maxHeight: 320, overflowY: 'auto',
  border: '1px solid var(--border)', background: 'var(--bg)',
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
  background: 'var(--panel2)', color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
};

const ingNameStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const amtInputStyle: React.CSSProperties = {
  width: 62, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--amber)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '2px 5px', outline: 'none', textAlign: 'right',
};
