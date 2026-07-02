/**
 * Settings → Advanced — port of HTML #settings-advanced (lines 2607–2640).
 *
 * Two sections:
 *   1. Appearance — theme dark/light toggle (HTML setTheme line 20350)
 *   2. Calculation Constants — grain absorb / default grain temp / cooling
 *      shrinkage. The HTML's Default Grain Temp had no save handler
 *      (just `oninput="updateTotals()"`); we promote it to a real
 *      persisted setting since rendering an input that resets every reload
 *      would be misleading.
 *
 * The actual `body.light` class toggle on theme change happens in App.tsx
 * (theme-on-load effect) — this panel just persists settings.theme.
 */

import { useStore } from '../../store';
import type { ThemeMode } from '../../types';

export default function AdvancedPanel() {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);

  const theme: ThemeMode = settings.theme ?? 'dark';

  const numOrZero = (s: string): number => {
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  const themeBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11,
    ...(active ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}),
  });

  return (
    <>
      {/* Appearance */}
      <div className="settings-section">
        <div className="settings-title">Appearance</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
            Theme
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn sm"
              style={themeBtnStyle(theme === 'dark')}
              onClick={() => setSettings({ theme: 'dark' })}
            >Dark</button>
            <button
              className="btn sm"
              style={themeBtnStyle(theme === 'light')}
              onClick={() => setSettings({ theme: 'light' })}
            >Light</button>
          </div>
        </div>
      </div>

      {/* Calculation Constants */}
      <div className="settings-section">
        <div className="settings-title">Calculation Constants</div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)',
          marginBottom: 12,
        }}>
          System-wide constants used in brewing calculations. These apply globally regardless of equipment profile.
        </div>
        <div className="settings-grid">
          <div className="settings-field">
            <label>Grain Absorption (L/kg)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={0.1} max={2.0} step={0.05}
                style={{ width: 60 }}
                value={settings.grainAbsorb ?? 0.75}
                onChange={e => setSettings({ grainAbsorb: numOrZero(e.target.value) })}
                title="Liters of water absorbed per kg of grain. Typical range: 0.5–1.1 L/kg"
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>L/kg</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>
                typical: 0.5–1.1 L/kg
              </span>
            </div>
          </div>

          <div className="settings-field">
            <label>Default Grain Temp (°C)</label>
            <input
              type="number"
              style={{ width: 80 }}
              value={settings.defaultGrainTemp ?? 20}
              onChange={e => setSettings({ defaultGrainTemp: numOrZero(e.target.value) })}
            />
          </div>

          <div className="settings-field">
            <label>Cooling Shrinkage (%)</label>
            <input
              type="number"
              style={{ width: 80 }}
              value={settings.coolingShrinkage ?? 4}
              onChange={e => setSettings({ coolingShrinkage: numOrZero(e.target.value) })}
            />
          </div>

          <div className="settings-field">
            <label>Default BH Efficiency (%)</label>
            <input
              type="number"
              min={0} max={100} step={0.1}
              style={{ width: 80 }}
              value={settings.defaultBhEff ?? 72}
              onChange={e => setSettings({ defaultBhEff: numOrZero(e.target.value) })}
              title="Default brewhouse efficiency applied to new recipes and BeerXML imports."
            />
          </div>

          <div className="settings-field">
            <label>Beer Buffer Capacity</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={0.01} max={0.10} step={0.005}
                style={{ width: 80 }}
                value={settings.beerBufferPhPerMeqL ?? 0.04}
                onChange={e => setSettings({ beerBufferPhPerMeqL: numOrZero(e.target.value) })}
                title="Estimated finished-beer buffer capacity, in pH units per mEq/L of acid. Drives the Ferm tab's residual-acid suggestion when measured pH exceeds target. Real beer typically 0.02–0.06; default 0.04."
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>pH/(mEq/L)</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>
                default 0.04 — real beer 0.02–0.06
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
