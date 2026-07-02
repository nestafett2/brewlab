/**
 * Add / Edit entry modal — port of brewlab-desktop.html lines 16715–16878
 * (libAddEntry / libEditEntry / buildLibForm / saveLibEntry).
 *
 * One modal handles all four sections via the section-conditional
 * field schema in libraryShared.LIB_FIELD_DEFS. Layout:
 *   • Two-column form (HTML's "rows of 2" pattern at 16792–16806).
 *   • Stock card at the top — On Hand (ledger balance, read-only, 0
 *     until the ledger system is ported) + Opening Balance input.
 *   • Notes panel: right-side for malts/hops, inline at bottom for
 *     yeast/misc — matches HTML 16828–16845.
 *
 * State: form fields are kept as strings while the user types, then
 * coerced at save time (numbers via parseFloat, booleans via .checked).
 * Mirrors HTML saveLibEntry (16848).
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { getLedgerBalance } from '../../lib/ledger';
import {
  LIB_FIELD_DEFS,
  LIB_STOCK_UNIT,
  type LibSection,
  type FieldDef,
  type LibEntry,
} from './libraryShared';
import { renderLibFieldInput } from './libraryFieldInput';
import { fmtNum } from '../../lib/format';

interface Props {
  section: LibSection;
  /** The entry being edited, or null for "add new". */
  entry: LibEntry | null;
  onSave: (next: Partial<LibEntry>, openingStock: number | null) => void;
  onClose: () => void;
}

type FormState = Record<string, string | boolean>;

function entryToForm(entry: LibEntry | null, defs: FieldDef[]): FormState {
  const out: FormState = {};
  for (const d of defs) {
    const k = d.key;
    const v = entry ? (entry as unknown as Record<string, unknown>)[k] : undefined;
    if (d.type === 'checkbox') {
      // HTML default: undefined → use d.default; explicit false → false; else truthy.
      if (v === undefined) out[k] = d.default ?? false;
      else out[k] = v === true || v === 'true';
    } else {
      out[k] = v == null ? '' : String(v);
    }
  }
  // notes lives outside fieldDefs in HTML — handled separately
  out.notes = String(((entry as { notes?: unknown } | null)?.notes ?? '') || '');
  return out;
}

function formToPatch(form: FormState, defs: FieldDef[]): Partial<LibEntry> {
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    const v = form[d.key];
    if (d.type === 'checkbox') out[d.key] = !!v;
    else if (d.type === 'number') {
      const s = String(v ?? '').trim();
      if (s === '') out[d.key] = '';
      else {
        const n = parseFloat(s);
        out[d.key] = isFinite(n) ? n : '';
      }
    } else {
      out[d.key] = String(v ?? '');
    }
  }
  out.notes = String(form.notes ?? '');
  return out as Partial<LibEntry>;
}

