/**
 * Analysis tab — port of HTML page-analysis (line 1944) +
 * renderAnalysisPage (11122) + printAnalysis (11418).
 *
 * Aggregated read-only brew summary — pulls from recipe / tax record /
 * cold side / brew day / ferm log / ferm meta / settings, computes a cost
 * breakdown, and renders a printable A4 layout.
 *
 * Editable: only `cold['cs-analysis-notes']` (textarea at the bottom,
 * persisted via setColdSide → cold_side blob upsert).
 *
 * The HTML pulls some values straight from DOM elements (estOG/estFG/etc.
 * from the stats-bar `.textContent`, measBhEff from `bd-meas-bh-eff`); the
 * React port reads the same source data from the recipe object and brew-day
 * blob and recomputes those values.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../../store';
import { lsGet } from '../../lib/storage';
import { fmtNum } from '../../lib/format';
import {
  platoToSg, calcActualEfficiency,
} from '../../lib/calculations';
import { printHtml } from '../../lib/print';
import type {
  Ingredient, BrewDayData, FermLogEntry, FermMeta, ColdSideData,
  TaxRecord,
} from '../../types';

interface Props { recipeId: string }

const fmtY = (v: number): string =>
  v > 0 ? '¥' + Math.round(v).toLocaleString('ja-JP') : '—';
const orDash = (v: unknown): string => {
  if (v == null) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
};

// Same library-key map the HTML uses (renderAnalysisPage line 11161).
const LIB_KEY: Record<string, 'malts' | 'hops' | 'yeast' | 'misc'> = {
  grain: 'malts', hop: 'hops', yeast: 'yeast', misc: 'misc',
};

interface AggregatedNote { source: string; text: string }

export default function AnalysisTab({ recipeId }: Props) {
  // ── Store reads ──────────────────────────────────────────────────────
  const recipe       = useStore(s => s.recipes.find(r => r.id === recipeId));
  const settings     = useStore(s => s.settings);
  const maltLib      = useStore(s => s.maltLib);
  const hopLib       = useStore(s => s.hopLib);
  const yeastLib     = useStore(s => s.yeastLib);
  const miscLib      = useStore(s => s.miscLib);
  const getTaxRecord = useStore(s => s.getTaxRecord);
  const getColdSide  = useStore(s => s.getColdSide);
  const setColdSide  = useStore(s => s.setColdSide);
  const pushToast    = useStore(s => s.pushToast);

  // Subscribe so external edits to the cached tax/cold blobs trigger re-render.
  const taxRecordCache = useStore(s => s.taxRecordsByRecipe[recipeId]);
  void taxRecordCache;

  // ── Local state — only the editable analysis-notes textarea ──────────
  const [cs, setCs] = useState<ColdSideData>(() => getColdSide(recipeId));
  // Re-hydrate when switching recipes.
  useEffect(() => {
    setCs(getColdSide(recipeId));
  }, [recipeId, getColdSide]);

  // Debounced flush to ColdSide blob — same 400ms cadence as PackagingTab
  // (which also writes 'cs-analysis-notes' but isn't usually open at the
  // same time). If both tabs were open we'd race; in practice only one is.
  const flushTimer = useRef<number | null>(null);
  const updateNotes = useCallback((text: string) => {
    setCs(prev => ({ ...prev, 'cs-analysis-notes': text }));
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      setColdSide(recipeId, { ...getColdSide(recipeId), 'cs-analysis-notes': text });
    }, 400);
  }, [recipeId, setColdSide, getColdSide]);
  useEffect(() => () => {
    if (flushTimer.current != null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  // ── Derived: every read-only field on the page ───────────────────────
  const view = useMemo(() => {
    if (!recipe) return null;
    const rec  = getTaxRecord(recipeId) as TaxRecord;
    const cold = getColdSide(recipeId);
    const ings    = lsGet<Ingredient[]>(`bl_recipe_ings_${recipeId}`, []);
    const bd      = lsGet<BrewDayData>(`bl_bd_${recipeId}`, {});
    const fermLog = lsGet<FermLogEntry[]>(`bl_ferm_log_${recipeId}`, []);
    const fm      = lsGet<FermMeta>(`bl_ferm_meta_${recipeId}`, {});

    const beerName = recipe.beerName || rec['beer-name'] || '—';
    const recName  = recipe.name     || rec['recipe-name'] || '—';
    const style    = recipe.style    || '—';
    const brewNum  = orDash(rec['brew-num']);
    const brewDate = orDash(rec['date']);

    // Stats — recipe object is canonical in React (HTML reads from DOM).
    const estOG  = recipe.ogPlato ? fmtNum(recipe.ogPlato, { dp: 1 }) : '—';
    const estFG  = recipe.fgPlato ? fmtNum(recipe.fgPlato, { dp: 1 }) : '—';
    const estABV = recipe.abv     ? fmtNum(recipe.abv, { dp: 1, suffix: '%' }) : '—';
    const estIBU = recipe.ibu     ? fmtNum(recipe.ibu, { dp: 0 }) : '—';
    const batchL = recipe.batchL  ? String(recipe.batchL) : '—';
    const estBhEff = recipe.bhEff ? fmtNum(recipe.bhEff, { dp: 1, suffix: '%' }) : '—';

    // Measured values from the tax record
    const measOG  = orDash(rec['start-brix']);
    const measFG  = orDash(rec['finish-brix']);
    const measABV = orDash(rec['abv']);
    const sellable = orDash(rec['total-packaged']);

    // Measured brewhouse efficiency — recompute from brew-day measured OG
    // (HTML reads `bd-meas-bh-eff` from the DOM). measOg in BrewDayData is a
    // raw user string in °Plato; convert to SG first via platoToSg.
    let measBhEff = '—';
    const measOgPlato = parseFloat(String(bd.measOg ?? ''));
    if (isFinite(measOgPlato) && measOgPlato > 0 && recipe.batchL > 0) {
      const measSg = platoToSg(measOgPlato);
      const eff = calcActualEfficiency(ings, measSg, recipe.batchL);
      if (isFinite(eff) && eff > 0) measBhEff = fmtNum(eff, { dp: 1, suffix: '%' });
    }

    // Attenuation — real (from measured OG/FG) and plan (from recipe stats)
    let attenReal = '—', attenPlan = '—';
    const startP = parseFloat(String(rec['start-brix'] ?? ''));
    const finP   = parseFloat(String(rec['finish-brix'] ?? ''));
    if (isFinite(startP) && isFinite(finP) && startP > 0) {
      attenReal = fmtNum((startP - finP) / startP * 100, { dp: 0 });
    }
    if (recipe.ogPlato > 0 && recipe.fgPlato >= 0) {
      attenPlan = fmtNum((recipe.ogPlato - recipe.fgPlato) / recipe.ogPlato * 100, { dp: 0 });
    }

    // ── Cost breakdown (HTML lines 11157–11186) ──
    const shipMaltRate = settings.shipMalt ?? 0;
    const shipHopsRate = settings.shipHops ?? 0;
    const taxRate      = settings.orderTax ?? 0;
    const libByType = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };

    let ingCost = 0;
    for (const i of ings) {
      let c = parseFloat(String(i.cost)) || 0;
      if (c === 0) {
        const dataKey = LIB_KEY[i.type];
        if (dataKey) {
          const lib = libByType[dataKey] as Array<{ name: string; price?: number | string }>;
          const libE = lib.find(e => (e.name || '').toLowerCase() === (i.name || '').toLowerCase());
          const libPrice = parseFloat(String(libE?.price ?? '')) || 0;
          if (libPrice > 0) {
            const amtKg = (parseFloat(String(i.amt)) || 0) * (i.unit === 'g' ? 0.001 : 1);
            c = i.type === 'yeast' ? libPrice : libPrice * amtKg;
          }
        }
      }
      ingCost += c;
    }

    const totalGrainKg = ings.filter(i => i.type === 'grain').reduce((s, i) => {
      const kg = (parseFloat(String(i.amt)) || 0) * (i.unit === 'g' ? 0.001 : 1);
      return s + kg;
    }, 0);
    const totalHopKg = ings.filter(i => i.type === 'hop').reduce((s, i) => {
      const kg = (parseFloat(String(i.amt)) || 0)
        * (i.unit === 'g' ? 0.001 : i.unit === 'kg' ? 1 : 0);
      return s + kg;
    }, 0);

    const maltShipping = totalGrainKg * shipMaltRate;
    const hopShipping  = totalHopKg  * shipHopsRate;
    const taxAmt = taxRate > 0 ? (ingCost + maltShipping + hopShipping) * (taxRate / 100) : 0;
    const totalAdded = maltShipping + hopShipping + taxAmt;
    const grandTotal = ingCost + totalAdded;
    const sellableLiters = parseFloat(String(rec['snap-sell-total'] ?? ''))
                       || parseFloat(String(sellable))
                       || 0;
    const perLiter = sellableLiters > 0 ? grandTotal / sellableLiters : 0;

    // Keg / can rows
    const kegRows = cold['cs-keg-rows'] || [];
    const cans    = orDash(cold['cs-cans']);
    const canSize = cold['cs-can-size'] || '350';
    const cansN  = parseFloat(String(cold['cs-cans']));
    const sizeN  = parseFloat(String(canSize));
    const canL   = isFinite(cansN) && isFinite(sizeN) ? fmtNum(cansN * sizeN / 1000, { dp: 1 }) : '—';

    // Yeast info
    const yeastIng = ings.find(i => i.type === 'yeast');
    const yeastName = yeastIng?.name || '—';
    const yeastGen  = orDash(cold['cs-yeast-gen']);

    // Tasting / change / analysis notes
    const tastingNotes  = cold['cs-tasting-notes']  || '';
    const changeNotes   = cold['cs-changes-notes']  || '';

    // Aggregated process notes (HTML lines 11207–11217)
    const aggregated: AggregatedNote[] = [];
    if (bd.mashReadings?.notes) aggregated.push({ source: 'Mash Readings', text: bd.mashReadings.notes });
    if (bd.notes) aggregated.push({ source: 'Brew Day', text: bd.notes });
    for (const entry of fermLog) {
      if (entry.notes) aggregated.push({
        source: `Fermentation (${entry.date || 'no date'})`, text: entry.notes,
      });
    }
    for (const n of [1, 2, 3] as const) {
      const note = fm[`dh${n}-notes` as keyof FermMeta] as string | undefined;
      if (note) aggregated.push({ source: `Dry Hop ${n}`, text: note });
    }
    if (cold['cs-process-notes']) aggregated.push({
      source: 'Packaging — Process Notes', text: cold['cs-process-notes'],
    });

    // Package date — HTML reads v('pkg-date') (not in TAX_FIELDS) → falls
    // back to '—'. We surface the cold-side date if available.
    const pkgDate = orDash(rec['snap-pkg-date'] || cold['cs-keg-date'] || cold['cs-can-date']);

    return {
      beerName, recName, style, brewNum, brewDate, pkgDate,
      classification: orDash(rec['classification']),
      estOG, estFG, estABV, estIBU, batchL, estBhEff,
      measOG, measFG, measABV, sellable, measBhEff,
      attenReal, attenPlan,
      ingCost, maltShipping, hopShipping, taxAmt, totalAdded, grandTotal, perLiter,
      taxRate,
      kegRows, cans, canSize, canL,
      yeastName, yeastGen,
      tastingNotes, changeNotes,
      aggregated,
      pkgWaste: orDash(rec['snap-total-waste-pkg']),
    };
  }, [recipe, recipeId, settings, maltLib, hopLib, yeastLib, miscLib,
      getTaxRecord, getColdSide]);

  // ── Print handler ────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    if (!view) {
      pushToast({ message: 'No analysis data to print.', variant: 'info' });
      return;
    }
    const node = document.getElementById('analysis-printable');
    if (!node) {
      pushToast({ message: 'No analysis data to print.', variant: 'info' });
      return;
    }
    printHtml(node.outerHTML, {
      title: 'Brew Analysis — ' + view.beerName,
      pageSize: 'A4',
      landscape: false,
      extraStyles: `
        body { font-size: 10px; }
        h1, h2 { font-size: 14px; }
      `,
    });
  }, [view, pushToast]);

  if (!recipe) return <div className="empty">Select a recipe.</div>;
  if (!view) return null;

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--border2)',
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
          BREW ANALYSIS
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          Printable brew summary
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn" onClick={handlePrint}>🖨 Print / PDF</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <div id="analysis-printable" style={{
          maxWidth: 800, margin: '0 auto',
          fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text)',
        }}>
          {/* ── Title block ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 16,
            border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', background: 'var(--panel2)' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>
                {view.beerName}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                Recipe: {view.recName}
              </div>
            </div>
            <div style={{
              background: 'var(--panel)',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
              borderLeft: '1px solid var(--border2)',
            }}>
              <MetaCell label="Style" value={view.style} />
              <MetaCell label="Recipe #" value={view.recName} />
              <MetaCell label="Tax Batch #" value={view.brewNum} amber />
            </div>
          </div>

          {/* ── Brew info row 1 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            <Card label="Brew Date" value={view.brewDate} />
            <Card label="Package Date" value={view.pkgDate} />
            <Card label="Brewer" value="Ben" />
            <Card label="Classification" value={view.classification} />
          </div>

          {/* ── Brew info row 2 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            <Card label="ABV Measured"
                  value={view.measABV !== '—' ? view.measABV + '%' : '—'}
                  valueColor="var(--green)" />
            <Card label="Batch Size (L)" value={view.batchL} />
            <Card label="Sellable Liters" value={view.sellable} />
            <Card label="IBU" value={view.estIBU} />
          </div>

          {/* ── Cost breakdown ── */}
          <SectionPanel title="Cost Breakdown">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                borderRight: '1px solid var(--border2)',
              }}>
                <tbody>
                  <CostRow label="Ingredients"   value={fmtY(view.ingCost)} />
                  <CostRow label="Malt Shipping" value={fmtY(view.maltShipping)} />
                  <CostRow label="Hop Shipping"  value={fmtY(view.hopShipping)} />
                  <CostRow label={`Tax (${view.taxRate || 10}%)`}
                           value={fmtY(view.taxAmt)} last />
                </tbody>
              </table>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <CostRow label="Total Added" value={fmtY(view.totalAdded)} />
                  <tr style={{ background: 'var(--panel2)' }}>
                    <td style={costLabelCellBold}>Total</td>
                    <td style={{ ...costValueCellBold, color: 'var(--amber)' }}>
                      {fmtY(view.grandTotal)}
                    </td>
                  </tr>
                  <tr style={{ background: 'var(--panel2)' }}>
                    <td style={{ ...costLabelCellBold, borderBottom: 'none' }}>Per Litre</td>
                    <td style={{ ...costValueCellBold, color: 'var(--amber)', borderBottom: 'none' }}>
                      {view.perLiter > 0 ? '¥' + Math.round(view.perLiter).toLocaleString('ja-JP') : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionPanel>

          {/* ── Yeast & Fermentation + Packaging side by side ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {/* Yeast & Fermentation */}
            <SectionPanel title="Yeast & Fermentation">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={cellMutedNarrow}>Yeast</td>
                    <td style={cellBold}>{view.yeastName}</td>
                    <td style={cellMutedNarrow}>Generation</td>
                    <td style={cellNormal}>{view.yeastGen}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ padding: 0, background: 'var(--panel2)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={fermHeader}>Fermentation</th>
                            <th style={{ ...fermHeader, textAlign: 'right' }}>Real</th>
                            <th style={{ ...fermHeader, textAlign: 'right', borderRight: 'none' }}>Plan</th>
                          </tr>
                        </thead>
                        <tbody>
                          <FermRow label="Plato"       real={view.measOG}  plan={view.estOG} />
                          <FermRow label="Final Plato" real={view.measFG}  plan={view.estFG} />
                          <FermRow label="ABV"
                                   real={view.measABV !== '—' ? view.measABV + '%' : '—'}
                                   plan={view.estABV} />
                          <FermRow label="Efficiency"  real={view.measBhEff} plan={view.estBhEff} />
                          <FermRow label="Atten"
                                   real={view.attenReal !== '—' ? view.attenReal : '—'}
                                   plan={view.attenPlan !== '—' ? view.attenPlan : '0'} />
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </SectionPanel>

            {/* Packaging */}
            <SectionPanel title="Packaging">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={pkgHeader}>Type</th>
                    <th style={{ ...pkgHeader, textAlign: 'right' }}>Amount</th>
                    <th style={{ ...pkgHeader, textAlign: 'right', borderRight: 'none' }}>Liters</th>
                  </tr>
                </thead>
                <tbody>
                  {view.kegRows.length > 0 ? view.kegRows.map((r, i) => {
                    const sizeN = parseFloat(r.size) || 0;
                    const qtyN = parseFloat(r.qty) || 0;
                    const litres = sizeN * qtyN;
                    return (
                      <tr key={i}>
                        <td style={pkgCell}>{r.size}L Kegs</td>
                        <td style={{ ...pkgCell, textAlign: 'right' }}>{r.qty || '—'}</td>
                        <td style={{ ...pkgCell, textAlign: 'right' }}>{litres || '—'}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={3} style={{ ...pkgCell, color: 'var(--text-muted)' }}>—</td></tr>
                  )}
                  <tr>
                    <td style={pkgCell}>Cans ({view.canSize}ml)</td>
                    <td style={{ ...pkgCell, textAlign: 'right' }}>{view.cans}</td>
                    <td style={{ ...pkgCell, textAlign: 'right' }}>{view.canL}</td>
                  </tr>
                  <tr style={{ background: 'var(--panel2)' }}>
                    <td style={{ ...pkgCell, color: 'var(--text-muted)', fontSize: 10 }}>Packaging waste</td>
                    <td colSpan={2} style={{ ...pkgCell, textAlign: 'right', color: 'var(--red)' }}>
                      {view.pkgWaste}
                    </td>
                  </tr>
                </tbody>
              </table>
            </SectionPanel>
          </div>

          {/* ── Process Notes (aggregated) ── */}
          <SectionPanel title="Process Notes">
            {view.aggregated.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
                No process notes recorded yet.
              </div>
            ) : view.aggregated.map((n, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr',
                borderBottom: '1px solid var(--border)',
                fontSize: 11, lineHeight: 1.5,
              }}>
                <div style={{
                  padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 9,
                  color: 'var(--amber-dim)', background: 'var(--panel2)',
                  borderRight: '1px solid var(--border)',
                }}>{n.source}</div>
                <div style={{ padding: '7px 12px', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  {n.text}
                </div>
              </div>
            ))}
          </SectionPanel>

          {/* ── Tasting Notes (only if present) ── */}
          {view.tastingNotes && (
            <SectionPanel title="Tasting Notes">
              <div style={{ padding: '10px 14px', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {view.tastingNotes}
              </div>
            </SectionPanel>
          )}

          {/* ── Changes for Next Time (only if present) ── */}
          {view.changeNotes && (
            <SectionPanel title="Changes for Next Time">
              <div style={{ padding: '10px 14px', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {view.changeNotes}
              </div>
            </SectionPanel>
          )}

          {/* ── Analysis Notes (editable — only mutable field on the page) ── */}
          <SectionPanel title="Analysis Notes">
            <div style={{ padding: '8px 10px' }}>
              <textarea
                value={cs['cs-analysis-notes'] ?? ''}
                onChange={e => updateNotes(e.target.value)}
                placeholder="Lab results, sensory analysis, QA notes..."
                style={{
                  background: 'var(--panel2)', border: '1px solid var(--border2)',
                  color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 12,
                  padding: 8, width: '100%', height: 80, outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Layout primitives — kept inline; only used by this tab.
// ═══════════════════════════════════════════════════════════════════

function MetaCell({ label, value, amber }: { label: string; value: string; amber?: boolean }) {
  return (
    <div style={{ padding: '10px 14px', borderRight: '1px solid var(--border2)' }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 11,
        ...(amber ? { fontWeight: 700, color: 'var(--amber)' } : {}),
      }}>{value}</div>
    </div>
  );
}

function Card({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      background: 'var(--panel2)', border: '1px solid var(--border2)',
      borderRadius: 6, padding: '8px 12px',
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2,
      }}>{label}</div>
      <div style={{ fontWeight: 600, color: valueColor }}>{value}</div>
    </div>
  );
}

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--border2)', borderRadius: 8,
      overflow: 'hidden', marginBottom: 10,
    }}>
      <div style={{
        background: 'var(--panel)', padding: '6px 12px',
        fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1.5,
        textTransform: 'uppercase', color: 'var(--amber-dim)',
      }}>{title}</div>
      {children}
    </div>
  );
}

function CostRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <tr>
      <td style={{
        padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)',
        ...(last ? {} : { borderBottom: '1px solid var(--border)' }),
      }}>{label}</td>
      <td style={{
        padding: '6px 12px', fontSize: 11, fontWeight: 600,
        textAlign: 'right', fontFamily: 'var(--mono)',
        ...(last ? {} : { borderBottom: '1px solid var(--border)' }),
      }}>{value}</td>
    </tr>
  );
}

function FermRow({ label, real, plan }: { label: string; real: string; plan: string }) {
  return (
    <tr>
      <td style={fermCellLabel}>{label}</td>
      <td style={fermCellReal}>{real}</td>
      <td style={fermCellPlan}>{plan}</td>
    </tr>
  );
}

// ─── shared cell styles ───
const cellMutedNarrow: React.CSSProperties = {
  padding: '6px 12px', borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)', fontSize: 10, width: 120,
};
const cellBold: React.CSSProperties = {
  padding: '6px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600,
};
const cellNormal: React.CSSProperties = {
  padding: '6px 12px', borderBottom: '1px solid var(--border)',
};
const fermHeader: React.CSSProperties = {
  padding: '5px 12px', fontFamily: 'var(--mono)', fontSize: 8,
  textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left',
  borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
};
const fermCellLabel: React.CSSProperties = {
  padding: '5px 12px', borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', fontSize: 10,
};
const fermCellReal: React.CSSProperties = {
  padding: '5px 12px', borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)', textAlign: 'right',
  fontWeight: 600, color: 'var(--amber)',
};
const fermCellPlan: React.CSSProperties = {
  padding: '5px 12px', borderBottom: '1px solid var(--border)',
  textAlign: 'right', color: 'var(--text-muted)',
};
const pkgHeader: React.CSSProperties = {
  padding: '5px 12px', fontFamily: 'var(--mono)', fontSize: 8,
  textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left',
  borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
};
const pkgCell: React.CSSProperties = {
  border: '1px solid var(--border)', padding: '5px 12px',
};
const costLabelCellBold: React.CSSProperties = {
  padding: '8px 12px', fontSize: 10, fontWeight: 700,
  borderBottom: '1px solid var(--border2)',
};
const costValueCellBold: React.CSSProperties = {
  padding: '8px 12px', fontSize: 13, fontWeight: 700,
  textAlign: 'right', fontFamily: 'var(--mono)',
  borderBottom: '1px solid var(--border2)',
};
