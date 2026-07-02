/**
 * Log-harvest modal — port of brewlab-desktop.html lines 12752–12833
 * (openHarvestYeastModal / openHarvestYeastModalForStrain /
 * confirmHarvestYeast).
 *
 * Fields:
 *   • Strain (text — pre-filled from initialStrain prop, read-only when set)
 *   • Amount (L)
 *   • Harvest Date
 *   • From Tax Batch # (free text — active recipe's taxBatch)
 *   • Generation (auto-suggest: caller-supplied default if provided, else
 *     this strain's most-recent-harvest gen + 1, else Gen 2)
 *   • Container (free text — jar/bottle id)
 *
 * Writes a new entry to the strain's `entries` array. If the strain
 * doesn't exist yet, creates it with the entered generation.
 *
 * The generation default has two callers with different semantics:
 *   • FermTab supplies `initialGeneration` = parent yeast gen + 1 (the
 *     parent comes from the recipe's yeast ingredient — fresh = Gen 1,
 *     harvested-pitched = the linked entry's gen).
 *   • Inventory page lets the modal compute the default itself: walk
 *     this strain's entries, find the most recent harvest (got > 0) and
 *     add 1; default to Gen 2 if no harvest history exists (assumption:
 *     first ever harvest comes from a fresh-yeast brew).
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { dateToStr, todayDate } from '../../lib/dates';
import { fmtNum } from '../../lib/format';
import type { HarvestedYeastEntry } from '../../types';

interface Props {
  /** When non-empty, the strain field is pre-filled and read-only. */
  initialStrain: string;
  /** Pre-fill amount (L). FermTab supplies meta['harvest-amt']. */
  initialAmount?: string;
  /** Pre-fill container. FermTab supplies meta['harvest-cont']. */
  initialContainer?: string;
  /** Pre-fill From Tax Batch #. FermTab supplies recipe.taxBatch. */
  initialFromBatch?: string;
  /** Pre-fill source beer name (silent — no input field). FermTab
   *  supplies recipe.beerName || recipe.name. Stored on the new
   *  entry's `harvestedFrom` field, paired with the tax batch. */
  initialBeerName?: string;
  /** Caller-supplied generation default (overrides the strain-history
   *  fallback). FermTab passes parent gen + 1. */
  initialGeneration?: number;
  onClose: () => void;
}

