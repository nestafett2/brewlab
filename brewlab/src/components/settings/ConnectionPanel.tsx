import { useState } from 'react';
import { useStore } from '../../store';
import { sbTestConnection, sbPushAll, sbWipeAll, hasSupabase } from '../../lib/supabase';
import { clearAllBrewLabData } from '../../lib/storage';

type StatusState = 'idle' | 'pending' | 'ok' | 'err';

export default function ConnectionPanel() {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const hydrate = useStore(s => s.hydrate);

  const [statusText, setStatusText] = useState(hasSupabase() ? 'Saved — click Test Connection' : 'Not connected');
  const [statusState, setStatusState] = useState<StatusState>('idle');

  const setStatus = (text: string, state: StatusState) => {
    setStatusText(text);
    setStatusState(state);
  };

  const onTest = async () => {
    setStatus('Testing…', 'pending');
    const r = await sbTestConnection();
    setStatus(r.ok ? '✓ Connected' : '✗ ' + r.msg, r.ok ? 'ok' : 'err');
  };

  const onPush = async () => {
    if (!hasSupabase()) { setStatus('✗ No credentials configured', 'err'); return; }
    setStatus('Pushing…', 'pending');
    try {
      const count = await sbPushAll();
      setStatus(`✓ Pushed ${count} records`, 'ok');
    } catch (e) {
      setStatus('✗ ' + (e instanceof Error ? e.message : 'Push failed'), 'err');
    }
  };

  const onPull = async () => {
    if (!hasSupabase()) { setStatus('✗ No credentials configured', 'err'); return; }
    setStatus('Pulling…', 'pending');
    await hydrate();
    setStatus('✓ Pulled — reloading…', 'ok');
    setTimeout(() => location.reload(), 800);
  };

  const onReset = async () => {
    if (!confirm('⚠ RESET ALL DATA\n\nThis will permanently delete ALL recipes, ingredients, fermentation logs, brew day data, and settings from Supabase AND this device.\n\nThis cannot be undone.\n\nAre you sure you want to continue?')) return;
    if (!confirm('🗑 FINAL WARNING\n\nEverything will be deleted. There is no going back.\n\nClick OK to wipe all data now.')) return;
    await sbWipeAll();
    clearAllBrewLabData();
    alert('All data wiped. Reloading now.');
    location.reload();
  };

  const statusColor =
    statusState === 'ok'  ? 'var(--green)' :
    statusState === 'err' ? 'var(--red)' :
                            'var(--text-muted)';

  return (
    <>
      {/* Brewery */}
      <div className="settings-section">
        <div className="settings-title">Brewery</div>
        <div className="settings-grid">
          <div className="settings-field" style={{ gridColumn: '1/-1' }}>
            <label>Brewery Name</label>
            <input
              type="text"
              placeholder="Nomodachi"
              style={{ width: '100%', boxSizing: 'border-box' }}
              value={settings.breweryName ?? ''}
              onChange={e => setSettings({ breweryName: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Supabase Connection */}
      <div className="settings-section">
        <div className="settings-title">Supabase Connection</div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
          marginBottom: 12, lineHeight: 1.6,
        }}>
          Connect BrewLab to your Supabase project for cloud sync and multi-device access.<br />
          The anon key is safe to store here — it is designed to be public. Keep your service key secret and never enter it here.
        </div>
        <div className="settings-grid">
          <div className="settings-field" style={{ gridColumn: '1/-1' }}>
            <label>Project URL</label>
            <input
              type="text"
              placeholder="https://xxxx.supabase.co"
              style={{ width: '100%', boxSizing: 'border-box' }}
              value={settings.sbUrl ?? ''}
              onChange={e => setSettings({ sbUrl: e.target.value })}
            />
          </div>
          <div className="settings-field" style={{ gridColumn: '1/-1' }}>
            <label>Anon Key</label>
            <input
              type="text"
              placeholder="eyJ…"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 9 }}
              value={settings.sbAnonKey ?? ''}
              onChange={e => setSettings({ sbAnonKey: e.target.value })}
            />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={onTest}>Test Connection</button>
          <button className="btn sm" title="Upload all local data to Supabase (run once after connecting)" onClick={onPush}>Push Local → Supabase</button>
          <button className="btn sm" title="Pull latest data from Supabase into this browser" onClick={onPull}>Pull Supabase → Local</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: statusColor }}>{statusText}</span>
        </div>

        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)',
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
          }}>⚠ Danger Zone</div>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text-muted)',
            marginBottom: 10, lineHeight: 1.5,
          }}>
            Wipes ALL data from Supabase and this device. Use this to start fresh. Run this on desktop first, then reset each other device separately.
          </div>
          <button
            className="btn sm"
            onClick={onReset}
            style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
          >🗑 Reset All Data</button>
        </div>
      </div>
    </>
  );
}
