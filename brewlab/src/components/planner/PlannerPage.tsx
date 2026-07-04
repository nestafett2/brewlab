/**
 * Planner page — top-level composition. Combines:
 *   • Toolbar (date-shift buttons, today, calendar 📅, yearly, add-brew)
 *   • PlannerGrid (vessel × date matrix + bar overlay)
 *   • PlannerUpcoming (right-side 30-day actions panel)
 *   • CalendarPopup (jump-to-date, anchored to the 📅 button)
 *   • AddBrewModal (add/edit, surfaces FvConflictModal on overlap)
 *   • FvConflictModal (vessel-overlap resolution)
 *   • YearlyModal
 *
 * State:
 *   • `plannerStart` is the leftmost visible date — UI cursor for the
 *     date range. Persisted to bl_planner_start (local-only, since
 *     scroll position is per-device, not brewery-wide).
 *   • plannerBrews + yearlyData come from the store; their setters
 *     write through to localStorage and Supabase.
 *
 * HTML reference:
 *   • plannerInit / plannerShift / plannerToday  (13518–13520)
 *   • renderPlanner cell-click + bar-click       (13767, 13812)
 *   • saveAddBrew + finalizeSaveAddBrew          (14066, 14174)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import type { PlannerBrew, PlannerAction } from '../../types';
import { addDays, dateToStr, diffDays, strToDate, todayDate } from '../../lib/dates';
import { PLANNER_DAYS, DOW_ABBR, deriveVesselGroups } from './plannerShared';
import { printHtml, escapeHtml } from '../../lib/print';
import PlannerGrid from './PlannerGrid';
import PlannerUpcoming from './PlannerUpcoming';
import CalendarPopup from './CalendarPopup';
import AddBrewModal, { type ConflictContext } from './AddBrewModal';
import FvConflictModal from './FvConflictModal';
import YearlyModal from './YearlyModal';

// Local-only key. Per-device scroll position; not synced.
const START_KEY = 'bl_planner_start';

function getInitialStart(): Date {
  try {
    const raw = localStorage.getItem(START_KEY);
    if (raw) {
      const d = strToDate(JSON.parse(raw));
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* ignore */ }
  // HTML default: today − 7 days (line 13518).
  return addDays(todayDate(), -7);
}

