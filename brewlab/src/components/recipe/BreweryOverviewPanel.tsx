/**
 * Brewery Overview right pane — port of brewlab-desktop.html lines
 * 4500–4828 (renderRbOverview). Shown in the Recipes tab when the
 * sidebar's "Overview" sub-tab is active.
 *
 * Sections (top to bottom):
 *   • Header                 — title + today + brew count
 *   • Pending Recording (⚠)  — conditional warn block
 *   • In Tank                — FV cards + BT cards
 *   • Upcoming Brews         + Recipe Brew Dates (2-col)
 *   • Upcoming Actions       + Deliveries (2-col)
 *   • Schedule               — section-grouped inventory forecast
 *
 * Brew references use the new format from RecipeSidebarRow:
 *   • Cards    — compact 2-line: `#X beerName  v1.0` + existing sub
 *   • Recipe Brew Dates — full 3-line: `#X beerName / style · {batchL}L / v1.x`
 *   • Upcoming Actions — single-line: `#X beerName` only (action label is focal)
 *
 * Schedule reuses the OrderPlanner forecast helper (deriveTimeline +
 * buildForecastRows) — see CLAUDE.md note on shared brewUsage logic.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import type { PlannerBrew, Recipe, OrderEntry, PlannerAction } from '../../types';
import { addDays, dateToStr, diffDays, fmtDate, strToDate, todayDate } from '../../lib/dates';
import { ACTION_TYPES, deriveVesselGroups, findVesselName } from '../planner/plannerShared';
import { formatBrewLine, formatBrewStyleLine } from '../../lib/brewFormat';
import { INV_UNITS } from '../../lib/units';
import { fmtNum } from '../../lib/format';
import {
  deriveTimeline, buildForecastRows, computeRowStatus,
  type LibSection, type LibBySection,
} from '../orders/orderForecast';

type ActiveBrew = PlannerBrew & { dEnd: number; pct: number };
type PlannedBrew = PlannerBrew & { dStart: number };

interface ActionItem {
  brew: PlannerBrew;
  act: PlannerAction;
  d: number;
}

interface NextBrewDay {
  name: string;
  date: string;
  d: number;
  /** Set when the merged entry came from a planner brew that has a
   *  recipeId, OR from a recipe with brewDate. Either way, we have a
   *  recipe to reference. */
  recipe?: Recipe;
  /** Source brew if it came from plannerBrews — for click-through and
   *  format consistency with cards. */
  brew?: PlannerBrew;
}

interface PendingItem {
  brew: PlannerBrew;
  daysSinceEnd: number;
}

interface Props {
  onOpenRecipe: (recipeId: string) => void;
}

