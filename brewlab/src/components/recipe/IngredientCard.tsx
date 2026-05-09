/**
 * Ingredient section — flat layout (no card chrome).
 *
 * Section header: small-caps label + inline count + thin divider underneath.
 * Right-click on the header opens a column-visibility popover, mirroring
 * the inventory page's pattern (brewlab-desktop.html:15223 / React's
 * src/components/inventory/CurrentStockTable.tsx:302). Visibility persists
 * per-section to localStorage at `bl_recipe_cols_<type>` — local-only
 * per-device prefs, intentionally not synced to Supabase.
 *
 * Rows are dense flex rows (~32px min-height). Available columns per type
 * registered in RECIPE_COL_DEFS; default visibility filters cost/color/aa
 * out — user re-enables via the toggle menu.
 *
 * Row interactions match RecipeTab's wiring:
 *   - single click  → select (visual highlight)
 *   - double click  → open Edit modal
 *   - right click   → context menu (Duplicate / Delete) — handled in RecipeTab
 *
 * Amount cell is read-only display. Inline editing was removed 2026-05-04
 * because accidental edits on tax-relevant amounts were too easy to make;
 * all amount changes go through the Edit modal.
 */

import { useState, type ReactElement } from 'react';
import { useStore } from '../../store';
import { fmtAmt } from '../../lib/utils';
import type { Ingredient, IngredientType } from '../../types';

type RecipeSectionType = 'grain' | 'hop' | 'yeast' | 'misc';

interface ColDef {
  key: string;
  label: string;
  default: boolean;
}

const RECIPE_COL_DEFS: Record<RecipeSectionType, ColDef[]> = {
  grain: [
    { key: 'amount', label: 'Amount',      default: true  },
    { key: 'name',   label: 'Name',        default: true  },
    { key: 'use',    label: 'Use',         default: true  },
    { key: 'pct',    label: 'Grain %',     default: true  },
    { key: 'color',  label: 'Color (EBC)', default: false },
    { key: 'cost',   label: 'Cost',        default: false },
  ],
  hop: [
    { key: 'amount', label: 'Amount', default: true  },
    { key: 'name',   label: 'Name',   default: true  },
    { key: 'use',    label: 'Use',    default: true  },
    { key: 'time',   label: 'Time',   default: true  },
    { key: 'ibu',    label: 'IBU',    default: true  },
    { key: 'aa',     label: 'AA %',   default: false },
    { key: 'cost',   label: 'Cost',   default: false },
  ],
  yeast: [
    { key: 'amount', label: 'Amount', default: true  },
    { key: 'name',   label: 'Name',   default: true  },
    { key: 'use',    label: 'Use',    default: true  },
    { key: 'cost',   label: 'Cost',   default: false },
  ],
  misc: [
    { key: 'amount', label: 'Amount', default: true  },
    { key: 'name',   label: 'Name',   default: true  },
    { key: 'use',    label: 'Use',    default: true  },
    { key: 'time',   label: 'Time',   default: true  },
    { key: 'cost',   label: 'Cost',   default: false },
  ],
};

function getRecipeColVisibility(type: RecipeSectionType): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`bl_recipe_cols_${type}`);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch { /* ignore */ }
  const def: Record<string, boolean> = {};
  for (const c of RECIPE_COL_DEFS[type]) def[c.key] = c.default;
  return def;
}

function setRecipeColVisibility(type: RecipeSectionType, vis: Record<string, boolean>) {
  try {
    localStorage.setItem(`bl_recipe_cols_${type}`, JSON.stringify(vis));
  } catch { /* ignore */ }
}

interface Props {
  recipeId: string;
  type: IngredientType;
  label: string;
  dotColor: string;
  items: Ingredient[];
  grainPcts: Map<string, number>;
  perHopIbu: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  /** Open the dry-hop split modal for this ingredient (hops only). */
  onOpenSplit?: (id: string) => void;
  /**
   * Adds a 12px top margin so the section gets ~24px effective spacing
   * above it (combined with the parent flex `gap: 12`). Used for the
   * Misc section's visual separation from yeast/hops/grains above.
   */
  extraTopGap?: boolean;
}

