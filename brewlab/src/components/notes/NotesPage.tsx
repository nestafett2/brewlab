/**
 * Brewery-wide Notes page — port of brewlab-desktop.html lines 3008–3019
 * (markup) and 9996–10058 (renderDesktopNotesList / addBreweryNoteDesktop /
 * deleteBreweryNoteDesktop).
 *
 * Two-column layout:
 *   • Left (320px) — title, textarea, "Add Note" button.
 *   • Right (flex 1) — scrollable list of cards, newest first by
 *     created_at. Each card shows timestamp + text + a small × delete
 *     button. "No notes yet." placeholder when empty.
 *
 * Storage: bl_brewery_notes (array of { id, text, created_at }). Already
 * wired in the store with addBreweryNote / deleteBreweryNote actions and
 * synced via the settings table (bl_brewery_notes is in SETTINGS_KEYS).
 *
 * Behaviour matches HTML exactly:
 *   • Trim input; ignore empty.
 *   • crypto.randomUUID() id, ISO timestamp.
 *   • confirm() before delete.
 *   • Sort newest-first by created_at on render — defensive against
 *     out-of-order data (e.g. mobile/tablet inserts that didn't prepend).
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import type { BreweryNote } from '../../types';

export default function NotesPage() {
  const breweryNotes      = useStore(s => s.breweryNotes);
  const addBreweryNote    = useStore(s => s.addBreweryNote);
  const deleteBreweryNote = useStore(s => s.deleteBreweryNote);
  const setBreweryNotes   = useStore(s => s.setBreweryNotes);
  const pushToast         = useStore(s => s.pushToast);
  const [draft, setDraft] = useState('');

  const sorted = useMemo(
    () => breweryNotes.slice().sort((a, b) => (b.created_at || '') > (a.created_at || '') ? 1 : -1),
    [breweryNotes],
  );

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const note: BreweryNote = {
      id: crypto.randomUUID(),
      text,
      created_at: new Date().toISOString(),
    };
    addBreweryNote(note);
    setDraft('');
  };

  const remove = (id: string) => {
    // Snapshot the full breweryNotes array so undo restores order +
    // any sibling notes (deleteBreweryNote does an array filter; the
    // restore needs the pre-filter array).
    const before = breweryNotes;
    deleteBreweryNote(id);
    pushToast({
      message: 'Deleted note',
      undo: () => setBreweryNotes(before),
    });
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Left — add note */}
        <div style={leftColStyle}>
          <div style={titleStyle}>BREWERY NOTES</div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a note…"
            // Ctrl/Cmd+Enter submits — small QoL not in HTML, harmless.
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') add(); }}
            style={textareaStyle}
          />
          <button className="btn primary" style={{ width: '100%' }} onClick={add}>
            Add Note
          </button>
        </div>

        {/* Right — notes list */}
        <div style={listStyle}>
          {sorted.length === 0 ? (
            <div style={emptyStyle}>No notes yet.</div>
          ) : sorted.map(n => (
            <div key={n.id} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={timestampStyle}>
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                </div>
                <div style={textStyle}>{n.text || ''}</div>
              </div>
              <button
                className="btn sm"
                style={deleteBtnStyle}
                onClick={() => remove(n.id)}
                title="Delete note"
              >×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1,
  width: '100%', height: '100%', overflow: 'hidden',
};

const containerStyle: React.CSSProperties = {
  display: 'flex', gap: 20, padding: 24, height: '100%',
  boxSizing: 'border-box', overflow: 'hidden',
};

const leftColStyle: React.CSSProperties = {
  width: 320, flexShrink: 0,
  display: 'flex', flexDirection: 'column', gap: 12,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 28, color: 'var(--amber)',
  letterSpacing: 1,
};

const textareaStyle: React.CSSProperties = {
  flex: 1, minHeight: 160, maxHeight: 260,
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13,
  padding: 10, resize: 'vertical', outline: 'none',
  borderRadius: 6, boxSizing: 'border-box',
};

const listStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 10,
};

const emptyStyle: React.CSSProperties = {
  color: 'var(--text-muted)', fontFamily: 'var(--sans)', fontSize: 13,
  padding: '20px 0',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '12px 14px',
  display: 'flex', gap: 12, alignItems: 'flex-start',
};

const timestampStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  letterSpacing: 0.5, marginBottom: 6,
};

const textStyle: React.CSSProperties = {
  fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text)',
  lineHeight: 1.5, whiteSpace: 'pre-wrap',
};

const deleteBtnStyle: React.CSSProperties = {
  flexShrink: 0, color: 'var(--red)', borderColor: 'var(--red)',
  fontSize: 11, padding: '2px 8px',
};
