/**
 * Ingredient table card. Each row is read-only display:
 *   - single click  → select (visual highlight)
 *   - double click  → open Edit modal (amounts change there with a Save button)
 *   - right click   → context menu (Duplicate / Delete)
 *
 * Inline editing was removed from the amount cell on 2026-05-04 — accidental
 * clicks were too easy to make and recipe amounts are tax-relevant. All
 * changes now go through the Edit modal. Matches HTML's pattern at
 * brewlab-desktop.html:7508–7510.
 */

import type { ReactElement } from 'react';
import { useStore } from '../../store';
import { fmtAmt } from '../../lib/utils';
import type { Ingredient, IngredientType } from '../../types';

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
}

export default function IngredientCard({ type, label, dotColor, items, grainPcts, perHopIbu, selectedId, onSelect, onDoubleClick, onContextMenu, onOpenSplit }: Props) {
  const maltLib = useStore(s => s.maltLib);
  const hopLib = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib = useStore(s => s.miscLib);

  return (
    <div className="ing-card">
      <div className="ing-card-header">
        <span className="ing-card-dot" style={{ background: dotColor }} />
        <span className="ing-card-label">{label}</span>
        <span className="ing-card-count">{items.length}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ width: 24 }}>#</th>
            <th style={{ width: 90 }}>Amount</th>
            <th>Name</th>
            <th style={{ width: 110 }}>Use</th>
            <th style={{ width: 45 }}>Time</th>
            <th style={{ width: 52 }}>IBU/%</th>
            <th style={{ width: 80, textAlign: 'right' }}>Cost &yen;</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                No {label.toLowerCase()} added
              </td>
            </tr>
          ) : (
            items.map((ing, idx) => (
              <IngredientRow
                key={ing.id}
                ing={ing}
                idx={idx}
                type={type}
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
        </tbody>
      </table>
    </div>
  );
}

function IngredientRow({ ing, idx, type, pct, ibu, isSelected, onSelect, onDoubleClick, onContextMenu, onOpenSplit, maltLib, hopLib, yeastLib, miscLib }: {
  ing: Ingredient;
  idx: number;
  type: IngredientType;
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
  const amtDisplay = fmtAmt(ing.amt, ing.unit) + ' ' + ing.unit;

  const extraInfo = ing.extra && type === 'grain' ? ` · ${ing.extra}EBC` :
                    ing.extra && type === 'hop' ? ` · ${ing.extra}%AA` : '';
  const useStr = (ing.use || '—') + extraInfo;
  const timeStr = ing.time ? `${ing.time}m` : '—';

  // IBU or grain %
  let ibuPctDisplay: ReactElement;
  if (ibu != null && ibu > 0) {
    ibuPctDisplay = <span style={{ color: '#5ab568' }}>{ibu.toFixed(1)}</span>;
  } else if (pct != null && pct > 0) {
    ibuPctDisplay = <span style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>;
  } else {
    ibuPctDisplay = <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  // Cost from library (match HTML app: look up from library if no cost on ingredient).
  // Water rows have no library and no cost — leave linecost at 0.
  let linecost = ing.cost || 0;
  if (linecost === 0 && type !== 'water') {
    const libKey = { grain: maltLib, hop: hopLib, yeast: yeastLib, misc: miscLib }[type];
    const lib = libKey.find((e: any) => e.id === ing.libId || (e.name || '').toLowerCase() === (ing.name || '').toLowerCase());
    if (lib?.price) {
      const kg = ing.unit === 'g' ? ing.amt * 0.001 : ing.amt;
      linecost = type === 'yeast' ? lib.price : lib.price * kg;
    }
  }
  const costCell = linecost > 0 ? `¥${Math.round(linecost).toLocaleString()}` : '—';
  const costHi = linecost > 1000;

  // Dry-hop split badge / button — matches HTML brewlab-desktop.html:7554–7563.
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

  return (
    <tr
      className={isSelected ? 'selected' : ''}
      onClick={() => onSelect(ing.id)}
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick(ing.id); }}
      onContextMenu={e => onContextMenu(e, ing.id)}
      style={{ cursor: 'pointer' }}
    >
      <td className="td-num">{idx + 1}</td>
      <td className="td-amt" style={{ minWidth: 90 }}>{amtDisplay}</td>
      <td className="td-name">
        {ing.name || '—'}
        {isDryHop && onOpenSplit && (
          hasSplit ? (
            <span
              onClick={e => { e.stopPropagation(); onOpenSplit(ing.id); }}
              title="Edit split"
              style={{
                cursor: 'pointer', marginLeft: 6,
                fontSize: 9, fontFamily: 'var(--mono)',
                color: 'var(--amber)',
                background: 'rgba(212,130,15,0.12)',
                border: '1px solid rgba(212,130,15,0.25)',
                borderRadius: 4, padding: '1px 5px',
              }}
            >
              {splitParts}
            </span>
          ) : (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onOpenSplit(ing.id); }}
              title="Split across dry hops"
              style={{
                marginLeft: 6, background: 'none',
                border: '1px solid var(--border2)', borderRadius: 4,
                color: 'var(--text-muted)',
                fontSize: 9, fontFamily: 'var(--mono)',
                padding: '1px 5px', cursor: 'pointer',
                letterSpacing: 0.5,
              }}
            >
              ÷ split
            </button>
          )
        )}
      </td>
      <td className="td-detail"><span className="use-pill">{useStr}</span></td>
      <td className="td-detail">{timeStr}</td>
      <td className="td-ibu">{ibuPctDisplay}</td>
      <td className={`td-cost${costHi ? ' hi' : ''}`} style={{ textAlign: 'right' }}>{costCell}</td>
    </tr>
  );
}
