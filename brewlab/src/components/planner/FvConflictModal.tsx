/**
 * FV Conflict modal — port of brewlab-desktop.html lines 14107–14172
 * (openFvConflictModal / closeFvConflictModal).
 *
 * Fires when a Save tries to assign a brew to a vessel that's already
 * occupied during the brew's date range. Offers three resolution paths:
 *   1. Move the new brew to a free FV/Unitank for the same date range.
 *   2. Move the existing brew to Unassigned.
 *   3. Move the new brew to Unassigned.
 *
 * The page calls back into the AddBrewModal's save flow with the chosen
 * vessel id (or `null` to mean "move existing aside, keep new in
 * intended vessel").
 */

import { useEffect } from 'react';
import { strToDate } from '../../lib/dates';
import type { PlannerBrew } from '../../types';
import type { VesselGroup } from './plannerShared';

interface Props {
  vesselName: string;
  existingName: string;
  newName: string;
  newStart: string;
  newEnd: string;
  /** Pass plannerBrews so we can compute free vessels for the new range. */
  plannerBrews: PlannerBrew[];
  /** Pre-derived vessel groups so we don't reach back into the store. */
  vesselGroups: VesselGroup[];
  /** The id of the brew being edited (skip self-comparison) — or null when adding. */
  editingBrewId: string | null;
  onMoveExisting: () => void;
  onMoveNew: (targetVesselId: string) => void;
  onClose: () => void;
}

export default function FvConflictModal({
  vesselName, existingName, newName, newStart, newEnd,
  plannerBrews, vesselGroups, editingBrewId,
  onMoveExisting, onMoveNew, onClose,
}: Props) {
  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Compute free FV vessels for the new range — HTML only checks the
  // FERMENTERS group (HTML 14115). UNITANKS is not a group in this
  // codebase; `unitanks` would be a future add. Brewhouse + Unassigned
  // are not candidates by design.
  const freeVessels: { id: string; name: string }[] = [];
  vesselGroups.forEach(g => {
    if (g.group !== 'FERMENTERS') return;
    g.vessels.forEach(v => {
      if (v.id === 'unassigned') return;
      const ns = strToDate(newStart), ne = strToDate(newEnd);
      const hasConflict = plannerBrews.some(b => {
        if (b.id === editingBrewId) return false;
        if (b.vessel !== v.id) return false;
        const bs = strToDate(b.start), be = strToDate(b.end);
        return ns <= be && ne >= bs;
      });
      if (!hasConflict) freeVessels.push(v);
    });
  });

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>VESSEL CONFLICT</div>
        <div style={msgStyle}>
          <b>{vesselName}</b> is already assigned to <b>"{existingName}"</b> during this period.
        </div>

        {freeVessels.length > 0 && (
          <>
            <div style={sectionLabelStyle}>Move "{newName}" to a free vessel:</div>
            <div style={btnGroupStyle}>
              {freeVessels.map(v => (
                <button
                  key={v.id}
                  className="btn"
                  style={{ ...optionBtnStyle, borderColor: 'var(--amber)', color: 'var(--amber)' }}
                  onClick={() => { onClose(); onMoveNew(v.id); }}
                >→ {v.name}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ ...sectionLabelStyle, marginTop: 8 }}>Or move to Unassigned:</div>
        <div style={btnGroupStyle}>
          <button
            className="btn"
            style={optionBtnStyle}
            onClick={() => { onClose(); onMoveExisting(); }}
          >Move "{existingName}" to Unassigned</button>
          <button
            className="btn"
            style={optionBtnStyle}
            onClick={() => { onClose(); onMoveNew('unassigned'); }}
          >Move "{newName}" to Unassigned</button>
        </div>

        <button
          className="btn"
          style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}
          onClick={onClose}
        >Cancel — go back</button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 380, maxWidth: '95vw',
  display: 'flex', flexDirection: 'column', gap: 4,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 6, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const msgStyle: React.CSSProperties = {
  fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text)',
  marginBottom: 8, lineHeight: 1.5,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  letterSpacing: 0.5, textTransform: 'uppercase', margin: '4px 0 2px',
};

const btnGroupStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};

const optionBtnStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 11,
};
