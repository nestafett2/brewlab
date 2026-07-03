/**
 * Settings → Google Sheets — configure the OAuth Client ID + per-section
 * spreadsheet IDs, and connect/disconnect the Google account used by
 * LedgerExportModal's optional "also push to Google Sheets" step.
 *
 * `bl_gsheets` is local-only (see lib/gsheets.ts) — nothing here ever
 * syncs to Supabase, by design (an OAuth access token is a bearer
 * credential scoped to one device/browser).
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import {
  getGSheetsConfig, setGSheetsConfig,
  gsheetsSignIn, gsheetsSignOut, gsheetsGetToken,
} from '../../lib/gsheets';

export default function GoogleSheetsSettings() {
  const pushToast = useStore(s => s.pushToast);
  const initial = getGSheetsConfig();

  const [clientId, setClientId]     = useState(initial.clientId ?? '');
  const [sheetMalts, setSheetMalts] = useState(initial.sheetIds?.malts ?? '');
  const [sheetHops, setSheetHops]   = useState(initial.sheetIds?.hops ?? '');
  const [sheetYM, setSheetYM]       = useState(initial.sheetIds?.yeastMisc ?? '');

  const [connecting, setConnecting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [connVersion, setConnVersion] = useState(0);

  const connected = gsheetsGetToken() !== null;

  useEffect(() => {
    const token = gsheetsGetToken();
    if (!token) { setEmail(null); return; }
    let cancelled = false;
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled) setEmail(data?.email ?? null); })
      .catch(() => { if (!cancelled) setEmail(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connVersion]);

  const saveAll = () => {
    setGSheetsConfig({
      clientId: clientId.trim(),
      sheetIds: {
        malts: sheetMalts.trim(),
        hops: sheetHops.trim(),
        yeastMisc: sheetYM.trim(),
      },
    });
    pushToast({ message: 'Google Sheets settings saved.', variant: 'success' });
  };

  const onConnectClick = async () => {
    if (connected) {
      gsheetsSignOut();
      setConnVersion(v => v + 1);
      return;
    }
    if (!clientId.trim()) {
      pushToast({ message: 'Enter an OAuth Client ID first.', variant: 'error' });
      return;
    }
    setConnecting(true);
    try {
      await gsheetsSignIn(clientId.trim());
      setConnVersion(v => v + 1);
    } catch (err) {
      pushToast({ message: err instanceof Error ? err.message : 'Sign-in failed.', variant: 'error' });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-title">Google Sheets</div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
        marginBottom: 12, lineHeight: 1.6,
      }}>
        Optionally push Tax Ledger exports into your own Google Sheet (one section at a time) in addition to the XLSX download.
      </div>

      <div className="settings-grid">
        <div className="settings-field" style={{ gridColumn: '1/-1' }}>
          <label>OAuth Client ID</label>
          <input
            type="text"
            placeholder="xxxx.apps.googleusercontent.com"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            onBlur={() => setGSheetsConfig({ clientId: clientId.trim() })}
          />
        </div>
        <div style={{
          gridColumn: '1/-1', fontFamily: 'var(--mono)', fontSize: 9,
          color: 'var(--text-muted)', marginTop: -6, marginBottom: 4, lineHeight: 1.6,
        }}>
          Get your Client ID from console.cloud.google.com — OAuth 2.0 credentials. Add https://brewlab-red.vercel.app to Authorised JavaScript origins and redirect URIs.
        </div>

        <div className="settings-field">
          <label>Malts Sheet ID</label>
          <input
            type="text"
            value={sheetMalts}
            onChange={e => setSheetMalts(e.target.value)}
            onBlur={() => setGSheetsConfig({ sheetIds: { ...getGSheetsConfig().sheetIds, malts: sheetMalts.trim() } })}
          />
        </div>
        <div className="settings-field">
          <label>Hops Sheet ID</label>
          <input
            type="text"
            value={sheetHops}
            onChange={e => setSheetHops(e.target.value)}
            onBlur={() => setGSheetsConfig({ sheetIds: { ...getGSheetsConfig().sheetIds, hops: sheetHops.trim() } })}
          />
        </div>
        <div className="settings-field">
          <label>Yeast &amp; Misc Sheet ID</label>
          <input
            type="text"
            value={sheetYM}
            onChange={e => setSheetYM(e.target.value)}
            onBlur={() => setGSheetsConfig({ sheetIds: { ...getGSheetsConfig().sheetIds, yeastMisc: sheetYM.trim() } })}
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={saveAll}>Save</button>
        <button className="btn sm" onClick={onConnectClick} disabled={connecting}>
          {connecting ? 'Connecting…' : connected ? 'Disconnect' : 'Connect'}
        </button>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          color: connected ? 'var(--green)' : 'var(--text-muted)',
        }}>
          {connected ? `✓ Connected${email ? ` as ${email}` : ''}` : 'Not connected'}
        </span>
      </div>
    </div>
  );
}
