/**
 * Style summary panel — bottom-row left tile on the recipe page.
 *
 * Lifted from `StatsSidebar` (now deleted) without behavior change:
 *   • Style picker dropdown (unified BJCP + custom via StylePickerDropdown).
 *   • Four range bars — OG / IBU / EBC|SRM / ABV — with markers
 *     positioned via styleMarkerPos against the recipe's current values.
 *   • ⊞ Style Guide modal trigger that mounts StyleGuideModal.
 *
 * Behavior identical to the sidebar block — calculations, markers,
 * dropdown sizing (620 px overhang) all unchanged. Only the framing
 * shell is new (panel header + tile background).
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { Recipe } from '../../types';
import { getUnifiedStyle } from '../../lib/styles';
import { sgToPlato } from '../../lib/calculations';
import StyleGuideModal from './StyleGuideModal';
import StylePickerDropdown from './StylePickerDropdown';

interface Stats {
  ogSg: number; ogPlato: number; fgSg: number; fgPlato: number;
  abv: number; ibu: number; ibuSg: number; ebc: number;
}

interface Props {
  recipe: Recipe;
  stats: Stats;
}

export default function StyleSummaryPanel({ recipe, stats }: Props) {
  const updateRecipe = useStore(s => s.updateRecipe);
  const customStyles = useStore(s => s.customStyles);
  const colorUnit    = useStore(s => s.settings.colorUnit ?? 'EBC');
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const styleWrapRef = useRef<HTMLDivElement>(null);

  // Click-outside closes the dropdown — same wiring as the old sidebar.
  useEffect(() => {
    if (!styleOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (styleWrapRef.current?.contains(e.target as Node)) return;
      setStyleOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onDocClick), 10);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDocClick); };
  }, [styleOpen]);

  const ogStr  = stats.ogPlato > 0 ? `${stats.ogPlato.toFixed(1)}°P` : '—';
  const ibuStr = stats.ibu     > 0 ? stats.ibu.toFixed(1) : '—';
  const abvStr = stats.abv     > 0 ? `${stats.abv.toFixed(1)}%` : '—';
  // Color: stats.ebc canonical; convert at display time when SRM toggled.
  const colorVal = colorUnit === 'SRM' ? stats.ebc / 1.97 : stats.ebc;
  const colorStr = colorVal > 0 ? `${colorVal.toFixed(1)} ${colorUnit}` : '—';
  // Marker position uses SRM internally regardless of display unit (matches
  // HTML brewlab-desktop.html:7848–7852).
  const colorSrmForBar = stats.ebc / 1.97;

  const style = getUnifiedStyle(recipe.styleKey, customStyles);

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span>Style</span>
        <span
          style={modalTriggerStyle}
          title="Style Guide Comparison"
          onClick={() => setStyleModalOpen(true)}
        >⊞</span>
      </div>

      <div className="style-guide" style={{ padding: '10px 12px 12px' }}>
        <div ref={styleWrapRef} style={{ position: 'relative', marginBottom: 10 }}>
          <div
            onClick={() => setStyleOpen(o => !o)}
            style={pickerTriggerStyle}
          >
            <span style={pickerLabelStyle}>
              {style ? style.name : '— select style —'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 8, flexShrink: 0 }}>▼</span>
          </div>
          {styleOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300, marginTop: 2 }}>
              <StylePickerDropdown
                selectedKey={recipe.styleKey}
                width={620}
                onSelect={(key, label) => {
                  updateRecipe(recipe.id, { styleKey: key, style: label });
                }}
                onClose={() => setStyleOpen(false)}
              />
            </div>
          )}
        </div>

        <StyleRangeBar
          label="OG"
          value={ogStr}
          range={style?.og ? [sgToPlato(style.og[0]), sgToPlato(style.og[1])] : null}
          actual={stats.ogPlato}
          rangeText={style?.og ? `${sgToPlato(style.og[0]).toFixed(1)}–${sgToPlato(style.og[1]).toFixed(1)} P` : '—'}
        />
        <StyleRangeBar
          label="IBU"
          value={ibuStr}
          range={style?.ibu ?? null}
          actual={stats.ibu}
          rangeText={style?.ibu ? `${style.ibu[0]}–${style.ibu[1]}` : '—'}
        />
        <StyleRangeBar
          label={colorUnit}
          value={colorStr}
          // BJCP color is stored as SRM. Compare in SRM regardless of
          // display unit (matches the prior behaviour); only the
          // right-side label flips with colorUnit.
          range={style?.srm ?? null}
          actual={colorSrmForBar}
          rangeText={style?.srm
            ? (colorUnit === 'EBC'
                ? `${(style.srm[0] * 1.97).toFixed(1)}–${(style.srm[1] * 1.97).toFixed(1)} EBC`
                : `${style.srm[0].toFixed(1)}–${style.srm[1].toFixed(1)} SRM`)
            : '—'}
        />
        <StyleRangeBar
          label="ABV"
          value={abvStr}
          range={style?.abv ?? null}
          actual={stats.abv}
          rangeText={style?.abv ? `${style.abv[0].toFixed(1)}–${style.abv[1].toFixed(1)} %` : '—'}
        />
      </div>

      {styleModalOpen && (
        <StyleGuideModal
          recipe={recipe}
          stats={{ ogPlato: stats.ogPlato, ibu: stats.ibu, ebc: stats.ebc, abv: stats.abv }}
          onClose={() => setStyleModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Range bar — five-zone "where this beer lands" indicator ────────
//
// Visual layout per row: [actual value] [bar with 5 colored zones] [style range].
// Bar block layout (BeerSmith-style):
//   • red    0–15 %   far below style
//   • yellow 15–30 %  approaching minimum (tolerance buffer)
//   • green  30–70 %  in style — the actual [min, max]
//   • yellow 70–85 %  approaching max (tolerance buffer)
//   • red    85–100 % far above style
// Hard-stop CSS gradient — no anti-aliased transitions.
//
// Marker mapping: the green block (30–70 %, width 40 % of the bar)
// represents [min, max]. Yellow zones add ±37.5 % of the style range
// width as tolerance buffer; red beyond that. So the visible bar spans
//   [min − 0.75·range, max + 0.75·range]
// and `pos = (actual − displayLow) / (2.5·range) × 100`, clamped to
// [0, 100]. When `range` is null (no style picked) the bar renders a
// flat track and the marker is hidden.

const ZONE_GRADIENT =
  'linear-gradient(to right, ' +
  '#c83232 0%, #c83232 15%, ' +
  '#dfae2c 15%, #dfae2c 30%, ' +
  '#3a8a3a 30%, #3a8a3a 70%, ' +
  '#dfae2c 70%, #dfae2c 85%, ' +
  '#c83232 85%, #c83232 100%)';

function StyleRangeBar({
  label, value, range, actual, rangeText,
}: {
  label: string;
  value: string;
  range: [number, number] | null;
  actual: number;
  rangeText: string;
}) {
  const hasRange = range != null && range[1] > range[0];
  const markerPct = hasRange
    ? (() => {
        const [min, max] = range;
        const span = max - min;
        const displayLow  = min - 0.75 * span;
        const displayHigh = max + 0.75 * span;
        const pct = ((actual - displayLow) / (displayHigh - displayLow)) * 100;
        return Math.max(0, Math.min(100, pct));
      })()
    : null;

  return (
    <div style={rowStyle}>
      <div style={lblStyle}>{label}</div>
      <div style={valStyle}>{value}</div>
      <div style={barWrapStyle}>
        <div style={{ ...barTrackStyle, background: hasRange ? ZONE_GRADIENT : '#3a3a3a' }}>
          {markerPct != null && (
            <svg
              viewBox="0 0 10 8"
              width={10}
              height={8}
              style={{
                position: 'absolute',
                left: `${markerPct}%`,
                top: -7,
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
              }}
              aria-hidden
            >
              <polygon points="0,0 10,0 5,8" fill="#000" stroke="#fff" strokeWidth={0.5} />
            </svg>
          )}
        </div>
      </div>
      <div style={rangeTextStyle}>{rangeText}</div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '34px 60px 1fr 88px',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

const lblStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase' as const,
};

const valStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
  textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums',
};

const barWrapStyle: React.CSSProperties = {
  position: 'relative', minWidth: 0, paddingTop: 2,
};

const barTrackStyle: React.CSSProperties = {
  position: 'relative',
  height: 8,
  borderRadius: 2,
  border: '1px solid rgba(0,0,0,0.35)',
  // background set inline based on hasRange (ZONE_GRADIENT or flat track).
};

const rangeTextStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap' as const,
};

const panelStyle: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  fontFamily: 'var(--display)',
  fontSize: 11,
  letterSpacing: 2,
  color: 'var(--amber)',
  textTransform: 'uppercase' as const,
};

const modalTriggerStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: 4,
};

const pickerTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 4,
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  padding: '4px 8px',
  cursor: 'pointer',
  borderRadius: 6,
};

const pickerLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
};
