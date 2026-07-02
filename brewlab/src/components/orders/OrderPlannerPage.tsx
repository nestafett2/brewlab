/**
 * Order Planner page — port of brewlab-desktop.html lines 3274–3303
 * (markup) and the helper functions named in Phase 2's spec.
 *
 * Toolbar:
 *   • Section nav: ALL / MALTS / HOPS / YEAST / ADJUNCTS.
 *   • 🔗 GOOGLE SHEETS — disabled with title="Coming soon" per spec.
 *   • ⬆ IMPORT LIBRARY (XML) — reuses the libraryImport helpers from
 *     the Libraries page port. After import the user is told what
 *     section received entries; they navigate there from the menu.
 *   • ⬆ IMPORT STOCK (CSV) — StockImportButton.
 *   • 📦 ORDERS — toggles OrdersPanel.
 *   • ⬇ EXPORT XLSX — exportOrderPlannerXlsx.
 *   • ＋ NEW ORDER — opens AddOrderModal.
 *
 * Body: ForecastTable.
 */

import { useRef, useState } from 'react';
import { useStore } from '../../store';
import ForecastTable from './ForecastTable';
import OrdersPanel from './OrdersPanel';
import AddOrderModal from './AddOrderModal';
import StockImportButton from './StockImportButton';
import { exportOrderPlannerXlsx } from './orderXlsx';
import type { LibSection } from './orderForecast';
import { importBeerXML, importBSMX, isBSMX } from '../libraries/libraryImport';

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
  const inventoryStock  = useStore(s => s.inventoryStock);
  const ledgerData      = useStore(s => s.ledgerData);
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const recipes   = useStore(s => s.recipes);
  const maltLib   = useStore(s => s.maltLib);
  const hopLib    = useStore(s => s.hopLib);
  const yeastLib  = useStore(s => s.yeastLib);
  const miscLib   = useStore(s => s.miscLib);
  const setMaltLib  = useStore(s => s.setMaltLib);
  const setHopLib   = useStore(s => s.setHopLib);
  const setYeastLib = useStore(s => s.setYeastLib);
  const setMiscLib  = useStore(s => s.setMiscLib);
  const libNextId    = useStore(s => s.libNextId);
  const setLibNextId = useStore(s => s.setLibNextId);
  const setInventoryStock = useStore(s => s.setInventoryStock);
  const pushToast         = useStore(s => s.pushToast);

  const [section, setSection] = useState<LibSection | 'all'>('all');
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const libImportRef = useRef<HTMLInputElement>(null);

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

  const handleLibFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let text: string;
    try { text = await file.text(); }
    catch (err) {
      pushToast({ message: 'Could not read file: ' + (err as Error).message, variant: 'error' });
      e.target.value = '';
      return;
    }
    try {
      const result = isBSMX(file.name, text)
        ? importBSMX(text, libNextId, inventoryStock)
        : importBeerXML(text, 'malts', libNextId, inventoryStock);
      const total = result.counts.malts + result.counts.hops + result.counts.yeast + result.counts.misc;
      if (total === 0) {
        pushToast({ message: 'No matching entries found in this file.', variant: 'info' });
        return;
      }
      if (result.newEntries.malts.length) setMaltLib([...maltLib, ...result.newEntries.malts]);
      if (result.newEntries.hops.length)  setHopLib([...hopLib,  ...result.newEntries.hops]);
      if (result.newEntries.yeast.length) setYeastLib([...yeastLib, ...result.newEntries.yeast]);
      if (result.newEntries.misc.length)  setMiscLib([...miscLib,  ...result.newEntries.misc]);
      setLibNextId(result.nextId);
      setInventoryStock(result.stockAdditions);
      const parts: string[] = [];
      if (result.counts.malts) parts.push(`${result.counts.malts} grains`);
      if (result.counts.hops)  parts.push(`${result.counts.hops} hops`);
      if (result.counts.yeast) parts.push(`${result.counts.yeast} yeasts`);
      if (result.counts.misc)  parts.push(`${result.counts.misc} misc`);
      pushToast({ message: 'Imported ' + parts.join(', '), variant: 'success' });
    } catch (err) {
      pushToast({ message: 'Error parsing file: ' + (err as Error).message, variant: 'error' });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <span style={titleStyle}>ORDER PLANNER</span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 14 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`btn sm ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >{s.label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="btn sm"
            disabled
            title="Coming soon"
          >🔗 GOOGLE SHEETS</button>
          <button
            className="btn sm"
            onClick={() => { if (libImportRef.current) { libImportRef.current.value = ''; libImportRef.current.click(); } }}
            title="Import ingredients from BeerXML into library"
          >⬆ IMPORT LIBRARY (XML)</button>
          <input
            ref={libImportRef}
            type="file"
            accept=".xml,.beerxml,.bsmx"
            style={{ display: 'none' }}
            onChange={handleLibFile}
          />
          <StockImportButton />
          <button className="btn sm" onClick={() => setOrdersOpen(true)}>📦 ORDERS</button>
          <button className="btn sm" onClick={exportXlsx}>⬇ EXPORT XLSX</button>
          <button className="btn sm primary" onClick={() => setAddOrderOpen(true)}>＋ NEW ORDER</button>
        </div>
      </div>

      <ForecastTable section={section} />

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
  flexWrap: 'wrap', rowGap: 4,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--amber)',
};
