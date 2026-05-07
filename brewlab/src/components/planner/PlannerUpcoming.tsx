/**
 * Upcoming actions panel — port of brewlab-desktop.html lines 13536–13580
 * (renderUpcoming).
 *
 * 30-day horizon from today. Collects:
 *   • 🟦 BREW START on each brew's start date
 *   • 🟥 BREW END on each brew's end date
 *   • Each action's date (action.date or start + (day−1)) with the
 *     action's label (custom label preferred when type==='custom')
 *
 * Sorted ascending by date. "TODAY" / "TOMORROW" / "in Nd" relative
 * label, plus a "DD MMM" absolute label.
 */

import { useMemo } from 'react';
import type { PlannerBrew } from '../../types';
import { ACTION_TYPES } from './plannerShared';
import { addDays, dateToStr, diffDays, strToDate, todayDate } from '../../lib/dates';

interface UpcomingItem {
  date: Date;
  label: string;
  brew: string;
  color: string;
}

interface Props {
  plannerBrews: PlannerBrew[];
}

export default function PlannerUpcoming({ plannerBrews }: Props) {
  const items = useMemo<UpcomingItem[]>(() => {
    const today = todayDate();
    const horizon = addDays(today, 30);
    const out: UpcomingItem[] = [];
    for (const brew of plannerBrews) {
      const start = strToDate(brew.start);
      const end = strToDate(brew.end);
      if (start >= today && start <= horizon) {
        out.push({ date: start, label: '🟦 BREW START', brew: brew.name, color: brew.color });
      }
      if (end >= today && end <= horizon) {
        out.push({ date: end, label: '🟥 BREW END', brew: brew.name, color: brew.color });
      }
      for (const act of (brew.actions ?? [])) {
        const dateStr = act.date || dateToStr(addDays(start, (act.day ?? 1) - 1));
        const d = strToDate(dateStr);
        if (d >= today && d <= horizon) {
          const aType = ACTION_TYPES[act.type] || ACTION_TYPES.custom;
          const lbl = act.type === 'custom' && act.label ? act.label : aType.label;
          out.push({ date: d, label: lbl, brew: brew.name, color: brew.color });
        }
      }
    }
    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [plannerBrews]);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={headerLabelStyle}>Upcoming Actions</span>
      </div>
      <div style={listStyle}>
        {items.length === 0 ? (
          <div style={emptyStyle}>No upcoming actions<br />in the next 30 days.</div>
        ) : items.map((it, i) => {
          const today = todayDate();
          const days = diffDays(today, it.date);
          const dayStr = days === 0 ? 'TODAY' : days === 1 ? 'TOMORROW' : `in ${days}d`;
          const dateStr = it.date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
          return (
            <div key={i} style={itemStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 3, height: 28, background: it.color, flexShrink: 0, borderRadius: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={labelStyle}>{it.label}</div>
                  <div style={subLabelStyle}>{it.brew}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={dayStrStyle}>{dayStr}</div>
                  <div style={dateStrStyle}>{dateStr}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 220, flexShrink: 0,
  borderLeft: '1px solid var(--border)',
  background: 'var(--panel)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid var(--border)',
  background: 'var(--panel2)', flexShrink: 0,
};

const headerLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5,
  color: 'var(--text-muted)', textTransform: 'uppercase',
};

const listStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '6px 0',
};

const emptyStyle: React.CSSProperties = {
  padding: '12px 10px', fontFamily: 'var(--mono)', fontSize: 10,
  color: 'var(--text-muted)',
};

const itemStyle: React.CSSProperties = {
  padding: '5px 10px', borderBottom: '1px solid var(--border)', cursor: 'default',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, color: 'var(--text)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const subLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const dayStrStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)', fontWeight: 600,
};

const dateStrStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)',
};
