/**
 * Add / Edit Brew modal — port of brewlab-desktop.html lines 13995–14212
 * (openAddBrewModal / openEditBrew / saveAddBrew + nested action editor
 * 13902–13992 + colour swatches 14052–14064).
 *
 * Sections:
 *   • Beer name                  (required)
 *   • Recipe linker              (opens RecipePickerModal; freeform allowed)
 *   • Vessel select              (grouped by Brewhouse / FV / BT / Unassigned)
 *   • Start date + duration      (end is computed)
 *   • Colour palette + custom    (15-swatch palette + native colour input)
 *   • Actions list (edit only)   (DH / CRASH / XFER / CUSTOM, with date+dur)
 *   • Notes
 *
 * Save flow:
 *   • Required: name + start. Trim and ignore empty.
 *   • End = start + (duration−1) days.
 *   • Vessel conflict: if vessel is not bh / unassigned, scan plannerBrews
 *     for overlap. If found, surface FvConflictModal — the page
 *     coordinates the resolution callbacks. We expose `onSaveResolved`
 *     so the page can re-call us with an overridden vessel.
 *
 * The actions editor is a nested form inside the modal — same lifecycle
 * as HTML's openAddActionForm/saveActionForm. Edits persist immediately
 * to the brew object via onChangeActions; this matches HTML, where each
 * action save calls renderActionsList + renderPlanner.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { PlannerBrew, PlannerAction } from '../../types';
import {
  BREW_SWATCHES, ACTION_TYPES,
  type VesselGroup,
} from './plannerShared';
import {
  addDays, dateToStr, diffDays, fmtDate, strToDate, todayDate,
} from '../../lib/dates';
import RecipePickerModal from './RecipePickerModal';

/** Conflict context — everything the page needs to surface FvConflictModal
 *  and resolve. The page owns all resolution actions; the modal just
 *  reports the overlap. */
export interface ConflictContext {
  proposed: PlannerBrew;
  existingBrew: PlannerBrew;
  vesselName: string;
}

interface Props {
  /** Existing brew if editing, else null. */
  brew: PlannerBrew | null;
  /** Pre-fill vessel + date when adding from a cell click. */
  prefillVessel?: string;
  prefillDate?: string;
  /** Pre-fill recipe linker — used by RecipeTab's "Add to Planner"
   *  button (HTML addCurrentRecipeToPlanner, brewlab-desktop.html:13522).
   *  Mirrors abmRecipeChanged semantics: sets the link, sets the display
   *  label, and seeds the beer name when it's empty. */
  prefillRecipeId?: string;
  prefillRecipeName?: string;
  vesselGroups: VesselGroup[];
  onClose: () => void;
  /** Save when there's no conflict (or after resolution). The page
   *  upserts the brew in the store. */
  onSave: (next: PlannerBrew) => void;
  /** Conflict detected — page surfaces FvConflictModal and decides. */
  onConflict: (ctx: ConflictContext) => void;
  onDelete: () => void;
  /** Persist action edits to the brew immediately (mirrors HTML). */
  onChangeActions: (brewId: string, actions: PlannerAction[]) => void;
}

