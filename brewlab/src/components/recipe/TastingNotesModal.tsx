/**
 * Tasting Notes Modal — port of HTML #tastingNotesModal (lines 1614–1632).
 * Three textareas: Process / Tasting / Changes for Next Time.
 *
 * Saves directly through the parent's onChange callbacks — the parent owns
 * cs-process-notes, cs-tasting-notes, cs-changes-notes in the cold blob and
 * debounces the persistence.
 */

import { useEffect } from 'react';

interface Props {
  processNotes: string;
  tastingNotes: string;
  changesNotes: string;
  onChange: (patch: { processNotes?: string; tastingNotes?: string; changesNotes?: string }) => void;
  onClose: () => void;
}

export default function TastingNotesModal({
  processNotes, tastingNotes, changesNotes, onChange, onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ta: React.CSSProperties = {
    background: 'var(--panel2)', border: '1px solid var(--border2)', color: 'var(--text)',
    fontFamily: 'var(--sans)', fontSize: 12, padding: 8,
    width: '100%', height: 80, outline: 'none',
    resize: 'vertical' as const, marginTop: 4, boxSizing: 'border-box' as const,
  };
  const lab: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
    textTransform: 'uppercase' as const, color: 'var(--text-muted)',
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 560, maxWidth: '96vw' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">TASTING NOTES</span>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={lab}>Process Notes</label>
            <textarea
              style={ta}
              placeholder="Process notes..."
              value={processNotes}
              onChange={e => onChange({ processNotes: e.target.value })}
            />
          </div>
          <div>
            <label style={lab}>Tasting Notes</label>
            <textarea
              style={ta}
              placeholder="Mouthfeel, bitterness, malt, hop, yeast character..."
              value={tastingNotes}
              onChange={e => onChange({ tastingNotes: e.target.value })}
            />
          </div>
          <div>
            <label style={lab}>Changes for Next Time</label>
            <textarea
              style={ta}
              placeholder="What to change..."
              value={changesNotes}
              onChange={e => onChange({ changesNotes: e.target.value })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