export default function IngredientCard({
  type, label, dotColor, items, grainPcts, perHopIbu,
  selectedId, onSelect, onDoubleClick, onContextMenu, onOpenSplit,
  extraTopGap = false,
}: Props) {
  // RecipeTab only ever passes grain / hop / yeast / misc. The prop is
  // typed broader for upstream flexibility; narrow defensively here.
  const sectionType: RecipeSectionType = (
    type === 'grain' || type === 'hop' || type === 'yeast' || type === 'misc'
  ) ? type : 'misc';

  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);

  const [colVis, setColVis] = useState<Record<string, boolean>>(
    () => getRecipeColVisibility(sectionType),
  );
  const [colMenu, setColMenu] = useState<{ x: number; y: number } | null>(null);

  const cols = RECIPE_COL_DEFS[sectionType];
  const visibleCols = cols.filter(c => colVis[c.key] !== false);

  const onHeaderContext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setColMenu({ x: e.clientX, y: e.clientY });
  };

  const toggleCol = (key: string) => {
    const next = { ...colVis, [key]: !(colVis[key] ?? false) };
    setColVis(next);
    setRecipeColVisibility(sectionType, next);
  };

  return (
    <div style={{ ...sectionStyle, ...(extraTopGap ? { marginTop: 12 } : {}) }}>
      <div
        style={headerStyle}
        onContextMenu={onHeaderContext}
        title="Right-click for column options"
      >
        <span style={{ ...dotStyle, background: dotColor }} />
        <span style={labelStyle}>{label}</span>
        <span style={countStyle}>· {items.length}</span>
      </div>

      {items.length === 0 ? (
        <div style={emptyStyle}>No {label.toLowerCase()} added</div>
      ) : (
        items.map(ing => (
          <IngredientRow
            key={ing.id}
            ing={ing}
            type={sectionType}
            visibleCols={visibleCols}
            pct={grainPcts.get(ing.id)}
            ibu={perHopIbu.get(ing.id)}
            isSelected={selectedId === ing.id}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onOpenSplit={onOpenSplit}
            maltLib={maltLib}
            hopLib={hopLib}
            yeastLib={yeastLib}
            miscLib={miscLib}
          />
        ))
      )}

      {colMenu && (
        <ColMenu
          type={sectionType}
          colVis={colVis}
          x={colMenu.x}
          y={colMenu.y}
          onToggle={toggleCol}
          onClose={() => setColMenu(null)}
        />
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────

function IngredientRow({
  ing, type, visibleCols, pct, ibu, isSelected,
  onSelect, onDoubleClick, onContextMenu, onOpenSplit,
  maltLib, hopLib, yeastLib, miscLib,
}: {
  ing: Ingredient;
  type: RecipeSectionType;
  visibleCols: ColDef[];
  pct?: number;
  ibu?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onOpenSplit?: (id: string) => void;
  maltLib: any[];
  hopLib: any[];
  yeastLib: any[];
  miscLib: any[];
}) {
  const isDryHop = type === 'hop' && (ing.use || '').toLowerCase() === 'dry hop';
  const split = isDryHop ? ing.dhSplit ?? null : null;
  const hasSplit = !!split && (
    (split[1] ?? 0) > 0 || (split[2] ?? 0) > 0 || (split[3] ?? 0) > 0
  );
  const splitParts = hasSplit && split
    ? ([1, 2, 3] as const)
        .filter(n => (split[n] ?? 0) > 0)
        .map(n => `DH${n}:${split[n]}g`)
        .join(' / ')
    : '';

  // Cost: ingredient cost first, fall back to library lookup. Water rows
  // skip the lookup (no library binding) — RecipeTab doesn't currently
  // render type='water' here, but stay defensive.
  let linecost = ing.cost || 0;
  if (linecost === 0) {
    const libKey = ({ grain: maltLib, hop: hopLib, yeast: yeastLib, misc: miscLib } as Record<string, any[]>)[type] || [];
    const lib = libKey.find((e: any) =>
      e.id === ing.libId || (e.name || '').toLowerCase() === (ing.name || '').toLowerCase()
    );
    if (lib?.price) {
      const kg = ing.unit === 'g' ? ing.amt * 0.001 : ing.amt;
      linecost = type === 'yeast' ? lib.price : lib.price * kg;
    }
  }
  const costHi = linecost > 1000;

  const cellMap: Record<string, ReactElement | null> = {
    amount: (
      <span style={cellAmountStyle}>{fmtAmt(ing.amt, ing.unit)} {ing.unit}</span>
    ),
    name: (
      <span style={cellNameStyle}>
        {ing.name || '—'}
        {isDryHop && onOpenSplit && (
          hasSplit ? (
            <span
              onClick={e => { e.stopPropagation(); onOpenSplit(ing.id); }}
              title="Edit split"
              style={splitBadgeStyle}
            >
              {splitParts}
            </span>
          ) : (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onOpenSplit(ing.id); }}
              title="Split across dry hops"
              style={splitButtonStyle}
            >
              ÷ split
            </button>
          )
        )}
      </span>
    ),
    use: <span style={cellDetailStyle}>{ing.use || '—'}</span>,
    time: <span style={cellDetailStyle}>{ing.time ? `${ing.time}m` : '—'}</span>,
    ibu: ibu != null && ibu > 0
      ? <span style={cellIbuStyle}>{ibu.toFixed(1)}</span>
      : <span style={cellMutedStyle}>—</span>,
    pct: pct != null && pct > 0
      ? <span style={cellMutedStyle}>{pct.toFixed(1)}%</span>
      : <span style={cellMutedStyle}>—</span>,
    aa: ing.extra
      ? <span style={cellDetailStyle}>{ing.extra}%</span>
      : <span style={cellMutedStyle}>—</span>,
    color: ing.extra
      ? <span style={cellDetailStyle}>{ing.extra}</span>
      : <span style={cellMutedStyle}>—</span>,
    cost: linecost > 0
      ? <span style={{ ...cellCostStyle, ...(costHi ? { color: 'var(--text)' } : {}) }}>
          ¥{Math.round(linecost).toLocaleString()}
        </span>
      : <span style={cellCostStyle}>—</span>,
  };

  return (
    <div
      style={{ ...rowStyle, ...(isSelected ? rowSelectedStyle : {}) }}
      onClick={() => onSelect(ing.id)}
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick(ing.id); }}
      onContextMenu={e => onContextMenu(e, ing.id)}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '';
      }}
    >
      {visibleCols.map(c => (
        <div key={c.key} style={{ ...(cellWrapperStyles[c.key] ?? {}), minWidth: 0 }}>
          {cellMap[c.key] ?? <span style={cellMutedStyle}>—</span>}
        </div>
      ))}
    </div>
  );
}

