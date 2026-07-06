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
import {
  getGSheetsConfig, gsheetsGetToken, gsheetsAppendRow,
  gsheetsSheetIdForSection, gsheetsTabNameFor,
} from '../../lib/gsheets';

const EXCLUDE_MISC = /phosphoric|sulfuric|lactic|hydrochloric|caustic|water|h2o|calcium.chloride|calcium.sulfate|gypsum|magnesium.sulfate|sodium.chloride|epsom|baking.soda|chalk|calcium.carbonate|\bsalts?\b/i;
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
  const [blockingPopup, setBlockingPopup] = useState<{
    nolibRows: RowData[];
    lowStockRows: { row: RowData; onHand: number; recording: number }[];
  } | null>(null);
  // In-popup resolver (Find Match / Add to Library) — only one row open
  // at a time, same pattern as the main modal's resolvingUid.
  const [popupResolvingUid, setPopupResolvingUid] = useState<string | null>(null);
  const [popupResolveSearch, setPopupResolveSearch] = useState('');
  // Which main-modal row has its inline stock-adjust panel open, and
  // the pending "new on-hand (kg)" input for it. Only one open at once.
  const [adjustingUid, setAdjustingUid] = useState<string | null>(null);
  const [adjustInput, setAdjustInput] = useState('');
  // Deferred-record flag: resolving the last nolib row can't call
  // doRecord() synchronously because `rows` hasn't recomputed the new
  // ledgerKey yet. Set this instead and let the effect below fire once
  // no row carries a nolib_ key.
  const [pendingRecord, setPendingRecord] = useState(false);

  // Opening balances by ledgerKey, from localStorage. Re-read whenever
  // ledgerData changes so on-hand math below stays consistent with the
  // rest of the inventory ledger.
  const invStock = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('bl_inv_stock') || '{}'); } catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerData]);

  // On-hand stock (kg) for a ledger key: opening balance + all IN - all
  // OUT. nolib_ keys have no tracked stock, so they read 0.
  const getOnHand = (ledgerKey: string): number => {
    if (ledgerKey.startsWith('nolib_')) return 0;
    const entries = ledgerData[ledgerKey] ?? [];
    const opening = parseFloat(invStock[ledgerKey]) || 0;
    return entries.reduce((bal, e) => {
      if (e.got) bal += parseFloat(String(e.got)) || 0;
      if (e.used) bal -= parseFloat(String(e.used)) || 0;
      return bal;
    }, opening);
  };

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

  // Gate RECORD USAGE: block on ingredients that aren't in the library
  // (nolib_) or that would drive on-hand stock negative. Either surfaces
  // the blocking popup; a clean pass records straight through.
  const confirm = () => {
    if (!brew) return;
    const nolibRows = rows.filter(r => checked[r.uid] && !r.alreadyLogged && r.ledgerKey.startsWith('nolib_'));
    const lowStockRows: { row: RowData; onHand: number; recording: number }[] = [];
    for (const r of rows) {
      if (!checked[r.uid] || r.alreadyLogged || r.ledgerKey.startsWith('nolib_')) continue;
      const rawAmt = parseFloat(amounts[r.uid] || '') || 0;
      if (rawAmt <= 0) continue;
      const qtyKg = toKgForLedger(rawAmt, r.ingUnit);
      const entries = ledgerData[r.ledgerKey] ?? [];
      const opening = parseFloat(invStock[r.ledgerKey]) || 0;
      const onHand = entries.reduce((bal, e) => {
        if (e.got) bal += parseFloat(String(e.got)) || 0;
        if (e.used) bal -= parseFloat(String(e.used)) || 0;
        return bal;
      }, opening);
      if (qtyKg > onHand) lowStockRows.push({ row: r, onHand, recording: qtyKg });
    }
    if (nolibRows.length > 0 || lowStockRows.length > 0) {
      setPopupResolvingUid(null);
      setPopupResolveSearch('');
      setBlockingPopup({ nolibRows, lowStockRows });
      return;
    }
    doRecord();
  };

  const doRecord = () => {
    if (!brew) return;
    const dateStr = date || dateToStr(todayDate());
    const next: LedgerData = { ...ledgerData };
    let recorded = 0;
    const skipped: string[] = [];
    const gsheetsQueue: { section: Section; ingName: string; qtyKg: number }[] = [];
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
      gsheetsQueue.push({ section: r.section, ingName: r.ingName, qtyKg });
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

      // Best-effort Google Sheets push — fire-and-forget, never blocks
      // closing the modal. Column order matches the XLSX ledger export.
      const token = gsheetsGetToken();
      if (token) {
        const { sheetIds } = getGSheetsConfig();
        const beerNote = brewTaxBatch ? `${brewTaxBatch} — ${brew.name}` : brew.name;
        for (const q of gsheetsQueue) {
          const sheetId = gsheetsSheetIdForSection(q.section, sheetIds);
          if (!sheetId) continue;
          const tabName = gsheetsTabNameFor(q.ingName);
          gsheetsAppendRow(token, sheetId, tabName, [
            dateStr, 'OUT', q.qtyKg, beerNote, '', dateStr, '', '',
          ]).catch(() => { /* best-effort — never block confirm */ });
        }
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

  // Called after a nolib row is linked/added from inside the popup.
  // Drops the row from nolibRows; if that empties the nolib list and
  // there are no low-stock issues left, close the popup and record.
  const afterPopupResolve = (r: RowData) => {
    setPopupResolvingUid(null);
    setPopupResolveSearch('');
    const prev = blockingPopup;
    if (!prev) return;
    const nextNolib = prev.nolibRows.filter(nr => nr.uid !== r.uid);
    if (nextNolib.length === 0 && prev.lowStockRows.length === 0) {
      // Defer: `rows` still holds the old nolib_ ledgerKey for the
      // just-resolved ingredient. The effect fires doRecord() once the
      // recompute lands (no row carries a nolib_ key).
      setBlockingPopup(null);
      setPendingRecord(true);
    } else {
      setBlockingPopup({ ...prev, nolibRows: nextNolib });
    }
  };

  // Inline stock correction from a main-modal row: write a got/used
  // ledger entry that brings computed on-hand to the entered kg value.
  // Because ledgerData lives in the store and invStock/rows key off it,
  // every row sharing this ledgerKey re-renders with fresh numbers.
  const applyAdjust = (r: RowData) => {
    const newOnHand = parseFloat(adjustInput);
    if (!isFinite(newOnHand) || newOnHand < 0) return;
    const currentOnHand = getOnHand(r.ledgerKey);
    const correction = newOnHand - currentOnHand;
    if (correction === 0) {
      pushToast({ message: 'Already at that level', variant: 'info' });
      setAdjustingUid(null);
      return;
    }
    const dateStr = dateToStr(todayDate());
    const entry: LedgerEntry = correction > 0
      ? { date: dateStr, got: correction, beer: 'Brew day correction', correctionNote: 'Brew day correction' }
      : { date: dateStr, used: Math.abs(correction), beer: 'Brew day correction', correctionNote: 'Brew day correction' };
    const next: LedgerData = { ...ledgerData, [r.ledgerKey]: [...(ledgerData[r.ledgerKey] ?? []), entry] };
    setLedgerData(next);
    pushToast({
      message: `Stock corrected: ${currentOnHand.toFixed(2)} → ${newOnHand.toFixed(2)} kg`,
      variant: 'success',
    });
    setAdjustingUid(null);
  };

  // Fire the deferred record once the resolved ingredient's row has
  // recomputed its real ledgerKey (no row left on a nolib_ key).
  useEffect(() => {
    if (!pendingRecord) return;
    if (rows.some(r => r.ledgerKey.startsWith('nolib_'))) return;
    setPendingRecord(false);
    doRecord();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecord, rows]);

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
    <>
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>RECORD INGREDIENT USAGE</div>
        <div style={brewNameStyle}>{brew.name.toUpperCase()}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label style={miniLabelStyle}>BREW DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
        </div>

        <div style={subHeaderStyle}>SELECT INGREDIENTS TO RECORD:</div>

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
              const isLib = !r.ledgerKey.startsWith('nolib_');
              const onHand = isLib ? getOnHand(r.ledgerKey) : 0;
              const recKg = toKgForLedger(parseFloat(amounts[r.uid] || '') || 0, r.ingUnit);
              const stockColor = onHand <= 0 ? '#d64545' : onHand >= recKg ? '#3a8a3a' : '#f09420';
              elements.push(
                <div key={r.uid}>
                <label style={{
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
                  {isLib && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: stockColor, whiteSpace: 'nowrap' }}>
                        Stock: {fmtStockKg(onHand, r.ingUnit)}
                      </span>
                      <button
                        className="btn sm"
                        onClick={e => { e.preventDefault(); setAdjustingUid(r.uid); setAdjustInput(getOnHand(r.ledgerKey).toFixed(2)); }}
                      >Adjust</button>
                    </div>
                  )}
                  {r.alreadyLogged && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: '#3a8a3a', flexShrink: 0 }}>
                      ✓ logged
                    </span>
                  )}
                </label>
                {adjustingUid === r.uid && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderBottom: '1px solid var(--border)',
                    background: 'var(--panel2)',
                  }}>
                    <input
                      type="number" min={0} step={0.1} autoFocus
                      value={adjustInput}
                      onChange={e => setAdjustInput(e.target.value)}
                      style={amtInputStyle}
                    />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>kg on hand</span>
                    <button className="btn sm" onClick={() => applyAdjust(r)}>Update</button>
                    <button className="btn sm" onClick={() => setAdjustingUid(null)}>Cancel</button>
                  </div>
                )}
                </div>,
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

    {blockingPopup !== null && (() => {
      const { nolibRows, lowStockRows } = blockingPopup;
      const hasNolib = nolibRows.length > 0;
      const hasLowStock = lowStockRows.length > 0;
      return (
        <div style={blockOverlayStyle} onMouseDown={() => setBlockingPopup(null)}>
          <div style={blockModalStyle} onMouseDown={e => e.stopPropagation()}>
            <div style={blockTitleStyle}>CANNOT RECORD — ACTION REQUIRED</div>

            {hasNolib && (
              <div style={{ marginTop: 14 }}>
                <div style={blockHeadingStyle}>These ingredients aren't in your library:</div>
                <div style={blockListStyle}>
                  {nolibRows.map(r => (
                    <div key={r.uid} style={blockItemStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {r.ingName} <span style={{ color: 'var(--text-muted)' }}>[{r.section}]</span>
                        </div>
                        <button
                          className="btn sm"
                          onClick={() => { setPopupResolvingUid(popupResolvingUid === r.uid ? null : r.uid); setPopupResolveSearch(''); }}
                        >Find Match</button>
                        <button
                          className="btn sm"
                          onClick={() => { addToLibrary(r); afterPopupResolve(r); }}
                        >Add to Library</button>
                      </div>
                      {popupResolvingUid === r.uid && (() => {
                        const lib = libBySection[r.section];
                        const filtered = popupResolveSearch.trim()
                          ? lib.filter(e => e.name.toLowerCase().includes(popupResolveSearch.toLowerCase()))
                          : lib.slice(0, 8);
                        return (
                          <div style={{ marginTop: 6, background: 'var(--panel2)', border: '1px solid var(--border2)', padding: 6 }}>
                            <input
                              autoFocus
                              placeholder={`Search ${r.section}…`}
                              value={popupResolveSearch}
                              onChange={e => setPopupResolveSearch(e.target.value)}
                              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 6px', outline: 'none', marginBottom: 4 }}
                            />
                            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                              {filtered.map(le => (
                                <div
                                  key={String(le.id)}
                                  onClick={() => { resolveLink(r, le); afterPopupResolve(r); }}
                                  style={{ padding: '3px 6px', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--panel)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
                                >{le.name}</div>
                              ))}
                              {filtered.length === 0 && (
                                <div style={{ padding: '3px 6px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>No matches</div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
                <div style={blockNoteStyle}>
                  Link each ingredient to a library entry ("Find Match") or add it as a new one ("Add to Library").
                </div>
              </div>
            )}

            {hasLowStock && (
              <div style={{ marginTop: 14 }}>
                <div style={blockHeadingStyle}>These ingredients exceed current stock:</div>
                <div style={blockListStyle}>
                  {lowStockRows.map(({ row, onHand, recording }) => (
                    <div key={row.uid} style={blockItemStyle}>
                      <div>{row.ingName}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8, marginTop: 2 }}>
                        Recording: {fmtStockKg(recording, row.ingUnit)} — On hand: {fmtStockKg(onHand, row.ingUnit)}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={blockNoteStyle}>
                  Go back and use each ingredient's "Adjust" button to correct stock, or record as-is.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              {hasNolib ? (
                <button className="btn primary" style={{ flex: 1 }} onClick={() => setBlockingPopup(null)}>
                  GO BACK AND FIX
                </button>
              ) : (
                <>
                  <button className="btn" style={{ flex: 1 }} onClick={() => setBlockingPopup(null)}>
                    GO BACK AND ADJUST
                  </button>
                  <button
                    className="btn"
                    style={{ flex: 1, color: 'var(--red, #d64545)', borderColor: 'var(--red, #d64545)' }}
                    onClick={() => { doRecord(); setBlockingPopup(null); }}
                  >
                    RECORD ANYWAY
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

// Format a kg stock figure in the ingredient's display unit (grams for
// 'g', otherwise kg), 1 dp with a trailing ".0" stripped.
function fmtStockKg(kg: number, unit: string): string {
  const val = unit === 'g' ? kg * 1000 : kg;
  const s = val.toFixed(1).replace(/\.0$/, '');
  return `${s}${unit === 'g' ? 'g' : 'kg'}`;
}

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

// ─── Blocking popup styles ───────────────────────────────────────────

const blockOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210,
};

const blockModalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '2px solid var(--red, #d64545)',
  padding: '18px 20px', width: 440, maxWidth: '95vw',
  maxHeight: '90vh', overflowY: 'auto',
};

const blockTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2,
  color: 'var(--red, #d64545)', paddingBottom: 8,
  borderBottom: '1px solid var(--red, #d64545)',
};

const blockHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
  color: 'var(--text)', marginBottom: 6, fontWeight: 700,
};

const blockListStyle: React.CSSProperties = {
  border: '1px solid var(--border)', background: 'var(--bg)',
};

const blockItemStyle: React.CSSProperties = {
  padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 10,
  color: 'var(--text)', borderBottom: '1px solid var(--border)',
};

const blockNoteStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  marginTop: 6, lineHeight: 1.5,
};
