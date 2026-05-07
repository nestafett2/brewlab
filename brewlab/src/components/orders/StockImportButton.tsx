/**
 * Stock import — port of brewlab-desktop.html line 14303
 * (importInventoryStock).
 *
 * Accepts .csv or .json. Both write into bl_inv_stock keyed by
 * `<sec>_<libId>`.
 *
 *   • JSON: either `{ stock: { key: qty } }` or flat `{ key: qty }`.
 *   • CSV : "Name, Section, Qty" lines. Looks up the library entry by
 *     case-insensitive name within the section, ignores rows that
 *     don't match.
 *
 * Surfaced as a small button — click triggers a hidden file picker.
 */

import { useRef } from 'react';
import { useStore } from '../../store';
import type { LibSection } from './orderForecast';

export default function StockImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const inventoryStock    = useStore(s => s.inventoryStock);
  const setInventoryStock = useStore(s => s.setInventoryStock);
  const maltLib  = useStore(s => s.maltLib);
  const hopLib   = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib  = useStore(s => s.miscLib);
  const pushToast = useStore(s => s.pushToast);

  const libBySection: Record<LibSection, { id: string | number; name: string }[]> = {
    malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib,
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      pushToast({ message: 'Could not read file: ' + (err as Error).message, variant: 'error' });
      e.target.value = '';
      return;
    }
    try {
      let imported = 0;
      const next: Record<string, number> = { ...inventoryStock };

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        const stock = (parsed?.stock && typeof parsed.stock === 'object') ? parsed.stock : parsed;
        for (const [k, v] of Object.entries(stock as Record<string, unknown>)) {
          const n = parseFloat(String(v));
          if (!isFinite(n)) continue;
          if (n === 0) delete next[k];
          else next[k] = n;
          imported++;
        }
      } else {
        // CSV — Name, Section, Qty
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          const cols = line.split(',').map(s => s.trim());
          const [name, sec, qty] = cols;
          if (!name || !sec || !qty) continue;
          if (!(sec in libBySection)) continue;
          const list = libBySection[sec as LibSection];
          const entry = list.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
          if (!entry) continue;
          const n = parseFloat(qty);
          if (!isFinite(n)) continue;
          const k = `${sec}_${entry.id}`;
          if (n === 0) delete next[k];
          else next[k] = n;
          imported++;
        }
      }

      setInventoryStock(next);
      // Imports are info-only per the toast/undo retrofit decision
      // (mirrors Libraries import — undo would have to track which
      // keys were created vs updated; not worth the complexity).
      pushToast({ message: `Imported ${imported} stock entries`, variant: 'success' });
    } catch (err) {
      pushToast({ message: 'Import failed: ' + (err as Error).message, variant: 'error' });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <>
      <button
        className="btn sm"
        onClick={() => { if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); } }}
        title="Import stock quantities from CSV or JSON"
      >⬆ IMPORT STOCK (CSV)</button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </>
  );
}