export default function HarvestYeastModal({
  initialStrain,
  initialAmount,
  initialContainer,
  initialFromBatch,
  initialBeerName,
  initialGeneration,
  onClose,
}: Props) {
  const harvestedYeast    = useStore(s => s.harvestedYeast);
  const setHarvestedYeast = useStore(s => s.setHarvestedYeast);
  const selectedRecipeId  = useStore(s => s.selectedRecipeId);
  const recipes           = useStore(s => s.recipes);
  const pushToast         = useStore(s => s.pushToast);
  // Inventory entry points (per-strain or empty-state) don't pass an
  // explicit beer name; fall back to the active recipe selection. When
  // there's no recipe, the harvest source's beer name is empty and only
  // the typed tax batch survives — HarvestedYeastView falls back to a
  // single-value render.
  const activeBeerName = useMemo(() => {
    if (initialBeerName != null) return initialBeerName;
    if (!selectedRecipeId) return '';
    const r = recipes.find(rr => rr.id === selectedRecipeId);
    return (r?.beerName?.trim() || r?.name?.trim()) ?? '';
  }, [initialBeerName, recipes, selectedRecipeId]);

  const lockStrain = !!initialStrain;
  const existing = initialStrain ? harvestedYeast[initialStrain] : undefined;

  // Generation default — caller override wins; otherwise look at the
  // strain's history. "Most recent harvest gen + 1" matches the new rule;
  // empty or usage-only history → Gen 2 (assumes the source brew was
  // pitched on fresh / Gen 1 yeast, so this harvest is its first child).
  const suggestedGen = useMemo(() => {
    if (initialGeneration && initialGeneration > 0) return initialGeneration;
    if (!existing) return 2;
    const lastHarvest = [...existing.entries]
      .reverse()
      .find(e => (Number(e.got) || 0) > 0);
    if (lastHarvest && lastHarvest.generation) return lastHarvest.generation + 1;
    return 2;
  }, [existing, initialGeneration]);

  const [strain, setStrain]       = useState(initialStrain);
  const [amount, setAmount]       = useState(initialAmount ?? '');
  const [date, setDate]           = useState(dateToStr(todayDate()));
  const [fromBatch, setFromBatch] = useState(initialFromBatch ?? '');
  const [generation, setGeneration] = useState(String(suggestedGen));
  const [container, setContainer] = useState(initialContainer ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const balance = useMemo(() => {
    if (!strain || !harvestedYeast[strain]) return null;
    return harvestedYeast[strain].entries.reduce(
      (s, e) => s + (Number(e.got) || 0) - (Number(e.used) || 0), 0,
    );
  }, [strain, harvestedYeast]);

  const save = () => {
    const trimmed = strain.trim();
    if (!trimmed) { pushToast({ message: 'Please enter a strain name.', variant: 'error' }); return; }
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { pushToast({ message: 'Please enter a valid amount.', variant: 'error' }); return; }
    const gen = parseInt(generation, 10) || 1;
    const taxTag = fromBatch.trim();
    const entry: HarvestedYeastEntry = {
      id: crypto.randomUUID(),
      date,
      got: amt,
      used: 0,
      beer: '',
      harvestDate: date,
      generation: gen,
      container: container.trim(),
      // Note string mirrors HTML's "Harvested from #X" voice but uses
      // the new tax-batch wording. Either field can be empty (manual
      // entry from the inventory page with no recipe loaded).
      note: taxTag
        ? `Harvested from tax batch ${taxTag}${activeBeerName ? ` — ${activeBeerName}` : ''}`
        : undefined,
      // `harvestedFrom` now stores the source brew's beer name (the
      // recipe the yeast came from); paired tax batch lives on
      // `harvestedFromTaxBatch`. View formatter zips them back into
      // "TAX — Beer" for the From column.
      harvestedFrom: activeBeerName,
      harvestedFromTaxBatch: taxTag,
      recipeId: selectedRecipeId ?? undefined,
      type: 'harvest',
    };

    const next = { ...harvestedYeast };
    const cur = next[trimmed] ?? { generation: gen, entries: [] };
    next[trimmed] = {
      generation: gen,
      entries: [...cur.entries, entry],
    };
    setHarvestedYeast(next);
    onClose();
  };

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        <div style={titleStyle}>🧫 LOG HARVEST</div>

        <Row label="STRAIN">
          <input
            type="text"
            value={strain}
            readOnly={lockStrain}
            onChange={e => setStrain(e.target.value)}
            placeholder="e.g. London Ale III"
            style={{ ...inputStyle, ...(lockStrain ? { background: 'var(--panel3)' } : {}) }}
          />
        </Row>

        {balance != null && (
          <div style={balanceStyle}>
            Current stock of <b>{strain}</b>:&nbsp;
            <span style={{ color: 'var(--amber)' }}>{fmtNum(balance, { dp: 1, suffix: ' L' })}</span>&nbsp;
            (Gen {harvestedYeast[strain]?.generation || 1})
          </div>
        )}

        <Row label="AMOUNT (L)">
          <input
            type="number" min={0} step={0.1}
            value={amount} onChange={e => setAmount(e.target.value)}
            autoFocus
            style={{ ...inputStyle, width: 120, flex: 'none' }}
          />
        </Row>
        <Row label="HARVEST DATE">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="FROM TAX BATCH #">
          <input
            type="text" value={fromBatch}
            onChange={e => setFromBatch(e.target.value)}
            placeholder="e.g. 384"
            style={inputStyle}
          />
        </Row>
        <Row label="GENERATION">
          <input
            type="number" min={1}
            value={generation}
            onChange={e => setGeneration(e.target.value)}
            style={{ ...inputStyle, width: 80, flex: 'none' }}
          />
        </Row>
        <Row label="CONTAINER">
          <input
            type="text" value={container}
            onChange={e => setContainer(e.target.value)}
            placeholder="e.g. Jar A"
            style={inputStyle}
          />
        </Row>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={save}>LOG HARVEST</button>
          <button className="btn" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <label style={{
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        width: 130, flexShrink: 0,
      }}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border2)',
  padding: '18px 20px', width: 380, maxWidth: '95vw',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11,
  padding: '4px 8px', outline: 'none',
};

const balanceStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 9,
  background: 'rgba(255,176,0,0.06)', border: '1px solid rgba(255,176,0,0.2)',
  padding: '5px 8px', marginBottom: 8, color: 'var(--text-muted)',
};
