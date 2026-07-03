/**
 * Current-stock table for the Inventory page — port of brewlab-desktop.html
 * line 15347 (renderInventory). Renders one section's library entries
 * with computed running balance from the tax ledger.
 *
 * Features:
 *   • Sortable by ingredient name OR any visible column.
 *   • Sticky-left columns: name + first 2 visible columns (HTML 15402).
 *   • Colour-coded stock cell: red (≤ 0), amber (< 15% of opening if
 *     opening > 0), normal (otherwise).
 *   • In-Stock-Only filter (HTML 15384): drops rows with stock ≤ 0.
 *   • Right-click on header opens column-visibility menu.
 *   • Drag-to-reorder column headers (HTML 15405).
 *   • Double-click a row → edit in Library entry modal (handled by
 *     onEditEntry passed from InventoryPage).
 *   • Inline ✕ on the name cell deletes the library entry.
 *   • Opening Bal. column has an inline number input — writes to
 *     bl_inv_stock via setInventoryStock.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { fmtKg, INV_SECTION_LABELS, INV_UNITS } from '../../lib/units';
import { fmtNum } from '../../lib/format';
import { getLedgerBalance } from '../../lib/ledger';
import {
  INV_COL_DEFS, getInvColVisibility, getOrderedVisibleCols,
  setInvColOrder, getInvColOrder, setInvColVisibility,
  type InvSection,
} from './inventoryShared';
import type { LibEntry } from '../libraries/libraryShared';

interface Props {
  section: InvSection;
  inStockOnly: boolean;
  /** Click handlers — InventoryPage owns these so the same buttons can
   *  open Library modals. */
  onEditEntry: (entry: LibEntry) => void;
  onDeleteEntry: (entry: LibEntry) => void;
}

interface SortState {
  col: string;
  /** 1 = asc, -1 = desc. */
  dir: 1 | -1;
}

const NUMERIC_COLS = new Set([
  '_stock', 'price', 'ebc', 'aa', 'beta', 'atten',
  'moisture', 'protein', 'yield_pct', 'diastatic_power', 'dbfg', 'max_pct',
]);

