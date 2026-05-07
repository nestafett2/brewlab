/**
 * Settings → Styles — port of HTML #settings-styles (line 2643) +
 * customStyleModal (line 3127) + functions at 6307–6377.
 *
 * Two concerns in one panel:
 *   1. Style Guide selector — picks which BJCP year (or BA, or none) the
 *      Recipe tab style picker draws from. Stored on `BrewSettings.styleGuide`.
 *   2. Custom Styles — dict keyed by 'custom_<timestamp>'. Add/Edit modal
 *      mirrors HTML's openCustomStyleModal/saveCustomStyle flow: same
 *      grid of OG/FG/ABV/IBU/EBC min/max, same "save adds to list and
 *      clears the form" behaviour. Existing-styles list is rendered
 *      inside the modal so the user can keep adding without reopening.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import type { CustomStyle, StyleGuide } from '../../types';
import { profileSharedStyles as ss } from './EquipmentProfilesPanel';

const STYLE_GUIDES: { value: StyleGuide; label: string }[] = [
  { value: 'bjcp2021',     label: 'BJCP 2021' },
  { value: 'bjcp2015',     label: 'BJCP 2015' },
  { value: 'bjcp2008',     label: 'BJCP 2008' },
  { value: 'brewersassoc', label: "Brewer's Association 2023" },
  { value: 'none',         label: 'None' },
];

export default function StylesPanel() {
  const settings        = useStore(s => s.settings);
  const setSettings     = useStore(s => s.setSettings);
  const customStyles    = useStore(s => s.customStyles);
  const setCustomStyles = useStore(s => s.setCustomStyles);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [modalOpen,  setModalOpen]  = useState(false);

  const open = (key: string | null) => {
    setEditingKey(key);
    setModalOpen(true);
  };
  const close = () => {
    setEditingKey(null);
    setModalOpen(false);
  };

  return (
    <>
      <div className="settings-section">
        <div className="settings-title">Style Guidelines</div>
        <div className="settings-grid">
          <div className="settings-field">
            <label>Style Guide</label>
            <select
              value={settings.styleGuide ?? 'bjcp2021'}
              onChange={e => setSettings({ styleGuide: e.target.value as StyleGuide })}
            >
              {STYLE_GUIDES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={() => open(null)}>＋ Add / Edit Custom Styles</button>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
            Add house styles, Japanese craft categories, or anything not in the standard guides.
          </div>
        </div>
      </div>

      {modalOpen && (
        <CustomStyleModal
          editingKey={editingKey}
          customStyles={customStyles}
          onSave={(key, style) => {
            setCustomStyles({ ...customStyles, [key]: style });
            // HTML clears the form and prepares for the next entry —
            // we drop the editing key and stay open.
            setEditingKey(null);
          }}
          onDelete={key => {
            const next = { ...customStyles };
            delete next[key];
            setCustomStyles(next);
            if (editingKey === key) setEditingKey(null);
          }}
          onEdit={key => setEditingKey(key)}
          onClose={close}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Custom-style add / edit modal
// ═══════════════════════════════════════════════════════════════════

// Style Guide options for the custom-style editor — drives the
// "Style Guide" column in the unified Style Picker. 'Custom' is the
// default for entries the user hasn't tagged.
const GUIDE_OPTIONS = [
  'Custom', 'BJCP 2021', 'BJCP 2015', 'BJCP 2008', "Brewer's Association 2023",
];

const EMPTY_STYLE = (): EditableStyle => ({
  name: '', cat: '', guide: 'Custom',
  og_min: '', og_max: '', fg_min: '', fg_max: '',
  abv_min: '', abv_max: '', ibu_min: '', ibu_max: '',
  ebc_min: '', ebc_max: '',
});

// Form state holds raw strings so blank inputs round-trip cleanly.
// Conversion to number|null happens at save time (matches HTML's
// `parseFloat(v); v!==''?parseFloat(v):null`).
interface EditableStyle {
  name: string;
  cat: string;
  guide: string;
  og_min: string; og_max: string;
  fg_min: string; fg_max: string;
  abv_min: string; abv_max: string;
  ibu_min: string; ibu_max: string;
  ebc_min: string; ebc_max: string;
}

function styleToForm(s: CustomStyle): EditableStyle {
  const n2s = (n: number | null) => n == null ? '' : String(n);
  return {
    name: s.name ?? '',
    cat:  s.cat ?? '',
    guide: s.guide ?? 'Custom',
    og_min: n2s(s.og_min), og_max: n2s(s.og_max),
    fg_min: n2s(s.fg_min), fg_max: n2s(s.fg_max),
    abv_min: n2s(s.abv_min), abv_max: n2s(s.abv_max),
    ibu_min: n2s(s.ibu_min), ibu_max: n2s(s.ibu_max),
    ebc_min: n2s(s.ebc_min), ebc_max: n2s(s.ebc_max),
  };
}

function formToStyle(f: EditableStyle): CustomStyle {
  const num = (v: string): number | null => v.trim() === '' ? null : parseFloat(v);
  return {
    name: f.name.trim(),
    cat:  f.cat.trim() || 'Custom Styles',
    guide: f.guide?.trim() || 'Custom',
    og_min: num(f.og_min), og_max: num(f.og_max),
    fg_min: num(f.fg_min), fg_max: num(f.fg_max),
    abv_min: num(f.abv_min), abv_max: num(f.abv_max),
    ibu_min: num(f.ibu_min), ibu_max: num(f.ibu_max),
    ebc_min: num(f.ebc_min), ebc_max: num(f.ebc_max),
  };
}

function CustomStyleModal({
  editingKey, customStyles, onSave, onDelete, onEdit, onClose,
}: {
  editingKey: string | null;
  customStyles: Record<string, CustomStyle>;
  onSave: (key: string, style: CustomStyle) => void;
  onDelete: (key: string) => void;
  onEdit: (key: string) => void;
  onClose: () => void;
}) {
  // Reset form whenever the editing key changes — matches HTML
  // openCustomStyleModal field-reset behaviour.
  const formInitial = useMemo<EditableStyle>(() => {
    if (editingKey && customStyles[editingKey]) return styleToForm(customStyles[editingKey]);
    return EMPTY_STYLE();
  }, [editingKey, customStyles]);

  const [form, setForm] = useState<EditableStyle>(formInitial);

  // Sync local form to formInitial when the editing key flips. Use a
  // stable proxy via useMemo's identity rather than useEffect to avoid
  // an extra render — but useMemo can't trigger setState, so use an
  // effect-less sync via a ref-keyed remount instead (handled by parent
  // unmount on close) plus a direct sync if formInitial changes.
  // Simpler: track last initial via state and sync on mismatch.
  const [lastInitial, setLastInitial] = useState(formInitial);
  if (lastInitial !== formInitial) {
    setLastInitial(formInitial);
    setForm(formInitial);
  }

  const update = <K extends keyof EditableStyle>(k: K, v: EditableStyle[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const save = () => {
    if (!form.name.trim()) return;
    const key = editingKey || ('custom_' + Date.now());
    onSave(key, formToStyle(form));
    // Clear form so next add starts blank — matches HTML lines 6364–6368.
    setForm(EMPTY_STYLE());
    setLastInitial(EMPTY_STYLE());
  };

  const keys = Object.keys(customStyles);

  return (
    <div style={ss.modalBackdrop} onClick={onClose}>
      <div style={{ ...ss.modalPanel, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={modalTitleStyle}>{editingKey ? 'EDIT CUSTOM STYLE' : 'ADD CUSTOM STYLE'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <FormRow label="STYLE NAME" colSpan={2}>
            <input
              type="text"
              autoFocus
              placeholder="e.g. House Hazy IPA"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              style={textInputStyle}
            />
          </FormRow>
          <FormRow label="CATEGORY" colSpan={2}>
            <input
              type="text"
              placeholder="e.g. House Styles"
              value={form.cat}
              onChange={e => update('cat', e.target.value)}
              style={textInputStyle}
            />
          </FormRow>
          <FormRow label="STYLE GUIDE" colSpan={2}>
            <select
              value={form.guide}
              onChange={e => update('guide', e.target.value)}
              style={textInputStyle}
            >
              {GUIDE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </FormRow>
        </div>

        <div style={rangeHeaderStyle}>STYLE RANGES (leave blank to skip)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
          <NumCell label="OG MIN °P"  value={form.og_min}  onChange={v => update('og_min',  v)} step={0.1} />
          <NumCell label="OG MAX °P"  value={form.og_max}  onChange={v => update('og_max',  v)} step={0.1} />
          <NumCell label="FG MIN °P"  value={form.fg_min}  onChange={v => update('fg_min',  v)} step={0.1} />
          <NumCell label="FG MAX °P"  value={form.fg_max}  onChange={v => update('fg_max',  v)} step={0.1} />
          <NumCell label="ABV MIN %"  value={form.abv_min} onChange={v => update('abv_min', v)} step={0.1} />
          <NumCell label="ABV MAX %"  value={form.abv_max} onChange={v => update('abv_max', v)} step={0.1} />
          <NumCell label="IBU MIN"    value={form.ibu_min} onChange={v => update('ibu_min', v)} step={1}   />
          <NumCell label="IBU MAX"    value={form.ibu_max} onChange={v => update('ibu_max', v)} step={1}   />
          <NumCell label="EBC MIN"    value={form.ebc_min} onChange={v => update('ebc_min', v)} step={1}   />
          <NumCell label="EBC MAX"    value={form.ebc_max} onChange={v => update('ebc_max', v)} step={1}   />
        </div>

        {keys.length > 0 && (
          <div style={{ marginBottom: 12, maxHeight: 140, overflowY: 'auto' }}>
            <div style={existingHeaderStyle}>EXISTING CUSTOM STYLES</div>
            {keys.map(k => {
              const s = customStyles[k];
              return (
                <div key={k} style={existingRowStyle}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, flex: 1, color: 'var(--text)' }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--amber)' }}>{s.guide || 'Custom'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>{s.cat || ''}</span>
                  <button className="btn sm" style={{ fontSize: 8, padding: '1px 6px' }} onClick={() => onEdit(k)}>Edit</button>
                  <button
                    className="btn sm"
                    style={{ fontSize: 8, padding: '1px 6px', color: 'var(--red)' }}
                    onClick={() => { if (window.confirm('Delete this custom style?')) onDelete(k); }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={save}>SAVE STYLE</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, colSpan, children }: {
  label: string;
  colSpan?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      gridColumn: colSpan === 2 ? '1 / -1' : undefined,
    }}>
      <label style={formLabelStyle}>{label}</label>
      {children}
    </div>
  );
}

function NumCell({ label, value, onChange, step }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
}) {
  return (
    <div>
      <div style={cellLabelStyle}>{label}</div>
      <input
        type="number"
        step={step}
        placeholder="—"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={cellInputStyle}
      />
    </div>
  );
}

const modalTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const formLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1, color: 'var(--text-muted)',
  textTransform: 'uppercase', minWidth: 90, flexShrink: 0,
};

const textInputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 8px', outline: 'none',
};

const rangeHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
  color: 'var(--text-muted)', marginBottom: 6,
};

const cellLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginBottom: 3,
};

const cellInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '3px 6px', outline: 'none',
};

const existingHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
  color: 'var(--text-muted)', marginBottom: 4,
};

const existingRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '4px 6px', background: 'var(--panel2)',
  border: '1px solid var(--border)', marginBottom: 2, borderRadius: 4,
};
