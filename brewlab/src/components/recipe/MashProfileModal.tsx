/**
 * Mash Profile modal — port of HTML #mashProfileOverlay (line 20762) +
 * supporting JS:
 *   - openMashProfile         (line 18000)
 *   - saveMashProfile         (line 17981)
 *   - resetMashProfile        (line 18018)
 *   - addMashStep             (line 18029)
 *   - readMashStepsFromModal  (line 17991)
 *   - updateMashCalcs         (line 18049)
 *   - getDefaultMashProfile   (line 17970)
 *   - loadMashProfileFromLib  (line 20193)
 *   - saveMashProfileToLib    (line 20215)
 *
 * Per-recipe blob persisted to `bl_mash_<recipeId>` (local-only; same
 * pattern as bl_water_chem_<id>, not in SETTINGS_KEYS allowlist).
 *
 * Live calc displays reuse `calcBrewDayTargets` so mash/sparge/strike
 * track every settings/equipment change in lockstep with the Brew Day tab.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../../store';
import { calcBrewDayTargets, DEFAULT_MASH_PROFILE } from '../../lib/calculations';
import { fmtNum } from '../../lib/format';
import { makeId } from '../../lib/utils';
import type {
  Recipe, Ingredient, MashProfile, MashStep, MashStepType,
} from '../../types';

interface Props {
  recipeId: string;
  recipe: Recipe;
  ingredients: Ingredient[];
  onClose: () => void;
}

// HTML line 17963 — the recipe-modal allowed step types. Settings → Mash
// Profiles editor uses a different subset. Both subsets fall under the
// MashStepType union in types/index.ts.
const MASH_STEP_TYPES: MashStepType[] = [
  'Infusion', 'Step Mash', 'Decoction', 'Double Decoction', 'Mash Out', 'Temperature Rest',
];

export default function MashProfileModal({ recipeId, recipe, ingredients, onClose }: Props) {
  const settings      = useStore(s => s.settings);
  const equipProfiles = useStore(s => s.equipProfiles);
  const maltLib       = useStore(s => s.maltLib);
  const hopLib        = useStore(s => s.hopLib);
  const yeastLib      = useStore(s => s.yeastLib);
  const mashProfiles  = useStore(s => s.mashProfiles);
  const setMashProfiles = useStore(s => s.setMashProfiles);
  const getMash         = useStore(s => s.getMash);
  const setMash         = useStore(s => s.setMash);
  const pushToast       = useStore(s => s.pushToast);
  const recipeProfileSelections = useStore(s => s.recipeProfilesByRecipe[recipeId]);

  // Active equip profile — same lookup used by BrewDayTab. Read for the
  // strike-temp Palmer formula and trub-loss in the calc chain.
  const activeEquip = useMemo(() => {
    const id = recipeProfileSelections?.equip;
    const byId = id ? equipProfiles.find(p => p.id === id) : null;
    return byId ?? equipProfiles[0] ?? null;
  }, [equipProfiles, recipeProfileSelections?.equip]);

  // ── Local form state ─────────────────────────────────────────────────
  // Source the persisted blob from the reactive store (also seeds the
  // mashByRecipe cache for any subscriber that opens after the modal).
  const initial = useMemo(() => {
    return getMash(recipeId) ?? DEFAULT_MASH_PROFILE;
  }, [recipeId, getMash]);

  const [ratio, setRatio] = useState<string>(
    initial.ratio != null ? String(initial.ratio) : '3.0',
  );
  const [steps, setSteps] = useState<MashStep[]>(
    initial.steps?.length ? initial.steps : DEFAULT_MASH_PROFILE.steps,
  );
  const [notes, setNotes] = useState<string>(initial.notes ?? '');

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Live calcs (mirror HTML updateMashCalcs at line 18049) ───────────
  const targets = useMemo(() => {
    const ratioNum = parseFloat(ratio);
    return calcBrewDayTargets({
      recipe, ingredients, maltLib, hopLib, yeastLib,
      equip: activeEquip,
      mashProfile: { id: '', name: '', ratio: ratioNum, steps },
      grainAbsorbLkg: settings.grainAbsorb && settings.grainAbsorb > 0 ? settings.grainAbsorb : undefined,
      grainTempC: typeof settings.defaultGrainTemp === 'number' && isFinite(settings.defaultGrainTemp)
        ? settings.defaultGrainTemp
        : undefined,
      coolingShrinkagePct: typeof settings.coolingShrinkage === 'number' && settings.coolingShrinkage > 0
        ? settings.coolingShrinkage
        : undefined,
    });
  }, [recipe, ingredients, maltLib, hopLib, yeastLib, activeEquip, ratio, steps, settings.grainAbsorb, settings.defaultGrainTemp, settings.coolingShrinkage]);

  const totalGrainKg = targets.totalGrainKg;
  const mashWaterL   = targets.mashWaterL ?? 0;
  const spargeVolL   = targets.spargeVolL ?? 0;
  const strikeTempC  = targets.strikeTempC ?? null;
  const totalWaterIn = mashWaterL + spargeVolL;

  const f1 = (n: number): string => fmtNum(n, { dp: 1 });

  const mashWaterDisplay = totalGrainKg > 0
    ? `Mash: ${f1(mashWaterL)} L` + (strikeTempC != null ? ` · Strike: ${f1(strikeTempC)}°C` : '')
    : '— (add grains first)';
  const spargeDisplay = totalGrainKg > 0 && spargeVolL > 0 ? `${f1(spargeVolL)} L` : '—';
  const totalDisplay = totalGrainKg > 0 && totalWaterIn > 0 ? `${f1(totalWaterIn)} L` : '—';

  // ── Step manipulation ────────────────────────────────────────────────
  const addStep = useCallback(() => {
    setSteps(prev => [...prev, { type: 'Infusion', temp: 68, time: 60 }]);
  }, []);
  const updateStep = useCallback((idx: number, patch: Partial<MashStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }, []);
  const removeStep = useCallback((idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Action handlers ──────────────────────────────────────────────────
  const buildProfileBlob = (): MashProfile => {
    const ratioNum = parseFloat(ratio) || DEFAULT_MASH_PROFILE.ratio!;
    return { id: '', name: '', ratio: ratioNum, steps, notes };
  };

  const handleSave = () => {
    // setMash writes localStorage + dispatches to Supabase + updates the
    // reactive mashByRecipe map so BrewDayTab/WaterTab refresh immediately.
    setMash(recipeId, buildProfileBlob());
    onClose();
  };

  const handleReset = () => {
    // Form-state reset only — blob isn't touched until Save. Snapshot the
    // current form so the brewer can recover their unsaved schedule.
    const beforeRatio = ratio;
    const beforeSteps = steps;
    const beforeNotes = notes;
    setRatio(String(DEFAULT_MASH_PROFILE.ratio));
    setSteps(DEFAULT_MASH_PROFILE.steps);
    setNotes(DEFAULT_MASH_PROFILE.notes ?? '');
    pushToast({
      message: 'Reset mash profile',
      undo: () => {
        setRatio(beforeRatio);
        setSteps(beforeSteps);
        setNotes(beforeNotes);
      },
    });
  };

  const handleLoadFromLib = (id: string) => {
    if (!id) return;
    const p = mashProfiles.find(mp => mp.id === id);
    if (!p) return;
    setRatio(p.ratio != null ? String(p.ratio) : '3.0');
    setSteps(p.steps?.length ? p.steps : DEFAULT_MASH_PROFILE.steps);
    setNotes(p.notes ?? '');
  };

  const handleSaveAsProfile = () => {
    const name = window.prompt('Save as profile name:');
    if (!name || !name.trim()) return;
    const ratioNum = parseFloat(ratio) || DEFAULT_MASH_PROFILE.ratio!;
    const next: MashProfile = {
      id: makeId(),
      name: name.trim(),
      ratio: ratioNum,
      steps,
      notes,
    };
    setMashProfiles([...mashProfiles, next]);
    pushToast({ message: `Saved profile "${next.name}"`, variant: 'success' });
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div className="modal-title">MASH PROFILE</div>
          <button className="btn sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Load Saved */}
          <div style={rowStyle}>
            <label style={labelStyle}>Load Saved</label>
            <select
              value=""
              onChange={e => handleLoadFromLib(e.target.value)}
              style={loadSelectStyle}
            >
              <option value="">— select a saved profile —</option>
              {mashProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              className="btn sm"
              onClick={handleSaveAsProfile}
              title="Save current settings as a reusable profile"
            >
              💾 Save as Profile
            </button>
          </div>

          {/* Water Ratio */}
          <div style={rowStyle}>
            <label style={labelStyle}>Water Ratio</label>
            <input
              type="number"
              step={0.1} min={1.5} max={6}
              placeholder="3.0"
              value={ratio}
              onChange={e => setRatio(e.target.value)}
              style={ratioInputStyle}
            />
            <span style={unitStyle}>L / kg grain</span>
            <div style={mashWaterDisplayStyle}>{mashWaterDisplay}</div>
          </div>

          {/* Sparge */}
          <div style={rowStyle}>
            <label style={labelStyle}>Sparge Water</label>
            <div style={spargeDisplayStyle}>{spargeDisplay}</div>
            <span style={unitStyle}>· Total:</span>
            <div style={totalDisplayStyle}>{totalDisplay}</div>
          </div>

          {/* Mash Steps */}
          <div>
            <div style={stepsHeaderStyle}>
              <span>Mash Steps</span>
              <button className="btn sm" onClick={addStep} style={{ fontSize: 10 }}>+ Add Step</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {steps.map((step, idx) => (
                <div key={idx} style={stepRowStyle}>
                  <select
                    value={step.type}
                    onChange={e => updateStep(idx, { type: e.target.value as MashStepType })}
                    style={stepTypeSelectStyle}
                  >
                    {MASH_STEP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="number" step={0.5}
                    placeholder="°C"
                    value={step.temp ?? ''}
                    onChange={e => updateStep(idx, { temp: parseFloat(e.target.value) || 0 })}
                    style={stepNumInputStyle(64)}
                  />
                  <span style={stepUnitStyle}>°C</span>
                  <input
                    type="number" step={1}
                    placeholder="min"
                    value={step.time ?? ''}
                    onChange={e => updateStep(idx, { time: parseFloat(e.target.value) || 0 })}
                    style={stepNumInputStyle(50)}
                  />
                  <span style={stepUnitStyle}>min</span>
                  <button
                    onClick={() => removeStep(idx)}
                    title="Remove"
                    style={removeBtnStyle}
                  >×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <label style={{ ...labelStyle, paddingTop: 4 }}>Notes</label>
            <textarea
              rows={2}
              placeholder="Profile notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={notesStyle}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button className="btn" onClick={handleReset} style={{ color: 'var(--text-muted)' }}>
            Reset to Default
          </button>
          <button className="btn primary" onClick={handleSave}>✓ Save</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Styles — match HTML markup at lines 20762–20821 verbatim.
// ═══════════════════════════════════════════════════════════════════

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 10,
  width: 580, maxWidth: '96vw', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 18px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '14px 18px',
  display: 'flex', flexDirection: 'column', gap: 14,
};

const footerStyle: React.CSSProperties = {
  padding: '10px 18px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
  textTransform: 'uppercase', color: 'var(--text-muted)', minWidth: 110,
};

const loadSelectStyle: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
  padding: '4px 8px', outline: 'none', borderRadius: 4, flex: 1,
};

const ratioInputStyle: React.CSSProperties = {
  width: 70, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 13,
  padding: '4px 8px', outline: 'none', borderRadius: 4,
};

const unitStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)',
};

const mashWaterDisplayStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--amber)', marginLeft: 8,
};

const spargeDisplayStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--blue)',
};

const totalDisplayStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)',
};

const stepsHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const stepRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'var(--panel2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '6px 8px',
};

const stepTypeSelectStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '3px 6px', outline: 'none', borderRadius: 4, flex: 1,
};

const stepNumInputStyle = (width: number): React.CSSProperties => ({
  width, background: 'var(--panel)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
  padding: '3px 6px', outline: 'none', borderRadius: 4, textAlign: 'right',
});

const stepUnitStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
};

const removeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--red)',
  cursor: 'pointer', padding: '0 4px', fontSize: 14,
};

const notesStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '5px 8px', outline: 'none', resize: 'vertical', borderRadius: 4,
};