export default function LibraryEntryModal({ section, entry, onSave, onClose }: Props) {
  const defs = LIB_FIELD_DEFS[section];
  const inventoryStock = useStore(s => s.inventoryStock);
  const [form, setForm] = useState<FormState>(() => entryToForm(entry, defs));

  // Re-seed form when entry / section flips (e.g. user clicks Edit on a
  // different row while the modal is being recycled). Defensive — current
  // page mounts a fresh modal per open, but this keeps the component safe.
  useEffect(() => {
    setForm(entryToForm(entry, defs));
  }, [entry, defs]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stockKey = entry?.id != null ? `${section}_${entry.id}` : null;
  const openingFromStore = stockKey != null ? Number(inventoryStock[stockKey] || 0) : 0;
  const [opening, setOpening] = useState<string>(openingFromStore ? String(openingFromStore) : '');
  // Keep opening in sync if entry changes (Edit on a different row).
  useEffect(() => {
    setOpening(openingFromStore ? String(openingFromStore) : '');
  }, [openingFromStore]);

  const update = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const save = () => {
    if (!String(form.name ?? '').trim()) return; // HTML focuses name; we just no-op
    const patch = formToPatch(form, defs);
    const opNum = opening.trim() === '' ? null : parseFloat(opening);
    onSave(patch, opNum);
  };

  const unit = LIB_STOCK_UNIT[section];
  // Live tax-ledger balance for this entry. Reads through getLedgerBalance
  // which sums opening + got − used (HTML 15127). Returns 0 for new
  // entries since `entry?.id` is null until first save.
  const ledgerData    = useStore(s => s.ledgerData);
  const stockKeyRead  = entry?.id != null ? `${section}_${entry.id}` : null;
  const onHandKg      = stockKeyRead
    ? getLedgerBalance(inventoryStock, ledgerData, stockKeyRead)
    : 0;

  const hasRightNotes = section === 'malts' || section === 'hops';

  const stockCard = (
    <div style={stockCardStyle}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8, color: 'var(--amber)', textTransform: 'uppercase' }}>
          ON HAND ({unit})
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--amber)', padding: '4px 0' }}>
          {fmtNum(onHandKg, { fallback: '0' })}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>
          Derived from tax ledger
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
          OPENING BAL. ({unit})
        </div>
        <input
          type="number"
          step={0.1}
          min={0}
          placeholder="0"
          value={opening}
          onChange={e => setOpening(e.target.value)}
          title="Balance before you started ledger tracking"
          style={inputStyle}
        />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
          Pre-ledger starting amount
        </div>
      </div>
    </div>
  );

  const fieldsHtml = renderFieldRows(defs, form, update);

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>
          {entry ? 'EDIT ENTRY' : `ADD ${section.toUpperCase().replace(/S$/, '')}`}
        </div>
        <div style={bodyStyle}>
          {hasRightNotes ? (
            <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
                {stockCard}
                {fieldsHtml}
              </div>
              <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 14, display: 'flex', flexDirection: 'column' }}>
                <label style={notesLabelStyle}>Notes</label>
                <textarea
                  value={String(form.notes ?? '')}
                  onChange={e => update('notes', e.target.value)}
                  placeholder="Tasting notes, brewing tips, batch details…"
                  style={notesTextareaStyle}
                />
              </div>
            </div>
          ) : (
            <>
              {stockCard}
              {fieldsHtml}
              <div style={formRowStyle}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabelStyle}>Notes</label>
                  <textarea
                    rows={3}
                    value={String(form.notes ?? '')}
                    onChange={e => update('notes', e.target.value)}
                    style={inlineNotesStyle}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <div style={footerStyle}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Field row builder ───────────────────────────────────────────────

function renderFieldRows(
  defs: FieldDef[],
  form: FormState,
  update: (k: string, v: string | boolean) => void,
): React.ReactNode {
  // HTML pairs non-wide fields side-by-side (rows of 2).
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < defs.length; ) {
    const d = defs[i];
    if (d.wide) {
      rows.push(
        <div key={d.key} style={formRowStyle}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>{d.label}</label>
            {renderInput(d, form, update)}
          </div>
        </div>,
      );
      i++;
    } else {
      const d2 = defs[i + 1] && !defs[i + 1].wide ? defs[i + 1] : null;
      rows.push(
        <div key={d.key + (d2 ? '_' + d2.key : '')} style={formRowStyle}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>{d.label}</label>
            {renderInput(d, form, update)}
          </div>
          {d2 && (
            <div style={{ flex: 1 }}>
              <label style={fieldLabelStyle}>{d2.label}</label>
              {renderInput(d2, form, update)}
            </div>
          )}
        </div>,
      );
      i += d2 ? 2 : 1;
    }
  }
  return rows;
}

function renderInput(
  d: FieldDef,
  form: FormState,
  update: (k: string, v: string | boolean) => void,
): React.ReactNode {
  // Delegates to the shared renderer so the bulk-edit modal can't drift.
  return renderLibFieldInput(d, form[d.key] ?? '', v => update(d.key, v));
}

// ─── Styles ──────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  borderRadius: 6, width: 720, maxWidth: '95vw', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  padding: '12px 18px', borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)',
};

const bodyStyle: React.CSSProperties = {
  padding: '14px 18px', flex: 1, overflowY: 'auto',
};

const footerStyle: React.CSSProperties = {
  padding: '10px 18px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'flex-end', gap: 8,
};

const stockCardStyle: React.CSSProperties = {
  display: 'flex', gap: 12,
  background: 'rgba(255,176,0,0.06)', border: '1px solid rgba(255,176,0,0.2)',
  borderRadius: 3, padding: '6px 8px', marginBottom: 6,
};

const formRowStyle: React.CSSProperties = {
  display: 'flex', gap: 10, marginBottom: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 6px', outline: 'none',
};

const notesLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8,
  textTransform: 'uppercase', color: 'var(--text-muted)',
  display: 'block', marginBottom: 6,
};

const notesTextareaStyle: React.CSSProperties = {
  flex: 1, minHeight: 220, width: '100%',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 12,
  padding: 8, resize: 'none', lineHeight: 1.6, outline: 'none',
  boxSizing: 'border-box',
};

const inlineNotesStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 11,
  padding: '6px 8px', resize: 'vertical', lineHeight: 1.5, outline: 'none',
};
