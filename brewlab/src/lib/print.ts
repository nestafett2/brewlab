/**
 * Shared print helper — port of the open-window-and-call-print pattern used
 * by every print path in brewlab-desktop.html (printTaxRecord 10852,
 * printTaxSummary 11059, printTaxMasterTab 10150, NTA print, etc.).
 *
 * The HTML pattern resolves CSS variables before injecting because the
 * popup window has no access to the parent's stylesheet. This module
 * uses literal hex colours in the print stylesheet so callers can pass
 * markup that prints correctly without runtime CSS resolution.
 */

import { useStore } from '../store';

interface PrintOptions {
  /** Browser window title (also the suggested PDF filename). */
  title: string;
  /** A3 landscape for wide tax tables; A4 portrait for single-recipe summaries. */
  pageSize?: 'A3' | 'A4';
  landscape?: boolean;
  /** Extra <style> rules merged after the default print stylesheet. */
  extraStyles?: string;
}

const DEFAULT_PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #111;
    background: #fff;
    font-size: 11px;
  }
  h1, h2, h3 { margin: 0 0 8px 0; font-weight: 600; }
  h1 { font-size: 18px; }
  h2 { font-size: 14px; margin-top: 12px; }
  h3 { font-size: 12px; margin-top: 8px; color: #444; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; font-weight: 600; }
  td.num, th.num { text-align: right; }
  .meta-grid { display: grid; grid-template-columns: 120px 1fr 120px 1fr; gap: 4px 12px; margin: 8px 0 12px 0; }
  .meta-grid > .lbl { color: #666; }
  .no-print { display: none; }
  @media print {
    .no-print { display: none !important; }
  }
`;

/**
 * Open a new window, write the given HTML body, and trigger the print
 * dialog. Returns the window reference (mainly so callers can close it
 * during testing).
 *
 * The HTML reference uses a 400–500 ms delay between document.close() and
 * window.print() to give the browser time to lay out before the print
 * dialog appears. We mirror that here.
 */
export function printHtml(bodyHtml: string, opts: PrintOptions): Window | null {
  const w = window.open('', '_blank');
  if (!w) {
    useStore.getState().pushToast({
      message: 'Please allow popups to print.',
      variant: 'error',
    });
    return null;
  }
  const pageSize = opts.pageSize ?? 'A4';
  const orientation = opts.landscape ? 'landscape' : 'portrait';
  const pageRule = `@page { size: ${pageSize} ${orientation}; margin: 8mm; }`;
  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<style>
${pageRule}
${DEFAULT_PRINT_CSS}
${opts.extraStyles ?? ''}
</style>
</head>
<body>
<div class="no-print" style="padding:10px;background:#f5f5f5;text-align:center;">
  <button onclick="window.print()" style="padding:8px 20px;font-size:14px;">Print / Save as PDF</button>
</div>
${bodyHtml}
</body>
</html>`);
  w.document.close();
  setTimeout(() => {
    try { w.print(); } catch {
      // Some browsers reject programmatic print after the popup loses focus —
      // the user can fall back to the in-page button rendered above.
    }
  }, 400);
  return w;
}

/**
 * Escape user-supplied content for safe inclusion in a print HTML string.
 * Tax record fields are user-typed and must not be interpolated raw.
 */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