// ── Column-toggle menu ────────────────────────────────────────────────

function ColMenu({
  type, colVis, x, y, onToggle, onClose,
}: {
  type: RecipeSectionType;
  colVis: Record<string, boolean>;
  x: number;
  y: number;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const left = Math.min(x, window.innerWidth - 220);
  const top  = Math.min(y, window.innerHeight - 320);

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 60 }}
        onMouseDown={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div
        style={{
          position: 'fixed', zIndex: 61, left, top,
          minWidth: 200, background: 'var(--panel)',
          border: '1px solid var(--border2)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{
          padding: '6px 12px', fontFamily: 'var(--mono)', fontSize: 8,
          letterSpacing: 1.5, color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
        }}>SHOW COLUMNS</div>
        {RECIPE_COL_DEFS[type].map(c => {
          const checked = colVis[c.key] !== false;
          return (
            <div
              key={c.key}
              onClick={() => onToggle(c.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--panel2)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ''}
            >
              <span style={{ width: 12, color: 'var(--amber)' }}>{checked ? '✓' : ''}</span>
              <span>{c.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 4px 6px',
  borderBottom: '1px solid var(--border)',
  cursor: 'context-menu',
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const countStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
};

const emptyStyle: React.CSSProperties = {
  padding: '10px 4px',
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 32,
  padding: '4px 8px',
  cursor: 'pointer',
  borderLeft: '2px solid transparent',
  borderBottom: '1px solid rgba(255,255,255,0.03)',
};

const rowSelectedStyle: React.CSSProperties = {
  background: 'rgba(255,159,10,0.10)',
  borderLeft: '2px solid var(--amber)',
};

// Per-column wrapper widths for the flex row. Name flexes to fill.
const cellWrapperStyles: Record<string, React.CSSProperties> = {
  amount: { width: 90,  flexShrink: 0 },
  name:   { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  use:    { width: 100, flexShrink: 0, textAlign: 'right' },
  time:   { width: 44,  flexShrink: 0, textAlign: 'right' },
  ibu:    { width: 44,  flexShrink: 0, textAlign: 'right' },
  pct:    { width: 50,  flexShrink: 0, textAlign: 'right' },
  aa:     { width: 50,  flexShrink: 0, textAlign: 'right' },
  color:  { width: 50,  flexShrink: 0, textAlign: 'right' },
  cost:   { width: 70,  flexShrink: 0, textAlign: 'right' },
};

const cellAmountStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  color: 'var(--text)',
  fontWeight: 600,
};

const cellNameStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text)',
  fontWeight: 500,
};

const cellDetailStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
  fontWeight: 400,
};

const cellMutedStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
};

const cellIbuStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: '#5ab568',
  fontWeight: 500,
};

const cellCostStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  color: 'var(--text-dim)',
};

const splitBadgeStyle: React.CSSProperties = {
  cursor: 'pointer', marginLeft: 6,
  fontSize: 9, fontFamily: 'var(--mono)',
  color: 'var(--amber)',
  background: 'rgba(212,130,15,0.12)',
  border: '1px solid rgba(212,130,15,0.25)',
  borderRadius: 4, padding: '1px 5px',
};

const splitButtonStyle: React.CSSProperties = {
  marginLeft: 6, background: 'none',
  border: '1px solid var(--border2)', borderRadius: 4,
  color: 'var(--text-muted)',
  fontSize: 9, fontFamily: 'var(--mono)',
  padding: '1px 5px', cursor: 'pointer',
  letterSpacing: 0.5,
};
