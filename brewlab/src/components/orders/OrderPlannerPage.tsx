/**
 * Order Planner page — port of brewlab-desktop.html lines 3274–3303
 * (markup) and the helper functions named in Phase 2's spec.
 *
 * Toolbar:
 *   • Section dropdown: ALL / MALTS / HOPS / YEAST / ADJUNCTS.
 *   • 🔗 GOOGLE SHEETS — disabled with title="Coming soon" per spec.
 *   • 📦 ORDERS — toggles OrdersPanel.
 *   • ⬇ EXPORT XLSX — exportOrderPlannerXlsx.
 *   • ＋ NEW ORDER — opens AddOrderModal.
 *
 * Import Library (XML) and Import Stock (CSV) moved to
 * Settings → Order Planner (OrderPlannerSettingsPanel.tsx) — occasional
 * bulk-import actions, not day-to-day toolbar buttons.
 *
 * Body: ForecastTable.
 */

import { useState } from 'react';
import { useStore } from '../../store';
import ForecastTable from './ForecastTable';
import OrdersPanel from './OrdersPanel';
import AddOrderModal from './AddOrderModal';
import { exportOrderPlannerXlsx } from './orderXlsx';
import { printForecastTable } from './forecastPrint';
import type { LibSection } from './orderForecast';

const SECTIONS: { id: LibSection | 'all'; label: string }[] = [
  { id: 'all',   label: 'ALL INGREDIENTS' },
  { id: 'malts', label: 'MALTS' },
  { id: 'hops',  label: 'HOPS' },
  { id: 'yeast', label: 'YEAST' },
  { id: 'misc',  label: 'ADJUNCTS' },
];

export default function OrderPlannerPage() {
  const settings    = useStore(s => s.settings);
  const plannerBrews    = useStore(s => s.plannerBrews);
  const orders          = useStore(s => s.orders);
  const recurringOrders = useStore(s => s.recurringOrders);
  const inventoryStock  = useStore(s => s.inventoryStock);
  const ledgerData      = useStore(s => s.ledgerData);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const recipes   = useStore(s => s.recipes);
  const maltLib   = useStore(s => s.maltLib);
  const hopLib    = useStore(s => s.hopLib);
  const yeastLib  = useStore(s => s.yeastLib);
  const miscLib   = useStore(s => s.miscLib);

  const [section, setSection] = useState<LibSection | 'all'>('all');
  const [dayLimit, setDayLimit] = useState<number>(30);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [addOrderOpen, setAddOrderOpen] = useState(false);

  const exportXlsx = () => {
    const recipeById = new Map(recipes.map(r => [r.id, r]));
    const labelOf = (b: typeof plannerBrews[number]): string => {
      const r = b.recipeId ? recipeById.get(b.recipeId) : undefined;
      const tax  = r?.taxBatch?.trim() ?? '';
      const beer = (r?.beerName?.trim() || r?.name?.trim()) ?? '';
      if (tax && beer) return `${tax} — ${beer}`;
      if (tax)         return tax;
      if (beer)        return beer;
      return b.name;
    };
    exportOrderPlannerXlsx({
      section,
      plannerBrews,
      libBySection: { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib },
      inventoryStock,
      ledgerData,
      getIngredients: recipeId => ingredientsByRecipe[recipeId] ?? [],
      resolveBrewLabel: labelOf,
      getTaxBatch: recipeId => recipeById.get(recipeId)?.taxBatch ?? '',
      breweryName: settings.breweryName,
    });
  };

  const printForecast = () => {
    const recipeById = new Map(recipes.map(r => [r.id, {
      taxBatch: r.taxBatch ?? '', beerName: r.beerName ?? '', name: r.name ?? '',
    }]));
    printForecastTable({
      section,
      plannerBrews,
      orders,
      recurringOrders,
      libBySection: { malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib },
      inventoryStock,
      ledgerData,
      getIngredients: recipeId => ingredientsByRecipe[recipeId] ?? [],
      recipeById,
      dayLimit,
      breweryName: settings.breweryName,
    });
  };

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <span style={titleStyle}>ORDER PLANNER</span>
        <select
          value={section}
          onChange={e => setSection(e.target.value as LibSection | 'all')}
          style={sectionSelectStyle}
        >
          {SECTIONS.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <select
          value={dayLimit}
          onChange={e => setDayLimit(Number(e.target.value))}
          style={sectionSelectStyle}
        >
          <option value={14}>2 weeks</option>
          <option value={30}>1 month</option>
          <option value={90}>3 months</option>
          <option value={0}>All</option>
        </select>
        <button className="btn sm" onClick={printForecast}>🖨 PRINT</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="btn sm"
            disabled
            title="Coming soon"
          >🔗 GOOGLE SHEETS</button>
          <button className="btn sm" onClick={() => setOrdersOpen(true)}>📦 ORDERS</button>
          <button className="btn sm" onClick={exportXlsx}>⬇ EXPORT XLSX</button>
          <button className="btn sm primary" onClick={() => setAddOrderOpen(true)}>＋ NEW ORDER</button>
        </div>
      </div>

      <ForecastTable section={section} dayLimit={dayLimit} />

      {ordersOpen && <OrdersPanel onClose={() => setOrdersOpen(false)} />}
      {addOrderOpen && <AddOrderModal onClose={() => setAddOrderOpen(false)} />}
    </div>
  );
}

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

const sectionSelectStyle: React.CSSProperties = {
  marginLeft: 14,
  fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)',
  background: 'var(--panel)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '5px 11px', outline: 'none', cursor: 'pointer',
};
