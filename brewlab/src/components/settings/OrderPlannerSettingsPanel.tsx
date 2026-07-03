/**
 * Settings → Order Planner — Import Library (XML) and Import Stock (CSV).
 * Moved out of the Order Planner toolbar (OrderPlannerPage.tsx) to
 * declutter it; these are occasional bulk-import actions, not day-to-day
 * toolbar buttons.
 */

import { useRef, useState } from 'react';
import { useStore } from '../../store';
import { importBeerXML, importBSMX, isBSMX } from '../libraries/libraryImport';
import StockImportButton from '../orders/StockImportButton';
import { profileSharedStyles as ss } from './EquipmentProfilesPanel';
import { makeId } from '../../lib/utils';
import { dateToStr, todayDate } from '../../lib/dates';
import { INV_UNITS } from '../../lib/units';
import type { RecurringOrder } from '../../types';

const TYPE_OPTIONS: { value: RecurringOrder['type']; label: string }[] = [
  { value: 'malts', label: 'Malt' },
  { value: 'hops',  label: 'Hop' },
  { value: 'yeast', label: 'Yeast' },
  { value: 'misc',  label: 'Adjunct' },
];

const CADENCE_OPTIONS: { value: RecurringOrder['cadence']; label: string }[] = [
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly',  label: 'Monthly' },
];

const cadenceLabel = (c: RecurringOrder['cadence']): string =>
  CADENCE_OPTIONS.find(o => o.value === c)?.label ?? c;
const typeLabel = (t: RecurringOrder['type']): string =>
  TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

interface RecurringDraft {
  type: RecurringOrder['type'];
  ingredient: string;
  qty: string;
  supplier: string;
  cadence: RecurringOrder['cadence'];
  startDate: string;
  endDate: string;
  notes: string;
}

function emptyDraft(): RecurringDraft {
  return {
    type: 'malts', ingredient: '', qty: '', supplier: '',
    cadence: 'weekly', startDate: dateToStr(todayDate()), endDate: '', notes: '',
  };
}

function draftFromOrder(ro: RecurringOrder): RecurringDraft {
  return {
    type: ro.type, ingredient: ro.ingredient, qty: String(ro.qty),
    supplier: ro.supplier ?? '', cadence: ro.cadence,
    startDate: ro.startDate, endDate: ro.endDate ?? '', notes: ro.notes ?? '',
  };
}

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

  const suppliers = useStore(s => s.suppliers);
  const recurringOrders = useStore(s => s.recurringOrders);
  const addRecurringOrder    = useStore(s => s.addRecurringOrder);
  const updateRecurringOrder = useStore(s => s.updateRecurringOrder);
  const deleteRecurringOrder = useStore(s => s.deleteRecurringOrder);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen]   = useState(false);
  const [draft, setDraft]         = useState<RecurringDraft>(emptyDraft());

  const openNewRecurring = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setFormOpen(true);
  };

  const openEditRecurring = (ro: RecurringOrder) => {
    setDraft(draftFromOrder(ro));
    setEditingId(ro.id);
    setFormOpen(true);
  };

  const saveRecurring = () => {
    const qty = parseFloat(draft.qty);
    const payload = {
      type: draft.type,
      ingredient: draft.ingredient.trim(),
      qty: isFinite(qty) ? qty : 0,
      supplier: draft.supplier.trim() || undefined,
      cadence: draft.cadence,
      startDate: draft.startDate || dateToStr(todayDate()),
      endDate: draft.endDate || undefined,
      notes: draft.notes.trim() || undefined,
    };
    if (editingId) updateRecurringOrder(editingId, payload);
    else addRecurringOrder({ id: makeId(), ...payload });
    setFormOpen(false);
  };

  const deleteRecurring = (ro: RecurringOrder) => {
    deleteRecurringOrder(ro.id);
    pushToast({
      message: `Deleted recurring order for "${ro.ingredient}"`,
      undo: () => addRecurringOrder(ro),
    });
  };

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

      <div className="settings-section">
        <div className="settings-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Recurring Orders</span>
          <button className="btn sm" onClick={openNewRecurring}>+ New Recurring Order</button>
        </div>
        <div style={ss.hint}>
          Auto-generate delivery entries on a schedule for routine buys (e.g. a weekly hop shipment) —
          they show up as delivery columns in the forecast without logging a real order each time.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recurringOrders.length === 0 ? (
            <div style={ss.empty}>No recurring orders yet. Click + New Recurring Order.</div>
          ) : recurringOrders.map(ro => (
            <div key={ro.id} style={ss.row} onClick={() => openEditRecurring(ro)}>
              <div>
                <div style={ss.rowTitle}>{ro.ingredient || '—'}</div>
                <div style={ss.rowMeta}>
                  {ro.qty} {INV_UNITS[ro.type]} · {typeLabel(ro.type)} · {cadenceLabel(ro.cadence)}
                  {' · '}from {ro.startDate}{ro.endDate ? ` to ${ro.endDate}` : ''}
                  {ro.supplier ? ` · ${ro.supplier}` : ''}
                </div>
              </div>
              <button
                className="btn sm"
                style={ss.deleteBtn}
                onClick={e => { e.stopPropagation(); deleteRecurring(ro); }}
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {formOpen && (
        <div style={ss.modalBackdrop} onClick={() => setFormOpen(false)}>
          <div style={ss.modalPanel} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)', marginBottom: 14 }}>
              {editingId ? 'EDIT RECURRING ORDER' : 'NEW RECURRING ORDER'}
            </div>
            <div className="settings-grid">
              <div className="settings-field">
                <label>Type</label>
                <select
                  value={draft.type}
                  onChange={e => setDraft({ ...draft, type: e.target.value as RecurringOrder['type'] })}
                >
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="settings-field">
                <label>Ingredient</label>
                <input
                  type="text"
                  value={draft.ingredient}
                  onChange={e => setDraft({ ...draft, ingredient: e.target.value })}
                  placeholder="Library entry name"
                />
              </div>
              <div className="settings-field">
                <label>Qty</label>
                <input
                  type="number" min={0} step={0.1}
                  value={draft.qty}
                  onChange={e => setDraft({ ...draft, qty: e.target.value })}
                />
              </div>
              <div className="settings-field">
                <label>Supplier</label>
                <select
                  value={draft.supplier}
                  onChange={e => setDraft({ ...draft, supplier: e.target.value })}
                >
                  <option value="">— None —</option>
                  {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="settings-field">
                <label>Cadence</label>
                <select
                  value={draft.cadence}
                  onChange={e => setDraft({ ...draft, cadence: e.target.value as RecurringOrder['cadence'] })}
                >
                  {CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="settings-field">
                <label>Start Date</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={e => setDraft({ ...draft, startDate: e.target.value })}
                />
              </div>
              <div className="settings-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={e => setDraft({ ...draft, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="settings-field" style={{ marginTop: 10 }}>
              <label>Notes</label>
              <input
                type="text"
                placeholder="optional"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={draft.notes}
                onChange={e => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn sm" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="btn sm primary" onClick={saveRecurring}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
