/**
 * Tax tab — port of HTML page-tax (line 1809) + saveTaxRecord (8502),
 * loadTaxPage (8510), updateTaxFromRecipe (8545), recordToTaxMaster (8802),
 * printTaxRecord (10852), exportTaxRecordExcel (10900).
 *
 * On mount: calls loadTaxRecord (overwrites the live-recompute fields from
 * fresh ingredient totals — snap-* fields are physically untouched by the
 * disjoint allowlist invariant in lib/tax.ts).
 *
 * Field-edit flow: local state, 400 ms debounce → setTaxRecordField → lsSet
 * → Supabase. Every edit also marks the field as a manual override so the
 * next "Update from Recipe" press skips it (or warns first).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { taxIdentifier } from '../../lib/tax';
import { printHtml, escapeHtml } from '../../lib/print';
import { exportSingleSheet, slugForFilename, todayIsoDate } from '../../lib/excel';
import type { TaxRecord, Classification } from '../../types';
import TaxClassificationSelect from './TaxClassificationSelect';

interface Props { recipeId: string }

type StringFieldKey =
  | 'date' | 'brew-num' | 'recipe-name' | 'beer-name'
  | 'malt' | 'wheat' | 'oats' | 'other' | 'hops' | 'yeast' | 'water'
  | 'kettle-waste'
  | 'fv-num' | 'fv-mm' | 'in-fv' | 'start-brix' | 'finish-brix'
  | 'tank' | 'mm' | 'in-bt'
  | 'keg-qty' | 'keg-total' | 'can-size-ml' | 'cans' | 'can-total' | 'total-packaged'
  | 'notes';

export default function TaxTab({ recipeId }: Props) {
  const recipe              = useStore(s => s.recipes.find(r => r.id === recipeId));
  const getTaxRecord        = useStore(s => s.getTaxRecord);
  const loadTaxRecord       = useStore(s => s.loadTaxRecord);
  const setTaxRecordField   = useStore(s => s.setTaxRecordField);
  const updateTaxFromRecipe = useStore(s => s.updateTaxFromRecipe);
  const recordToTaxMaster   = useStore(s => s.recordToTaxMaster);
  // Subscribe so this component re-renders when loadTaxRecord/etc. mutate
  // the cache for this recipe — without this the table input values stay
  // pinned to the initial render's snapshot.
  const taxRecord           = useStore(s => s.taxRecordsByRecipe[recipeId]);

  // ── Live recompute on mount + per-recipe re-mount ────────────────────
  useEffect(() => {
    loadTaxRecord(recipeId);
  }, [recipeId, loadTaxRecord]);

  // ── Local edit state (mirrors the cached record) ─────────────────────
  const [local, setLocal] = useState<TaxRecord>(() => taxRecord ?? getTaxRecord(recipeId));

  // Sync local from store when the store-side record changes (loadTaxRecord
  // post-mount, updateTaxFromRecipe, recordToTaxMaster, hydrate).
  useEffect(() => {
    if (taxRecord) setLocal(taxRecord);
  }, [taxRecord]);

  // ── Debounced flush (400 ms — matches the PackagingTab pattern) ──────
  const flushTimer = useRef<number | null>(null);
  const pendingPatches = useRef<Partial<TaxRecord>>({});

  const flushNow = useCallback(() => {
    const patches = pendingPatches.current;
    pendingPatches.current = {};
    flushTimer.current = null;
    for (const [key, value] of Object.entries(patches) as [keyof TaxRecord, unknown][]) {
      setTaxRecordField(recipeId, key, value);
    }
  }, [recipeId, setTaxRecordField]);

  const updateField = useCallback((key: StringFieldKey, value: string) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    pendingPatches.current[key] = value;
    if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(flushNow, 400);
  }, [flushNow]);

  // Flush any pending edits when unmounting / switching recipes
  useEffect(() => {
    return () => {
      if (flushTimer.current != null) {
        window.clearTimeout(flushTimer.current);
        flushNow();
      }
    };
  }, [flushNow]);

  // ── Action handlers ──────────────────────────────────────────────────
  const handleUpdateFromRecipe = () => {
    flushNow();
    const result = updateTaxFromRecipe(recipeId, {
      confirmOverwrite: () => window.confirm(
        'Some fields have been manually edited. Updating will overwrite them ' +
        'with data from Brew Day, Fermentation, and Packaging tabs.\n\nContinue?',
      ),
    });
    if (result.applied && result.blanks.length > 0) {
      window.alert('Updated. The following fields are still blank:\n\n• ' + result.blanks.join('\n• '));
    }
  };

  const handleRecord = () => {
    flushNow();
    const result = recordToTaxMaster(recipeId, {
      confirmBlanks: blanks =>
        window.confirm('The following fields are blank:\n\n• ' + blanks.join('\n• ') + '\n\nRecord anyway?'),
      confirmOverwrite: existingRecordedAt =>
        window.confirm(
          'This recipe is already in the Tax Master (recorded on ' +
          existingRecordedAt + ').\n\nOverwrite the existing record?',
        ),
    });
    if (result.recorded) {
      window.alert('Recorded to Tax Master ✓');
    }
  };

  const handlePrint = () => {
    flushNow();
    const rec = useStore.getState().taxRecordsByRecipe[recipeId] ?? local;
    printTaxRecordHtml(rec);
  };

  const handleExportExcel = () => {
    flushNow();
    const rec = useStore.getState().taxRecordsByRecipe[recipeId] ?? local;
    if (!rec || Object.keys(rec).length === 0) {
      window.alert('No tax data yet — use ↻ Update from Recipe first.');
      return;
    }
    exportTaxRecordToExcel(rec);
  };

  // ── Render ───────────────────────────────────────────────────────────
  if (!recipe) return <div className="empty">Select a recipe.</div>;

  const v = (k: StringFieldKey): string => {
    const x = local[k];
    return x == null ? '' : String(x);
  };

  // For the abv column — accepts string or number
  const abvDisplay = (() => {
    const a = local.abv;
    return a == null ? '' : String(a);
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid var(--border2)',
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
          TAX RECORD
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)' }}>
          {taxIdentifier(recipe) || '—'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)' }}>
            Classification
          </span>
          <TaxClassificationSelect recipeId={recipeId} showAuto />
          <button className="btn" onClick={handleUpdateFromRecipe}>↻ Update from Recipe</button>
          <button className="btn" onClick={handlePrint}>🖨 Print</button>
          <button className="btn" onClick={handleExportExcel}>⬇ Export XLS</button>
          <button className="btn primary" onClick={handleRecord}>⬆ Record to Tax Master</button>
        </div>
      </div>

      {/* Body — sections in cards */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="Brew Info">
          <Field label="Brew Date">
            <Input value={v('date')} onChange={e => updateField('date', e.target.value)} placeholder="YYYY-MM-DD" />
          </Field>
          <Field label="Tax Batch #">
            <Input value={v('brew-num')} onChange={e => updateField('brew-num', e.target.value)} />
          </Field>
          <Field label="Recipe (仕込記号)">
            <Input value={v('recipe-name')} onChange={e => updateField('recipe-name', e.target.value)} />
          </Field>
          <Field label="Beer Name">
            <Input value={v('beer-name')} onChange={e => updateField('beer-name', e.target.value)} />
          </Field>
        </Section>

        <Section title="Ingredients">
          <Field label="Malt (kg)">
            <Input type="number" step="0.01" value={v('malt')} onChange={e => updateField('malt', e.target.value)} />
          </Field>
          <Field label="Wheat (kg)">
            <Input type="number" step="0.01" value={v('wheat')} onChange={e => updateField('wheat', e.target.value)} />
          </Field>
          <Field label="Oats (kg)">
            <Input type="number" step="0.01" value={v('oats')} onChange={e => updateField('oats', e.target.value)} />
          </Field>
          <Field label="Other (kg)">
            <Input type="number" step="0.01" value={v('other')} onChange={e => updateField('other', e.target.value)} />
          </Field>
          <Field label="Hops (kg)">
            <Input type="number" step="0.001" value={v('hops')} onChange={e => updateField('hops', e.target.value)} />
          </Field>
          <Field label="Yeast (kg)">
            <Input type="number" step="0.001" value={v('yeast')} onChange={e => updateField('yeast', e.target.value)} />
          </Field>
          <Field label="Water (L)">
            <Input type="number" step="0.1" value={v('water')} onChange={e => updateField('water', e.target.value)} />
          </Field>
          <Field label="Spent Grain (kg)">
            {/* Live-recompute field — cached display, read-only. The value is
                produced by loadTaxRecord on tab open via LIVE_RECOMPUTE_KEYS. */}
            <Input
              type="text"
              readOnly
              value={local['spent-grain'] != null ? String(local['spent-grain']) : ''}
              placeholder="—"
              style={{ background: 'var(--panel3)', color: 'var(--text-muted)' }}
            />
          </Field>
          <Field label="Kettle Waste (L)">
            <Input type="number" step="0.1" value={v('kettle-waste')} onChange={e => updateField('kettle-waste', e.target.value)} />
          </Field>
        </Section>

        <Section title="Fermentation">
          <Field label="FV #">
            <Input value={v('fv-num')} onChange={e => updateField('fv-num', e.target.value)} />
          </Field>
          <Field label="FV MM">
            <Input type="number" step="0.1" value={v('fv-mm')} onChange={e => updateField('fv-mm', e.target.value)} />
          </Field>
          <Field label="In FV (L)">
            <Input type="number" step="0.1" value={v('in-fv')} onChange={e => updateField('in-fv', e.target.value)} />
          </Field>
          <Field label="Start Brix">
            <Input type="number" step="0.01" value={v('start-brix')} onChange={e => updateField('start-brix', e.target.value)} />
          </Field>
          <Field label="Finish Brix">
            <Input type="number" step="0.01" value={v('finish-brix')} onChange={e => updateField('finish-brix', e.target.value)} />
          </Field>
          <Field label="ABV (%)">
            <Input type="number" step="0.01" value={abvDisplay}
                   onChange={e => {
                     setLocal(prev => ({ ...prev, abv: e.target.value }));
                     pendingPatches.current.abv = e.target.value;
                     if (flushTimer.current != null) window.clearTimeout(flushTimer.current);
                     flushTimer.current = window.setTimeout(flushNow, 400);
                   }} />
          </Field>
        </Section>

        <Section title="Conditioning">
          <Field label="Tank #">
            <Input value={v('tank')} onChange={e => updateField('tank', e.target.value)} />
          </Field>
          <Field label="MM">
            <Input type="number" step="0.1" value={v('mm')} onChange={e => updateField('mm', e.target.value)} />
          </Field>
          <Field label="In Tank (L)">
            <Input type="number" step="0.1" value={v('in-bt')} onChange={e => updateField('in-bt', e.target.value)} />
          </Field>
        </Section>

        <Section title="Packaging">
          <Field label="Keg Qty / Sizes">
            <Input value={v('keg-qty')} onChange={e => updateField('keg-qty', e.target.value)} placeholder="e.g. 15L×4, 10L×2" />
          </Field>
          <Field label="Keg Total (L)">
            <Input type="number" step="0.1" value={v('keg-total')} onChange={e => updateField('keg-total', e.target.value)} />
          </Field>
          <Field label="Can Size (ml)">
            <Input type="number" step="1" value={v('can-size-ml')} onChange={e => updateField('can-size-ml', e.target.value)} />
          </Field>
          <Field label="Cans">
            <Input type="number" step="1" value={v('cans')} onChange={e => updateField('cans', e.target.value)} />
          </Field>
          <Field label="Can Total (L)">
            <Input type="number" step="0.1" value={v('can-total')} onChange={e => updateField('can-total', e.target.value)} />
          </Field>
          <Field label="Total Packaged (L)">
            <Input type="number" step="0.1" value={v('total-packaged')} onChange={e => updateField('total-packaged', e.target.value)} />
          </Field>
        </Section>

        <Section title="Notes">
          <Field label="Notes" wide>
            <textarea
              value={v('notes')}
              onChange={e => updateField('notes', e.target.value)}
              rows={3}
              style={{
                width: '100%', resize: 'vertical', padding: '6px 8px',
                background: 'var(--panel2)', color: 'var(--text)',
                border: '1px solid var(--border2)', borderRadius: 6,
                fontFamily: 'var(--sans)', fontSize: 13,
              }}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Layout primitives (kept inline — small, used only by this tab)
