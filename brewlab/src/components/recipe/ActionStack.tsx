/**
 * Right-side action column for the recipe page. Two labeled groups:
 *
 *   EDIT   — Substitute / Duplicate / Delete (operate on selected ingredient)
 *   TOOLS  — Grain % / Hop IBUs / Add to Planner
 *
 * SETUP and ADD sections were extracted to RecipeActionLeft.tsx.
 *
 * Selection gating (Substitute / Duplicate / Delete need a selected
 * ingredient) is handled by the parent's existing alert path; rows are
 * just dimmed visually here.
 */

interface Props {
  selectedId: string | null;
  onSubstitute: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onScale: () => void;
  onGrainPct: () => void;
  onHopIbu: () => void;
  onAddToPlanner: () => void;
}

export default function ActionStack({
  selectedId,
  onSubstitute, onDuplicate, onDelete,
  onScale, onGrainPct, onHopIbu, onAddToPlanner,
}: Props) {
  // EDIT-group rows need an ingredient selected. Render the row with
  // muted styling + disabled cursor when nothing's picked, but keep
  // the click wired so the parent's existing alert path fires (matches
  // the prior sidebar behaviour — no silent dead clicks).
  const editDimStyle: React.CSSProperties | undefined = selectedId ? undefined : {
    opacity: 0.45, cursor: 'not-allowed',
  };

  return (
    <div style={containerStyle}>
      <div className="sb-section-label">Edit</div>
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
  borderLeft: '1px solid var(--border)',
  padding: '8px 0',
  overflowY: 'auto',
};
