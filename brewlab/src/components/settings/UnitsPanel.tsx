/**
 * Settings → Units — port of HTML #settings-units (lines 2473–2570).
 *
 * Two sections after the 2026-05-04 dead-field cleanup:
 *   1. Ingredient Units (color only — hopUnit/yeastUnit/pressureUnit dropped,
 *      were saved but never read in either HTML or React)
 *   2. Display Precision (g / kg / ml / L)
 *
 * Currency dropdown and Date Format dropdown also dropped — JPY-only display
 * and dateFormat had no consumer in either app.
 *
 * All persisted fields live on BrewSettings → bl_brew_settings → settings
 * Supabase row, exactly the same path as ConnectionPanel uses.
 */

import { useStore } from '../../store';
import type { ColorUnit, DisplayPrecision } from '../../types';

const PRECISION_OPTS: { value: DisplayPrecision; label: (unit: string) => string }[] = [
  { value: '0',    label: u => `0 — e.g. 250 ${u}` },
  { value: '1',    label: u => `1 — e.g. 250.5 ${u}` },
  { value: '2',    label: u => `2 — e.g. 250.50 ${u}` },
  { value: 'auto', label: () => 'Auto (trim zeros)' },
];

export default function UnitsPanel() {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);

  return (
    <>
      {/* Ingredient Units */}
      <div className="settings-section">
        <div className="settings-title">Ingredient Units</div>
        <div className="settings-grid">
          <div className="settings-field">
            <label>Color</label>
            <select
              value={settings.colorUnit ?? 'EBC'}
              onChange={e => setSettings({ colorUnit: e.target.value as ColorUnit })}
            >
              <option value="EBC">EBC</option>
              <option value="SRM">SRM</option>
            </select>
          </div>
        </div>
      </div>

      {/* Display Precision */}
      <div className="settings-section">
        <div className="settings-title">Display Precision</div>
        <div className="settings-grid">
          <PrecisionField
            label="Grams (g)"   unit="g"
            value={settings.dpG  ?? 'auto'}
            onChange={v => setSettings({ dpG: v })}
          />
          <PrecisionField
            label="Kilograms (kg)" unit="kg"
            value={settings.dpKg ?? 'auto'}
            onChange={v => setSettings({ dpKg: v })}
          />
          <PrecisionField
            label="Millilitres (ml)" unit="ml"
            value={settings.dpMl ?? 'auto'}
            onChange={v => setSettings({ dpMl: v })}
          />
          <PrecisionField
            label="Litres (L)"  unit="L"
            value={settings.dpL  ?? 'auto'}
            onChange={v => setSettings({ dpL: v })}
          />
        </div>
      </div>

    </>
  );
}

function PrecisionField({
  label, unit, value, onChange,
}: {
  label: string;
  unit: string;
  value: DisplayPrecision;
  onChange: (v: DisplayPrecision) => void;
}) {
  return (
    <div className="settings-field">
      <label>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value as DisplayPrecision)}>
        {PRECISION_OPTS.map(o => (
          <option key={o.value} value={o.value}>{o.label(unit)}</option>
        ))}
      </select>
    </div>
  );
}
