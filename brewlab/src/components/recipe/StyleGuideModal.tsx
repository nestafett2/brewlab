/**
 * Style Guide Comparison Modal — matches brewlab-desktop.html lines 20823–20860
 * (markup) and 6378–6483 (logic).
 *
 * Four range bars (Est OG / Bitterness / Color / Est ABV) plot the recipe's
 * current value against the BJCP 2021 style range. Value is amber when in
 * range, red when out. Marker is clamped to [2, 98]% so it never sits flush
 * against the bar edges.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { getUnifiedStyle } from '../../lib/styles';
import { sgToPlato } from '../../lib/calculations';
import { fmtNum } from '../../lib/format';
import type { CustomStyle, Recipe, StyleOverlay } from '../../types';
import StylePickerDropdown from './StylePickerDropdown';

interface Stats {
  ogPlato: number;
  ibu: number;
  ebc: number;
  abv: number;
}

interface Props {
  recipe: Recipe;
  stats: Stats;
  onClose: () => void;
}

interface BarParams {
  label: string;
  val: number;
  fmt: (v: number) => string;
  min: number;
  max: number;
  rangeStr: string;
}

export default function StyleGuideModal({ recipe, stats, onClose }: Props) {
  const updateRecipe = useStore(s => s.updateRecipe);
  const customStyles = useStore(s => s.customStyles);
  const setCustomStyles = useStore(s => s.setCustomStyles);
  const styleOverlays = useStore(s => s.styleOverlays);
  const setStyleOverlays = useStore(s => s.setStyleOverlays);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // ESC closes the modal (matches the rest of the app's modal convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside closes the style dropdown (mirrors HTML toggleStyleModalDropdown).
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dropdownRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setDropdownOpen(false);
    };
    // Defer attachment so the click that opened the dropdown doesn't close it.
    const id = setTimeout(() => document.addEventListener('mousedown', onDocClick), 10);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDocClick); };
  }, [dropdownOpen]);

  // Unified lookup — works for BJCP and custom styles alike. Custom OG/FG
  // ranges are pre-converted from °P to SG inside getUnifiedStyle so the
  // sgToPlato calls below work for both sources. Pass styleOverlays so
  // BJCP descriptive fields surface alongside numeric ranges.
  const style = getUnifiedStyle(recipe.styleKey, customStyles, styleOverlays);
  const styleLabel = style ? `${style.name} (${recipe.styleKey})` : '— select style —';

  // Descriptive-field write target. BJCP styles persist through the
  // overlay dict; custom styles persist directly on their CustomStyle
  // record (descriptive fields sit alongside the numeric ranges).
  const updateDescriptive = (patch: Partial<StyleOverlay>) => {
    if (!style || !recipe.styleKey) return;
    if (style.source === 'bjcp') {
      const cur = styleOverlays[recipe.styleKey] ?? {};
      // Drop empty strings so the overlay record stays minimal.
      const merged: StyleOverlay = { ...cur, ...patch };
      for (const k of Object.keys(merged) as (keyof StyleOverlay)[]) {
        const v = merged[k];
        if (v === '' || v === null || v === undefined) delete merged[k];
      }
      const next = { ...styleOverlays };
      if (Object.keys(merged).length === 0) delete next[recipe.styleKey];
      else next[recipe.styleKey] = merged;
      setStyleOverlays(next);
    } else {
      const cur = customStyles[recipe.styleKey];
      if (!cur) return;
      const merged: CustomStyle = { ...cur, ...patch };
      // Same empty-string normalization on the descriptive subset only —
      // numeric ranges keep their explicit nulls.
      const descKeys: (keyof StyleOverlay)[] = [
        'notes', 'description', 'profile', 'ingredients', 'examples', 'webLink',
      ];
      for (const k of descKeys) {
        if (merged[k] === '' || merged[k] === null) delete merged[k];
      }
      setCustomStyles({ ...customStyles, [recipe.styleKey]: merged });
    }
  };

  // Build the four bar parameter rows (mirrors HTML renderStyleModalBars params)
  const params: BarParams[] = [
    {
      label: 'Est OG',
      val: stats.ogPlato,
      fmt: v => fmtNum(v, { dp: 2, suffix: ' °P' }),
      min: style?.og ? sgToPlato(style.og[0]) : 0,
      max: style?.og ? sgToPlato(style.og[1]) : 0,
      rangeStr: style?.og ? `${fmtNum(sgToPlato(style.og[0]), { dp: 2 })} – ${fmtNum(sgToPlato(style.og[1]), { dp: 2, suffix: ' °P' })}` : '',
    },
    {
      label: 'Bitterness',
      val: stats.ibu,
      fmt: v => fmtNum(v, { dp: 1, suffix: ' IBU' }),
      min: style?.ibu ? style.ibu[0] : 0,
      max: style?.ibu ? style.ibu[1] : 0,
      rangeStr: style?.ibu ? `${style.ibu[0]} – ${style.ibu[1]} IBU` : '',
    },
    {
      label: 'Color',
      val: stats.ebc,
      fmt: v => fmtNum(v, { dp: 1, suffix: ' EBC' }),
      min: style?.srm ? style.srm[0] * 1.97 : 0,
      max: style?.srm ? style.srm[1] * 1.97 : 0,
      rangeStr: style?.srm ? `${fmtNum(style.srm[0] * 1.97, { dp: 1 })} – ${fmtNum(style.srm[1] * 1.97, { dp: 1, suffix: ' EBC' })}` : '',
    },
    {
      label: 'Est ABV',
      val: stats.abv,
      fmt: v => fmtNum(v, { dp: 1, suffix: '%' }),
      min: style?.abv ? style.abv[0] : 0,
      max: style?.abv ? style.abv[1] : 0,
      rangeStr: style?.abv ? `${fmtNum(style.abv[0], { dp: 1 })} – ${fmtNum(style.abv[1], { dp: 1, suffix: '%' })}` : '',
    },
  ];

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 620, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="modal-title">STYLE GUIDE COMPARISON</div>
          <button className="btn" onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {/* Style selector — dropdown is in-flow, so opening it pushes the
              range bars below down rather than overlapping them. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, whiteSpace: 'nowrap' as const, width: 60, paddingTop: 8 }}>STYLE</span>
            <div style={{ flex: 1 }}>
              <div
                ref={triggerRef}
                onClick={() => setDropdownOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--panel2)', border: '1px solid var(--border2)', padding: '5px 10px', cursor: 'pointer' }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: style ? 'var(--text)' : 'var(--text-muted)', flex: 1 }}>
                  {styleLabel}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>▼</span>
              </div>
              {dropdownOpen && (
                <div ref={dropdownRef} style={{ marginTop: 4 }}>
                  <StylePickerDropdown
                    selectedKey={recipe.styleKey}
                    onSelect={(key, label) => {
                      if (!key) return; // shouldn't happen — no choose-later in this site
                      updateRecipe(recipe.id, { styleKey: key, style: label });
                    }}
                    onClose={() => setDropdownOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Range bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {params.map(p => (
              <RangeBarRow key={p.label} params={p} hasStyle={!!style} />
            ))}
          </div>

          {/* Descriptive fields — editable for any style (BJCP or custom).
              Carbonation renders as a labeled range string when set; the
              text fields render only when non-empty AND grow into edit
              fields on click. We show a single "Edit fields" button to
              toggle the whole descriptive section into edit mode rather
              than per-field toggles, which would clutter the modal. */}
          {style && (
            <DescriptiveSection style={style} onChange={updateDescriptive} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Descriptive fields — view + inline edit ─────────────────────────────
//
// View mode: labeled blocks for any non-empty fields, skipping empties
// entirely. Edit mode: every field rendered as an input/textarea, even
// the empty ones, so the user can fill them in. Toggle controlled by a
// local "Edit / Done" button. All fields optional — saving writes back
// via `onChange` and lets the parent route to overlay vs CustomStyle.

interface DescriptiveProps {
  style: ReturnType<typeof getUnifiedStyle> & object;
  onChange: (patch: Partial<StyleOverlay>) => void;
}

function DescriptiveSection({ style, onChange }: DescriptiveProps) {
  const [editing, setEditing] = useState(false);
  const hasAny =
    !!style.notes || !!style.description || !!style.profile ||
    !!style.ingredients || !!style.examples || !!style.webLink ||
    style.carb != null;

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text-muted)' }}>
          STYLE NOTES
        </div>
        <button className="btn sm" onClick={() => setEditing(e => !e)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <RangeRow
            label="Carbonation (vols)"
            min={style.carb?.[0] ?? null}
            max={style.carb?.[1] ?? null}
            onChange={(min, max) =>
              onChange({ carbonationMin: min, carbonationMax: max })}
          />
          <Textarea label="Notes"       value={style.notes       ?? ''} onChange={v => onChange({ notes: v })} rows={2} />
          <Textarea label="Description" value={style.description ?? ''} onChange={v => onChange({ description: v })} rows={3} />
          <Textarea label="Profile"     value={style.profile     ?? ''} onChange={v => onChange({ profile: v })} rows={3} placeholder="Aroma · Appearance · Flavor · Mouthfeel" />
          <Textarea label="Ingredients" value={style.ingredients ?? ''} onChange={v => onChange({ ingredients: v })} rows={2} />
          <Textarea label="Examples"    value={style.examples    ?? ''} onChange={v => onChange({ examples: v })} rows={2} placeholder="Comma-separated commercial examples" />
          <UrlField label="Web Link"    value={style.webLink     ?? ''} onChange={v => onChange({ webLink: v })} />
        </div>
      ) : !hasAny ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No notes for this style yet — click Edit to add carbonation, description, profile, etc.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {style.carb && (
            <ViewRow label="Carbonation">{fmtNum(style.carb[0], { dp: 1 })} – {fmtNum(style.carb[1], { dp: 1, suffix: ' vols' })}</ViewRow>
          )}
          {style.notes       && <ViewRow label="Notes" multiline>{style.notes}</ViewRow>}
          {style.description && <ViewRow label="Description" multiline>{style.description}</ViewRow>}
          {style.profile     && <ViewRow label="Profile" multiline>{style.profile}</ViewRow>}
          {style.ingredients && <ViewRow label="Ingredients" multiline>{style.ingredients}</ViewRow>}
          {style.examples    && <ViewRow label="Examples" multiline>{style.examples}</ViewRow>}
          {style.webLink     && (
            <ViewRow label="Web Link">
              <a href={style.webLink} target="_blank" rel="noopener noreferrer"
                 style={{ color: 'var(--amber)', textDecoration: 'underline' }}>
                {style.webLink}
              </a>
            </ViewRow>
          )}
        </div>
      )}
    </div>
  );
}

