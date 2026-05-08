/**
 * Order Planner forecast table — port of brewlab-desktop.html line
 * 15466 (renderOrderPlanner). The cross-product table:
 *
 *   columns: brew + delivery columns interleaved by date (each takes
 *            two cells: amount + running balance).
 *   rows:    ingredient grouped by section (malts/hops/yeast/misc).
 *
 * Status indicator per row (HTML 15562):
 *   • DONE   — totalNeeded === 0 (every column already recorded)
 *   • SHORT  — finalBalance < 0
 *   • LOW    — finalBalance < totalNeeded * 0.15
 *   • OK     — otherwise
 *
 * Brew header right-click → opens the Phase 1 RecordUsageModal for that
 * brew. Same surface area as HTML 15545 (oncontextmenu).
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { fmtKg, INV_UNITS } from '../../lib/units';
import {
  buildForecastRows, computeRowStatus, deriveTimeline,
  type LibSection, type LibBySection, type TimelineColumn,
} from './orderForecast';
import RecordUsageModal from '../inventory/RecordUsageModal';

interface Props {
  section: LibSection | 'all';
}

const SECTION_LABEL: Record<LibSection, string> = {
  malts: 'MALTS', hops: 'HOPS', yeast: 'YEAST', misc: 'ADJUNCTS',
};

export default function ForecastTable({ section }: Props) {
  const plannerBrews   = useStore(s => s.plannerBrews);
  const orders         = useStore(s => s.orders);
  const inventoryStock = useStore(s => s.inventoryStock);
  const ledgerData     = useStore(s => s.ledgerData);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const loadIngredients     = useStore(s => s.loadIngredients);
  const recipes = useStore(s => s.recipes);
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);

  // Recipe lookup for brew → taxBatch / beerName resolution. The
  // forecast header renders "TAX — Beer" composite labels and the
  // already-recorded check prefers exact taxBatch match.
  const recipeById = useMemo(() => {
    const m = new Map<string, { taxBatch: string; beerName: string; name: string }>();
    for (const r of recipes) {
      m.set(r.id, {
        taxBatch: r.taxBatch ?? '',
        beerName: r.beerName ?? '',
        name:     r.name ?? '',
      });
    }
    return m;
  }, [recipes]);
  const getTaxBatch = (recipeId: string): string =>
    recipeById.get(recipeId)?.taxBatch ?? '';

  const [recordUsageBrewId, setRecordUsageBrewId] = useState<string | null>(null);

  // Lazy-load ingredients for every brew currently in the timeline.
  // Without this, freshly-hydrated brews would fall back to the empty
  // array on first render and the forecast would underestimate usage.
  useEffect(() => {
    for (const b of plannerBrews) {
      if (b.recipeId && ingredientsByRecipe[b.recipeId] === undefined) {
        loadIngredients(b.recipeId);
      }
    }
  }, [plannerBrews, ingredientsByRecipe, loadIngredients]);

  const libBySection: LibBySection = { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib };

  const timeline = useMemo<TimelineColumn[]>(
    () => deriveTimeline(plannerBrews, orders),
    [plannerBrews, orders],
  );

  const sections: LibSection[] = section === 'all'
    ? ['malts', 'hops', 'yeast', 'misc']
    : [section];

  // Empty states.
  const visibleBrews = plannerBrews.filter(b => b.recipeId);
  if (!visibleBrews.length) {
    return (
      <div style={emptyStyle}>
        No brews linked to recipes in the planner.<br />
        Open the Planner, add brews, and link them to recipes to see your order plan.
      </div>
    );
  }

  // Build forecast rows once per section so we can also detect the
  // "no ingredients used in any planned brew" empty case.
  const sectionRows = sections.map(sec => ({
    sec,
    rows: buildForecastRows(
      sec, timeline, libBySection, inventoryStock, ledgerData,
      recipeId => ingredientsByRecipe[recipeId] ?? [],
      getTaxBatch,
    ),
  }));
  const anyRows = sectionRows.some(s => s.rows.length > 0);
  if (!anyRows) {
    return (
      <div style={emptyStyle}>
        No ingredients from your library are used in any planned brew.
      </div>
    );
  }

  // Total cells in a row (used for section header colspan).
  // 1 ingredient + 1 on-hand + (2 per timeline column) + 1 needed + 1 status
  const totalColCount = 3 + timeline.length * 2 + 1;

  return (
    <div style={tableWrapStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', userSelect: 'none' }}>
        <tbody>
          {sectionRows.map(({ sec, rows }) => {
            if (!rows.length) return null;
            const unit = INV_UNITS[sec];
            return (
              <SectionBlock
                key={sec}
                sec={sec}
                unit={unit}
                rows={rows}
                timeline={timeline}
                totalColCount={totalColCount}
                recipeById={recipeById}
                onBrewContext={brewId => setRecordUsageBrewId(brewId)}
              />
            );
          })}
        </tbody>
      </table>

      {recordUsageBrewId && (
        <RecordUsageModal
          brewId={recordUsageBrewId}
          onClose={() => setRecordUsageBrewId(null)}
        />
      )}
    </div>
  );
}

// ── Sub-render: one section block (header + col headers + data rows) ─

function SectionBlock({
  sec, unit, rows, timeline, totalColCount, recipeById, onBrewContext,
}: {
  sec: LibSection;
  unit: string;
  rows: ReturnType<typeof buildForecastRows>;
  timeline: TimelineColumn[];
  totalColCount: number;
  recipeById: Map<string, { taxBatch: string; beerName: string; name: string }>;
  onBrewContext: (brewId: string) => void;
}) {
  return (
    <>
      {/* Section heading row */}
      <tr>
        <td colSpan={totalColCount} style={sectionHeaderStyle}>
          {SECTION_LABEL[sec]} · {unit.toUpperCase()}
        </td>
      </tr>

      {/* Column header row */}
      <tr style={{ background: 'var(--panel2)' }}>
        <th style={{ ...thStyle, ...stickyLeftStyle, minWidth: 160, zIndex: 15 }}>INGREDIENT</th>
        <th style={{ ...thStyle, minWidth: 80, textAlign: 'right' }}>ON HAND</th>
        {timeline.map((col, i) => col.kind === 'brew' ? (
          <th
            key={`c-${i}`}
            colSpan={2}
            onContextMenu={e => { e.preventDefault(); onBrewContext(col.brew.id); }}
            title="Right-click to log usage"
            style={{
              ...thStyle, textAlign: 'center', cursor: 'context-menu',
              borderTop: `2px solid ${col.brew.color}`,
              background: `${col.brew.color}22`,
              color: 'var(--text)', padding: '3px 6px',
            }}
          >
            {formatBrewHeader(col.brew, recipeById)}
            <br />
            <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>
              {col.brew.start.slice(5)}
            </span>
          </th>
        ) : (
          <th
            key={`c-${i}`}
            colSpan={2}
            style={{
              ...thStyle, textAlign: 'center',
              borderTop: '2px solid var(--green)',
              background: 'rgba(50,215,75,0.08)',
              color: 'var(--green)', padding: '3px 6px',
            }}
          >
            📦 DELIVERY
            <br />
            <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>
              {col.date.slice(5).replace('-', '/')}
            </span>
          </th>
        ))}
        <th style={{ ...thStyle, minWidth: 80, textAlign: 'right' }}>NEEDED</th>
        <th style={{ ...thStyle, minWidth: 70 }}>STATUS</th>
      </tr>

      {/* Data rows */}
      {rows.map((row, i) => {
        const rowBg = i % 2 === 0 ? 'var(--bg)' : 'var(--panel)';
        const status = computeRowStatus(row);
        const statusLabel =
          status === 'DONE'  ? '✓ DONE' :
          status === 'SHORT' ? '⚠ SHORT' :
          status === 'LOW'   ? '⚡ LOW' : '✓ OK';
        const statusColor =
          status === 'DONE'  ? '#3a8a3a' :
          status === 'SHORT' ? '#c03030' :
          status === 'LOW'   ? '#f09420' : '#3a8a3a';

        return (
          <tr key={String(row.entry.id)} style={{ background: rowBg }}>
            <td style={{ ...nameTdStyle, ...stickyLeftStyle, background: rowBg }}>
              {row.entry.name || '—'}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontSize: 11 }}>{fmtKg(row.stock)}</td>
            {row.colAmts.flatMap((c, j) => {
              const bal = row.balances[j];
              const balColor = bal < 0
                ? '#c03030'
                : row.stock > 0 && bal < row.stock * 0.15
                  ? '#f09420' : 'var(--text)';
              return [
                <td key={`a-${j}`} style={{ ...tdStyle, textAlign: 'center' }}>
                  {c.incoming > 0
                    ? <span style={{ color: 'var(--green)' }}>+{fmtKg(c.incoming)}</span>
                    : c.recorded
                      ? <span title="Already recorded" style={{ color: '#3a8a3a', fontSize: 9 }}>✓</span>
                      : c.amt > 0
                        ? <span style={{ color: '#c05050' }}>{fmtKg(c.amt)}</span>
                        : null}
                </td>,
                <td key={`b-${j}`} style={{ ...tdStyle, textAlign: 'center', color: balColor }}>
                  {fmtKg(bal)}
                </td>,
              ];
            })}
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontSize: 11 }}>
              {fmtKg(row.totalNeeded)}
            </td>
            <td style={{ ...tdStyle, fontWeight: 700, color: statusColor }}>
              {statusLabel}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Composite brew header label — "ABC-23 — Hazy IPA" when the linked
 * recipe has both a taxBatch and a beerName/name. Falls back to single
 * values: just the brew name if there's no recipe link, just the tax
 * batch if the recipe has a taxBatch but no beer name, etc.
 */
