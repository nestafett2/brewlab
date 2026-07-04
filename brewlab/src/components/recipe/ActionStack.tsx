/**
 * Right-side action column for the recipe page. Four labeled groups:
 *
 *   SETUP  — Classification / Equipment / Mash Profile (recipe-config)
 *   ADD    — Fermentable / Hops / Misc / Yeast / Water Adj / + Carrageenan
 *   EDIT   — Substitute / Duplicate / Delete (operate on selected ingredient)
 *   TOOLS  — Grain % / Hop IBUs / Add to Planner
 *
 * SETUP holds the two recipe-level dropdowns (Classification + Equipment)
 * plus the Mash Profile launcher — all "what is this recipe configured
 * to be" choices. ADD/EDIT/TOOLS remain action verbs.
 *
 * Selection gating (Substitute / Duplicate / Delete need a selected
 * ingredient) is handled by the parent's existing alert path; rows are
 * just dimmed visually here.
 */

import { useEffect } from 'react';
import { useStore } from '../../store';
import type { Classification, IngredientType } from '../../types';

interface Props {
  /** Recipe id — drives the Setup-section dropdown subscriptions
   *  (classification + equipment selection). */
  recipeId: string;
  selectedId: string | null;
  onAddIngredient: (type: IngredientType) => void;
  onQuickAddCarrageenan: () => void;
  onSubstitute: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMashProfile: () => void;
  onScale: () => void;
  onGrainPct: () => void;
  onHopIbu: () => void;
  onAddToPlanner: () => void;
}

export default function ActionStack({
  recipeId, selectedId,
  onAddIngredient, onQuickAddCarrageenan,
  onSubstitute, onDuplicate, onDelete,
  onMashProfile, onScale, onGrainPct, onHopIbu, onAddToPlanner,
}: Props) {
  // EDIT-group rows need an ingredient selected. Render the row with
  // muted styling + disabled cursor when nothing's picked, but keep
  // the click wired so the parent's existing alert path fires (matches
  // the prior sidebar behaviour — no silent dead clicks).
  const editDimStyle: React.CSSProperties | undefined = selectedId ? undefined : {
    opacity: 0.45, cursor: 'not-allowed',
  };

  // Setup-section subscriptions.
  const recipe                = useStore(s => s.recipes.find(r => r.id === recipeId));
  const setRecipeClassification = useStore(s => s.setRecipeClassification);
  const equipProfiles         = useStore(s => s.equipProfiles);
  const recipeProfiles        = useStore(s => s.recipeProfilesByRecipe[recipeId]);
  const getRecipeProfiles     = useStore(s => s.getRecipeProfiles);
  const setRecipeProfileKind  = useStore(s => s.setRecipeProfileKind);

  // Lazy-prime the per-recipe profile cache on first render — same
  // pattern as the (deleted) ProfileSelect helper. Subsequent renders
  // read directly from `recipeProfiles`.
  useEffect(() => {
    if (recipeProfiles === undefined) getRecipeProfiles(recipeId);
  }, [recipeProfiles, recipeId, getRecipeProfiles]);

  const currentEquip = recipeProfiles?.equip ?? '';

  return (
    <div style={containerStyle}>
      <div className="sb-section-label">Setup</div>
      <div style={setupBlockStyle}>
        <div style={setupFieldStyle}>
          <div style={setupLabelStyle}>Classification</div>
          <select
            value={recipe?.classification || 'Beer'}
            onChange={e => setRecipeClassification(recipeId, e.target.value as Classification)}
            style={selectStyle}
          >
            <option value="Beer">Beer</option>
            <option value="Happoshu">Happoshu</option>
          </select>
        </div>
        <div style={setupFieldStyle}>
          <div style={setupLabelStyle}>Equipment</div>
          <select
            value={currentEquip}
            onChange={e => setRecipeProfileKind(recipeId, 'equip', e.target.value)}
            style={selectStyle}
            title={equipProfiles.find(p => p.id === currentEquip)?.name ?? '— none —'}
          >
            <option value="">— none —</option>
            {equipProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="sidebar-btn" onClick={onMashProfile}>
        <span className="icon">🌡</span>Mash Profile
      </div>

      <div className="sb-section-label" style={{ marginTop: 10 }}>Add</div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('grain')}>
        <span className="icon">🌾</span>Fermentable
      </div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('hop')}>
        <span className="icon">🌿</span>Hops
      </div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('misc')}>
        <span className="icon">+</span>Misc
      </div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('yeast')}>
        <span className="icon">🧫</span>Yeast
      </div>
      <div className="sidebar-btn" onClick={() => onAddIngredient('water')}>
        <span className="icon">💧</span>Water Adj.
      </div>
      <div className="sidebar-btn" onClick={onQuickAddCarrageenan} title="Add 30g/1200L scaled to batch size">
        <span className="icon">🧪</span>+ Carrageenan
      </div>

      <div className="sb-section-label" style={{ marginTop: 10 }}>Edit</div>
      <div className="sidebar-btn" onClick={onSubstitute} style={editDimStyle}>
        <span className="icon">↗</span>Substitute
      </div>
      <div className="sidebar-btn" onClick={onDuplicate} style={editDimStyle}>
        <span className="icon">⧉</span>Duplicate
      </div>
      <div
        className="sidebar-btn"
        onClick={onDelete}
        style={{ ...(editDimStyle ?? {}), color: 'var(--red)' }}
      >
        <span className="icon">✕</span>Delete
      </div>

      <div className="sb-section-label" style={{ marginTop: 10 }}>Tools</div>
      <div className="sidebar-btn" onClick={onScale}>
        <span className="icon">⇔</span>Scale
      </div>
      <div className="sidebar-btn" onClick={onGrainPct}>
        <span className="icon">◎</span>Grain %
      </div>
      <div className="sidebar-btn" onClick={onHopIbu}>
        <span className="icon">◈</span>Hop IBUs
      </div>
      <div className="sidebar-btn" onClick={onAddToPlanner} title="Schedule a brew of this recipe">
        <span className="icon">📅</span>Add to Planner
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  width: 188, flexShrink: 0,
  background: 'var(--bg)',
  borderRight: '1px solid var(--border)',
  padding: '8px 0',
  overflowY: 'auto',
};

// Setup-section block. Sits between the section header and the Mash
// Profile button; padding aligns with .sidebar-btn left/right indent
// (the legacy sidebar buttons indent ~12 px) so the dropdowns visually
// inhabit the same column rhythm.
const setupBlockStyle: React.CSSProperties = {
  padding: '4px 12px 4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const setupFieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const setupLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase' as const,
};

// Native <select> truncation: width:100% + box-sizing constrains the
// closed control to the column width; long option labels (e.g. "Test
// 1200 BBL Hot Liquor Tank") get OS-level ellipsis on the closed
// display. Open dropdown shows full text via the browser's native popup.
const selectStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box' as const,
  background: 'var(--panel2)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  padding: '3px 6px',
  outline: 'none',
  borderRadius: 3,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
};
