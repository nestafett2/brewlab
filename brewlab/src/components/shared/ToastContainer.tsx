/**
 * Toast container — fixed bottom-right, stacks toasts vertically with
 * newest on top of the visible stack. Mounted once in App.tsx outside
 * the device-specific layouts so toasts surface across desktop / tablet
 * / mobile.
 *
 * Auto-dismiss timing lives in the store (per-toast setTimeout in a
 * module-scoped Map). Hover-pause reaches into that via the store's
 * `pauseToastTimer(id)` and `resumeToastTimer(id, ms)` actions — clear
 * on mouseenter, fresh duration on mouseleave (intentional: hovering
 * "extends" rather than "remembers remaining time").
 *
 * No exit animation per the architecture decision — fade-in only.
 */

import { useStore } from '../../store';
import {
  type ToastSpec,
  TOAST_DURATION_DEFAULT,
  TOAST_DURATION_WITH_UNDO,
} from '../../lib/toast';

export default function ToastContainer() {
  const toasts = useStore(s => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map(spec => <Toast key={spec.id} spec={spec} />)}
    </div>
  );
}

function Toast({ spec }: { spec: ToastSpec }) {
  const dismissToast     = useStore(s => s.dismissToast);
  const popUndoById      = useStore(s => s.popUndoById);
  const pauseToastTimer  = useStore(s => s.pauseToastTimer);
  const resumeToastTimer = useStore(s => s.resumeToastTimer);

  const duration =
    spec.duration ?? (spec.undo ? TOAST_DURATION_WITH_UNDO : TOAST_DURATION_DEFAULT);

  const handleMouseEnter = () => pauseToastTimer(spec.id);
  const handleMouseLeave = () => resumeToastTimer(spec.id, duration);

  // Route through the store so the matching undoHistory entry is
  // popped (otherwise the persistent button could later fire the
  // same closure a second time).
  const handleUndoClick = () => popUndoById(spec.id);

  const handleClose = () => dismissToast(spec.id);

  const variant = spec.variant ?? 'info';
  const icon = variant === 'success' ? '✓' : variant === 'error' ? '✕' : 'ℹ';

  return (
    <div
      className={`toast toast-${variant}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="toast-icon">{icon}</span>
      <span className="toast-message">{spec.message}</span>
      {spec.undo && (
        <button className="toast-undo" onClick={handleUndoClick}>
          Undo
        </button>
      )}
      <button
        className="toast-close"
        onClick={handleClose}
        aria-label="Dismiss"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