function formatBrewHeader(
  brew: { name: string; recipeId?: string | null },
  recipeById: Map<string, { taxBatch: string; beerName: string; name: string }>,
): string {
  const r = brew.recipeId ? recipeById.get(brew.recipeId) : undefined;
  const tax = r?.taxBatch?.trim() ?? '';
  const beer = (r?.beerName?.trim() || r?.name?.trim()) ?? '';
  if (tax && beer) return `${tax} — ${beer}`;
  if (tax)         return tax;
  if (beer)        return beer;
  return brew.name;
}

// ── Styles ────────────────────────────────────────────────────────────

const tableWrapStyle: React.CSSProperties = {
  flex: 1, overflow: 'auto',
};

const emptyStyle: React.CSSProperties = {
  padding: 30, color: 'var(--text-muted)',
  fontFamily: 'var(--mono)', fontSize: 10, textAlign: 'center',
};

const sectionHeaderStyle: React.CSSProperties = {
  background: 'var(--panel2)',
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2,
  color: 'var(--amber)', padding: '6px 12px',
  borderTop: '2px solid var(--border2)',
};

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  padding: '4px 8px', fontWeight: 600,
  background: 'var(--panel2)',
};

const stickyLeftStyle: React.CSSProperties = {
  position: 'sticky' as const, left: 0, zIndex: 5,
};

const nameTdStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
  padding: '4px 8px', borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
  padding: '4px 6px', borderBottom: '1px solid var(--border)',
};