// ═══════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--panel2)',
      border: '1px solid var(--border2)',
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2,
        color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '8px 14px',
      }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: wide ? '1 / -1' : undefined,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: '5px 8px',
        background: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border2)',
        borderRadius: 5,
        fontFamily: 'var(--sans)',
        fontSize: 13,
        ...(props.style ?? {}),
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
// Print + Excel (uses lib/print.ts + lib/excel.ts helpers)
// ═══════════════════════════════════════════════════════════════════

function printTaxRecordHtml(rec: TaxRecord): void {
  const v = (k: keyof TaxRecord, unit?: string): string => {
    const val = rec[k];
    if (val == null || String(val).trim() === '') return '—';
    return escapeHtml(val) + (unit ? ' ' + unit : '');
  };
  const beerLabel = v('beer-name') !== '—' ? v('beer-name') : v('recipe-name');
  const cls = (rec['classification'] as Classification | undefined) || 'Beer';
  const body = `
<h1>TAX RECORD — ${beerLabel}</h1>
<div style="font-size:10px;color:#555;margin-bottom:12px;">
  Tax Batch #${v('brew-num')} &nbsp;|&nbsp; Date: ${v('date')} &nbsp;|&nbsp; ${escapeHtml(cls)}
</div>
<table>
  <tr><th colspan="4" style="background:#eee;">Brew Info</th></tr>
  <tr><th>Recipe</th><td>${v('recipe-name')}</td><th>Beer Name</th><td>${v('beer-name')}</td></tr>
  <tr><th>Brew Date</th><td>${v('date')}</td><th>Tax Batch #</th><td>${v('brew-num')}</td></tr>
</table>
<table>
  <tr><th colspan="8" style="background:#eee;">Ingredients</th></tr>
  <tr><th>Malt (kg)</th><th>Wheat (kg)</th><th>Oats (kg)</th><th>Other (kg)</th>
      <th>Hops (kg)</th><th>Yeast (kg)</th><th>Water (L)</th><th>Spent Grain (kg)</th></tr>
  <tr>
    <td class="num">${v('malt')}</td><td class="num">${v('wheat')}</td>
    <td class="num">${v('oats')}</td><td class="num">${v('other')}</td>
    <td class="num">${v('hops')}</td><td class="num">${v('yeast')}</td>
    <td class="num">${v('water')}</td><td class="num">${v('spent-grain')}</td>
  </tr>
</table>
<table>
  <tr><th colspan="6" style="background:#eee;">Fermentation &amp; Conditioning</th></tr>
  <tr><th>FV #</th><th>FV MM</th><th>In FV (L)</th><th>Start Brix</th><th>Finish Brix</th><th>ABV</th></tr>
  <tr>
    <td>${v('fv-num')}</td><td class="num">${v('fv-mm')}</td><td class="num">${v('in-fv')}</td>
    <td class="num">${v('start-brix')}</td><td class="num">${v('finish-brix')}</td>
    <td class="num">${v('abv', '%')}</td>
  </tr>
  <tr><th>Tank #</th><th>MM</th><th>In Tank (L)</th><th>Kettle Waste (L)</th><td colspan="2"></td></tr>
  <tr>
    <td>${v('tank')}</td><td class="num">${v('mm')}</td>
    <td class="num">${v('in-bt')}</td><td class="num">${v('kettle-waste')}</td>
    <td colspan="2"></td>
  </tr>
</table>
<table>
  <tr><th colspan="6" style="background:#eee;">Packaging</th></tr>
  <tr><th>Keg Qty / Sizes</th><th>Keg Total (L)</th><th>Can Size (ml)</th>
      <th>Cans</th><th>Can Total (L)</th><th>Total Packaged (L)</th></tr>
  <tr>
    <td>${v('keg-qty')}</td><td class="num">${v('keg-total')}</td>
    <td class="num">${v('can-size-ml')}</td><td class="num">${v('cans')}</td>
    <td class="num">${v('can-total')}</td><td class="num">${v('total-packaged')}</td>
  </tr>
</table>
${v('notes') !== '—' ? `<p><strong>Notes:</strong> ${v('notes')}</p>` : ''}
`;
  printHtml(body, {
    title: 'Tax Record — ' + (beerLabel === '—' ? 'BrewLab' : beerLabel),
    pageSize: 'A4',
    landscape: false,
  });
}

