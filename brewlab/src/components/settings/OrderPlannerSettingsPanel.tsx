/**
 * Settings → Order Planner — Import Library (XML) and Import Stock (CSV).
 * Moved out of the Order Planner toolbar (OrderPlannerPage.tsx) to
 * declutter it; these are occasional bulk-import actions, not day-to-day
 * toolbar buttons.
 */

import { useRef } from 'react';
import { useStore } from '../../store';
import { importBeerXML, importBSMX, isBSMX } from '../libraries/libraryImport';
import StockImportButton from '../orders/StockImportButton';

export default function OrderPlannerSettingsPanel() {
  const inventoryStock = useStore(s => s.inventoryStock);
  const setInventoryStock = useStore(s => s.setInventoryStock);
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const setMaltLib  = useStore(s => s.setMaltLib);
  const setHopLib   = useStore(s => s.setHopLib);
  const setYeastLib = useStore(s => s.setYeastLib);
  const setMiscLib  = useStore(s => s.setMiscLib);
  const libNextId    = useStore(s => s.libNextId);
  const setLibNextId = useStore(s => s.setLibNextId);
  const pushToast = useStore(s => s.pushToast);

  const libImportRef = useRef<HTMLInputElement>(null);

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
    <>
      <div className="settings-section">
        <div className="settings-title">Library Import</div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
          marginBottom: 12,
        }}>
          Import ingredients from a BeerXML or BSMX file into the malt / hop / yeast / misc libraries.
        </div>
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
      </div>

      <div className="settings-section">
        <div className="settings-title">Stock Import</div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
          marginBottom: 12,
        }}>
          Import inventory stock quantities from a CSV or JSON file.
        </div>
        <StockImportButton />
      </div>
    </>
  );
}
