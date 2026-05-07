/**
 * Settings → Suppliers — port of HTML #settings-suppliers (line 2845) +
 * the chip-style functions getSuppliers / addSupplier / removeSupplier
 * (14702 / 14722 / 14734) and the Default Shipping Costs section
 * (line 2859).
 *
 * Two sections:
 *   1. Suppliers — string array, rendered as removable chips. Add input
 *      with Enter/click to append. Duplicates rejected silently (matches
 *      HTML line 14727).
 *   2. Default Shipping Costs — numeric fields persisted on BrewSettings
 *      (shipMalt, shipHops, shipYeastDry, shipYeastLiquid, orderTax).
 *      Consumed by the Order Planner cost estimates and Analysis cost
 *      breakdown when those land.
 *
 * Sync note: SCHEMA.md and CLAUDE.md document `bl_suppliers` as syncing
 * via the `settings` table. The HTML app's sbSet was missing it from the
 * `settingsKeys` array (brewlab-desktop.html:6565), so suppliers were
 * effectively local-only there despite the docs. The React port already
 * has 'bl_suppliers' in SETTINGS_KEYS (lib/supabase.ts:940), so the
 * docs are accurate for React. Resolution: kept the React behaviour
 * (suppliers DO sync), no doc change needed. The HTML mismatch is a
 * known reference-app bug that doesn't affect us.
 *
 * First-run seed mirrors HTML DEFAULT_SUPPLIERS (line 14698).
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store';

const DEFAULT_SUPPLIERS = ['BET', 'Onishii', 'Evergreen', 'HakkoSupply', 'Upper Left'];

export default function SuppliersPanel() {
  const suppliers    = useStore(s => s.suppliers);
  const setSuppliers = useStore(s => s.setSuppliers);
  const settings     = useStore(s => s.settings);
  const setSettings  = useStore(s => s.setSettings);
  const [input, setInput] = useState('');

  // First-run seed — only when the array has never been populated.
  // Mirrors HTML lines 14699–14700.
  useEffect(() => {
    if (suppliers.length === 0) setSuppliers([...DEFAULT_SUPPLIERS]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = () => {
    const val = input.trim();
    if (!val) return;
    if (suppliers.includes(val)) {
      setInput('');
      return;
    }
    setSuppliers([...suppliers, val]);
    setInput('');
  };

  const remove = (idx: number) => {
    setSuppliers(suppliers.filter((_, i) => i !== idx));
  };

  const numOrUndef = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = parseFloat(s);
    return isFinite(n) ? n : undefined;
  };

  return (
    <>
      <div className="settings-section">
        <div className="settings-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Suppliers</span>
        </div>
        <div style={hintStyle}>
          The distributors and wholesalers you order from — distinct from ingredient manufacturers.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {suppliers.length === 0 ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
              No suppliers yet.
            </div>
          ) : suppliers.map((s, i) => (
            <div key={s + i} style={chipStyle}>
              <span>{s}</span>
              <span
                onClick={() => remove(i)}
                style={chipRemoveStyle}
                title="Remove"
              >✕</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="e.g. BET, Evergreen…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            style={addInputStyle}
          />
          <button className="btn sm" onClick={add}>+ Add</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-title">Default Shipping Costs</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          Default shipping cost per order by ingredient category. Used in Order Planner cost estimates.
        </div>
        <div className="settings-grid">
          <div className="settings-field">
            <label>Malt Shipping (¥/kg)</label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={settings.shipMalt ?? ''}
              onChange={e => setSettings({ shipMalt: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field">
            <label>Hop Shipping (¥/kg)</label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={settings.shipHops ?? ''}
              onChange={e => setSettings({ shipHops: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field">
            <label>Yeast Shipping — Dry (¥/pkg)</label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={settings.shipYeastDry ?? ''}
              onChange={e => setSettings({ shipYeastDry: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field">
            <label>Yeast Shipping — Liquid (¥/pkg)</label>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={settings.shipYeastLiquid ?? ''}
              onChange={e => setSettings({ shipYeastLiquid: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="settings-field">
            <label>Default Tax Rate (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="10"
              value={settings.orderTax ?? ''}
              onChange={e => setSettings({ orderTax: numOrUndef(e.target.value) })}
            />
          </div>
        </div>
      </div>
    </>
  );
}

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
  marginBottom: 10, lineHeight: 1.6,
};

const chipStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
};

const chipRemoveStyle: React.CSSProperties = {
  cursor: 'pointer', color: 'var(--text-muted)',
  marginLeft: 4, fontSize: 12, lineHeight: 1,
};

const addInputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 8px', outline: 'none',
};