function ViewRow({ label, children, multiline }: { label: string; children: React.ReactNode; multiline?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: multiline ? 'flex-start' : 'baseline' }}>
      <div style={descLabelStyle}>{label}</div>
      <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', whiteSpace: multiline ? 'pre-wrap' as const : 'normal' }}>
        {children}
      </div>
    </div>
  );
}

function Textarea({ label, value, onChange, rows = 2, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={descLabelStyle}>{label}</div>
      <textarea
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...descInputStyle, flex: 1, resize: 'vertical', minHeight: rows * 18 }}
      />
    </div>
  );
}

function UrlField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <div style={descLabelStyle}>{label}</div>
      <input
        type="url"
        placeholder="https://…"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...descInputStyle, flex: 1 }}
      />
    </div>
  );
}

function RangeRow({ label, min, max, onChange }: {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const num = (s: string): number | null => s.trim() === '' ? null : parseFloat(s);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <div style={descLabelStyle}>{label}</div>
      <input
        type="number" step={0.1} placeholder="min"
        value={min ?? ''}
        onChange={e => onChange(num(e.target.value), max)}
        style={{ ...descInputStyle, width: 80 }}
      />
      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 10 }}>–</span>
      <input
        type="number" step={0.1} placeholder="max"
        value={max ?? ''}
        onChange={e => onChange(min, num(e.target.value))}
        style={{ ...descInputStyle, width: 80 }}
      />
    </div>
  );
}

const descLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase' as const,
  width: 92, flexShrink: 0, paddingTop: 4,
};

const descInputStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '4px 8px', outline: 'none',
};

// ── Single bar row (mirrors HTML renderStyleModalBars per-row template) ────
function RangeBarRow({ params: p, hasStyle }: { params: BarParams; hasStyle: boolean }) {
  const inRange = hasStyle && p.val >= p.min && p.val <= p.max;
  const valColor = !hasStyle
    ? 'var(--text-dim)'
    : inRange ? 'var(--amber-bright, #f5a623)' : '#e05050';
  const markerColor = !hasStyle
    ? 'var(--text-dim)'
    : inRange ? 'var(--text)' : '#e05050';
  // Clamp marker to [2, 98] so it never sits flush against the edges (matches HTML).
  const pct = (hasStyle && p.max > p.min)
    ? Math.max(2, Math.min(98, ((p.val - p.min) / (p.max - p.min)) * 100))
    : 50;

  return (
    <div className="smb-row">
      <div className="smb-label">{p.label}</div>
      <div className="smb-val" style={{ color: valColor }}>{p.val > 0 ? p.fmt(p.val) : '—'}</div>
      <div className="smb-bar-wrap">
        <div className="smb-bar-track">
          <div className="smb-bar-fill" />
          {hasStyle && (
            <div className="smb-marker" style={{ left: `${pct}%`, background: markerColor }} />
          )}
        </div>
      </div>
      <div className="smb-range">{p.rangeStr}</div>
    </div>
  );
}
