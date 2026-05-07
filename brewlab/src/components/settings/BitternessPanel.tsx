/**
 * Settings → Bitterness — port of HTML #settings-bitterness (lines 2574–2604).
 *
 * Three controls, all already on BrewSettings:
 *   - ibuMethod (tinseth / rager / daniels)
 *   - mashHopAdj (% reduction vs boil hops; default −80)
 *   - leafHopAdj (% adjustment vs pellet; default −10)
 */

import { useStore } from '../../store';
import type { IbuMethod } from '../../types';

export default function BitternessPanel() {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);

  const intOrZero = (s: string): number => {
    const n = parseInt(s, 10);
    return isFinite(n) ? n : 0;
  };

  return (
    <div className="settings-section">
      <div className="settings-title">IBU Calculation</div>
      <div className="settings-grid">
        <div className="settings-field">
          <label>IBU Method</label>
          <select
            value={settings.ibuMethod ?? 'tinseth'}
            onChange={e => setSettings({ ibuMethod: e.target.value as IbuMethod })}
          >
            <option value="tinseth">Tinseth</option>
            <option value="rager">Rager</option>
            <option value="daniels">Daniels</option>
          </select>
        </div>

        <div className="settings-field">
          <label>Mash Hop IBU Adjustment</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={-100} max={0} step={5}
              style={{ width: 60 }}
              value={settings.mashHopAdj ?? -80}
              onChange={e => setSettings({ mashHopAdj: intOrZero(e.target.value) })}
              title="Negative % reduction vs normal boil hops. Default: -80% (mash hops contribute 20% of normal IBU)"
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>%</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>
              default –80 → 20% contribution
            </span>
          </div>
        </div>

        <div className="settings-field">
          <label>Leaf / Whole Hop Adjustment</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={-50} max={50} step={5}
              style={{ width: 60 }}
              value={settings.leafHopAdj ?? -10}
              onChange={e => setSettings({ leafHopAdj: intOrZero(e.target.value) })}
              title="% adjustment vs pellet hops. Typically -10% to -15% for whole hops."
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>%</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>
              vs pellets (typically –10 to –15)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
