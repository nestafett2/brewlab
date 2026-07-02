/**
 * Settings → Tanks — port of HTML #settings-tanks (line 2666) +
 * renderTankSettings (18688) + saveTankName/saveTankField/deleteTankVessel
 * (18466 / 18479 / 18764).
 *
 * The React app already treats `tankCalib` as the canonical tank list:
 * BrewDayTab.tsx:248 and PackagingTab.tsx:208 derive available FVs from
 * `Object.keys(tankCalib).filter(k => k.startsWith('fv'))`. This panel
 * mutates that same dict, which means new tanks added here become
 * selectable in Brew Day / Packaging immediately. No separate vessel
 * list to sync.
 *
 * HTML's PLANNER_VESSELS const was non-persistent (an in-memory array
 * mutated by addTankVessel that resets on reload) — moving the source
 * of truth to bl_tank_calib also fixes that bug.
 *
 * Default seed mirrors HTML PLANNER_VESSELS (line 13469): fv1–fv4 +
 * bt1–bt2. Seeded on first render if calib is empty so Brew Day's tank
 * dropdowns aren't empty for new installs.
 */

import { useEffect } from 'react';
import { useStore } from '../../store';
import type { TankCalibration, TankType } from '../../types';

// HTML defaults match brewlab-desktop.html:18705–18706 (string values
// because the calib blob historically stored strings).
const FV_DEFAULTS = (name: string): TankCalibration => ({
  name, threshold: '55', coneVol: '300', lPerMm: '2.0',
  coneHeight: '0', type: 'Conical' as TankType,
});
const BT_DEFAULTS = (name: string): TankCalibration => ({
  name, threshold: '40', coneVol: '200', lPerMm: '9.5',
});

const SEED_VESSELS: { id: string; name: string; group: 'fv' | 'bt' }[] = [
  { id: 'fv1', name: 'FV 1', group: 'fv' },
  { id: 'fv2', name: 'FV 2', group: 'fv' },
  { id: 'fv3', name: 'FV 3', group: 'fv' },
  { id: 'fv4', name: 'FV 4', group: 'fv' },
  { id: 'bt1', name: 'BT 1', group: 'bt' },
  { id: 'bt2', name: 'BT 2', group: 'bt' },
];

