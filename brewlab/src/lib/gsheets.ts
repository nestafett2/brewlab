/**
 * Google Sheets sync — one-way push of Tax Ledger export rows into a
 * user's own Google Sheet, via the Sheets API v4 + a client-side OAuth
 * implicit-grant popup (no backend, no server secret).
 *
 * `bl_gsheets` (clientId, sheetIds, accessToken, tokenExpiry) is
 * **local-only** — written via `lsLocal`, never `lsSet`, so it never
 * reaches Supabase. A Google access token is a bearer credential; it
 * must not leave the device it was issued on.
 */

import { lsGet, lsLocal } from './storage';
import type { SheetSpec, CellValue } from './excel';

const GSHEETS_KEY = 'bl_gsheets';

export const GSHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

/** Section filter shared with LedgerExportModal's dropdown. */
export type SectionOpt = 'all' | 'malts' | 'hops' | 'yeast' | 'misc';

export interface GSheetsSheetIds {
  malts?: string;
  hops?: string;
  yeastMisc?: string;
}

export interface GSheetsConfig {
  clientId?: string;
  sheetIds?: GSheetsSheetIds;
  accessToken?: string;
  tokenExpiry?: number;
}

export function getGSheetsConfig(): GSheetsConfig {
  return lsGet<GSheetsConfig>(GSHEETS_KEY, {});
}

/** Merge-write — only touches the keys present in `patch`. Local-only. */
export function setGSheetsConfig(patch: Partial<GSheetsConfig>): void {
  const next: GSheetsConfig = { ...getGSheetsConfig(), ...patch };
  lsLocal(GSHEETS_KEY, next);
}

/**
 * Opens a Google OAuth2 implicit-grant popup (`response_type=token`) and
 * resolves with the access token once Google redirects the popup back to
 * this app's own origin. Polls the popup's location — cross-origin reads
 * throw while it's still on accounts.google.com, which we swallow.
 */
export function gsheetsSignIn(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: GSHEETS_SCOPES,
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'gsheets-oauth',
      'width=480,height=640',
    );
    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site.'));
      return;
    }
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        reject(new Error('Sign-in window was closed before completing.'));
        return;
      }
      let href: string;
      try {
        href = popup.location.href;
      } catch {
        return; // Still on accounts.google.com — cross-origin, keep polling.
      }
      if (!href.startsWith(redirectUri)) return;
      clearInterval(poll);
      const hash = popup.location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hash);
      const token = hashParams.get('access_token');
      const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);
      popup.close();
      if (!token) {
        reject(new Error('Google did not return an access token.'));
        return;
      }
      setGSheetsConfig({ accessToken: token, tokenExpiry: Date.now() + expiresIn * 1000 });
      resolve(token);
    }, 500);
  });
}

/** Returns the current access token, or null if missing/expired. */
export function gsheetsGetToken(): string | null {
  const cfg = getGSheetsConfig();
  if (!cfg.accessToken || !cfg.tokenExpiry) return null;
  if (Date.now() >= cfg.tokenExpiry) return null;
  return cfg.accessToken;
}

/** Clears the token but preserves clientId/sheetIds — no need to re-enter those. */
export function gsheetsSignOut(): void {
  const cfg = getGSheetsConfig();
  lsLocal(GSHEETS_KEY, { clientId: cfg.clientId, sheetIds: cfg.sheetIds });
}

/** Which configured Sheet ID a library section routes to. */
export function gsheetsSheetIdForSection(
  section: Exclude<SectionOpt, 'all'>,
  sheetIds: GSheetsSheetIds | undefined,
): string | undefined {
  if (!sheetIds) return undefined;
  if (section === 'malts') return sheetIds.malts;
  if (section === 'hops') return sheetIds.hops;
  return sheetIds.yeastMisc; // yeast or misc share one sheet
}

/** Tab name for an ingredient — mirrors LedgerExportModal's sheet-name sanitising. */
export function gsheetsTabNameFor(ingredientName: string): string {
  return (ingredientName || 'ingredient').slice(0, 31).replace(/[\\/?*[\]:]/g, '');
}

async function gsheetsCreateTab(token: string, sheetId: string, tabName: string): Promise<void> {
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
  } catch {
    // Best-effort — if this fails (e.g. tab already exists from a race),
    // the append retry below will surface any real error.
  }
}

/**
 * Appends one row to a sheet tab. If the tab doesn't exist yet (Sheets
 * API returns 400), creates it via batchUpdate and retries the append
 * exactly once.
 */
export async function gsheetsAppendRow(
  token: string, sheetId: string, tabName: string, row: (string | number)[],
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}:append?valueInputOption=USER_ENTERED`;
  const doAppend = () => fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  let res = await doAppend();
  if (res.status === 400) {
    await gsheetsCreateTab(token, sheetId, tabName);
    res = await doAppend();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Sheets append failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

/**
 * Writes `headers` as row 1 of a tab if it doesn't already have content
 * in A1 — checked with a plain GET so this never overwrites existing data.
 * A missing tab (fetch not ok) is treated the same as "empty": the
 * append below creates the tab.
 */
export async function gsheetsEnsureHeaders(
  token: string, sheetId: string, tabName: string, headers: string[],
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`${tabName}!A1`)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) {
    const data = await res.json().catch(() => null);
    if (Array.isArray(data?.values) && data.values.length > 0) return;
  }
  await gsheetsAppendRow(token, sheetId, tabName, headers);
}

function cellToSheetsValue(v: CellValue): string | number {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/**
 * Pushes the same sheets built for the Tax Ledger XLSX export into the
 * user's configured Google Sheet(s). Silent no-op (`null`) when Google
 * Sheets isn't configured — this is an opt-in convenience feature, not a
 * required sync path.
 *
 * NOTE: a single spreadsheet ID is configured per section (malts / hops /
 * yeast+misc combined), not per ingredient. When `sectionFilter` is a
 * single section, every sheet in `sheets` unambiguously belongs to that
 * section's spreadsheet. When it's `'all'`, `sheets` mixes entries from
 * all four library sections with no per-sheet section tag to route by —
 * routing them correctly isn't possible without changing the shared
 * `SheetSpec` shape (also used by the plain XLSX export), so this
 * refuses that case with a clear message rather than silently writing
 * ledger rows into the wrong spreadsheet.
 */
export async function gsheetsPushLedger(
  sheets: SheetSpec[], sectionFilter: SectionOpt,
): Promise<string | null> {
  const token = gsheetsGetToken();
  if (!token) return null;
  const { sheetIds } = getGSheetsConfig();
  if (!sheetIds || (!sheetIds.malts && !sheetIds.hops && !sheetIds.yeastMisc)) return null;

  if (sectionFilter === 'all') {
    return 'Google Sheets sync needs one section selected (not "All") so entries route to the right sheet.';
  }
  const sheetId = gsheetsSheetIdForSection(sectionFilter, sheetIds);
  if (!sheetId) return null; // that section's sheet isn't configured — silent skip

  try {
    for (const sheet of sheets) {
      const tabName = sheet.name;
      await gsheetsEnsureHeaders(token, sheetId, tabName, sheet.headers);
      for (const row of sheet.rows) {
        const type = String(row[1] ?? '');
        const dateVal = String(row[0] ?? '');
        if (type === '' && dateVal.startsWith('Balance at')) continue; // opening balance row
        await gsheetsAppendRow(token, sheetId, tabName, row.map(cellToSheetsValue));
      }
    }
    return 'ok';
  } catch (err) {
    return err instanceof Error ? err.message : 'Google Sheets sync failed.';
  }
}
