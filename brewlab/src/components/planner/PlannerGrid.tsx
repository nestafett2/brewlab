/**
 * Planner grid — port of brewlab-desktop.html lines 13711–13894
 * (renderPlanner).
 *
 * Two layers:
 *   1. STATIC LAYER — single CSS grid with one column per day (LABEL_W
 *      sticky vessel-label column + PLANNER_DAYS × DAY_W cells).
 *      Builds a month header row, a day header row (with weekend / today
 *      highlights), then per-vessel rows interleaved with group headers.
 *   2. BAR OVERLAY — absolutely-positioned over the static layer:
 *        • Each brew → primary bar + an action strip with greedy lane
 *          assignment (HTML 13818–13841) so overlapping actions stack.
 *        • Brewhouse row → day-1 swatch per brew, vertically split
 *          when multiple brews share a brew-day (HTML 13862–13891).
 *
 * Click handlers:
 *   • Empty cell → onCellClick(vesselId, dateStr) — opens add-brew modal.
 *   • Brew bar / action strip → onBrewClick(brewId) — opens edit modal.
 *
 * Today's date column is highlighted (today-col); weekends shaded.
 */

import { useMemo } from 'react';
import type { PlannerBrew, PlannerAction } from '../../types';
import {
  PLANNER_DAYS, DAY_W, LABEL_W,
  MONTH_H, DAY_H, ROW_H, GROUP_H, PRIMARY_H, LANE_H,
  ACTION_TYPES, MONTH_ABBR, DOW_ABBR,
  type VesselGroup,
} from './plannerShared';
import { addDays, dateToStr, diffDays, strToDate, todayDate } from '../../lib/dates';

interface Props {
  startDate: Date;
  vesselGroups: VesselGroup[];
  brews: PlannerBrew[];
  onCellClick: (vesselId: string, dateStr: string) => void;
  onBrewClick: (brewId: string) => void;
}

interface Row {
  type: 'group' | 'vessel';
  group?: VesselGroup;
  vessel?: { id: string; name: string };
}

interface PlacedAction extends PlannerAction {
  cs: number;       // start-day index relative to brew start, clamped
  ce: number;       // end-day index, clamped
  ax: number;       // px x within the bar wrapper
  aw: number;       // px width of the action segment
  lane: number;     // 0..N — vertical stacking within the strip
}