function exportTaxRecordToExcel(rec: TaxRecord): void {
  const headers = [
    'Tax Batch #','Brew Date','Recipe','Beer Name',
    'Malt (kg)','Wheat (kg)','Oats (kg)','Other (kg)',
    'Hops (kg)','Yeast (kg)','Water (L)','Spent Grain (kg)','Kettle Waste (L)',
    'FV #','FV MM','In FV (L)','Start Brix','Finish Brix','ABV',
    'Tank #','MM','In Tank (L)',
    'Keg Qty','Keg Total (L)','Can Size (ml)','Cans','Can Total (L)','Total Packaged (L)',
    'Classification','Notes',
  ];
  const keys: (keyof TaxRecord)[] = [
    'brew-num','date','recipe-name','beer-name',
    'malt','wheat','oats','other',
    'hops','yeast','water','spent-grain','kettle-waste',
    'fv-num','fv-mm','in-fv','start-brix','finish-brix','abv',
    'tank','mm','in-bt',
    'keg-qty','keg-total','can-size-ml','cans','can-total','total-packaged',
    'classification','notes',
  ];
  const v = (k: keyof TaxRecord): string | number => {
    const x = rec[k];
    if (x == null) return '';
    if (typeof x === 'number') return x;
    return String(x);
  };
  const row = keys.map(v);
  const filename = `tax_record_${slugForFilename(String(rec['brew-num'] ?? 'brewlab'))}_${todayIsoDate()}.xlsx`;
  exportSingleSheet(filename, 'Tax Record', headers, [row]);
}
