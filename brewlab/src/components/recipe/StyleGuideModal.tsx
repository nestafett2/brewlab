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
import type { Recipe } from '../../types';
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
  // sgToPlato calls below work for both sources.
  const style = getUnifiedStyle(recipe.styleKey, customStyles);
  const styleLabel = style ? `${style.name} (${recipe.styleKey})` : '— select style —';

  // Build the four bar parameter rows (mirrors HTML renderStyleModalBars params)
  const params: BarParams[] = [
    {
      label: 'Est OG',
      val: stats.ogPlato,
      fmt: v => `${v.toFixed(2)} °P`,
      min: style?.og ? sgToPlato(style.og[0]) : 0,
      max: style?.og ? sgToPlato(style.og[1]) : 0,
      rangeStr: style?.og ? `${sgToPlato(style.og[0]).toFixed(2)} – ${sgToPlato(style.og[1]).toFixed(2)} °P` : '',
    },
    {
      label: 'Bitterness',
      val: stats.ibu,
      fmt: v => `${v.toFixed(1)} IBU`,
      min: style?.ibu ? style.ibu[0] : 0,
      max: style?.ibu ? style.ibu[1] : 0,
      rangeStr: style?.ibu ? `${style.ibu[0]} – ${style.ibu[1]} IBU` : '',
    },
    {
      label: 'Color',
      val: stats.ebc,
      fmt: v => `${v.toFixed(1)} EBC`,
      min: style?.srm ? style.srm[0] * 1.97 : 0,
      max: style?.srm ? style.srm[1] * 1.97 : 0,
      rangeStr: style?.srm ? `${(style.srm[0] * 1.97).toFixed(1)} – ${(style.srm[1] * 1.97).toFixed(1)} EBC` : '',
    },
    {
      label: 'Est ABV',
      val: stats.abv,
      fmt: v => `${v.toFixed(1)}%`,
      min: style?.abv ? style.abv[0] : 0,
      max: style?.abv ? style.abv[1] : 0,
      rangeStr: style?.abv ? `${style.abv[0].toFixed(1)} – ${style.abv[1].toFixed(1)}%` : '',
    },
  ];

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 620, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="modal-title">STYLE GUIDE COMPARISON</div>
          <button className="btn" onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        </div>
      </div>
    </div>
  );
}

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
