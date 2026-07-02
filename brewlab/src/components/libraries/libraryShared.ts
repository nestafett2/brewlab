/**
 * Libraries page — shared schema. Mirrors brewlab-desktop.html lines
 * 16620–16776:
 *   • LIB_HEADERS  — column header labels for each section's table.
 *   • LIB_FIELDS   — entry-object keys read into each table column.
 *   • LIB_FIELD_DEFS — per-section field schema for the Add/Edit modal,
 *     each entry shaped { key, label, type, opts?, wide? }.
 *
 * Types and option lists are kept verbatim from the HTML so an entry
 * round-tripped through BeerXML / BSMX in either app produces the same
 * schema. The bulk-edit modal uses a narrower subset of fields
 * (LIB_BULK_FIELD_DEFS) per HTML 14474–14502.
 */

import type { MaltLib, HopLib, YeastLib, MiscLib } from '../../types';

export type LibSection = 'malts' | 'hops' | 'yeast' | 'misc';

export type LibEntry = MaltLib | HopLib | YeastLib | MiscLib;

// ── Table column headers (HTML 16620) ─────────────────────────────────
export const LIB_HEADERS: Record<LibSection, string[]> = {
  malts: ['Name', 'Maltster', 'Supplier', 'Type', 'EBC', 'Price ¥/kg', 'Notes'],
  hops:  ['Name', 'AA%', 'Beta%', 'Origin', 'Supplier', 'Price ¥/kg', 'Lot #', 'Notes'],
  yeast: ['Name', 'Lab', 'Atten%', 'Temp Min', 'Temp Max', 'Price ¥/pkg', 'Notes'],
  misc:  ['Name', 'Type', 'Use', 'Happoshu', 'Price ¥/kg', 'Notes'],
};

// ── Entry field keys per table column (HTML 16626) ────────────────────
// Lengths MUST match LIB_HEADERS — these are zipped positionally at the
// table-render call site (LibrariesPage table body iterates LIB_FIELDS).
// `malted` / `tariff` are checkbox-only fields exposed via LIB_FIELD_DEFS
// for the Add/Edit modal; they are deliberately NOT table columns.
export const LIB_FIELDS: Record<LibSection, string[]> = {
  malts: ['name', 'maltster', 'supplier', 'malt_type', 'ebc', 'price', 'notes'],
  hops:  ['name', 'aa', 'beta', 'origin', 'supplier', 'price', 'lot_num', 'notes'],
  yeast: ['name', 'lab', 'atten', 'temp_min', 'temp_max', 'price', 'notes'],
  misc:  ['name', 'misc_type', 'use', 'happoshu_trigger', 'price', 'notes'],
};

// ── Section titles for the toolbar ────────────────────────────────────
export const LIB_TITLES: Record<LibSection, string> = {
  malts: 'MALT LIBRARY',
  hops:  'HOP LIBRARY',
  yeast: 'YEAST LIBRARY',
  misc:  'MISC LIBRARY',
};

// ── Stock unit per section (Inventory + Modal labels) ─────────────────
export const LIB_STOCK_UNIT: Record<LibSection, string> = {
  malts: 'kg', hops: 'kg', yeast: 'pkg', misc: 'kg',
};

// ── Modal field definition ────────────────────────────────────────────
export type FieldType = 'text' | 'number' | 'select' | 'supplier-select' | 'checkbox';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  opts?: string[];
  /** Wide fields take the whole row in the two-column form layout. */
  wide?: boolean;
  /** Default for checkboxes when the entry doesn't have a value yet. */
  default?: boolean;
}

