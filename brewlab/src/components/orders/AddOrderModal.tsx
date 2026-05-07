/**
 * Add Order modal — port of brewlab-desktop.html lines 14798–15116
 * (openAddOrderModal / saveAllOrders + helpers).
 *
 * Three-column layout (1100px-wide modal):
 *   • LEFT (240) — FOR THESE BREWS: checkboxes for upcoming
 *     not-yet-fully-recorded brews. Default OFF (HTML 14843); ticking
 *     refreshes the suggestions live.
 *   • MIDDLE (300) — SUGGESTED: short-stock items computed from the
 *     selected brews, grouped by supplier. Each row has a checkbox
 *     and an "Add Selected to Order" button.
 *   • RIGHT (flex 1) — MY ORDER: staged items grouped by supplier
 *     with delete ✕. Below: collapsible Add Manually form. Bottom:
 *     "📋 Create Order" button → reveals the Order Details panel with
 *     fallback supplier + order date + ✓ CREATE ORDER / 🖨 PRINT.
 *
 * On confirm:
 *   • Push each staged item to bl_orders with a fresh id.
 *   • Push a matching IN ledger entry per item that has a library
 *     match — so the forecast picks up the order as incoming stock
 *     immediately. Same as HTML saveAllOrders 15082–15094.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { dateToStr, todayDate } from '../../lib/dates';
import { fmtKg } from '../../lib/units';
import {
  suggestShortItems, type LibBySection, type LibSection, type Suggestion,
} from './orderForecast';
import { applyLedgerInserts, buildOrderLedgerEntry } from './orderLedgerSync';
import type { OrderEntry } from '../../types';

interface Props {
  onClose: () => void;
}

interface StagedItem {
  type: LibSection;
  ingredient: string;
  qty: number;
  supplier: string;
  delivery: string;
  status: 'pending' | 'ordered' | 'received';
  notes: string;
}

const TYPE_COLORS: Record<LibSection, string> = {
  malts: 'var(--amber)', hops: 'var(--green)', yeast: 'var(--blue)', misc: 'var(--text-muted)',
};
const TYPE_LABELS: Record<LibSection, string> = {
  malts: 'MALT', hops: 'HOP', yeast: 'YEAST', misc: 'ADJ',
};

export default function AddOrderModal({ onClose }: Props) {
  const plannerBrews   = useStore(s => s.plannerBrews);
  const orders         = useStore(s => s.orders);
  const setOrders      = useStore(s => s.setOrders);
  const ledgerData     = useStore(s => s.ledgerData);
  const setLedgerData  = useStore(s => s.setLedgerData);
  const pushToast      = useStore(s => s.pushToast);
  const inventoryStock = useStore(s => s.inventoryStock);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const loadIngredients     = useStore(s => s.loadIngredients);
  const settings   = useStore(s => s.settings);
  const suppliers  = useStore(s => s.suppliers);
  const maltLib    = useStore(s => s.maltLib);
  const hopLib     = useStore(s => s.hopLib);
  const yeastLib   = useStore(s => s.yeastLib);
  const miscLib    = useStore(s => s.miscLib);

  // Lazy-prime ingredients for any brew the user might select.
  useEffect(() => {
    for (const b of plannerBrews) {
      if (b.recipeId && ingredientsByRecipe[b.recipeId] === undefined) {
        loadIngredients(b.recipeId);
      }
    }
  }, [plannerBrews, ingredientsByRecipe, loadIngredients]);

  // Filter to upcoming brews not fully recorded (HTML 14830).
  const filterableBrews = useMemo(
    () => plannerBrews
      .filter(b => b.recipeId && !b.fullyRecorded)
      .slice()
      .sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    [plannerBrews],
  );

  // ── Brew filter (left) ──
  const [brewChecked, setBrewChecked] = useState<Record<string, boolean>>({});
  const checkedBrews = useMemo(
    () => filterableBrews.filter(b => brewChecked[b.id]),
    [filterableBrews, brewChecked],
  );

  // ── Suggestions (middle) ──
  const libBySection: LibBySection = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };
  const suggestions = useMemo(() => suggestShortItems(
    checkedBrews, libBySection, inventoryStock, ledgerData,
    recipeId => ingredientsByRecipe[recipeId] ?? [],
  ), [checkedBrews, libBySection, inventoryStock, ledgerData, ingredientsByRecipe]);
  const [sugChecked, setSugChecked] = useState<Record<number, boolean>>({});

  // Reset checks when suggestions list shape changes.
  useEffect(() => {
    setSugChecked({});
  }, [checkedBrews]);

  // ── Staged (right) ──
  const [staged, setStaged] = useState<StagedItem[]>([]);

  // Manual add form state.
  const [manualOpen, setManualOpen]  = useState(false);
  const [manualType, setManualType]  = useState<LibSection>('malts');
  const [manualIng, setManualIng]    = useState<string>('');
  const [manualQty, setManualQty]    = useState<string>('25');
  const [manualSupp, setManualSupp]  = useState<string>('');
  const [manualDel, setManualDel]    = useState<string>('');
  const [manualStatus, setManualStatus] = useState<'pending'|'ordered'|'received'>('pending');
  const [manualNotes, setManualNotes] = useState<string>('');

  // Log-order panel state.
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [globalSupplier, setGlobalSupplier] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>(dateToStr(todayDate()));

  // Re-seed manual ingredient when type changes.
  useEffect(() => {
    const list = libBySection[manualType];
    if (!list.length) { setManualIng(''); return; }
    if (!list.some(e => e.name === manualIng)) setManualIng(list[0].name);
  }, [manualType, libBySection, manualIng]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Handlers ──
  const toggleBrew = (id: string) =>
    setBrewChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const allBrews = (val: boolean) => {
    const next: Record<string, boolean> = {};
    for (const b of filterableBrews) next[b.id] = val;
    setBrewChecked(next);
  };
  const toggleSug = (i: number) =>
    setSugChecked(prev => ({ ...prev, [i]: !prev[i] }));
  const allSug = (val: boolean) => {
    const next: Record<number, boolean> = {};
    suggestions.forEach((_, i) => { next[i] = val; });
    setSugChecked(next);
  };

  const addCheckedSuggestions = () => {
    let added = 0;
    const nextStaged = staged.slice();
    suggestions.forEach((s, i) => {
      if (!sugChecked[i]) return;
      const dup = nextStaged.some(x => x.ingredient === s.ingredient && x.type === s.type);
      if (dup) return;
      nextStaged.push({
        type: s.type, ingredient: s.ingredient, qty: s.qty,
        supplier: s.supplier || '', delivery: s.delivery,
        status: s.status, notes: s.notes,
      });
      added++;
    });
    if (added) setStaged(nextStaged);
  };

  const addManual = () => {
    const qty = parseFloat(manualQty) || 0;
    if (!manualIng || qty <= 0) return;
    setStaged(prev => [...prev, {
      type: manualType,
      ingredient: manualIng,
      qty,
      supplier: manualSupp.trim(),
      delivery: manualDel,
      status: manualStatus,
      notes: manualNotes.trim(),
    }]);
    // Reset for next item, keep type/supplier/delivery.
    setManualQty('25');
  };

  const removeStaged = (i: number) =>
    setStaged(prev => prev.filter((_, idx) => idx !== i));

  const confirmAndLog = () => {
    if (!staged.length) { onClose(); return; }
    const date = orderDate || dateToStr(todayDate());
    const fallback = globalSupplier;
    // Snapshot before any cascade so the toast's undo restores both
    // orders AND ledgerData. Ledger touches are conditional on
    // status==='received' but we capture both unconditionally — the
    // closure's setLedgerData(beforeLedger) is a safe no-op when the
    // action didn't actually mutate ledgerData.
    const beforeOrders = orders;
    const beforeLedger = ledgerData;

    // Build the new orders. Ledger writes are conditional on
    // status==='received' — see ../orderLedgerSync.ts for the invariant.
    const newOrders: OrderEntry[] = [];
    const ledgerInserts: { key: string; entry: import('../../types').LedgerEntry }[] = [];
    for (const it of staged) {
      const supplier = it.supplier || fallback;
      const idSeed = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const order: OrderEntry = {
        id: idSeed,
        type: it.type,
        ingredient: it.ingredient,
        qty: it.qty,
        supplier,
        delivery: it.delivery || date,
        status: it.status,
        notes: it.notes,
        orderDate: date,
      };
      newOrders.push(order);
      // Only write a ledger IN entry when the order is logged with
      // status='received' from the start. The vast majority of orders
      // are logged pending/ordered and only flip to received later via
      // the Edit Order modal — at which point the ledger entry is
      // created. This keeps the ledger == received-orders invariant.
      if (it.status === 'received') {
        const built = buildOrderLedgerEntry(order, libBySection);
        if (built) ledgerInserts.push(built);
      }
    }
    setOrders([...orders, ...newOrders]);
    if (ledgerInserts.length) {
      setLedgerData(applyLedgerInserts(ledgerData, ledgerInserts));
    }
    pushToast({
      message: newOrders.length === 1
        ? `Created order for "${newOrders[0].ingredient}"`
        : `Created ${newOrders.length} orders`,
      undo: () => {
        setOrders(beforeOrders);
        setLedgerData(beforeLedger);
      },
    });
    onClose();
  };

  const printOrderList = () => {
    const supp = globalSupplier;
    const date = orderDate || dateToStr(todayDate());
    const win = window.open('', '_blank', 'width=700,height=600');
    if (!win) {
      window.alert('Popup blocked. Allow popups for this site to print the order list.');
      return;
    }
    const brand = (settings.breweryName?.trim() || 'BrewLab');
    const rows = staged.map(it => `
      <tr>
        <td>${escapeHtml(it.ingredient)}</td>
        <td style="text-align:right">${it.qty} kg</td>
        <td>${escapeHtml(it.supplier || supp)}</td>
        <td>${escapeHtml(it.notes || '')}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Order List — ${date}</title>
<style>
  body{font-family:monospace;font-size:12px;padding:24px;color:#111;}
  h2{margin:0 0 4px;font-size:18px;}
  p{margin:0 0 16px;color:#555;font-size:11px;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;border-bottom:2px solid #333;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
  td{padding:6px 8px;border-bottom:1px solid #ddd;}
  .footer{margin-top:24px;font-size:10px;color:#888;}
</style></head><body>
<h2>${escapeHtml(brand)} — Order List</h2>
<p>Date: ${date}${supp ? ' · Supplier: '+escapeHtml(supp) : ''} · ${staged.length} item${staged.length !== 1 ? 's' : ''}</p>
<table>
  <thead><tr><th>Ingredient</th><th style="text-align:right">Qty</th><th>Supplier</th><th>Notes</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Printed from BrewLab</div>
<script>window.onload=()=>setTimeout(()=>window.print(),200);<\/script>
</body></html>`);
    win.document.close();
  };

  // Group helpers for grid rendering.
  const groupedSuggestions = useMemo(() => {
    const m: Record<string, { sug: Suggestion; i: number }[]> = {};
    suggestions.forEach((s, i) => {
      const k = s.supplier || '— No Supplier —';
      if (!m[k]) m[k] = [];
      m[k].push({ sug: s, i });
    });
    return m;
  }, [suggestions]);

  const groupedStaged = useMemo(() => {
    const m: Record<string, { item: StagedItem; i: number }[]> = {};
    staged.forEach((item, i) => {
      const k = item.supplier || '— No Supplier —';
      if (!m[k]) m[k] = [];
      m[k].push({ item, i });
    });
    return m;
  }, [staged]);

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>

        {/* LEFT — brew filter */}
        <div style={leftColStyle}>
          <div style={colHeaderStyle}>
            <div style={colTitleStyle}>FOR THESE BREWS</div>
            <div style={colHintStyle}>Check brews to include in suggestions</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn sm" style={{ fontSize: 9 }} onClick={() => allBrews(true)}>All</button>
              <button className="btn sm" style={{ fontSize: 9 }} onClick={() => allBrews(false)}>None</button>
            </div>
          </div>
          <div style={listScrollStyle}>
            {filterableBrews.length === 0 ? (
              <div style={emptyStyle}>No upcoming brews in planner.</div>
            ) : filterableBrews.map(b => (
              <div
                key={b.id}
                onClick={() => toggleBrew(b.id)}
                style={brewRowStyle}
              >
                <input
                  type="checkbox"
                  checked={!!brewChecked[b.id]}
                  onChange={() => toggleBrew(b.id)}
                  style={{ accentColor: 'var(--amber)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={brewNameStyle}>{b.name}</div>
                  <div style={brewDateStyle}>{b.start ? b.start.slice(5).replace('-', '/') : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MIDDLE — suggestions */}
        <div style={middleColStyle}>
          <div style={colHeaderStyle}>
            <div style={colTitleStyle}>SUGGESTED</div>
            <div style={colHintStyle}>SHORT items from selected brews · grouped by supplier</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn sm" style={{ fontSize: 9 }} onClick={() => allSug(true)}>All</button>
              <button className="btn sm" style={{ fontSize: 9 }} onClick={() => allSug(false)}>None</button>
            </div>
          </div>
          <div style={listScrollStyle}>
            {!checkedBrews.length ? (
              <div style={{ ...emptyStyle, whiteSpace: 'pre-line' as const }}>
                {'Select brews on the left ←\nto see suggested items.'}
              </div>
            ) : suggestions.length === 0 ? (
              <div style={emptyStyle}>No SHORT ingredients for selected brews.</div>
            ) : Object.keys(groupedSuggestions).sort().map(supplierKey => (
              <div key={supplierKey}>
                <div style={supplierHeaderStyle}>{supplierKey}</div>
                {groupedSuggestions[supplierKey].map(({ sug, i }) => (
                  <div key={i} style={sugRowStyle}>
                    <input
                      type="checkbox"
                      checked={!!sugChecked[i]}
                      onChange={() => toggleSug(i)}
                      style={{ accentColor: 'var(--amber)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={brewNameStyle}>{sug.ingredient}</div>
                      <div style={brewDateStyle}>
                        <span style={{ color: TYPE_COLORS[sug.type] }}>{TYPE_LABELS[sug.type]}</span>
                        {' '} · order {fmtKg(sug.qty)} kg · short {sug.shortfall.toFixed(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              className="btn primary"
              style={{ width: '100%', fontSize: 10 }}
              onClick={addCheckedSuggestions}
            >Add Selected to Order →</button>
          </div>
        </div>

        {/* RIGHT — staged + create/manual */}
        <div style={rightColStyle}>
          <div style={colHeaderStyle}>
            <div style={colTitleStyle}>MY ORDER</div>
            <div style={colHintStyle}>Items to order — grouped by supplier</div>
          </div>
          <div style={{ ...listScrollStyle, minHeight: 80 }}>
            {staged.length === 0 ? (
              <div style={{
                padding: '24px 16px', fontFamily: 'var(--mono)', fontSize: 9,
                color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'pre-line' as const,
              }}>{'No items yet —\n← pick from suggested or add manually below'}</div>
            ) : Object.keys(groupedStaged).sort().map(supplierKey => (
              <div key={supplierKey}>
                <div style={supplierHeaderStyle}>{supplierKey}</div>
                {groupedStaged[supplierKey].map(({ item, i }) => (
                  <div key={i} style={stagedRowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={brewNameStyle}>{item.ingredient}</div>
                      <div style={brewDateStyle}>
                        {item.qty} kg · <span style={{ color: STATUS_COLORS[item.status] }}>{item.status}</span>
                      </div>
                      {item.delivery && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>
                          Exp. {item.delivery}
                        </div>
                      )}
                    </div>
                    <span
                      onClick={() => removeStaged(i)}
                      title="Remove"
                      style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '2px 4px' }}
                    >✕</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Order-details panel — toggled */}
          {logPanelOpen ? (
            <div style={logPanelStyle}>
              <div style={{
                fontFamily: 'var(--display)', fontSize: 11, letterSpacing: 2,
                color: 'var(--amber)', marginBottom: 2,
              }}>ORDER DETAILS</div>
              <Row label="FALLBACK SUPPLIER">
                <select value={globalSupplier} onChange={e => setGlobalSupplier(e.target.value)} style={inputStyle}>
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="ORDER DATE">
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={inputStyle} />
              </Row>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button className="btn primary" style={{ flex: 1, fontSize: 10 }} onClick={confirmAndLog}>
                  ✓ CREATE ORDER
                </button>
                <button className="btn" style={{ fontSize: 10 }} onClick={printOrderList}>🖨 PRINT</button>
                <button
                  className="btn"
                  style={{ fontSize: 10, color: 'var(--text-muted)' }}
                  onClick={() => setLogPanelOpen(false)}
                >← Back</button>
              </div>
            </div>
          ) : (
            <div style={triggerRowStyle}>
              <button
                className="btn primary"
                style={{ flex: 1 }}
                disabled={!staged.length}
                onClick={() => setLogPanelOpen(true)}
              >📋 Review & Create</button>
              <button className="btn" onClick={onClose}>CANCEL</button>
            </div>
          )}

          {/* Add Manually — collapsible */}
          <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div
              onClick={() => setManualOpen(o => !o)}
              style={{
                padding: '8px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--panel2)', userSelect: 'none' as const,
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                {manualOpen ? '▼' : '▶'}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
                textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>Add Manually</span>
            </div>
            {manualOpen && (
              <div style={{ padding: '12px 14px 14px' }}>
                <Row label="TYPE">
                  <select
                    value={manualType}
                    onChange={e => setManualType(e.target.value as LibSection)}
                    style={inputStyle}
                  >
                    <option value="malts">Malt</option>
                    <option value="hops">Hop</option>
                    <option value="yeast">Yeast</option>
                    <option value="misc">Adjunct</option>
                  </select>
                </Row>
                <Row label="INGREDIENT">
                  <select
                    value={manualIng}
                    onChange={e => setManualIng(e.target.value)}
                    style={inputStyle}
                  >
                    {libBySection[manualType].map(e => (
                      <option key={String(e.id)} value={e.name}>{e.name}</option>
                    ))}
                  </select>
                </Row>
                <Row label="QTY (kg)">
                  <input
                    type="number" min={0} step={0.1}
                    value={manualQty}
                    onChange={e => setManualQty(e.target.value)}
                    style={inputStyle}
                  />
                </Row>
                <Row label="SUPPLIER">
                  <select value={manualSupp} onChange={e => setManualSupp(e.target.value)} style={inputStyle}>
                    <option value="">— None —</option>
                    {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Row>
                <Row label="EXP. DELIVERY">
                  <input type="date" value={manualDel} onChange={e => setManualDel(e.target.value)} style={inputStyle} />
                </Row>
                <Row label="STATUS">
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['pending', 'ordered', 'received'] as const).map(s => (
                      <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="radio" name="manual-status" value={s}
                          checked={manualStatus === s}
                          onChange={() => setManualStatus(s)}
                          style={{ accentColor: 'var(--amber)' }}
                        />
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{s}</span>
                      </label>
                    ))}
                  </div>
                </Row>
                <Row label="NOTES">
                  <input
                    type="text" value={manualNotes}
                    onChange={e => setManualNotes(e.target.value)}
                    placeholder="optional"
                    style={inputStyle}
                  />
                </Row>
                <button
                  className="btn primary"
                  style={{ width: '100%', marginTop: 4 }}
                  onClick={addManual}
                >＋ ADD TO ORDER</button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <label style={{
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        width: 110, flexShrink: 0,
      }}>{label}</label>
      {children}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--text-muted)',
  ordered: 'var(--amber)',
  received: 'var(--green)',
};

// ── Styles ────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  display: 'flex', gap: 0,
  background: 'var(--panel)', border: '1px solid var(--border2)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  width: 'min(1100px, 96vw)', maxHeight: '90vh',
};

const leftColStyle: React.CSSProperties = {
  width: 240, flexShrink: 0,
  borderRight: '1px solid var(--border2)',
  display: 'flex', flexDirection: 'column' as const, minHeight: 0,
};
const middleColStyle: React.CSSProperties = {
  width: 300, flexShrink: 0,
  borderRight: '1px solid var(--border2)',
  display: 'flex', flexDirection: 'column' as const, minHeight: 0,
};
const rightColStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  display: 'flex', flexDirection: 'column' as const, minHeight: 0,
};

const colHeaderStyle: React.CSSProperties = {
  padding: '12px 14px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel2)', flexShrink: 0,
};
const colTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
};
const colHintStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 2,
};

const listScrollStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
};

const emptyStyle: React.CSSProperties = {
  padding: '24px 16px', fontFamily: 'var(--mono)', fontSize: 9,
  color: 'var(--text-muted)', textAlign: 'center',
};

const supplierHeaderStyle: React.CSSProperties = {
  padding: '5px 12px 4px',
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1.5,
  textTransform: 'uppercase' as const, color: 'var(--amber)',
  background: 'var(--panel2)', borderBottom: '1px solid var(--border)',
};

const brewRowStyle: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
};

const sugRowStyle: React.CSSProperties = {
  padding: '7px 12px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 10,
};

const stagedRowStyle: React.CSSProperties = {
  padding: '7px 12px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'flex-start', gap: 8,
};

const brewNameStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--text)',
  whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
};
const brewDateStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2,
};

const logPanelStyle: React.CSSProperties = {
  padding: '12px 14px', borderTop: '1px solid var(--border)',
  background: 'var(--panel2)',
  display: 'flex', flexDirection: 'column' as const, gap: 8, flexShrink: 0,
};

const triggerRowStyle: React.CSSProperties = {
  padding: '10px 12px', borderTop: '1px solid var(--border)',
  display: 'flex', gap: 8, flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 8px', outline: 'none',
};
