/**
 * Tax Ledger XLSX export — port of brewlab-desktop.html lines 15980–16048
 * (openLedgerExportModal / runLedgerExport).
 *
 * Workbook structure:
 *   • One sheet per ingredient with at least one ledger entry in the
 *     date range, named after the ingredient (truncated to 31 chars).
 *   • Sheet columns: Date · Type · Qty (kg) · Beer/Note · Received Date ·
 *     Used Date · Balance · Supplier.
 *   • Running balance is computed from the very first entry — not just
 *     the first one in the date range — so the BALANCE column in the
 *     export matches what the user sees in the live LedgerView. The
 *     pre-range entries are condensed into one "Balance at <fromDate>"
 *     row so the cumulative number stays right.
 *
 * Filename: `<breweryName>_TaxLedger_<from>_to_<to>.xlsx`. HTML used
 * "OpenAir" hard-coded; we substitute settings.breweryName so other
 * breweries get their own branding.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { exportWorkbook, type SheetSpec, type CellValue } from '../../lib/excel';
import { gsheetsPushLedger, gsheetsGetToken } from '../../lib/gsheets';
import type { InvSection } from './inventoryShared';

interface Props {
  /** Section currently active — pre-selects the section dropdown. */
  defaultSection: InvSection;
  onClose: () => void;
}

const ALL_OPTION = 'all' as const;
type SectionOpt = typeof ALL_OPTION | InvSection;

export default function LedgerExportModal({ defaultSection, onClose }: Props) {
  const settings   = useStore(s => s.settings);
  const maltLib    = useStore(s => s.maltLib);
  const hopLib     = useStore(s => s.hopLib);
  const yeastLib   = useStore(s => s.yeastLib);
  const miscLib    = useStore(s => s.miscLib);
  const inventoryStock = useStore(s => s.inventoryStock);
  const ledgerData     = useStore(s => s.ledgerData);
  const pushToast      = useStore(s => s.pushToast);

  const now = new Date();
  const y = now.getFullYear();
  const [from, setFrom]       = useState(`${y}-01-01`);
  const [to, setTo]           = useState(`${y}-12-31`);
  const [section, setSection] = useState<SectionOpt>(defaultSection);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const libBySection: Record<InvSection, { id: string | number; name: string }[]> = {
    malts: maltLib, hops: hopLib, yeast: yeastLib, misc: miscLib,
  };

  const buildSheets = (): SheetSpec[] => {
    const sections: InvSection[] = section === ALL_OPTION
      ? ['malts', 'hops', 'yeast', 'misc']
      : [section];

    const sheets: SheetSpec[] = [];
    for (const sec of sections) {
      for (const entry of libBySection[sec]) {
        const key = `${sec}_${entry.id}`;
        const allRows = (ledgerData[key] ?? []).slice()
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        // Filter to date range.
        let rangeRows = allRows;
        if (from) rangeRows = rangeRows.filter(r => r.date >= from);
        if (to)   rangeRows = rangeRows.filter(r => r.date <= to);
        if (!rangeRows.length) continue;

        // Compute pre-range running balance so the in-range rows show
        // correct cumulative balances.
        const opening = parseFloat(String(inventoryStock[key] ?? 0)) || 0;
        let runningBefore = opening;
        for (const r of allRows) {
          if (from && r.date < from) {
            if (r.got)  runningBefore += Number(r.got)  || 0;
            if (r.used) runningBefore -= Number(r.used) || 0;
          }
        }

        const headers = ['Date', 'Type', 'Qty (kg)', 'Beer / Note', 'Received Date', 'Used Date', 'Balance', 'Supplier'];
        const rows: CellValue[][] = [];
        // Opening / starting balance row.
        if (!from) {
          rows.push(['Start', '', '', 'Opening balance', '', '', opening, '']);
        } else {
          rows.push([`Balance at ${from}`, '', '', '', '', '', Math.round(runningBefore * 1000) / 1000, '']);
        }
        let running = runningBefore;
        for (const r of rangeRows) {
          const isGot = !!r.got;
          if (isGot) running += Number(r.got)  || 0;
          else       running -= Number(r.used) || 0;
          rows.push([
            r.date,
            isGot ? 'IN' : 'OUT',
            isGot ? (r.got ?? '') : (r.used ?? ''),
            isGot ? (r.supplier ?? '') : (r.taxBatch ? `${r.taxBatch} — ${r.beer ?? ''}` : (r.beer ?? '')),
            r.receivedDate ?? '',
            r.usedDate ?? '',
            Math.round(running * 1000) / 1000,
            r.supplier ?? '',
          ]);
        }
        const sheetName = (entry.name || 'ingredient')
          .slice(0, 31)
          .replace(/[\\/?*[\]:]/g, '');
        sheets.push({
          name: sheetName,
          headers,
          rows,
          colWidths: [12, 6, 9, 28, 14, 14, 10, 14],
        });
      }
    }

    return sheets;
  };

  const run = () => {
    const sheets = buildSheets();
    if (!sheets.length) {
      pushToast({ message: 'No ledger entries in that date range.', variant: 'info' });
      return;
    }
    const brand = (settings.breweryName?.trim() || 'BrewLab').replace(/[\s/\\?*[\]:]/g, '_');
    const suffix = from || to ? `_${from || 'start'}_to_${to || 'end'}` : '_all';
    exportWorkbook(`${brand}_TaxLedger${suffix}.xlsx`, sheets);
    onClose();
  };

  const syncToSheets = async () => {
    if (section === ALL_OPTION) {
      pushToast({ message: 'Select a specific section to sync to Google Sheets.', variant: 'error' });
      return;
    }
    const sheets = buildSheets();
    if (!sheets.length) {
      pushToast({ message: 'No ledger entries in that date range.', variant: 'info' });
      return;
    }
    const gsheetsResult = await gsheetsPushLedger(sheets, section);
    if (gsheetsResult === 'ok') {
      pushToast({ message: 'Synced to Google Sheets', variant: 'success' });
    } else if (gsheetsResult != null) {
      pushToast({ message: gsheetsResult, variant: 'error' });
    }
    onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>EXPORT TAX LEDGER (XLSX)</div>

        <Row label="FROM DATE">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="TO DATE">
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="SECTION">
          <select value={section} onChange={e => setSection(e.target.value as SectionOpt)} style={inputStyle}>
            <option value={ALL_OPTION}>All</option>
            <option value="malts">Malts</option>
            <option value="hops">Hops</option>
            <option value="yeast">Yeast</option>
            <option value="misc">Adjuncts (Misc)</option>
          </select>
        </Row>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 8 }}>
          One sheet per ingredient with entries in the range. Running balance carries
          over from before the FROM date, so figures match the live ledger view.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={run}>EXPORT</button>
          {gsheetsGetToken() !== null && (
            <button className="btn" style={{ flex: 1 }} onClick={syncToSheets}>SYNC TO SHEETS</button>
          )}
          <button className="btn" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <label style={{
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        width: 110, flexShrink: 0,
      }}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 380, maxWidth: '95vw',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '4px 8px', outline: 'none',
};