export default function BreweryOverviewPanel({ onOpenRecipe }: Props) {
  const plannerBrews   = useStore(s => s.plannerBrews);
  const recipes        = useStore(s => s.recipes);
  const orders         = useStore(s => s.orders);
  const tankCalib      = useStore(s => s.tankCalib);
  const ledgerData     = useStore(s => s.ledgerData);
  const inventoryStock = useStore(s => s.inventoryStock);
  const maltLib        = useStore(s => s.maltLib);
  const hopLib         = useStore(s => s.hopLib);
  const yeastLib       = useStore(s => s.yeastLib);
  const miscLib        = useStore(s => s.miscLib);
  const getIngredients = useStore(s => s.getIngredients);

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bl_dismissed_rec_reminders');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch { return new Set(); }
  });

  const recipeById = useMemo<Record<string, Recipe>>(() => {
    const out: Record<string, Recipe> = {};
    for (const r of recipes) out[r.id] = r;
    return out;
  }, [recipes]);

  const vesselGroups = useMemo(() => deriveVesselGroups(tankCalib), [tankCalib]);
  const isBT = (vesselId: string): boolean => {
    const g = vesselGroups.find(g => g.vessels.some(v => v.id === vesselId));
    return g?.group === 'BRIGHT TANKS';
  };

  // ── Categorise brews (HTML 4510–4527) ────────────────────────────────
  const today = useMemo(todayDate, []);
  const cats = useMemo(() => {
    const activeFV: ActiveBrew[] = [];
    const activeBT: ActiveBrew[] = [];
    const planned: PlannedBrew[] = [];
    for (const brew of plannerBrews) {
      const start = strToDate(brew.start);
      const end = strToDate(brew.end);
      const dStart = diffDays(start, today);
      const dEnd = diffDays(today, end);
      if (today >= start && today <= end) {
        const denom = dStart + dEnd;
        const pct = denom > 0 ? Math.max(0, Math.min(100, Math.round((dStart / denom) * 100))) : 0;
        const enriched: ActiveBrew = { ...brew, dEnd, pct };
        if (isBT(brew.vessel)) activeBT.push(enriched);
        else activeFV.push(enriched);
      } else if (today < start && dStart > -30) {
        planned.push({ ...brew, dStart: diffDays(today, start) });
      }
    }
    planned.sort((a, b) => a.dStart - b.dStart);
    return { activeFV, activeBT, planned };
  }, [plannerBrews, today, vesselGroups]);

  // ── Upcoming actions (HTML 4530–4541) ────────────────────────────────
  const upcomingActions = useMemo<ActionItem[]>(() => {
    const out: ActionItem[] = [];
    for (const brew of plannerBrews) {
      const start = strToDate(brew.start);
      for (const act of (brew.actions ?? [])) {
        if (act.type === 'brewStart' || act.type === 'brewEnd') continue;
        const dateStr = act.date || dateToStr(addDays(start, (act.day ?? 1) - 1));
        const d = diffDays(today, strToDate(dateStr));
        if (d >= -1 && d <= 14) out.push({ brew, act, d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }, [plannerBrews, today]);

  // ── Deliveries within 30d (HTML 4544–4548) ───────────────────────────
  const upcomingOrders = useMemo<OrderEntry[]>(() => {
    return orders
      .filter(o => {
        if (!o.delivery) return false;
        const d = diffDays(today, strToDate(o.delivery));
        return d >= 0 && d <= 30;
      })
      .sort((a, b) => diffDays(today, strToDate(a.delivery!)) - diffDays(today, strToDate(b.delivery!)));
  }, [orders, today]);

  // ── Recipe Brew Dates (HTML 4562–4577) ───────────────────────────────
  // Merge plannerBrews start dates with recipes.brewDate, dedupe by name.
  const nextBrewDays = useMemo<NextBrewDay[]>(() => {
    const map = new Map<string, NextBrewDay>();
    for (const b of plannerBrews) {
      const d = diffDays(today, strToDate(b.start));
      if (d >= 0 && d <= 60 && !map.has(b.name)) {
        map.set(b.name, {
          name: b.name,
          date: b.start,
          d,
          recipe: b.recipeId ? recipeById[b.recipeId] : undefined,
          brew: b,
        });
      }
    }
    for (const r of recipes) {
      if (!r.brewDate) continue;
      const name = r.beerName || r.name;
      const d = diffDays(today, strToDate(r.brewDate));
      if (d >= 0 && d <= 60 && !map.has(name)) {
        map.set(name, { name, date: r.brewDate, d, recipe: r });
      }
    }
    return [...map.values()].sort((a, b) => a.d - b.d);
  }, [plannerBrews, recipes, recipeById, today]);

  // ── Pending recording reminders (HTML 4677–4703) ─────────────────────
  const pendingRecording = useMemo<PendingItem[]>(() => {
    const out: PendingItem[] = [];
    const sections: LibSection[] = ['malts', 'hops', 'yeast', 'misc'];
    const libBySection: LibBySection = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };
    for (const brew of plannerBrews) {
      if (!brew.recipeId) continue;
      const endD = strToDate(brew.end);
      const daysSinceEnd = diffDays(endD, today);
      if (daysSinceEnd < 1 || daysSinceEnd > 60) continue;
      const beerName = (brew.name || '').toLowerCase();
      if (!beerName) continue;
      let recorded = false;
      outer: for (const sec of sections) {
        for (const entry of libBySection[sec]) {
          const key = `${sec}_${entry.id}`;
          const ledger = ledgerData[key] ?? [];
          if (ledger.some(e => e.used != null && (e.beer ?? '').toLowerCase().includes(beerName))) {
            recorded = true;
            break outer;
          }
        }
      }
      if (!recorded) out.push({ brew, daysSinceEnd });
    }
    return out;
  }, [plannerBrews, ledgerData, maltLib, hopLib, yeastLib, miscLib, today]);

  const visibleReminders = pendingRecording.filter(p => !dismissed.has(p.brew.id));

  // ── Schedule (HTML 4639–4674) — reuse OrderPlanner forecast ──────────
  const schedule = useMemo(() => {
    const filteredBrews = plannerBrews.filter(b => b.recipeId && !b.fullyRecorded);
    const timeline = deriveTimeline(filteredBrews, []); // no delivery columns
    const brewCols = filteredBrews
      .slice()
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const libBySection: LibBySection = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };
    const sections: LibSection[] = ['malts', 'hops', 'yeast', 'misc'];

    const bySec = sections.map(sec => {
      const rows = buildForecastRows(sec, timeline, libBySection, inventoryStock, ledgerData, getIngredients);
      // Status order: SHORT → LOW → OK → DONE; then by name
      const rank = (s: ReturnType<typeof computeRowStatus>): number =>
        s === 'SHORT' ? 0 : s === 'LOW' ? 1 : s === 'OK' ? 2 : 3;
      const enriched = rows.map(row => ({ row, status: computeRowStatus(row) }));
      enriched.sort((a, b) => rank(a.status) - rank(b.status) || a.row.entry.name.localeCompare(b.row.entry.name));
      return { sec, entries: enriched };
    });
    return { brewCols, bySec };
  }, [plannerBrews, maltLib, hopLib, yeastLib, miscLib, inventoryStock, ledgerData, getIngredients]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="ov-panel">
      <div className="ov-header">
        <div className="ov-header-title">Brewery Overview</div>
        <div className="ov-header-sub">
          {fmtDate(today)} · {plannerBrews.length} brews scheduled
        </div>
      </div>

      {visibleReminders.length > 0 && (
        <div className="ov-section ov-section-warn">
          <div className="ov-section-title">⚠ Inventory Recording Reminders</div>
          {visibleReminders.map(p => {
            const recipe = p.brew.recipeId ? recipeById[p.brew.recipeId] : null;
            const line = formatBrewLine(p.brew, recipe);
            return (
              <div key={p.brew.id} className="ov-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span
                  className="ov-row-label"
                  style={{ cursor: p.brew.recipeId ? 'pointer' : 'default', textDecoration: p.brew.recipeId ? 'underline' : 'none' }}
                  onClick={() => p.brew.recipeId && onOpenRecipe(p.brew.recipeId)}
                >
                  <b>{line.primary}</b>
                  {!line.fallbackOnly && line.version && <span className="ov-card-version"> {line.version}</span>}
                  {' '}— ended {p.daysSinceEnd}d ago
                </span>
                <button
                  className="btn sm"
                  title="Dismiss this reminder"
                  onClick={() => setDismissed(prev => {
                    const next = new Set(prev);
                    next.add(p.brew.id);
                    localStorage.setItem('bl_dismissed_rec_reminders', JSON.stringify([...next]));
                    return next;
                  })}
                  style={{ flexShrink: 0, fontSize: 10, padding: '2px 8px' }}
                >✕ Dismiss</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="ov-section">
        <div className="ov-section-title">In Tank</div>
        {cats.activeFV.length === 0 && cats.activeBT.length === 0 ? (
          <div className="ov-empty">No active ferments</div>
        ) : (
          <div className="ov-cards">
            {cats.activeFV.map(b => (
              <BrewCard
                key={b.id}
                brew={b}
                recipe={b.recipeId ? recipeById[b.recipeId] : null}
                badge="fermenting"
                badgeLabel="Fermenting"
                sub={`${findVesselName(vesselGroups, b.vessel)} · ${b.dEnd < 0 ? `Done ${Math.abs(b.dEnd)}d ago` : `${b.dEnd}d left`}`}
                pct={b.pct}
                barColor="var(--green)"
                warn={b.dEnd <= 3 && b.dEnd >= 0 ? '⚠ Transfer soon' : undefined}
                onOpenRecipe={onOpenRecipe}
              />
            ))}
            {cats.activeBT.map(b => (
              <BrewCard
                key={b.id}
                brew={b}
                recipe={b.recipeId ? recipeById[b.recipeId] : null}
                badge="bright"
                badgeLabel="Bright Tank"
                sub={`${findVesselName(vesselGroups, b.vessel)} · ${b.dEnd < 0 ? 'overdue' : b.dEnd === 0 ? 'packaging today' : `${b.dEnd}d until packaging`}`}
                pct={b.pct}
                barColor="var(--blue)"
                onOpenRecipe={onOpenRecipe}
              />
            ))}
          </div>
        )}
      </div>

      <div className="ov-row-of-sections">
        <div className="ov-section">
          <div className="ov-section-title">Upcoming Brews</div>
          {cats.planned.length === 0 ? (
            <div className="ov-empty">No upcoming brews scheduled</div>
          ) : (
            <div className="ov-cards">
              {cats.planned.slice(0, 6).map(b => (
                <BrewCard
                  key={b.id}
                  brew={b}
                  recipe={b.recipeId ? recipeById[b.recipeId] : null}
                  badge="planned"
                  badgeLabel={b.dStart === 0 ? 'Today' : b.dStart === 1 ? 'Tomorrow' : `in ${b.dStart}d`}
                  sub={`${findVesselName(vesselGroups, b.vessel)} · ${fmtDate(strToDate(b.start))}`}
                  onOpenRecipe={onOpenRecipe}
                />
              ))}
            </div>
          )}
        </div>

        {nextBrewDays.length > 0 && (
          <div className="ov-section">
            <div className="ov-section-title">Recipe Brew Dates</div>
            {nextBrewDays.map((nb, i) => {
              // Use formatBrewLine when we have a recipe; otherwise simple name.
              const line = nb.brew
                ? formatBrewLine(nb.brew, nb.recipe)
                : nb.recipe
                  ? formatBrewLine(
                      { id: nb.recipe.id, name: nb.name, vessel: '', start: nb.date, end: nb.date, color: '' },
                      nb.recipe,
                    )
                  : { primary: nb.name, version: null as string | null, fallbackOnly: true };
              const styleLine = formatBrewStyleLine(nb.recipe);
              const clickable = !!nb.recipe?.id;
              const dateLabel = nb.d === 0 ? 'today' : nb.d === 1 ? 'tomorrow' : fmtDate(strToDate(nb.date));
              const dateColor = nb.d <= 2 ? 'var(--amber)' : undefined;
              return (
                <div
                  key={i}
                  className={`ov-row ${clickable ? 'clickable' : ''}`}
                  onClick={clickable && nb.recipe ? () => onOpenRecipe(nb.recipe!.id) : undefined}
                >
                  <div className="ov-row-label ov-row-label-3line" style={{ flex: 1, minWidth: 0 }}>
                    <span className="l1">{line.primary}</span>
                    {styleLine && <span className="l2">{styleLine}</span>}
                    {!line.fallbackOnly && line.version && <span className="l3">{line.version}</span>}
                  </div>
                  <span className="ov-row-date" style={dateColor ? { color: dateColor } : undefined}>
                    {dateLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ov-row-of-sections">
        <div className="ov-section">
          <div className="ov-section-title">Upcoming Actions</div>
          {upcomingActions.length === 0 ? (
            <div className="ov-empty">No actions in next 14 days</div>
          ) : (
            upcomingActions.map((it, i) => {
              const aType = ACTION_TYPES[it.act.type] ?? ACTION_TYPES.custom;
              const label = it.act.type === 'custom' && it.act.label ? it.act.label : aType.label;
              const recipe = it.brew.recipeId ? recipeById[it.brew.recipeId] : null;
              const line = formatBrewLine(it.brew, recipe);
              const dateLabel = it.d === 0 ? 'today' : it.d === 1 ? 'tomorrow' : `in ${it.d}d`;
              const dateColor = it.d <= 1 ? 'var(--amber)' : undefined;
              return (
                <div key={i} className="ov-row">
                  <span style={{ fontSize: 14 }}>{it.act.emoji || '📋'}</span>
                  <span className="ov-row-label">
                    <b>{label}</b> · {line.primary}
                  </span>
                  <span className="ov-row-date" style={dateColor ? { color: dateColor } : undefined}>
                    {dateLabel}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="ov-section">
          <div className="ov-section-title">Deliveries</div>
          {upcomingOrders.length === 0 ? (
            <div className="ov-empty">No deliveries logged</div>
          ) : (
            upcomingOrders.map(o => {
              const d = diffDays(today, strToDate(o.delivery!));
              const dateLabel = d === 0 ? 'today' : d === 1 ? 'tomorrow' : fmtDate(strToDate(o.delivery!));
              const unit = INV_UNITS[o.type] ?? '';
              return (
                <div key={o.id} className="ov-row">
                  <span className="ov-row-label">
                    <b>{o.ingredient}</b>
                    {o.supplier ? ` · ${o.supplier}` : ''}{' '}
                    <span style={{ color: 'var(--text-muted)' }}>{o.qty} {unit}</span>
                  </span>
                  <span className="ov-row-date" style={d === 0 ? { color: 'var(--amber)' } : undefined}>
                    {dateLabel}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ScheduleTable
        brewCols={schedule.brewCols}
        bySec={schedule.bySec}
        recipeById={recipeById}
        onOpenRecipe={onOpenRecipe}
      />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────

interface BrewCardProps {
  brew: PlannerBrew;
  recipe: Recipe | null | undefined;
  badge: 'fermenting' | 'bright' | 'planned';
  badgeLabel: string;
  sub: string;
  pct?: number;
  barColor?: string;
  warn?: string;
  onOpenRecipe: (recipeId: string) => void;
}

function BrewCard({ brew, recipe, badge, badgeLabel, sub, pct, barColor, warn, onOpenRecipe }: BrewCardProps) {
  const line = formatBrewLine(brew, recipe);
  const clickable = !!brew.recipeId && !!recipe;
  const borderColor = brew.color || '#888';
  return (
    <div
      className={`ov-card ${clickable ? 'clickable' : ''}`}
      style={{ borderLeft: `3px solid ${borderColor}` }}
      onClick={clickable ? () => onOpenRecipe(brew.recipeId!) : undefined}
    >
      <span className={`ov-card-badge ${badge}`}>{badgeLabel}</span>
      <div className="ov-card-name">
        <span>{line.primary}</span>
        {!line.fallbackOnly && line.version && (
          <span className="ov-card-version">{line.version}</span>
        )}
      </div>
      <div className="ov-card-sub">{sub}</div>
      {pct !== undefined && (
        <div className="ov-card-bar">
          <div
            className="ov-card-bar-fill"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      )}
      {warn && (
        <div className="ov-card-detail" style={{ color: 'var(--amber)' }}>{warn}</div>
      )}
      {clickable && (
        <div className="ov-card-detail">→ open recipe</div>
      )}
    </div>
  );
}

// ─── Schedule table ───────────────────────────────────────────────────

const SEC_LABELS: Record<LibSection, string> = {
  malts: 'Malts & Grains',
  hops:  'Hops',
  yeast: 'Yeast',
  misc:  'Adjuncts',
};

interface ScheduleTableProps {
  brewCols: PlannerBrew[];
  bySec: { sec: LibSection; entries: { row: ReturnType<typeof buildForecastRows>[number]; status: ReturnType<typeof computeRowStatus> }[] }[];
  recipeById: Record<string, Recipe>;
  onOpenRecipe: (recipeId: string) => void;
}

function ScheduleTable({ brewCols, bySec, recipeById, onOpenRecipe }: ScheduleTableProps) {
  if (brewCols.length === 0) {
    return (
      <div className="ov-section">
        <div className="ov-section-title">Inventory Schedule</div>
        <div className="ov-empty">No upcoming brews to project against.</div>
      </div>
    );
  }
  return (
    <div className="ov-section">
      <div className="ov-section-title">Inventory Schedule</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="ov-schedule">
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Item</th>
              <th className="num" style={{ minWidth: 70 }}>Stock</th>
              {brewCols.map(b => {
                const recipe = b.recipeId ? recipeById[b.recipeId] : null;
                const line = formatBrewLine(b, recipe);
                const clickable = !!recipe;
                return (
                  <th
                    key={b.id}
                    className="num"
                    title={line.primary}
                    style={clickable ? { cursor: 'pointer' } : undefined}
                    onClick={clickable && recipe ? () => onOpenRecipe(recipe.id) : undefined}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ textTransform: 'none' }}>{truncate(line.primary, 14)}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>{(b.start || '').slice(5)}</span>
                    </div>
                  </th>
                );
              })}
              <th className="num" style={{ minWidth: 70 }}>Final</th>
              <th style={{ minWidth: 60 }}>Status</th>
            </tr>
          </thead>
          {bySec.map(({ sec, entries }) => {
            if (entries.length === 0) return null;
            const unit = INV_UNITS[sec] || 'kg';
            return (
              <tbody key={sec}>
                <tr className="sec-header">
                  <td colSpan={brewCols.length + 4}>{SEC_LABELS[sec]}</td>
                </tr>
                {entries.map(({ row, status }) => {
                    const isShort = status === 'SHORT';
                    const isLow = status === 'LOW';
                    return (
                      <tr key={`${sec}-${row.entry.id}`} className={isShort ? 'short' : isLow ? 'low' : ''}>
                        <td>{row.entry.name}</td>
                        <td className="num">{row.stock.toFixed(row.stock < 1 ? 2 : 1)} {unit}</td>
                        {row.colAmts.map((cell, i) => {
                          const bal = row.balances[i];
                          const cellStyle: React.CSSProperties = bal < 0
                            ? { color: 'var(--red)', fontWeight: 600 }
                            : bal < row.totalNeeded * 0.15
                              ? { color: 'var(--amber)', fontWeight: 600 }
                              : { color: 'var(--text-muted)' };
                          return (
                            <td key={i} className="num" style={cellStyle}>
                              {cell.amt > 0 ? fmtNum(cell.amt, { dp: 1 }) : <span style={{ opacity: 0.25 }}>—</span>}
                            </td>
                          );
                        })}
                        <td className="num" style={{ color: row.finalBalance < 0 ? 'var(--red)' : undefined }}>
                          {row.finalBalance.toFixed(row.finalBalance < 1 && row.finalBalance > -1 ? 2 : 1)}
                        </td>
                        <td>
                          {isShort && <span className="status-short">SHORT</span>}
                          {isLow && <span className="status-low">LOW</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
        </table>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