export default function AddBrewModal({
  brew, prefillVessel, prefillDate, prefillRecipeId, prefillRecipeName,
  vesselGroups, onClose, onSave, onConflict, onDelete, onChangeActions,
}: Props) {
  const isEdit = !!brew;
  const plannerBrews = useStore(s => s.plannerBrews);
  const recipes      = useStore(s => s.recipes);

  // Seed name from prefillRecipeName when adding via "Add to Planner"
  // (HTML abmRecipeChanged sets the name field when it's empty —
  // brewlab-desktop.html:13642). When editing, brew.name wins.
  const initialName = brew?.name ?? (prefillRecipeId ? (prefillRecipeName ?? '') : '');
  const initialStart = brew?.start ?? prefillDate ?? dateToStr(todayDate());
  const initialDur = brew ? diffDays(strToDate(brew.start), strToDate(brew.end)) + 1 : 14;
  const initialVessel = brew?.vessel ?? prefillVessel ?? findFirstVesselId(vesselGroups);
  const initialColor = brew?.color ?? BREW_SWATCHES[0];
  const initialNotes = brew?.notes ?? '';
  // Edit mode reads the recipe link from the brew object; add mode
  // accepts a prefill from RecipeTab's "Add to Planner" flow.
  const initialRecipeId = (brew?.recipeId ?? prefillRecipeId) ?? '';
  const initialRecipeName = (() => {
    if (!initialRecipeId) return '';
    if (prefillRecipeName && prefillRecipeId === initialRecipeId) return prefillRecipeName;
    const r = recipes.find(x => x.id === initialRecipeId);
    return r?.beerName?.trim() || r?.name || '';
  })();

  const [name, setName]                 = useState(initialName);
  const [recipeId, setRecipeId]         = useState<string>(initialRecipeId || '');
  const [recipeDisplay, setRecipeDisplay] = useState<string>(initialRecipeName);
  const [vessel, setVessel]             = useState(initialVessel);
  const [start, setStart]               = useState(initialStart);
  const [duration, setDuration]         = useState<string>(String(initialDur));
  const [color, setColor]               = useState(initialColor);
  const [notes, setNotes]               = useState(initialNotes);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Action editor state ─────────────────────────────────────────────
  const [actions, setActions] = useState<PlannerAction[]>(brew?.actions ?? []);
  const [actEditingIdx, setActEditingIdx] = useState<number | null>(null);
  const [actFormOpen,   setActFormOpen]   = useState(false);
  const [actType,       setActType]       = useState<'dh'|'crash'|'xfer'|'custom'>('dh');
  const [actLabel,      setActLabel]      = useState('');
  const [actDate,       setActDate]       = useState('');
  const [actDur,        setActDur]        = useState<string>('3');

  const persistActions = (next: PlannerAction[]) => {
    setActions(next);
    if (brew?.id) onChangeActions(brew.id, next);
  };

  const openAddActionForm = () => {
    setActEditingIdx(null);
    setActType('dh');
    setActLabel('');
    setActDur('3');
    // Default date = brew start + 7 days clamped to brew end (HTML 13911).
    const sd = strToDate(start);
    const dur = parseInt(duration) || 14;
    const end = addDays(sd, dur - 1);
    const def = addDays(sd, 7);
    setActDate(dateToStr(def <= end ? def : sd));
    setActFormOpen(true);
  };

  const editAction = (idx: number) => {
    const a = actions[idx];
    if (!a) return;
    setActEditingIdx(idx);
    setActType((a.type as 'dh'|'crash'|'xfer'|'custom') || 'custom');
    setActLabel(a.label || '');
    setActDur(String(a.dur || 1));
    const fallback = dateToStr(addDays(strToDate(start), (a.day || 1) - 1));
    setActDate(a.date || fallback);
    setActFormOpen(true);
  };

  const saveActionForm = () => {
    if (!actDate) return;
    const day = diffDays(strToDate(start), strToDate(actDate)) + 1;
    const dur = parseInt(actDur) || 1;
    const next: PlannerAction = {
      type: actType, day, dur,
      label: actLabel.trim(),
      date: actDate,
    };
    const out = [...actions];
    if (actEditingIdx != null) out[actEditingIdx] = next;
    else out.push(next);
    persistActions(out);
    setActFormOpen(false);
    setActEditingIdx(null);
  };

  const deleteAction = (idx: number) => {
    persistActions(actions.filter((_, i) => i !== idx));
  };

  // ── Save logic ──────────────────────────────────────────────────────
  const buildBrew = (vesselOverride?: string): PlannerBrew => {
    const dur = parseInt(duration) || 14;
    const end = dateToStr(addDays(strToDate(start), dur - 1));
    return {
      id: brew?.id ?? `brew_${Date.now()}`,
      name: name.trim(),
      recipeId: recipeId || null,
      vessel: vesselOverride ?? vessel,
      start,
      end,
      color,
      notes: notes.trim(),
      actions,
    };
  };

  const findConflict = (forVessel: string, brewStart: string, brewEnd: string): PlannerBrew | null => {
    if (!forVessel || forVessel === 'bh' || forVessel === 'unassigned') return null;
    const sd = strToDate(brewStart), ed = strToDate(brewEnd);
    return plannerBrews.find(b => {
      if (b.id === brew?.id) return false;
      if (b.vessel !== forVessel) return false;
      const bs = strToDate(b.start), be = strToDate(b.end);
      return sd <= be && ed >= bs;
    }) ?? null;
  };

  const handleSave = () => {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    if (!start) return;
    const proposed = buildBrew();
    const conflict = findConflict(proposed.vessel, proposed.start, proposed.end);
    if (conflict) {
      const vName = vesselGroups
        .flatMap(g => g.vessels)
        .find(v => v.id === proposed.vessel)?.name ?? proposed.vessel;
      onConflict({ proposed, existingBrew: conflict, vesselName: vName });
      return;
    }
    onSave(proposed);
  };

  // End-date display (HTML abmRecalcEnd at line 13630).
  const endDisplay = useMemo(() => {
    if (!start) return '';
    const dur = parseInt(duration) || 0;
    if (dur <= 0) return '';
    return `→ ends ${fmtDate(addDays(strToDate(start), dur - 1))}`;
  }, [start, duration]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <>
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>{isEdit ? 'EDIT BREW' : 'ADD BREW'}</div>

        <Row label="BEER NAME">
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Solar Storm"
            style={textInputStyle}
          />
        </Row>

        <Row label="LINK RECIPE">
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                background: 'var(--panel2)', border: '1px solid var(--border2)',
                padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 10,
                color: recipeId ? 'var(--text)' : 'var(--text-muted)',
                cursor: 'pointer', minHeight: 26,
              }}
              onClick={() => setPickerOpen(true)}
            >{recipeId ? recipeDisplay : '— freeform / no recipe —'}</div>
            <button className="btn sm" onClick={() => setPickerOpen(true)}>Browse</button>
            <button
              className="btn sm" title="Clear"
              onClick={() => { setRecipeId(''); setRecipeDisplay(''); }}
            >✕</button>
          </div>
        </Row>

        <Row label="VESSEL">
          <select value={vessel} onChange={e => setVessel(e.target.value)} style={textInputStyle}>
            {vesselGroups.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Row>

        <Row label="START DATE">
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            style={textInputStyle}
          />
        </Row>

        <Row label="DURATION">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <input
              type="number" min={1} max={365}
              value={duration}
              onChange={e => setDuration(e.target.value)}
              style={{ ...textInputStyle, width: 60, flex: 'none' }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>days</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-dim)', marginLeft: 4 }}>
              {endDisplay}
            </span>
          </div>
        </Row>

        <Row label="COLOUR">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BREW_SWATCHES.map(c => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 18, height: 18, borderRadius: 2, cursor: 'pointer',
                    border: c === color ? '2px solid #fff' : '2px solid transparent',
                    background: c,
                    transition: 'border-color 0.1s',
                  }}
                />
              ))}
            </div>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              title="Custom colour"
              style={{
                width: 26, height: 26, padding: 0,
                border: '1px solid var(--border2)', background: 'transparent',
                cursor: 'pointer', borderRadius: 2,
              }}
            />
          </div>
        </Row>

        {isEdit && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
                color: 'var(--text-muted)', textTransform: 'uppercase',
              }}>Actions</span>
              <button className="btn sm" onClick={openAddActionForm}>＋ Add Action</button>
            </div>
            <ActionsList
              actions={actions}
              onEdit={editAction}
              onDelete={deleteAction}
            />
            {actFormOpen && (
              <div style={actionFormStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <div>
                    <div style={miniLabelStyle}>TYPE</div>
                    <select
                      value={actType}
                      onChange={e => setActType(e.target.value as 'dh'|'crash'|'xfer'|'custom')}
                      style={miniInputStyle}
                    >
                      <option value="dh">🟢 Dry Hop</option>
                      <option value="crash">🔵 Crash Cool</option>
                      <option value="xfer">🟣 Transfer</option>
                      <option value="custom">⚪ Custom</option>
                    </select>
                  </div>
                  {actType === 'custom' && (
                    <div>
                      <div style={miniLabelStyle}>LABEL</div>
                      <input
                        type="text"
                        value={actLabel}
                        onChange={e => setActLabel(e.target.value)}
                        placeholder="e.g. Gelatin"
                        style={miniInputStyle}
                      />
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <div>
                    <div style={miniLabelStyle}>START DATE</div>
                    <input
                      type="date"
                      value={actDate}
                      onChange={e => setActDate(e.target.value)}
                      style={miniInputStyle}
                    />
                  </div>
                  <div>
                    <div style={miniLabelStyle}>DURATION (days)</div>
                    <input
                      type="number" min={1} max={60}
                      value={actDur}
                      onChange={e => setActDur(e.target.value)}
                      style={miniInputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm primary" style={{ flex: 1 }} onClick={saveActionForm}>
                    {actEditingIdx != null ? 'SAVE' : 'ADD'}
                  </button>
                  <button className="btn sm" onClick={() => { setActFormOpen(false); setActEditingIdx(null); }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Row label="NOTES" align="flex-start">
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Batch details, targets, reminders…"
            style={{
              flex: 1,
              background: 'var(--panel2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 10,
              padding: '5px 7px', outline: 'none', resize: 'none', lineHeight: 1.5,
            }}
          />
        </Row>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={handleSave}>SAVE</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
          {isEdit && (
            <button
              className="btn danger"
              onClick={() => onDelete()}
            >DELETE</button>
          )}
        </div>
      </div>
    </div>

    {pickerOpen && (
      <RecipePickerModal
        selectedId={recipeId || null}
        onPick={(id, displayName) => {
          setRecipeId(id);
          setRecipeDisplay(displayName);
          // If beer name is empty, seed with the recipe display name —
          // matches HTML abmRecipeChanged at line 13642.
          if (!name.trim()) setName(displayName);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    )}
    </>
  );
}

// ── Inline pieces ────────────────────────────────────────────────────

function Row({ label, align = 'center', children }: {
  label: string; align?: 'center' | 'flex-start'; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: align, gap: 10, marginBottom: 8 }}>
      <label style={rowLabelStyle}>{label}</label>
      {children}
    </div>
  );
}

function ActionsList({
  actions, onEdit, onDelete,
}: {
  actions: PlannerAction[];
  onEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
}) {
  if (!actions.length) {
    return (
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', padding: '4px 0' }}>
        No actions yet
      </div>
    );
  }
  return (
    <>
      {actions.map((a, i) => {
        const aType = ACTION_TYPES[a.type] || ACTION_TYPES.custom;
        const label = a.type === 'custom' && a.label ? a.label : aType.label;
        return (
          <div
            key={i}
            onClick={() => onEdit(i)}
            title="Click to edit"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', background: 'var(--panel3)',
              border: '1px solid var(--border)', marginBottom: 3, cursor: 'pointer',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 1, flexShrink: 0, background: aType.dotColor }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text)', flex: 1 }}>{label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>
              {a.date || `Day ${a.day}`}, {a.dur || 1}d
            </span>
            <span
              onClick={e => { e.stopPropagation(); onDelete(i); }}
              style={{
                fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer',
                padding: '0 3px',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLSpanElement).style.color = 'var(--red)'}
              onMouseLeave={e => (e.currentTarget as HTMLSpanElement).style.color = 'var(--text-muted)'}
            >✕</span>
          </div>
        );
      })}
    </>
  );
}

function findFirstVesselId(groups: VesselGroup[]): string {
  // Prefer the first FERMENTERS vessel; fall back to brewhouse, then unassigned.
  const fv = groups.find(g => g.group === 'FERMENTERS')?.vessels[0]?.id;
  if (fv) return fv;
  const bh = groups.find(g => g.group === 'BREWHOUSE')?.vessels[0]?.id;
  if (bh) return bh;
  return 'unassigned';
}

// ── Styles ────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 380, maxWidth: '95vw',
  maxHeight: '90vh', overflowY: 'auto',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const rowLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
  color: 'var(--text-muted)', textTransform: 'uppercase',
  width: 72, flexShrink: 0,
};

const textInputStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 8px', flex: 1, outline: 'none',
};

const actionFormStyle: React.CSSProperties = {
  background: 'var(--panel3)', border: '1px solid var(--border2)',
  padding: 8, marginTop: 6,
};

const miniLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text-muted)',
  letterSpacing: 1, marginBottom: 3,
};

const miniInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 9,
  padding: '3px 5px', outline: 'none',
};