export default function PlannerPage() {
  const plannerBrews    = useStore(s => s.plannerBrews);
  const setPlannerBrews = useStore(s => s.setPlannerBrews);
  const tankCalib       = useStore(s => s.tankCalib);
  const settings        = useStore(s => s.settings);
  const pushToast       = useStore(s => s.pushToast);
  // One-shot pre-fill from RecipeTab → "Add to Planner" sidebar action.
  const pendingPlannerAdd    = useStore(s => s.pendingPlannerAdd);
  const setPendingPlannerAdd = useStore(s => s.setPendingPlannerAdd);

  const vesselGroups = useMemo(() => deriveVesselGroups(tankCalib), [tankCalib]);

  const [start, setStart] = useState<Date>(() => getInitialStart());
  const persistStart = (d: Date) => {
    setStart(d);
    try { localStorage.setItem(START_KEY, JSON.stringify(dateToStr(d))); } catch { /* ignore */ }
  };

  // Calendar popup
  const [calOpen, setCalOpen] = useState(false);
  const [calAnchor, setCalAnchor] = useState<{ top: number; left: number; bottom: number }>({ top: 0, left: 0, bottom: 0 });
  const calBtnRef = useRef<HTMLButtonElement>(null);

  // Add/Edit brew modal. `adding` carries any pre-fill instructions —
  // vessel + date for cell clicks, plus optional recipe link/name for
  // the "Add to Planner" flow from RecipeTab.
  const [editingBrew, setEditingBrew] = useState<PlannerBrew | null>(null);
  const [adding, setAdding] = useState<{
    vessel?: string;
    date?: string;
    prefillRecipeId?: string;
    prefillRecipeName?: string;
  } | null>(null);

  // Consume pendingPlannerAdd one-shot signal on mount or whenever it
  // appears (typically right after RecipeTab's "Add to Planner" click
  // navigates here). Mirrors HTML addCurrentRecipeToPlanner's
  // `setTimeout(()=>abmRecipeChanged(...), 50)` post-open pattern, but
  // done synchronously since we control modal open at the same time.
  useEffect(() => {
    if (!pendingPlannerAdd) return;
    setEditingBrew(null);
    setAdding({
      // HTML uses today as start (line 13528). Vessel left to the modal's
      // own default (first FERMENTERS, fallback to brewhouse / unassigned).
      date: dateToStr(todayDate()),
      prefillRecipeId: pendingPlannerAdd.recipeId,
      prefillRecipeName: pendingPlannerAdd.recipeName,
    });
    setPendingPlannerAdd(null);
  }, [pendingPlannerAdd, setPendingPlannerAdd]);

  // Conflict modal
  const [conflict, setConflict] = useState<ConflictContext | null>(null);

  // Yearly modal
  const [yearlyOpen, setYearlyOpen] = useState(false);

  // Toggle: hide vessel rows with no brews in the visible window.
  const [hideEmpty, setHideEmpty] = useState(false);

  // Date range label
  const rangeLabel = useMemo(() => {
    const last = addDays(start, PLANNER_DAYS - 1);
    return `${dateToStr(start)} – ${dateToStr(last)}`;
  }, [start]);

  // Toolbar nav
  const shift = (days: number) => persistStart(addDays(start, days));
  const goToToday = () => persistStart(addDays(todayDate(), -7));

  // ── Print — HTML render of the current visible planner window ────────
  const printPlanner = () => {
    const days: Date[] = [];
    for (let i = 0; i < PLANNER_DAYS; i++) days.push(addDays(start, i));
    const today = todayDate();
    const visEnd = addDays(start, PLANNER_DAYS - 1);

    const tintClass = (d: Date): string => {
      if (d.getTime() === today.getTime()) return 'td-today';
      return (d.getDay() === 0 || d.getDay() === 6) ? 'we' : '';
    };

    // Day header cells (number + day-of-week).
    const dayHeader = days
      .map(d => `<td class="dayhdr ${tintClass(d)}">${d.getDate()}<br>${DOW_ABBR[d.getDay()]}</td>`)
      .join('');

    // One <tbody> section per vessel group: amber group row + vessel rows.
    const bodyRows = vesselGroups.map(g => {
      const groupRow =
        `<tr class="grouprow"><td colspan="${days.length + 1}">${escapeHtml(g.group)}</td></tr>`;

      const vesselRows = g.vessels.map(v => {
        // Brews on this vessel overlapping the window, earliest first.
        const vb = plannerBrews
          .filter(b => b.vessel === v.id)
          .map(b => ({ b, s: strToDate(b.start), e: strToDate(b.end) }))
          .filter(({ s, e }) => s <= visEnd && e >= start)
          .sort((a, c) => a.s.getTime() - c.s.getTime());

        // Coverage array → contiguous colspan runs per brew.
        const cover: (PlannerBrew | null)[] = new Array(days.length).fill(null);
        for (const { b, s, e } of vb) {
          const si = Math.max(0, diffDays(start, s));
          const ei = Math.min(days.length - 1, diffDays(start, e));
          for (let d = si; d <= ei; d++) if (cover[d] === null) cover[d] = b;
        }

        let cells = '';
        let i = 0;
        while (i < days.length) {
          const b = cover[i];
          if (!b) {
            cells += `<td class="${tintClass(days[i])}"></td>`;
            i++;
          } else {
            let j = i;
            while (j < days.length && cover[j] === b) j++;
            cells += `<td class="brewbar" colspan="${j - i}" style="background-color:${escapeHtml(b.color)}">${escapeHtml(b.name)}</td>`;
            i = j;
          }
        }
        return `<tr><td class="vlabel">${escapeHtml(v.name)}</td>${cells}</tr>`;
      }).join('');

      return groupRow + vesselRows;
    }).join('');

    const brewery = settings.breweryName || 'Brewery';
    const bodyHtml = `
<div style="display:flex;justify-content:space-between;align-items:baseline;font-family:monospace;margin-bottom:6px;">
  <span style="font-size:12px;font-weight:700;">${escapeHtml(brewery)}</span>
  <span style="font-size:14px;font-weight:700;letter-spacing:2px;">PRODUCTION PLANNER</span>
  <span style="font-size:9px;">${escapeHtml(rangeLabel)} &middot; printed ${escapeHtml(dateToStr(today))}</span>
</div>
<table class="planner">
  <thead><tr><td class="corner"></td>${dayHeader}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;

    printHtml(bodyHtml, {
      title: 'Production Planner',
      pageSize: 'A4',
      landscape: true,
      extraStyles: `
        table.planner { border-collapse: collapse; width: 100%; table-layout: fixed; font-family: monospace; }
        table.planner td { border: 1px solid #ccc; font-size: 8px; padding: 1px 2px; text-align: center; overflow: hidden; white-space: nowrap; }
        table.planner td.corner { width: 90px; border: none; }
        table.planner td.vlabel { text-align: left; font-size: 10px; font-weight: 600; width: 90px; white-space: nowrap; }
        table.planner td.we { background: #eeeeee; }
        table.planner td.td-today { background: #ffe6bf; }
        table.planner td.brewbar { color: #fff; text-align: left; text-shadow: 0 0 2px rgba(0,0,0,0.6); }
        table.planner tr.grouprow td { background: #fff3d6; color: #b5730a; font-weight: 700; text-align: left; font-size: 9px; letter-spacing: 1px; }
      `,
    });
  };

  const openCalendar = () => {
    if (!calBtnRef.current) return;
    const r = calBtnRef.current.getBoundingClientRect();
    setCalAnchor({ top: r.top, left: r.left, bottom: r.bottom });
    setCalOpen(true);
  };

  // ── Cell / bar click handlers ───────────────────────────────────────
  const handleCellClick = (vesselId: string, dateStr: string) => {
    setEditingBrew(null);
    setAdding({ vessel: vesselId, date: dateStr });
  };

  const handleBrewClick = (brewId: string) => {
    const b = plannerBrews.find(x => x.id === brewId);
    if (!b) return;
    setEditingBrew(b);
    setAdding(null);
  };

  // ── Save / Update brew ──────────────────────────────────────────────
  const persistBrew = (proposed: PlannerBrew, extraUpdates?: PlannerBrew[]) => {
    const before = plannerBrews;
    const isEdit = before.some(b => b.id === proposed.id);
    const updates = extraUpdates ?? [];
    let next = plannerBrews;
    // Apply extras first (e.g. moving an existing conflicting brew to
    // unassigned) so the upsert below sees the new state.
    for (const u of updates) {
      const idx = next.findIndex(b => b.id === u.id);
      if (idx >= 0) next = next.map(b => b.id === u.id ? u : b);
      else next = [...next, u];
    }
    // Upsert proposed.
    const idx = next.findIndex(b => b.id === proposed.id);
    if (idx >= 0) next = next.map(b => b.id === proposed.id ? proposed : b);
    else next = [...next, proposed];
    setPlannerBrews(next);
    setEditingBrew(null);
    setAdding(null);
    pushToast({
      message: isEdit
        ? `Saved brew "${proposed.name}"`
        : `Added brew "${proposed.name}"`,
      undo: () => setPlannerBrews(before),
    });
  };

  // ── Action editor persistence (mirrors HTML lib write on each edit) ─
  const onChangeActions = (brewId: string, actions: PlannerAction[]) => {
    const next = plannerBrews.map(b => b.id === brewId ? { ...b, actions } : b);
    setPlannerBrews(next);
    // Also update the in-modal brew so its actions list re-renders if
    // the user keeps editing — handled by AddBrewModal's local state,
    // but we refresh `editingBrew` so the next open shows fresh actions.
    setEditingBrew(prev => prev && prev.id === brewId ? { ...prev, actions } : prev);
  };

  const onDeleteBrew = () => {
    if (!editingBrew) return;
    const before = plannerBrews;
    const name = editingBrew.name;
    setPlannerBrews(plannerBrews.filter(b => b.id !== editingBrew.id));
    setEditingBrew(null);
    setAdding(null);
    pushToast({
      message: `Deleted brew "${name}"`,
      undo: () => setPlannerBrews(before),
    });
  };

  const modalBrew = editingBrew ?? null;
  const modalOpen = adding !== null || editingBrew !== null;

  return (
    <div style={pageStyle}>
      {/* TOOLBAR */}
      <div style={toolbarStyle}>
        <span style={titleStyle}>PRODUCTION PLANNER</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 16 }}>
          <button className="btn sm" onClick={() => shift(-14)}>◀◀</button>
          <button className="btn sm" onClick={() => shift(-7)}>◀</button>
          <button className="btn sm" onClick={goToToday}>TODAY</button>
          <button className="btn sm" onClick={() => shift(7)}>▶</button>
          <button className="btn sm" onClick={() => shift(14)}>▶▶</button>
          <button
            ref={calBtnRef}
            className="btn sm"
            onClick={openCalendar}
            title="Jump to date"
            style={{ fontSize: 13 }}
          >📅</button>
        </div>
        <div style={dateRangeStyle}>{rangeLabel}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className={`btn sm ${hideEmpty ? 'active' : ''}`}
            onClick={() => setHideEmpty(v => !v)}
            title="Hide vessel rows with no brews in the visible range"
          >{hideEmpty ? '☑' : '☐'} HIDE EMPTY</button>
          <button className="btn sm" onClick={printPlanner}>🖨 PRINT</button>
          <button className="btn sm" onClick={() => setYearlyOpen(true)}>📅 YEARLY</button>
          <button
            className="btn sm primary"
            onClick={() => { setEditingBrew(null); setAdding({}); }}
          >＋ ADD BREW</button>
        </div>
      </div>

      {/* BODY: scrollable grid + upcoming panel */}
      <div style={bodyStyle}>
        <div style={scrollWrapStyle}>
          <PlannerGrid
            startDate={start}
            vesselGroups={vesselGroups}
            brews={plannerBrews}
            onCellClick={handleCellClick}
            onBrewClick={handleBrewClick}
            hideEmpty={hideEmpty}
          />
        </div>
        <PlannerUpcoming plannerBrews={plannerBrews} />
      </div>

      {/* CALENDAR POPUP */}
      {calOpen && (
        <CalendarPopup
          initial={start}
          anchor={calAnchor}
          onPick={d => { persistStart(d); setCalOpen(false); }}
          onClose={() => setCalOpen(false)}
        />
      )}

      {/* ADD/EDIT BREW MODAL */}
      {modalOpen && (
        <AddBrewModal
          brew={modalBrew}
          prefillVessel={adding?.vessel}
          prefillDate={adding?.date}
          prefillRecipeId={adding?.prefillRecipeId}
          prefillRecipeName={adding?.prefillRecipeName}
          vesselGroups={vesselGroups}
          onClose={() => { setEditingBrew(null); setAdding(null); }}
          onSave={proposed => persistBrew(proposed)}
          onConflict={ctx => setConflict(ctx)}
          onDelete={onDeleteBrew}
          onChangeActions={onChangeActions}
        />
      )}

      {/* FV CONFLICT MODAL */}
      {conflict && (
        <FvConflictModal
          vesselName={conflict.vesselName}
          existingName={conflict.existingBrew.name}
          newName={conflict.proposed.name}
          newStart={conflict.proposed.start}
          newEnd={conflict.proposed.end}
          plannerBrews={plannerBrews}
          vesselGroups={vesselGroups}
          editingBrewId={editingBrew?.id ?? null}
          onMoveExisting={() => {
            // Move the existing conflicting brew to 'unassigned' AND
            // upsert the proposed brew at its intended vessel — both in
            // a single setPlannerBrews call so nothing flickers.
            const existingMoved = { ...conflict.existingBrew, vessel: 'unassigned' };
            persistBrew(conflict.proposed, [existingMoved]);
            setConflict(null);
          }}
          onMoveNew={(targetVesselId: string) => {
            persistBrew({ ...conflict.proposed, vessel: targetVesselId });
            setConflict(null);
          }}
          onClose={() => setConflict(null)}
        />
      )}

      {/* YEARLY MODAL */}
      {yearlyOpen && <YearlyModal onClose={() => setYearlyOpen(false)} />}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel)', flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--amber)',
};

const dateRangeStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)',
  letterSpacing: 0.5, marginLeft: 8,
};

const bodyStyle: React.CSSProperties = {
  display: 'flex', flex: 1, overflow: 'hidden',
};

const scrollWrapStyle: React.CSSProperties = {
  flex: 1, overflow: 'auto', position: 'relative',
};
