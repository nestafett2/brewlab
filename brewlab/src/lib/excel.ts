/**
 * SheetJS wrappers — single source for the Excel exports across the four
 * tax destinations. Standardised on SheetJS per port plan §13.2 (Tax
 * Summary uses SheetJS too, not the HTML's HTML-blob-as-.xls hack).
 */

import * as XLSX from 'xlsx';

export type CellValue = string | number | boolean | null | undefined | Date;

export interface SheetSpec {
  /** Tab name shown in Excel. Max 31 chars per the Excel format. */
  name: string;
  /** First-row column headers. */
  headers: string[];
  /** Data rows — each row's length should match `headers`. */
  rows: CellValue[][];
  /** Optional column widths in characters (~7px each). */
  colWidths?: number[];
}

/**
 * Export one or more sheets as a single .xlsx workbook. The browser
 * downloads the file — no server round-trip.
 */
export function exportWorkbook(filename: string, sheets: SheetSpec[]): void {
  const wb = XLSX.utils.book_new();
  for (const spec of sheets) {
    const aoa: CellValue[][] = [spec.headers, ...spec.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (spec.colWidths) {
      ws['!cols'] = spec.colWidths.map(w => ({ wch: w }));
    }
    // Excel limits sheet names to 31 chars and forbids ":\\/?*[]"
    const safeName = spec.name.slice(0, 31).replace(/[:\\/?*[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  XLSX.writeFile(wb, filename);
}

/** Convenience for one-sheet exports — wraps exportWorkbook. */
export function exportSingleSheet(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
  colWidths?: number[],
): void {
  exportWorkbook(filename, [{ name: sheetName, headers, rows, colWidths }]);
}

/**
 * Slugify a recipe identifier for filenames. Strips characters that the
 * shell or filesystem might choke on. Mirrors HTML's `safeName` patterns.
 */
export function slugForFilename(s: string): string {
  return String(s ?? '')
    .replace(/[^\w\d-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

/** ISO date string (YYYY-MM-DD) for filename stamps. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