export default function PlannerGrid({
  startDate, vesselGroups, brews, onCellClick, onBrewClick,
}: Props) {
  const today = todayDate();

  // Day list (PLANNER_DAYS days from startDate).
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < PLANNER_DAYS; i++) out.push(addDays(startDate, i));
    return out;
  }, [startDate]);

  // Month spans for the top header.
  const monthSpans = useMemo(() => {
    const out: { year: number; month: number; span: number }[] = [];
    let curKey: string | null = null;
    let curSpan = 0;
    let curYear = 0, curMonth = 0;
    days.forEach((d, i) => {
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (k !== curKey) {
        if (curKey !== null) out.push({ year: curYear, month: curMonth, span: curSpan });
        curKey = k;
        curYear = d.getFullYear();
        curMonth = d.getMonth();
        curSpan = 1;
      } else {
        curSpan++;
      }
      if (i === days.length - 1) out.push({ year: curYear, month: curMonth, span: curSpan });
    });
    return out;
  }, [days]);

  // Rows = group header + per-vessel.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of vesselGroups) {
      out.push({ type: 'group', group: g });
      for (const v of g.vessels) out.push({ type: 'vessel', vessel: v });
    }
    return out;
  }, [vesselGroups]);

  // Vertical offset of each vessel row in the bar overlay.
  const rowTops = useMemo(() => {
    const tops: Record<string, number> = {};
    let y = MONTH_H + DAY_H;
    for (const r of rows) {
      if (r.type === 'group') y += GROUP_H;
      else if (r.vessel) { tops[r.vessel.id] = y; y += ROW_H; }
    }
    return tops;
  }, [rows]);

  const gridTotalW = LABEL_W + DAY_W * PLANNER_DAYS;
  const gridTotalH = useMemo(
    () => MONTH_H + DAY_H + rows.reduce((s, r) => s + (r.type === 'group' ? GROUP_H : ROW_H), 0),
    [rows],
  );

  // Build absolute-positioned brew bars (with greedy action lane stacking).
  const bars = useMemo(() => buildBarLayouts(brews, startDate, rowTops), [brews, startDate, rowTops]);
  const bhDays = useMemo(() => buildBrewhouseDayBars(brews, startDate, rowTops['bh']), [brews, startDate, rowTops]);

  return (
    <div style={{ position: 'relative', minWidth: gridTotalW }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_W}px repeat(${PLANNER_DAYS}, ${DAY_W}px)`,
          position: 'relative',
        }}
      >
        {/* ── Month header ──────────────────────────────────────────── */}
        <div className="pg-corner" style={cornerStyle(MONTH_H)}>
          <span style={cornerLabelStyle}>VESSEL</span>
        </div>
        {monthSpans.map((ms, i) => (
          <div
            key={`m-${i}-${ms.year}-${ms.month}`}
            style={{ ...monthCellStyle, gridColumn: `span ${ms.span}` }}
          >
            {MONTH_ABBR[ms.month]} {ms.year}
          </div>
        ))}

        {/* ── Day header ────────────────────────────────────────────── */}
        <div style={{ ...cornerStyle(DAY_H), borderTop: '1px solid var(--border)' }} />
        {days.map((d, i) => {
          const isWe = d.getDay() === 0 || d.getDay() === 6;
          const isTd = d.getTime() === today.getTime();
          return (
            <div
              key={`d-${i}`}
              style={{
                ...dayCellStyle,
                background: isTd ? 'rgba(212,130,15,0.18)' : isWe ? 'var(--bg)' : 'var(--panel2)',
                borderBottom: isTd ? '2px solid var(--amber)' : '1px solid var(--border)',
              }}
            >
              <span style={{
                ...dayNumStyle,
                color: isTd ? 'var(--amber)' : 'var(--text-dim)',
              }}>{d.getDate()}</span>
              <span style={dayDowStyle}>{DOW_ABBR[d.getDay()]}</span>
            </div>
          );
        })}

        {/* ── Vessel rows ───────────────────────────────────────────── */}
        {rows.map((r, ri) => {
          if (r.type === 'group' && r.group) {
            return (
              <RowGroup key={`g-${ri}`} groupName={r.group.group} dayCount={days.length} />
            );
          }
          if (r.type === 'vessel' && r.vessel) {
            return (
              <RowVessel
                key={`v-${r.vessel.id}`}
                vessel={r.vessel}
                days={days}
                today={today}
                onCellClick={onCellClick}
              />
            );
          }
          return null;
        })}
      </div>

      {/* ── Bar overlay ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0,
          width: gridTotalW, height: gridTotalH,
          pointerEvents: 'none', zIndex: 5,
        }}
      >
        {bars.map(b => (
          <div
            key={b.brew.id}
            style={{ position: 'absolute', left: b.x, top: b.top + 1, width: b.w, pointerEvents: 'all' }}
          >
            <div
              style={{
                width: '100%', height: PRIMARY_H, background: b.brew.color,
                borderRadius: '2px 2px 0 0',
                display: 'flex', alignItems: 'center', padding: '0 8px',
                cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap',
                border: '1px solid rgba(0,0,0,0.3)', borderBottom: 'none',
                boxSizing: 'border-box', transition: 'filter 0.1s',
              }}
              title={b.brew.notes || b.brew.name}
              onClick={e => { e.stopPropagation(); onBrewClick(b.brew.id); }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.15)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter = ''; }}
            >
              <span style={brewNameStyle}>{b.brew.name}</span>
            </div>
            <div
              style={{
                width: '100%', height: b.stripH,
                borderRadius: '0 0 2px 2px',
                border: '1px solid rgba(0,0,0,0.25)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                position: 'relative', overflow: 'hidden',
                boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.35)',
                cursor: 'pointer',
              }}
              onClick={e => { e.stopPropagation(); onBrewClick(b.brew.id); }}
            >
              {b.placed.map((p, i) => {
                const aType = ACTION_TYPES[p.type] || ACTION_TYPES.custom;
                const label = p.type === 'custom' && p.label ? p.label.toUpperCase() : aType.label;
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute', top: p.lane * LANE_H, left: p.ax,
                      width: p.aw, height: LANE_H,
                      background: aType.color,
                      display: 'flex', alignItems: 'center', padding: '0 3px',
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 500,
                      color: 'rgba(255,255,255,0.9)', letterSpacing: 0.3,
                      borderRight: '1px solid rgba(0,0,0,0.3)',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                    }}
                  >{label}</div>
                );
              })}
            </div>
          </div>
        ))}

        {bhDays.map((b, i) => (
          <div
            key={`bh-${i}`}
            title={`${b.brew.name} — brew day`}
            onClick={e => { e.stopPropagation(); onBrewClick(b.brew.id); }}
            style={{
              position: 'absolute', left: b.x, top: b.top, width: b.w, height: b.h,
              background: b.brew.color, opacity: 0.9, borderRadius: 2,
              cursor: 'pointer', overflow: 'hidden', pointerEvents: 'all',
            }}
          >
            {b.showLabel && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, color: '#fff',
                padding: '0 3px', whiteSpace: 'nowrap', overflow: 'hidden',
                display: 'block', lineHeight: `${b.h}px`,
              }}>{b.brew.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function RowGroup({ groupName, dayCount }: { groupName: string; dayCount: number }) {
  return (
    <>
      <div style={{
        background: 'var(--panel2)',
        borderBottom: '1px solid var(--border)',
        borderRight: '1px solid var(--border2)',
        position: 'sticky' as const, left: 0, zIndex: 10,
        display: 'flex', alignItems: 'center',
        padding: '0 10px', height: GROUP_H, minWidth: LABEL_W,
      }}>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 10, letterSpacing: 2,
          color: 'var(--amber)',
        }}>{groupName}</span>
      </div>
      {Array.from({ length: dayCount }, (_, i) => (
        <div key={i} style={{
          background: 'var(--panel2)',
          borderBottom: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          height: GROUP_H, width: DAY_W,
        }} />
      ))}
    </>
  );
}

function RowVessel({
  vessel, days, today, onCellClick,
}: {
  vessel: { id: string; name: string };
  days: Date[];
  today: Date;
  onCellClick: (vesselId: string, dateStr: string) => void;
}) {
  return (
    <>
      <div style={{
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        borderRight: '1px solid var(--border2)',
        position: 'sticky' as const, left: 0, zIndex: 10,
        display: 'flex', alignItems: 'center',
        padding: '0 10px', height: ROW_H, minWidth: LABEL_W, gap: 8,
      }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.5,
          color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap',
        }}>{vessel.name}</span>
      </div>
      {days.map((d, i) => {
        const isWe = d.getDay() === 0 || d.getDay() === 6;
        const isTd = d.getTime() === today.getTime();
        const ds = dateToStr(d);
        return (
          <div
            key={i}
            style={{
              background: isTd ? 'rgba(212,130,15,0.05)' : isWe ? 'rgba(255,255,255,0.03)' : 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
              height: ROW_H, width: DAY_W,
              position: 'relative', cursor: 'pointer',
              transition: 'background 0.06s',
            }}
            onClick={() => onCellClick(vessel.id, ds)}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--panel2)'; }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.background =
                isTd ? 'rgba(212,130,15,0.05)' : isWe ? 'rgba(255,255,255,0.03)' : 'var(--bg)';
            }}
          />
        );
      })}
    </>
  );
}

// ─── Bar layout math (HTML 13786–13860) ──────────────────────────────

interface BarLayout {
  brew: PlannerBrew;
  x: number;
  top: number;
  w: number;
  stripH: number;
  placed: PlacedAction[];
}

function buildBarLayouts(brews: PlannerBrew[], startDate: Date, rowTops: Record<string, number>): BarLayout[] {
  const visEnd = addDays(startDate, PLANNER_DAYS - 1);
  const out: BarLayout[] = [];
  for (const brew of brews) {
    const rowTop = rowTops[brew.vessel];
    if (rowTop === undefined) continue;
    if (brew.vessel === 'bh') continue; // brewhouse uses single-day swatches

    const startD = strToDate(brew.start);
    const endD = strToDate(brew.end);
    if (endD < startDate || startD > visEnd) continue;

    const clampedStart = startD < startDate ? startDate : startD;
    const clampedEnd = endD > visEnd ? visEnd : endD;

    const x = LABEL_W + diffDays(startDate, clampedStart) * DAY_W;
    const w = (diffDays(clampedStart, clampedEnd) + 1) * DAY_W - 2;

    // Action lane assignment (greedy — HTML 13818–13841).
    const leftClipDays = startD < startDate ? diffDays(startD, startDate) : 0;
    const visibleDays = diffDays(clampedStart, clampedEnd);
    const placed: PlacedAction[] = [];
    for (const act of (brew.actions ?? [])) {
      const actStartDay = (act.day ?? 1) - 1;
      const actEndDay = actStartDay + ((act.dur ?? 1) - 1);
      const cs = Math.max(actStartDay, leftClipDays);
      const ce = Math.min(actEndDay, leftClipDays + visibleDays);
      if (cs > ce) continue;
      placed.push({
        ...act,
        cs, ce,
        ax: (cs - leftClipDays) * DAY_W,
        aw: (ce - cs + 1) * DAY_W,
        lane: 0,
      });
    }
    placed.forEach((p, i) => {
      const usedLanes: number[] = [];
      for (let q = 0; q < i; q++) {
        const o = placed[q];
        if (o.cs <= p.ce && o.ce >= p.cs) usedLanes.push(o.lane);
      }
      let lane = 0;
      while (usedLanes.includes(lane)) lane++;
      p.lane = lane;
    });
    const numLanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 1);
    const stripH = numLanes * LANE_H;

    out.push({ brew, x, top: rowTop, w, stripH, placed });
  }
  return out;
}

interface BhDayBar {
  brew: PlannerBrew;
  x: number; top: number; w: number; h: number;
  showLabel: boolean;
}

function buildBrewhouseDayBars(
  brews: PlannerBrew[],
  startDate: Date,
  bhTop: number | undefined,
): BhDayBar[] {
  if (bhTop === undefined) return [];
  const visEnd = addDays(startDate, PLANNER_DAYS - 1);
  // Group brews by start date (HTML 13867).
  const byDate = new Map<string, PlannerBrew[]>();
  for (const brew of brews) {
    const sd = strToDate(brew.start);
    if (sd < startDate || sd > visEnd) continue;
    const key = brew.start;
    const arr = byDate.get(key) ?? [];
    arr.push(brew);
    byDate.set(key, arr);
  }
  const out: BhDayBar[] = [];
  byDate.forEach((arr, ds) => {
    const d = strToDate(ds);
    const x = LABEL_W + diffDays(startDate, d) * DAY_W;
    const w = DAY_W - 2;
    const laneH = Math.max(6, Math.floor((ROW_H - 4) / arr.length));
    arr.forEach((brew, i) => {
      out.push({
        brew,
        x,
        top: bhTop + 1 + i * laneH,
        w,
        h: laneH - 1,
        showLabel: i === 0 && arr.length === 1,
      });
    });
  });
  return out;
}

// ─── Header styles ───────────────────────────────────────────────────

const cornerStyle = (h: number): React.CSSProperties => ({
  background: 'var(--panel2)',
  borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border2)',
  position: 'sticky' as const, left: 0, zIndex: 20,
  display: 'flex', alignItems: 'flex-end',
  padding: '0 10px 4px', gap: 4, height: h, minWidth: LABEL_W,
});

const cornerLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 12, letterSpacing: 1.5,
  color: 'var(--text-muted)',
};

const monthCellStyle: React.CSSProperties = {
  background: 'var(--panel2)',
  borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', padding: '0 6px',
  fontFamily: 'var(--display)', fontSize: 11, letterSpacing: 1,
  color: 'var(--amber)', height: MONTH_H,
};

const dayCellStyle: React.CSSProperties = {
  borderRight: '1px solid var(--border)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  width: DAY_W, height: DAY_H,
  fontFamily: 'var(--mono)', fontSize: 10, cursor: 'default',
};

const dayNumStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500,
};

const dayDowStyle: React.CSSProperties = {
  color: 'var(--text-muted)', fontSize: 9, letterSpacing: 0.5,
};

const brewNameStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, color: '#fff',
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
  letterSpacing: 0.3,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
