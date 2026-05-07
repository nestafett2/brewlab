import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { Recipe } from '../../types';
import { getUnifiedStyle, styleMarkerPos } from '../../lib/styles';
import StyleGuideModal from './StyleGuideModal';
import StylePickerDropdown from './StylePickerDropdown';

interface Stats {
  ogSg: number; ogPlato: number; fgSg: number; fgPlato: number;
  abv: number; ibu: number; ibuSg: number; ebc: number;
  totalGrainKg: number; totalHopG: number; totalCost: number;
}

interface Props {
  stats: Stats;
  recipe: Recipe;
  selectedId: string | null;
  onAddIngredient: (type: 'grain' | 'hop' | 'yeast' | 'misc') => void;
  onQuickAddCarrageenan: () => void;
  onSubstitute: () => void;
  onGrainPct: () => void;
  onHopIbu: () => void;
  onMashProfile: () => void;
  onAddToPlanner: () => void;
}

export default function StatsSidebar({ stats, recipe, onAddIngredient, onQuickAddCarrageenan, onSubstitute, onGrainPct, onHopIbu, onMashProfile, onAddToPlanner }: Props) {
  const updateRecipe = useStore(s => s.updateRecipe);
  const customStyles = useStore(s => s.customStyles);
  const colorUnit    = useStore(s => s.settings.colorUnit ?? 'EBC');
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const styleWrapRef = useRef<HTMLDivElement>(null);

  // Click-outside closes the style dropdown.
  useEffect(() => {
    if (!styleOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (styleWrapRef.current?.contains(e.target as Node)) return;
      setStyleOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onDocClick), 10);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDocClick); };
  }, [styleOpen]);

  const ogStr = stats.ogPlato > 0 ? `${stats.ogPlato.toFixed(1)}°P` : '—';
  const fgStr = stats.fgPlato > 0 ? `${stats.fgPlato.toFixed(1)}°P` : '—';
  const abvStr = stats.abv > 0 ? `${stats.abv.toFixed(1)}%` : '—';
  const ibuStr = stats.ibu > 0 ? stats.ibu.toFixed(1) : '—';
  const ibuSgStr = stats.ibuSg > 0 ? stats.ibuSg.toFixed(2) : '—';
  // Color: stats.ebc is the canonical internal value (CALCULATIONS.md
  // "EBC stored in malt library"). Convert to SRM for display when
  // settings.colorUnit === 'SRM' (HTML brewlab-desktop.html:7784–7786).
  const colorVal = colorUnit === 'SRM' ? stats.ebc / 1.97 : stats.ebc;
  const colorStr = colorVal > 0 ? `${colorVal.toFixed(1)} ${colorUnit}` : '—';

  // Unified style lookup — works for both BJCP and custom styles.
  const style = getUnifiedStyle(recipe.styleKey, customStyles);
  // Style range bar: BJCP styles store SRM. Compare current value in SRM
  // regardless of display unit (HTML lines 7848–7852: marker position uses
  // SRM internally; only the label/text changes with colorUnit).
  const colorSrmForBar = stats.ebc / 1.97;

  return (
    <div className="sidebar" style={{ width: 188 }}>
      {/* Recipe Stats */}
      <div className="stats-card" style={{ margin: '8px 8px 0', borderRadius: 8 }}>
        <div className="stats-card-title">Recipe Stats</div>
        <div className="stat-row"><span className="stat-label">Est OG</span><span className="stat-value">{ogStr}</span></div>
        <div className="stat-row"><span className="stat-label">Est FG</span><span className="stat-value dim">{fgStr}</span></div>
        <div className="stat-row"><span className="stat-label">Est ABV</span><span className="stat-value dim">{abvStr}</span></div>
        <div className="stat-row"><span className="stat-label">IBU</span><span className="stat-value dim">{ibuStr}</span></div>
        <div className="stat-row"><span className="stat-label">IBU/SG</span><span className="stat-value dim">{ibuSgStr}</span></div>
        <div className="stat-row"><span className="stat-label">Color</span><span className="stat-value dim">{colorStr}</span></div>
        <div className="stat-row"><span className="stat-label">Grains</span><span className="stat-value dim">{stats.totalGrainKg > 0 ? `${stats.totalGrainKg.toFixed(2)} kg` : '—'}</span></div>
        <div className="stat-row"><span className="stat-label">Hops</span><span className="stat-value dim">{stats.totalHopG > 0 ? `${stats.totalHopG.toFixed(0)} g` : '—'}</span></div>
        <div className="stat-row"><span className="stat-label">Total Cost</span><span className="stat-value">&yen;{Math.round(stats.totalCost).toLocaleString()}</span></div>
      </div>

      {/* Actions — all wired */}
      <div className="sb-section-label">Actions</div>
      <div className="sidebar-btn" onClick={onMashProfile}><span className="icon">🌡</span>Mash Profile</div>
      <div className="sidebar-btn" onClick={onSubstitute}><span className="icon">↗</span>Substitute</div>
      <div className="sidebar-btn" onClick={onGrainPct}><span className="icon">◎</span>Grain %</div>
      <div className="sidebar-btn" onClick={onHopIbu}><span className="icon">◈</span>Hop IBUs</div>
      <div className="sidebar-btn" onClick={onAddToPlanner} title="Schedule a brew of this recipe"><span className="icon">📅</span>Add to Planner</div>

      {/* Add */}
      <div className="sb-section-label" style={{ marginTop: 4 }}>Add</div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('grain')}><span className="icon">🌾</span>Fermentable</div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('hop')}><span className="icon">🌿</span>Hops</div>
      <div className="sidebar-btn"><span className="icon">💧</span>Water Adj.</div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('yeast')}><span className="icon">🧫</span>Yeast</div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('misc')}><span className="icon">+</span>Misc</div>
      <div className="sidebar-btn" onClick={onQuickAddCarrageenan} title="Add 30g/1200L scaled to batch size"><span className="icon">🧪</span>+ Carrageenan</div>

      {/* Style Guide */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, padding: '10px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="stats-card-title" style={{ margin: 0 }}>Style</span>
          <span
            style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
            title="Style Guide Comparison"
            onClick={() => setStyleModalOpen(true)}
          >⊞</span>
        </div>
        <div className="style-guide">
          {/* Style picker — unified BJCP + Custom dropdown. The dropdown
              panel sits absolute-positioned at width 620 so it can fit the
              BeerSmith-style 6-column table without being cramped to the
              188px sidebar. The recipe-tab body container has overflow
              visible so this overhang is fine. */}
          <div ref={styleWrapRef} style={{ position: 'relative', marginBottom: 10 }}>
            <div
              onClick={() => setStyleOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, background: 'var(--panel2)', border: '1px solid var(--border2)', padding: '4px 8px', cursor: 'pointer', borderRadius: 6 }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
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

          {/* Range bars — positioned markers when style is selected. Each
              range may be null on a custom style if the user left those
              fields blank; styleMarkerPos guard handles either case. */}
          <StyleRangeBar label="OG"        value={ogStr}    markerPos={style?.og  ? styleMarkerPos(stats.ogSg, style.og) : null} />
          <StyleRangeBar label="IBU"       value={ibuStr}   markerPos={style?.ibu ? styleMarkerPos(stats.ibu,  style.ibu) : null} />
          <StyleRangeBar label={colorUnit} value={colorStr} markerPos={style?.srm ? styleMarkerPos(colorSrmForBar, style.srm) : null} />
          <StyleRangeBar label="ABV"       value={abvStr}   markerPos={style?.abv ? styleMarkerPos(stats.abv,  style.abv) : null} />
        </div>
      </div>

      {/* Style Guide Comparison modal — opens when ⊞ icon is clicked */}
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

function StyleRangeBar({ label, value, markerPos }: { label: string; value: string; markerPos: number | null }) {
  return (
    <div className="style-row">
      <div className="sr-lbl">{label}</div>
      <div className="range-bar">
        <div className="range-fill" />
        {markerPos != null && <div className="range-marker" style={{ left: `${markerPos}%` }} />}
      </div>
      <div className="sr-val">{value}</div>
    </div>
  );
}
