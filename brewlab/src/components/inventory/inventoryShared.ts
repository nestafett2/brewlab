/**
 * Inventory page — column definitions + visibility/order helpers.
 * Mirrors brewlab-desktop.html lines 15169–15346.
 *
 * INV_COL_DEFS — per-section column metadata used by both the table
 * header and the visibility menu. The two virtual keys `_stock` (ON
 * HAND, derived from ledger) and `_opening` (Opening Bal., editable
 * input) are interleaved with the entry-field columns.
 *
 * Visibility (bl_inv_cols_<sec>) and column order (bl_inv_order_<sec>)
 * are persisted local-only — per-device prefs that should not sync
 * across the brewery (per the audit memory). They never enter
 * SETTINGS_KEYS.
 */

import { lsGet, lsLocal } from '../../lib/storage';

export type InvSection = 'malts' | 'hops' | 'yeast' | 'misc';

export interface InvColDef {
  /** Field key on the lib entry, or '_stock' / '_opening' virtual keys. */
  key: string;
  /** Header label. Always rendered uppercased. */
  label: string;
  /** Default visibility state — used when no saved preference exists. */
  default: boolean;
}

// ── Column definitions per section (HTML 15169) ───────────────────────
export const INV_COL_DEFS: Record<InvSection, InvColDef[]> = {
  malts: [
    { key: 'maltster',        label: 'Maltster',        default: true  },
    { key: 'supplier',        label: 'Local Supplier',  default: true  },
    { key: 'malt_type',       label: 'Type',            default: false },
    { key: 'ebc',             label: 'EBC',             default: true  },
    { key: 'price',           label: 'Price ¥/kg',      default: true  },
    { key: 'yield_pct',       label: 'Yield %',         default: false },
    { key: 'moisture',        label: 'Moisture %',      default: false },
    { key: 'diastatic_power', label: 'Diastatic Power', default: false },
    { key: 'protein',         label: 'Protein %',       default: false },
    { key: 'dbfg',            label: 'DBFG %',          default: false },
    { key: 'max_pct',         label: 'Max in Batch %',  default: false },
    { key: '_opening',        label: 'Opening Bal.',    default: true  },
  ],
  hops: [
    { key: 'aa',       label: 'AA %',       default: true  },
    { key: 'beta',     label: 'Beta %',     default: false },
    { key: 'origin',   label: 'Origin',     default: false },
    { key: 'supplier', label: 'Supplier',   default: true  },
    { key: 'price',    label: 'Price ¥/kg', default: true  },
    { key: 'lot_num',  label: 'Lot #',      default: true  },
    { key: '_opening', label: 'Opening Bal.', default: true },
  ],
  yeast: [
    { key: 'lab',       label: 'Lab',           default: true  },
    { key: 'atten',     label: 'Attenuation %', default: true  },
    { key: 'temp_min',  label: 'Min Temp °C',   default: false },
    { key: 'temp_max',  label: 'Max Temp °C',   default: false },
    { key: '_opening',  label: 'Opening Bal.',  default: true  },
  ],
  misc: [
    { key: 'misc_type', label: 'Type',         default: true },
    { key: 'use',       label: 'Use',          default: true },
    { key: 'price',     label: 'Price ¥/kg',   default: true },
    { key: '_opening',  label: 'Opening Bal.', default: true },
  ],
};

// ── Visibility prefs (bl_inv_cols_<sec>, local-only) ──────────────────

export function getInvColVisibility(sec: InvSection): Record<string, boolean> {
  const saved = lsGet<Record<string, boolean> | null>(`bl_inv_cols_${sec}`, null);
  if (saved) return saved;
  const def: Record<string, boolean> = {};
  for (const c of INV_COL_DEFS[sec]) def[c.key] = c.default;
  return def;
}

export function setInvColVisibility(sec: InvSection, vis: Record<string, boolean>): void {
  lsLocal(`bl_inv_cols_${sec}`, vis);
}

// ── Column order prefs (bl_inv_order_<sec>, local-only) ────────────────

export function getInvColOrder(sec: InvSection): string[] {
  const saved = lsGet<string[] | null>(`bl_inv_order_${sec}`, null);
  if (saved && Array.isArray(saved)) return saved;
  // Default: defs order with `_stock` appended at the end. `_opening`
  // is part of defs and slots in wherever it's defined.
  const defs = INV_COL_DEFS[sec];
  return [...defs.map(c => c.key), '_stock'];
}

export function setInvColOrder(sec: InvSection, order: string[]): void {
  lsLocal(`bl_inv_order_${sec}`, order);
}

/**
 * Resolve the visible columns for a section in the saved order.
 * Returns the ordered column keys (including `_stock` / `_opening`).
 */
export function getOrderedVisibleCols(sec: InvSection): string[] {
  const vis = getInvColVisibility(sec);
  const order = getInvColOrder(sec);
  const defs = INV_COL_DEFS[sec];
  // Universe of available col keys = entry-field keys + the two virtuals.
  const allKeys = [...defs.map(c => c.key), '_stock'];
  // Sort allKeys by saved order; unordered keys go to the end.
  const ordered = [...allKeys].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return 0;
  });
  // _stock has no visibility entry — it's always rendered.
  // _opening is in `vis`; respect its toggle.
  return ordered.filter(k => {
    if (k === '_stock') return true;
    return vis[k] !== false;
  });
}
