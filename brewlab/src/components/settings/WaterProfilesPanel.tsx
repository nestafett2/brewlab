/**
 * Settings → Water Profiles — port of HTML #settings-water (line 2729) +
 * editor modal (line 2747) + render/save/delete JS (line 20370–20431).
 *
 * List + search + add + edit modal + delete. Storage via setWaterProfiles
 * → bl_water_profiles → settings table.
 *
 * The waterProfiles store slice was already wired (Desktop.tsx ProfileSelect
 * reads it for the per-recipe Water profile dropdown). This panel is the
 * editor on top of it. WaterTab consumes Ca/Mg/Na/SO4/Cl/HCO3 directly via
 * the per-recipe `recipe_profiles.water` selection lookup.
 *
 * CSV / BeerSmith XML import (HTML lines 20436–20480) is intentionally
 * deferred — the brewer's existing profiles already round-trip through
 * Supabase, so import is a nice-to-have. Add later if needed.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { makeId } from '../../lib/utils';
import type { WaterProfile } from '../../types';
import { profileSharedStyles as ss } from './EquipmentProfilesPanel';

export default function WaterProfilesPanel() {
  const profiles    = useStore(s => s.waterProfiles);
  const setProfiles = useStore(s => s.setWaterProfiles);
  const pushToast   = useStore(s => s.pushToast);
  const [search, setSearch]       = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? profiles.filter(p => (p.name || '').toLowerCase().includes(q))
      : profiles;
  }, [profiles, search]);

  const editing = editingId ? profiles.find(p => p.id === editingId) ?? null : null;

  const addProfile = () => {
    const id = makeId();
    // Seed defaults match HTML addWaterProfile (line 20418).
    const next: WaterProfile = {
      id, name: 'New Water Profile',
      ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0,
      ph: 7.0, notes: '',
    };
    setProfiles([...profiles, next]);
    setEditingId(id);
  };

  const updateProfile = (id: string, updates: Partial<WaterProfile>) => {
    setProfiles(profiles.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProfile = (id: string) => {
    const before = profiles;
    const target = profiles.find(p => p.id === id);
    setProfiles(profiles.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
    pushToast({
      message: target ? `Deleted water profile "${target.name}"` : 'Deleted water profile',
      undo: () => setProfiles(before),
    });
  };

  return (
    <>
      <div className="settings-section">
        <div className="settings-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Water Profiles</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={ss.searchInput}
            />
            <button className="btn sm" onClick={addProfile}>+ New Profile</button>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          Save named source water profiles (Kobe, Wakayama, etc.) to select when building recipes.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <div style={ss.empty}>No profiles yet.</div>
          ) : filtered.map(p => (
            <div key={p.id} style={ss.row} onClick={() => setEditingId(p.id)}>
              <div>
                <div style={ss.rowTitle}>{p.name}</div>
                <div style={ss.rowMeta}>
                  Ca {p.ca || 0} · Mg {p.mg || 0} · Na {p.na || 0} ·
                  {' '}SO₄ {p.so4 || 0} · Cl {p.cl || 0} · HCO₃ {p.hco3 || 0} ·
                  {' '}pH {p.ph ?? '—'}
                </div>
              </div>
              <span style={ss.chevron}>›</span>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <WaterProfileModal
          profile={editing}
          onChange={updates => updateProfile(editing.id, updates)}
          onClose={() => setEditingId(null)}
          onDelete={() => deleteProfile(editing.id)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Editor modal
// ═══════════════════════════════════════════════════════════════════

function WaterProfileModal({
  profile, onChange, onClose, onDelete,
}: {
  profile: WaterProfile;
  onChange: (updates: Partial<WaterProfile>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const numField = (s: string): number => {
    if (s.trim() === '') return 0;
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  const numOrUndef = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = parseFloat(s);
    return isFinite(n) ? n : undefined;
  };

  return (
    <div style={ss.modalBackdrop} onClick={onClose}>
      <div style={{ ...ss.modalPanel, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Profile Name"
            value={profile.name ?? ''}
            onChange={e => onChange({ name: e.target.value })}
            style={{ ...ss.profileNameInput, width: 240 }}
          />
          <button className="btn sm" style={ss.deleteBtn} onClick={onDelete}>✕ Delete</button>
        </div>

        <div className="settings-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Ion label="Ca²⁺ (ppm)"  value={profile.ca}   onChange={v => onChange({ ca:   numField(v) })} />
          <Ion label="Mg²⁺ (ppm)"  value={profile.mg}   onChange={v => onChange({ mg:   numField(v) })} />
          <Ion label="Na⁺ (ppm)"   value={profile.na}   onChange={v => onChange({ na:   numField(v) })} />
          <Ion label="SO₄²⁻ (ppm)" value={profile.so4}  onChange={v => onChange({ so4:  numField(v) })} />
          <Ion label="Cl⁻ (ppm)"   value={profile.cl}   onChange={v => onChange({ cl:   numField(v) })} />
          <Ion label="HCO₃⁻ (ppm)" value={profile.hco3} onChange={v => onChange({ hco3: numField(v) })} />
          <div className="settings-field">
            <label>pH</label>
            <input
              type="number"
              step={0.1}
              min={4}
              max={9}
              value={profile.ph ?? ''}
              onChange={e => onChange({ ph: numOrUndef(e.target.value) })}
            />
          </div>
        </div>

        <div className="settings-field" style={{ marginTop: 10 }}>
          <label>Notes</label>
          <input
            type="text"
            placeholder="optional"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={profile.notes ?? ''}
            onChange={e => onChange({ notes: e.target.value })}
          />
        </div>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn sm primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Ion({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="settings-field">
      <label>{label}</label>
      <input
        type="number"
        step={0.1}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