export default function TanksPanel() {
  const tankCalib    = useStore(s => s.tankCalib);
  const setTankCalib = useStore(s => s.setTankCalib);
  const plannerBrews = useStore(s => s.plannerBrews);
  const setPlannerBrews = useStore(s => s.setPlannerBrews);
  const pushToast    = useStore(s => s.pushToast);

  // Seed defaults on first mount if calib is empty (matches HTML
  // first-render behaviour at line 18704–18707, but persisted).
  useEffect(() => {
    if (Object.keys(tankCalib).length > 0) return;
    const next: Record<string, TankCalibration> = {};
    SEED_VESSELS.forEach(v => {
      next[v.id] = v.group === 'fv' ? FV_DEFAULTS(v.name) : BT_DEFAULTS(v.name);
    });
    setTankCalib(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fvIds = Object.keys(tankCalib).filter(k => k.startsWith('fv')).sort(naturalSort);
  const btIds = Object.keys(tankCalib).filter(k => k.startsWith('bt')).sort(naturalSort);

  const updateField = <K extends keyof TankCalibration>(id: string, field: K, value: TankCalibration[K]) => {
    setTankCalib({
      ...tankCalib,
      [id]: { ...tankCalib[id], [field]: value, name: tankCalib[id]?.name ?? id.toUpperCase() },
    });
  };

  const addTank = (kind: 'fv' | 'bt') => {
    const prefix = kind;
    const display = kind === 'fv' ? 'FV' : 'BT';
    // Find next number — examine existing ids of this kind.
    const existing = (kind === 'fv' ? fvIds : btIds)
      .map(id => parseInt(id.slice(prefix.length), 10))
      .filter(n => Number.isFinite(n));
    const next = existing.length ? Math.max(...existing) + 1 : 1;
    const id = prefix + next;
    const seed = kind === 'fv' ? FV_DEFAULTS(`${display} ${next}`) : BT_DEFAULTS(`${display} ${next}`);
    setTankCalib({ ...tankCalib, [id]: seed });
  };

  const deleteTank = (id: string) => {
    const beforeCalib   = tankCalib;
    const beforePlanner = plannerBrews;
    const target = tankCalib[id];
    const inUse = plannerBrews.some(b => b.vessel === id);
    if (inUse) {
      setPlannerBrews(plannerBrews.map(b => b.vessel === id ? { ...b, vessel: 'unassigned' } : b));
    }
    const next = { ...tankCalib };
    delete next[id];
    setTankCalib(next);
    pushToast({
      message: target ? `Deleted tank "${target.name}"` : 'Deleted tank',
      undo: () => {
        setTankCalib(beforeCalib);
        if (inUse) setPlannerBrews(beforePlanner);
      },
    });
  };

  return (
    <>
      <TankGroup
        title="Fermentation Vessels"
        ids={fvIds}
        isFV
        calib={tankCalib}
        onChange={updateField}
        onDelete={deleteTank}
        onAdd={() => addTank('fv')}
      />
      <TankGroup
        title="Bright Tanks"
        ids={btIds}
        isFV={false}
        calib={tankCalib}
        onChange={updateField}
        onDelete={deleteTank}
        onAdd={() => addTank('bt')}
      />
    </>
  );
}

function TankGroup({
  title, ids, isFV, calib, onChange, onDelete, onAdd,
}: {
  title: string;
  ids: string[];
  isFV: boolean;
  calib: Record<string, TankCalibration>;
  onChange: <K extends keyof TankCalibration>(id: string, field: K, value: TankCalibration[K]) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="settings-section">
      <div className="settings-title">
        {title}
        <span style={subTitleStyle}>— synced with planner schedule</span>
      </div>
      {ids.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>
          No tanks yet.
        </div>
      )}
      {ids.map(id => (
        <TankRow
          key={id}
          id={id}
          isFV={isFV}
          calib={calib[id]}
          onChange={onChange}
          onDelete={onDelete}
        />
      ))}
      <button className="btn" style={{ marginTop: 8 }} onClick={onAdd}>＋ Add {isFV ? 'FV' : 'BT'}</button>
    </div>
  );
}

function TankRow({
  id, isFV, calib, onChange, onDelete,
}: {
  id: string;
  isFV: boolean;
  calib: TankCalibration | undefined;
  onChange: <K extends keyof TankCalibration>(id: string, field: K, value: TankCalibration[K]) => void;
  onDelete: (id: string) => void;
}) {
  const c = calib ?? { name: id.toUpperCase() };
  const placeholder = id.toUpperCase();

  return (
    <div style={tankRowStyle}>
      <div style={{ ...tankFieldStyle, minWidth: 80, maxWidth: 100 }}>
        <label style={tankLabelStyle}>Name</label>
        <input
          type="text"
          value={c.name ?? ''}
          placeholder={placeholder}
          onChange={e => onChange(id, 'name', e.target.value)}
          style={{ ...tankInputStyle, fontWeight: 600 }}
        />
      </div>
      {isFV && (
        <div style={tankFieldStyle}>
          <label style={tankLabelStyle}>Type</label>
          <select
            value={c.type ?? 'Conical'}
            onChange={e => onChange(id, 'type', e.target.value as TankType)}
            style={{ ...tankInputStyle, padding: 3 }}
          >
            <option value="Conical">Conical</option>
            <option value="Unitank">Unitank</option>
          </select>
        </div>
      )}
      <div style={tankFieldStyle}>
        <label style={tankLabelStyle}>Cone Threshold (mm)</label>
        <input
          type="text"
          value={c.threshold ?? ''}
          onChange={e => onChange(id, 'threshold', e.target.value)}
          style={tankInputStyle}
        />
      </div>
      <div style={tankFieldStyle}>
        <label style={tankLabelStyle}>Cone Volume (L)</label>
        <input
          type="text"
          value={c.coneVol ?? ''}
          onChange={e => onChange(id, 'coneVol', e.target.value)}
          style={tankInputStyle}
        />
      </div>
      <div style={tankFieldStyle}>
        <label style={tankLabelStyle}>L per mm above</label>
        <input
          type="text"
          value={c.lPerMm ?? ''}
          onChange={e => onChange(id, 'lPerMm', e.target.value)}
          style={tankInputStyle}
        />
      </div>
      {isFV && (
        <div
          style={tankFieldStyle}
          title="Height of conical section below measurement start point. Added to MM reading for tax reporting."
        >
          <label style={tankLabelStyle}>Conical Height (mm)</label>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={c.coneHeight ?? ''}
            onChange={e => onChange(id, 'coneHeight', e.target.value)}
            style={tankInputStyle}
          />
        </div>
      )}
      <button
        className="btn sm danger"
        style={{ marginTop: 10, alignSelf: 'flex-end' }}
        onClick={() => onDelete(id)}
      >✕</button>
    </div>
  );
}

// Sort fv1, fv2, fv10 — not fv1, fv10, fv2.
function naturalSort(a: string, b: string): number {
  const re = /^([a-z]+)(\d+)$/i;
  const am = a.match(re), bm = b.match(re);
  if (am && bm && am[1] === bm[1]) return parseInt(am[2], 10) - parseInt(bm[2], 10);
  return a.localeCompare(b);
}

const subTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)',
  fontWeight: 400, marginLeft: 8,
};

const tankRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: 7, background: 'var(--panel)', border: '1px solid var(--border)',
  marginBottom: 4,
};

const tankFieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, flex: 1,
};

const tankLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 7, letterSpacing: 1,
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

const tankInputStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '3px 6px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
