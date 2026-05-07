import { useStore } from '../../store';
import ConnectionPanel from './ConnectionPanel';
import UnitsPanel from './UnitsPanel';
import BitternessPanel from './BitternessPanel';
import AdvancedPanel from './AdvancedPanel';
import EquipmentProfilesPanel from './EquipmentProfilesPanel';
import MashProfilesPanel from './MashProfilesPanel';
import PitchProfilesPanel from './PitchProfilesPanel';
import StylesPanel from './StylesPanel';
import TanksPanel from './TanksPanel';
import WaterProfilesPanel from './WaterProfilesPanel';
import SuppliersPanel from './SuppliersPanel';

const SECTIONS = [
  'Units', 'Bitterness', 'Advanced', 'Styles', 'Tanks',
  'Equipment Profiles', 'Water Profiles', 'Mash Profiles',
  'Pitch Profiles', 'Suppliers', 'Connection',
] as const;
type Section = typeof SECTIONS[number];

export default function SettingsPanel() {
  // Active section lives in the store so the menu-bar Settings dropdown can
  // route to a specific sub-tab (e.g. clicking "Bitterness" sets it to
  // 'Bitterness' before navigating). Falls back to 'Units' if a stale value
  // sneaks in.
  const stored = useStore(s => s.settingsSection);
  const setSettingsSection = useStore(s => s.setSettingsSection);
  const section: Section = (SECTIONS as readonly string[]).includes(stored)
    ? (stored as Section)
    : 'Units';
  return (
    <div className="settings-layout">
      <div className="settings-nav">
        {SECTIONS.map(s => (
          <div
            key={s}
            className={`settings-nav-item ${section === s ? 'active' : ''}`}
            onClick={() => setSettingsSection(s)}
          >{s}</div>
        ))}
      </div>
      <div className="settings-content">
        <div className="settings-card">
          {section === 'Units'              ? <UnitsPanel />              :
           section === 'Bitterness'         ? <BitternessPanel />         :
           section === 'Advanced'           ? <AdvancedPanel />           :
           section === 'Styles'             ? <StylesPanel />             :
           section === 'Tanks'              ? <TanksPanel />              :
           section === 'Equipment Profiles' ? <EquipmentProfilesPanel />  :
           section === 'Water Profiles'     ? <WaterProfilesPanel />      :
           section === 'Mash Profiles'      ? <MashProfilesPanel />       :
           section === 'Pitch Profiles'     ? <PitchProfilesPanel />      :
           section === 'Suppliers'          ? <SuppliersPanel />          :
           section === 'Connection'         ? <ConnectionPanel />         :
           <Stub label={section} />}
        </div>
      </div>
    </div>
  );
}

function Stub({ label }: { label: string }) {
  const settings = useStore(s => s.settings);
  // Touching settings keeps the stub honest about shared state
  void settings;
  return (
    <div className="settings-section">
      <div className="settings-title">{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>
        Not yet ported from the HTML reference app.
      </div>
    </div>
  );
}
