/**
 * Persistent Undo button — desktop top bar, top-right of the tab row.
 * Reads from `undoHistory` (decoupled from toast lifetime) so it can
 * still fire even after the originating toast has auto-dismissed.
 * Mirrors Ctrl+Z (App.tsx keydown) — both go through
 * `popMostRecentUndo` so behavior stays in sync.
 *
 * Disabled when undoHistory is empty. Tooltip shows the message of
 * the entry that would be undone.
 */

import { useStore } from '../../store';

export default function UndoButton() {
  const undoHistory = useStore(s => s.undoHistory);
  const popMostRecentUndo = useStore(s => s.popMostRecentUndo);

  const target = undoHistory.length > 0 ? undoHistory[undoHistory.length - 1] : null;
  const disabled = !target;
  const title = target ? `Undo: ${target.message}` : 'Nothing to undo';

  return (
    <button
      type="button"
      className="topbar-undo-btn"
      onClick={popMostRecentUndo}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <span className="topbar-undo-icon" aria-hidden>↶</span>
      <span className="topbar-undo-label">Undo</span>
    </button>
  );
}
