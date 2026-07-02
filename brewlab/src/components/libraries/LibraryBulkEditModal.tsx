/**
 * Bulk-edit modal — port of brewlab-desktop.html lines 14466–14543
 * (libBulkEdit / buildLibBulkForm / saveLibBulkEdit).
 *
 * Each field has a checkbox to its left; ticking it enables the input.
 * On save, only ticked fields are merged onto every selected entry —
 * mirrors HTML's "CHECK A FIELD TO CHANGE IT" hint.
 */

import { useState } from 'react';
import { LIB_BULK_FIELD_DEFS, type LibSection, type FieldDef, type LibEntry } from './libraryShared';
import { renderLibFieldInput, type LibFieldValue } from './libraryFieldInput';

interface Props {
  section: LibSection;
  selectedCount: number;
  onSave: (changes: Partial<LibEntry>) => void;
  onClose: () => void;
}

export default function LibraryBulkEditModal({ section, selectedCount, onSave, onClose }: Props) {
  const defs = LIB_BULK_FIELD_DEFS[section];
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  // Values can be string OR boolean — booleans land here when a checkbox-
  // typed bulk field is added (none today, but the renderer is shared
  // with the single-edit modal which does support checkbox).
  const [values,  setValues]  = useState<Record<string, LibFieldValue>>({});

  const toggle = (k: string) => setEnabled(prev => ({ ...prev, [k]: !prev[k] }));
  const setVal = (k: string, v: LibFieldValue) => setValues(prev => ({ ...prev, [k]: v }));

  const apply = () => {
    const changes: Record<string, unknown> = {};
    for (const d of defs) {
      if (!enabled[d.key]) continue;
      const v = values[d.key] ?? '';
      if (d.type === 'number') {
        const s = String(v).trim();
        if (s === '') changes[d.key] = '';
        else {
          const n = parseFloat(s);
          changes[d.key] = isFinite(n) ? n : '';
        }
      } else if (d.type === 'checkbox') {
        changes[d.key] = !!v;
      } else {
        changes[d.key] = String(v ?? '');
      }
    }
    onSave(changes as Partial<LibEntry>);
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>BULK EDIT — {selectedCount} ENTRIES</div>
        <div style={bodyStyle}>
          <div style={hintStyle}>CHECK A FIELD TO CHANGE IT FOR ALL SELECTED ENTRIES</div>
          {defs.map(d => (
            <BulkRow
              key={d.key}
              def={d}
              enabled={!!enabled[d.key]}
              value={values[d.key] ?? ''}
              onToggle={() => toggle(d.key)}
              onChange={v => setVal(d.key, v)}
            />
          ))}
        </div>
        <div style={footerStyle}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function BulkRow({
  def, enabled, value, onToggle, onChange,
}: {
  def: FieldDef;
  enabled: boolean;
  value: LibFieldValue;
  onToggle: () => void;
  onChange: (v: LibFieldValue) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        style={{ accentColor: 'var(--amber)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <label style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8, color: 'var(--text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 2 }}>
          {def.label}
        </label>
        {renderLibFieldInput(def, value, onChange, { disabled: !enabled })}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  borderRadius: 6, width: 460, maxWidth: '95vw',
  display: 'flex', flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  padding: '12px 18px', borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
};

const bodyStyle: React.CSSProperties = { padding: '12px 18px' };

const footerStyle: React.CSSProperties = {
  padding: '10px 18px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'flex-end', gap: 8,
};

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  marginBottom: 10, letterSpacing: 1,
};
