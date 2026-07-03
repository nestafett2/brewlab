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
import { fmtIngAmt, toKgForLedger } from '../../lib/units';
import { ingNamesMatch } from '../../lib/ingredient-matcher';
import { dateToStr, todayDate, strToDate } from '../../lib/dates';
import type { LedgerData, LedgerEntry, PlannerBrew, MaltLib, HopLib, YeastLib, MiscLib } from '../../types';
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
  const recipes             = useStore(s => s.recipes);
  const pushToast           = useStore(s => s.pushToast);
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const setMaltLib  = useStore(s => s.setMaltLib);
  const setHopLib   = useStore(s => s.setHopLib);
  const setYeastLib = useStore(s => s.setYeastLib);
  const setMiscLib  = useStore(s => s.setMiscLib);
  const updateIngredient = useStore(s => s.updateIngredient);

  const brew = useMemo(
    () => plannerBrews.find(b => b.id === brewId) ?? null,
    [plannerBrews, brewId],
  );

  // Tax batch # of the brew's linked recipe — written onto each ledger
  // OUT entry alongside `beer` so future "is this brew already
  // recorded?" checks (forecast / order-XLSX / fully-recorded) can do
  // an exact compare instead of brew-name substring. Empty string when
  // the brew has no linked recipe or the recipe's taxBatch is blank.
  const brewTaxBatch = useMemo(() => {
    if (!brew?.recipeId) return '';
    return recipes.find(r => r.id === brew.recipeId)?.taxBatch ?? '';
  }, [brew, recipes]);

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

    for (const sec of SECTIONS) {
      const ingType = ING_TYPES[sec];
      // ingType is constrained to 'grain'|'hop'|'yeast'|'misc' so the
      // type === ingType equality already narrows out water rows.
      let secIngs = ings.filter(i => i.type === ingType);
      if (sec === 'misc') secIngs = secIngs.filter(i => !EXCLUDE_MISC.test(i.name));
      if (!secIngs.length) continue;
      for (const ing of secIngs) {
        const libEntry = libBySection[sec].find(le => ingNamesMatch(le.name, ing.name, ing.libId, le.id));
        const ledgerKey = libEntry
          ? `${sec}_${libEntry.id}`
          : `nolib_${sec}_${encodeURIComponent(ing.name)}`;
        const alreadyLogged = (ledgerData[ledgerKey] ?? []).some(e => {
          if (e.used == null) return false;
          if (brewTaxBatch && e.taxBatch && e.taxBatch === brewTaxBatch) return true;
          return (e.beer ?? '').toLowerCase().includes(brewTag);
        });
        out.push({
          uid: `${sec}_${ing.name}`,
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
  }, [brew, brewTaxBatch, ings, ledgerData, maltLib, hopLib, yeastLib, miscLib]);

  // Per-row checked + amount state.
  const initialChecked = useMemo<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const r of rows) m[r.uid] = !r.alreadyLogged;
    return m;
  }, [rows]);
  const [checked, setChecked] = useState<Record<string, boolean>>(initialChecked);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState<string>(brew?.start || dateToStr(todayDate()));
  const [resolvingUid, setResolvingUid] = useState<string | null>(null);
  const [resolveSearch, setResolveSearch] = useState('');

  // Re-seed local state when the row set changes. On a genuine brew
  // change, fully reset to defaults. On a same-brew recompute (e.g.
  // resolveLink/addToLibrary linking a "not in library" ingredient,
  // which changes that row's ledgerKey and produces a new `rows`
  // array), merge in defaults only for uids not already tracked so the
  // user's existing checkbox/amount edits survive the round trip —
  // uids are stable (section + ingredient name) across that recompute.
  const lastRowsRef = useRef<RowData[] | null>(null);
  const lastBrewIdRef = useRef<string | null>(null);
  if (lastRowsRef.current !== rows) {
    const brewChanged = lastBrewIdRef.current !== brewId;
    lastRowsRef.current = rows;
    lastBrewIdRef.current = brewId;
    if (brewChanged) {
      setChecked(initialChecked);
      const amt: Record<string, string> = {};
      for (const r of rows) amt[r.uid] = fmtIngAmt(r.ingAmt, r.ingUnit);
      setAmounts(amt);
    } else {
      setChecked(prev => {
        const next = { ...prev };
        for (const r of rows) if (!(r.uid in next)) next[r.uid] = !r.alreadyLogged;
        return next;
      });
      setAmounts(prev => {
        const next = { ...prev };
        for (const r of rows) if (!(r.uid in next)) next[r.uid] = fmtIngAmt(r.ingAmt, r.ingUnit);
        return next;
      });
    }
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

  // Link a recipe ingredient to a library entry by saving libId onto the ingredient.
  // Also update the row's ledgerKey by rebuilding rows (rows is derived from store so
  // updating the ingredient triggers a re-render automatically).
  const resolveLink = (row: RowData, libEntry: LibEntry) => {
    // Find the matching recipe ingredient by name + section type
    const ingType = ING_TYPES[row.section];
    const recipeIng = ings.find(i => i.type === ingType && i.name === row.ingName);
    if (recipeIng && recipeId) {
      updateIngredient(recipeId, String(recipeIng.id), { libId: String(libEntry.id) });
    }
    setResolvingUid(null);
    setResolveSearch('');
    pushToast({ message: `Linked "${row.ingName}" → "${libEntry.name}"`, variant: 'success' });
  };

  const addToLibrary = (row: RowData) => {
    const newId = String(Date.now());
    const newEntry = { id: newId, name: row.ingName, supplier: '', notes: '' };
    if (row.section === 'malts') setMaltLib([...maltLib, newEntry as MaltLib]);
    else if (row.section === 'hops') setHopLib([...hopLib, newEntry as HopLib]);
    else if (row.section === 'yeast') setYeastLib([...yeastLib, newEntry as YeastLib]);
    else setMiscLib([...miscLib, newEntry as MiscLib]);
    resolveLink(row, newEntry as LibEntry);
    pushToast({ message: `Added "${row.ingName}" to ${row.section} library.`, variant: 'success' });
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
        // Empty string preserved (rather than dropped) so consumers can
        // tell "deliberately blank because the recipe has no taxBatch"
        // apart from "legacy entry pre-dating the field" — useful for
        // the forecast's matching fallback (see isBrewFullyRecorded).
        taxBatch: brewTaxBatch,
      };
      next[r.ledgerKey] = [...(next[r.ledgerKey] ?? []), entry];
      recorded++;
    }
    if (recorded > 0) {
      setLedgerData(next);
      // Re-check whether the brew is now fully recorded — if every
      // recipe ingredient has a matching ledger row (per ingNamesMatch +
      // brew-name-prefix match), set brew.fullyRecorded.
      const fullyRecorded = isBrewFullyRecorded(brew, ings, libBySection, next, brewTaxBatch);
      if (fullyRecorded && !brew.fullyRecorded) {
        setPlannerBrews(plannerBrews.map(b =>
          b.id === brew.id ? { ...b, fullyRecorded: true } : b));
      }
    }
    onClose();
    if (skipped.length) {
      pushToast({
        message: `Skipped (zero amount): ${skipped.join(', ')}`,
        variant: 'info',
      });
    }
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
                      <div>
                        <div
                          style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#f09420', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={e => { e.preventDefault(); setResolvingUid(resolvingUid === r.uid ? null : r.uid); setResolveSearch(''); }}
                        >⚠ not in library — click to fix</div>
                        {resolvingUid === r.uid && (() => {
                          const lib = libBySection[r.section];
                          const filtered = resolveSearch.trim()
                            ? lib.filter(e => e.name.toLowerCase().includes(resolveSearch.toLowerCase()))
                            : lib.slice(0, 8);
                          return (
                            <div style={{ marginTop: 4, background: 'var(--panel2)', border: '1px solid var(--border2)', padding: 6 }}>
                              <input
                                autoFocus
                                placeholder={`Search ${r.section}…`}
                                value={resolveSearch}
                                onChange={e => setResolveSearch(e.target.value)}
                                onClick={e => e.preventDefault()}
                                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 6px', outline: 'none', marginBottom: 4 }}
                              />
                              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                                {filtered.map(le => (
                                  <div
                                    key={String(le.id)}
                                    onClick={e => { e.preventDefault(); resolveLink(r, le); }}
                                    style={{ padding: '3px 6px', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--panel)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
                                  >{le.name}</div>
                                ))}
                                {filtered.length === 0 && (
                                  <div style={{ padding: '3px 6px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>No matches</div>
                                )}
                              </div>
                              <button
                                className="btn sm"
                                style={{ marginTop: 6, width: '100%' }}
                                onClick={e => { e.preventDefault(); addToLibrary(r); }}
                              >+ Add "{r.ingName}" to library</button>
                            </div>
                          );
                        })()}
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
  taxBatch: string,
): boolean {
  const sectionMap: Record<string, Section> = { grain: 'malts', hop: 'hops', yeast: 'yeast', misc: 'misc' };
  const tag = brew.name.toLowerCase().split(' ').slice(0, 2).join(' ');
  return ings.every(ing => {
    const sec = sectionMap[ing.type];
    if (!sec) return true; // unknown type skipped
    const lib = libBySection[sec].find(le => ingNamesMatch(le.name, ing.name, ing.libId, le.id));
    if (!lib) return true; // un-matchable rows skipped (HTML 15776)
    const key = `${sec}_${lib.id}`;
    // Prefer taxBatch-exact match when both the recipe and the entry
    // have one; fall back to brew-name substring for legacy entries
    // that pre-date the taxBatch column.
    return (ledgerData[key] ?? []).some(e => {
      if (e.used == null) return false;
      if (taxBatch && e.taxBatch && e.taxBatch === taxBatch) return true;
      return (e.beer ?? '').toLowerCase().includes(tag);
    });
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