// ── Per-section modal schemas (HTML 16735–16775) ──────────────────────
export const LIB_FIELD_DEFS: Record<LibSection, FieldDef[]> = {
  malts: [
    { key: 'name',            label: 'Name',         type: 'text', wide: true },
    { key: 'maltster',        label: 'Maltster',     type: 'text' },
    { key: 'supplier',        label: 'Supplier',     type: 'supplier-select' },
    { key: 'malt_type',       label: 'Type',         type: 'select', opts: ['Base', 'Crystal', 'Roasted', 'Wheat', 'Oat', 'Rye', 'Adjunct', 'Other'] },
    { key: 'malted',          label: 'Malted',       type: 'checkbox', default: true },
    { key: 'tariff',          label: 'Tariff Quota', type: 'checkbox', default: false },
    { key: 'ebc',             label: 'EBC',          type: 'number' },
    { key: 'price',           label: 'Price (¥/kg)', type: 'number' },
    { key: 'dbfg',            label: 'DBFG %',       type: 'number' },
    { key: 'max_pct',         label: 'Max in Batch %', type: 'number' },
    { key: 'moisture',        label: 'Moisture %',   type: 'number' },
    { key: 'diastatic_power', label: 'Diastatic Power', type: 'number' },
    { key: 'protein',         label: 'Protein %',    type: 'number' },
    { key: 'yield_pct',       label: 'Yield %',      type: 'number' },
    { key: 'potential',       label: 'Potential (SG)', type: 'number' },
  ],
  hops: [
    { key: 'name',     label: 'Name',         type: 'text', wide: true },
    { key: 'hop_type', label: 'Type',         type: 'select', opts: ['Pellet', 'Cryo', 'Whole', 'Extract'] },
    { key: 'aa',       label: 'AA %',         type: 'number' },
    { key: 'beta',     label: 'Beta %',       type: 'number' },
    { key: 'origin',   label: 'Origin',       type: 'text' },
    { key: 'supplier', label: 'Supplier',     type: 'supplier-select' },
    { key: 'price',    label: 'Price (¥/kg)', type: 'number' },
    { key: 'lot_num',  label: 'Lot #',        type: 'text', wide: true },
  ],
  yeast: [
    { key: 'name',       label: 'Name',         type: 'text', wide: true },
    { key: 'lab',        label: 'Lab',          type: 'text' },
    { key: 'yeast_type', label: 'Type',         type: 'select', opts: ['Ale', 'Lager', 'Kveik', 'Belgian', 'Saison', 'Wild', 'Other'] },
    { key: 'form',       label: 'Form',         type: 'select', opts: ['Dry', 'Liquid'] },
    { key: 'atten',      label: 'Atten%',       type: 'number' },
    { key: 'temp_min',   label: 'Min Temp°C',   type: 'number' },
    { key: 'temp_max',   label: 'Max Temp°C',   type: 'number' },
    { key: 'price',      label: 'Price (¥/pkg)', type: 'number' },
  ],
  misc: [
    { key: 'name',             label: 'Name',         type: 'text', wide: true },
    { key: 'misc_type',        label: 'Type',         type: 'select', opts: ['Fining', 'Nutrient', 'Acid', 'Enzyme', 'Spice', 'Flavor', 'Other'] },
    { key: 'use',              label: 'Use',          type: 'select', opts: ['Mash', 'Boil', 'Primary', 'Secondary', 'Packaging', 'Kegging'] },
    { key: 'happoshu_trigger', label: 'Happoshu Trigger', type: 'checkbox' },
    { key: 'price',            label: 'Price (¥/kg)', type: 'number' },
  ],
};

// ── Bulk edit field defs (HTML 14476–14502) ───────────────────────────
export const LIB_BULK_FIELD_DEFS: Record<LibSection, FieldDef[]> = {
  malts: [
    { key: 'maltster',  label: 'Maltster',         type: 'text' },
    { key: 'supplier',  label: 'Local Supplier',   type: 'supplier-select' },
    { key: 'malt_type', label: 'Type',             type: 'select', opts: ['Base', 'Crystal', 'Roasted', 'Wheat', 'Oat', 'Rye', 'Adjunct', 'Other'] },
    { key: 'price',     label: 'Price (¥/kg)',     type: 'number' },
    { key: 'max_pct',   label: 'Max in Batch %',   type: 'number' },
  ],
  hops: [
    { key: 'supplier', label: 'Supplier',     type: 'supplier-select' },
    { key: 'price',    label: 'Price (¥/kg)', type: 'number' },
    { key: 'lot_num',  label: 'Lot #',        type: 'text' },
    { key: 'hop_type', label: 'Type',         type: 'select', opts: ['Pellet', 'Cryo', 'Whole', 'Extract'] },
  ],
  yeast: [
    { key: 'lab',        label: 'Lab',          type: 'text' },
    { key: 'price',      label: 'Price (¥/pkg)', type: 'number' },
    { key: 'yeast_type', label: 'Type',         type: 'select', opts: ['Ale', 'Lager', 'Kveik', 'Belgian', 'Saison', 'Wild', 'Wheat', 'Other'] },
    { key: 'form',       label: 'Form',         type: 'select', opts: ['Dry', 'Liquid'] },
  ],
  misc: [
    { key: 'supplier',  label: 'Supplier', type: 'supplier-select' },
    { key: 'price',     label: 'Price',    type: 'number' },
    { key: 'misc_type', label: 'Type',     type: 'select', opts: ['Fining', 'Nutrient', 'Acid', 'Enzyme', 'Spice', 'Flavor', 'Other'] },
  ],
};

// ── Helpers ──

/** Compare ids loosely — handles legacy data where some are strings and
 *  some are numbers (HTML stored numeric, but localStorage round-trip
 *  through JSON keeps them numeric; some imports may yield strings). */
export function sameId(a: string | number | undefined, b: string | number | undefined): boolean {
  return a != null && b != null && String(a) === String(b);
}

/** Trigger a download of `text` as `filename` with `mime`. Mirrors the
 *  HTML helper (brewlab-desktop.html:18436). */
export function downloadText(text: string, filename: string, mime = 'application/xml'): void {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