export default function CurrentStockTable({ section, inStockOnly, onEditEntry, onDeleteEntry }: Props) {
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const inventoryStock    = useStore(s => s.inventoryStock);
  const setInventoryStock = useStore(s => s.setInventoryStock);
  const ledgerData        = useStore(s => s.ledgerData);

  const [sort, setSort] = useState<SortState>({ col: 'name', dir: 1 });
  // Trigger re-render when col visibility / order menu mutates localStorage.
  const [colsRev, setColsRev] = useState(0);
  const bumpCols = () => setColsRev(r => r + 1);

  // Column-visibility popover anchor + open state.
  const [colMenu, setColMenu] = useState<{ x: number; y: number } | null>(null);

  const data: LibEntry[] =
    section === 'malts' ? maltLib :
    section === 'hops'  ? hopLib :
    section === 'yeast' ? yeastLib : miscLib;
  const unit = INV_UNITS[section];

  // Order/visibility resolved here so the table re-renders when colsRev bumps.
  const orderedKeys = useMemo(
    () => getOrderedVisibleCols(section),
    [section, colsRev],
  );
  const colDefMap = useMemo(
    () => Object.fromEntries(INV_COL_DEFS[section].map(c => [c.key, c])),
    [section],
  );

  const sorted = useMemo(() => {
    const list = data.slice();
    list.sort((a, b) => {
      const k = sort.col;
      let av: number | string;
      let bv: number | string;
      if (k === 'name') {
        av = (a.name || '').toLowerCase();
        bv = (b.name || '').toLowerCase();
      } else if (k === '_stock' || k === 'stock') {
        av = getLedgerBalance(inventoryStock, ledgerData, `${section}_${a.id}`);
        bv = getLedgerBalance(inventoryStock, ledgerData, `${section}_${b.id}`);
      } else if (NUMERIC_COLS.has(k)) {
        av = parseFloat(String((a as unknown as Record<string, unknown>)[k] ?? '')) || 0;
        bv = parseFloat(String((b as unknown as Record<string, unknown>)[k] ?? '')) || 0;
      } else {
        av = String((a as unknown as Record<string, unknown>)[k] ?? '').toLowerCase();
        bv = String((b as unknown as Record<string, unknown>)[k] ?? '').toLowerCase();
      }
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return 0;
    });
    return list;
  }, [data, sort, inventoryStock, ledgerData, section]);

  const filtered = useMemo(() => {
    if (!inStockOnly) return sorted;
    return sorted.filter(e =>
      getLedgerBalance(inventoryStock, ledgerData, `${section}_${e.id}`) > 0);
  }, [sorted, inStockOnly, inventoryStock, ledgerData, section]);

  const sortBy = (col: string) => {
    setSort(prev => prev.col === col
      ? { col, dir: (prev.dir * -1) as 1 | -1 }
      : { col, dir: 1 });
  };
  const arrow = (col: string): string =>
    sort.col === col ? (sort.dir === 1 ? ' ↑' : ' ↓') : '';

  // Drag-to-reorder. We just track the dragged key; on drop we splice.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const onDragStart = (key: string, e: React.DragEvent) => {
    setDragKey(key);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (key: string, e: React.DragEvent) => {
    if (!dragKey || dragKey === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (targetKey: string, e: React.DragEvent) => {
    e.preventDefault();
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const order = getInvColOrder(section).slice();
    // Resolve indexes — if either key isn't already in saved order, append it
    // before reorder so the splice math stays consistent.
    if (!order.includes(dragKey))   order.push(dragKey);
    if (!order.includes(targetKey)) order.push(targetKey);
    const fromIdx = order.indexOf(dragKey);
    const toIdx   = order.indexOf(targetKey);
    if (fromIdx < 0 || toIdx < 0) { setDragKey(null); return; }
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);
    setInvColOrder(section, order);
    setDragKey(null);
    bumpCols();
  };
  const onDragEnd = () => setDragKey(null);

  const updateOpening = (key: string, val: string) => {
    const n = parseFloat(val);
    const next = { ...inventoryStock };
    if (!isFinite(n) || n === 0) delete next[key];
    else next[key] = n;
    setInventoryStock(next);
  };

  // Sticky offset math — name (260) + up to 2 sticky cols (90 each).
  const STICKY_NAME_W = 260;
  const STICKY_COL_W  = 90;

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      <table style={tableStyle}>
        <thead>
          <tr onContextMenu={e => { e.preventDefault(); setColMenu({ x: e.clientX, y: e.clientY }); }}>
            <th
              style={{
                ...thStyle, ...stickyStyle, left: 0, minWidth: STICKY_NAME_W, cursor: 'pointer',
                maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onClick={() => sortBy('name')}
            >INGREDIENT{arrow('name')}</th>
            {orderedKeys.map((key, idx) => {
              const isSticky = idx < 2;
              const left = isSticky ? STICKY_NAME_W + idx * STICKY_COL_W : undefined;
              const sortKey = key === '_stock' ? 'stock' : key;
              const label = key === '_stock'
                ? `ON HAND (${unit})${arrow('stock')}`
                : key === '_opening'
                  ? `OPENING BAL.`
                  : `${(colDefMap[key]?.label ?? key).toUpperCase()}${arrow(key)}`;
              return (
                <th
                  key={key}
                  draggable
                  onDragStart={e => onDragStart(key, e)}
                  onDragOver={e => onDragOver(key, e)}
                  onDrop={e => onDrop(key, e)}
                  onDragEnd={onDragEnd}
                  style={{
                    ...thStyle,
                    ...(isSticky ? { ...stickyStyle, left, background: 'var(--panel)' } : {}),
                    minWidth: key === '_stock' ? 100 : 90,
                    cursor: key === '_opening' ? 'grab' : 'grab',
                    ...(key === '_opening' ? { color: 'var(--text-muted)', fontSize: 8 } : {}),
                  }}
                  onClick={key === '_opening' ? undefined : () => sortBy(sortKey)}
                  title={key === '_opening'
                    ? 'Drag to reorder. Amount before ledger tracking started.'
                    : undefined}
                >{label}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={orderedKeys.length + 1} style={emptyStyle}>
                No {INV_SECTION_LABELS[section]} in library yet — import a BeerXML file to get started
              </td>
            </tr>
          ) : filtered.map((entry, rowIdx) => {
            const stockKey = `${section}_${entry.id}`;
            const opening = parseFloat(String(inventoryStock[stockKey] ?? 0)) || 0;
            const stock = getLedgerBalance(inventoryStock, ledgerData, stockKey);
            const stockColor = stock <= 0
              ? '#c03030'
              : opening > 0 && stock < opening * 0.15
                ? '#f09420'
                : 'var(--amber)';
            const rowBg = rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--panel)';
            return (
              <tr
                key={String(entry.id)}
                onDoubleClick={() => onEditEntry(entry)}
                style={{ cursor: 'pointer' }}
                title="Double-click to edit"
              >
                <td
                  style={{
                    ...tdStyle, ...stickyStyle, left: 0, background: rowBg,
                    maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={entry.name || ''}
                >
                  {entry.name || '—'}
                  <span
                    onClick={e => { e.stopPropagation(); onDeleteEntry(entry); }}
                    style={delBtnStyle}
                    title="Delete"
                  >  ✕</span>
                </td>
                {orderedKeys.map((key, idx) => {
                  const isSticky = idx < 2;
                  const left = isSticky ? STICKY_NAME_W + idx * STICKY_COL_W : undefined;
                  const cellStyle: React.CSSProperties = {
                    ...tdStyle,
                    ...(isSticky ? { ...stickyStyle, left, background: rowBg } : {}),
                  };
                  if (key === '_stock') {
                    return (
                      <td key={key} style={{ ...cellStyle, fontWeight: 600, color: stockColor }}>
                        {fmtKg(stock)}
                      </td>
                    );
                  }
                  if (key === '_opening') {
                    return (
                      <td key={key} style={cellStyle}>
                        <input
                          type="number"
                          min={0} step={0.1}
                          placeholder="0"
                          value={opening || ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateOpening(stockKey, e.target.value)}
                          title="Opening balance — pre-ledger starting amount"
                          style={openingInputStyle}
                        />
                      </td>
                    );
                  }
                  let v = (entry as unknown as Record<string, unknown>)[key];
                  let display = v == null || v === '' ? '—' : String(v);
                  if ((key === 'aa' || key === 'beta') && display !== '—') {
                    display = fmtNum(parseFloat(display), { fallback: display });
                  }
                  if (typeof v === 'boolean') display = v ? '✓' : '—';
                  return <td key={key} style={cellStyle}>{display}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {colMenu && (
        <ColVisibilityMenu
          section={section}
          x={colMenu.x}
          y={colMenu.y}
          onClose={() => { setColMenu(null); bumpCols(); }}
        />
      )}
    </div>
  );
}

// ── Column visibility popover ────────────────────────────────────────

function ColVisibilityMenu({
  section, x, y, onClose,
}: {
  section: InvSection;
  x: number; y: number;
  onClose: () => void;
}) {
  // Reads/writes through the helpers and forces a parent re-render via
  // onClose — keeps the menu's state in sync without a redundant store.
  const [vis, setVis] = useState(() => getInvColVisibility(section));

  const toggle = (key: string) => {
    const next = { ...vis, [key]: !vis[key] };
    setVis(next);
    setInvColVisibility(section, next);
  };

  const left = Math.min(x, window.innerWidth - 220);
  const top  = Math.min(y, window.innerHeight - 320);

  // Outside-click close.
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 60 }}
        onMouseDown={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div
        style={{
          position: 'fixed', zIndex: 61, left, top,
          minWidth: 200, background: 'var(--panel)',
          border: '1px solid var(--border2)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{
          padding: '6px 12px', fontFamily: 'var(--mono)', fontSize: 8,
          letterSpacing: 1.5, color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
        }}>SHOW COLUMNS</div>
        {INV_COL_DEFS[section].map(c => {
          const checked = vis[c.key] !== false;
          return (
            <div
              key={c.key}
              onClick={() => toggle(c.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--panel2)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
            >
              <span style={{ width: 12, color: 'var(--amber)' }}>{checked ? '✓' : ''}</span>
              <span>{c.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', userSelect: 'none',
};

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)',
  textAlign: 'left', padding: '6px 8px', fontWeight: 600,
  background: 'var(--panel2)', borderBottom: '1px solid var(--border)',
};

const stickyStyle: React.CSSProperties = {
  position: 'sticky' as const, zIndex: 5,
};

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  padding: '4px 8px', borderBottom: '1px solid var(--border)',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: 20, color: 'var(--text-muted)',
  fontFamily: 'var(--mono)', fontSize: 9,
};

const delBtnStyle: React.CSSProperties = {
  marginLeft: 6, color: 'var(--text-muted)', cursor: 'pointer',
  fontSize: 10, fontWeight: 700,
};

const openingInputStyle: React.CSSProperties = {
  width: 70, boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '2px 6px', outline: 'none', textAlign: 'right',
};
