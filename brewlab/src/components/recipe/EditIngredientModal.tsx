/**
 * Ingredient Edit Modal — matches HTML app's openIngEdit / confirmIngEdit.
 *
 * Two-panel layout:
 *   Left  = live stats (pinned top) + same-type ingredient list (scrollable below)
 *   Right = edit form
 *
 * Opens on double-click of an ingredient row.
 * Live-preview: as fields change, calculates "what-if" stats showing how the
 * edit affects OG/FG/ABV/IBU/EBC without committing until Save.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../store';
import { fmtAmt, asNum } from '../../lib/utils';
import type { Ingredient, HopUse } from '../../types';
import {
  calcOG, calcFG, calcABV, calcTotalIBU, calcEBC, sgToPlato,
} from '../../lib/calculations';

interface Props {
  recipeId: string;
  ingredient: Ingredient;
  allIngredients: Ingredient[];
  onClose: () => void;
}

const HOP_USES: HopUse[] = ['mash', 'first wort', 'boil', 'whirlpool', 'flameout', 'dry hop'];
const MISC_USES = ['boil', 'mash', 'whirlpool', 'fermentation', 'cold side', 'packaging'];

export default function EditIngredientModal({ recipeId, ingredient, allIngredients, onClose }: Props) {
  const updateIngredient = useStore(s => s.updateIngredient);
  const maltLib = useStore(s => s.maltLib);
  const hopLib = useStore(s => s.hopLib);
  const yeastLib = useStore(s => s.yeastLib);
  const miscLib = useStore(s => s.miscLib);
  const recipes = useStore(s => s.recipes);
  const settings = useStore(s => s.settings);

  const recipe = recipes.find(r => r.id === recipeId);
  const type = ingredient.type;

  // ── Draft state ──
  const [amt, setAmt] = useState(String(ingredient.amt));
  const [extra, setExtra] = useState(ingredient.extra || '');
  const [use, setUse] = useState(ingredient.use || '');
  const [time, setTime] = useState(ingredient.time != null ? String(ingredient.time) : '');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState((ingredient as any).notes || '');
  const [malted, setMalted] = useState((ingredient as any).malted !== false);

  // Yeast-specific
  const [yeastForm, setYeastForm] = useState<'dry' | 'liquid'>('dry');
  const [yeastSource, setYeastSource] = useState<'fresh' | 'harvested'>('fresh');
  const [yeastBatch, setYeastBatch] = useState('');
  const [yeastGen, setYeastGen] = useState('');

  // Initialize cost from ingredient or library
  useEffect(() => {
    let c = ingredient.cost || 0;
    if (c === 0) {
      const libs: Record<string, any[]> = { grain: maltLib, hop: hopLib, yeast: yeastLib, misc: miscLib };
      const lib = (libs[type] || []).find((e: any) =>
        e.id === ingredient.libId || (e.name || '').toLowerCase() === (ingredient.name || '').toLowerCase()
      );
      if (lib?.price) c = lib.price;
    }
    setCost(c > 0 ? String(c) : '');
  }, [ingredient, type, maltLib, hopLib, yeastLib, miscLib]);

  // Initialize yeast fields
  useEffect(() => {
    if (type !== 'yeast') return;
    const isDry = ingredient.unit === 'g' || ingredient.unit === 'pkg';
    setYeastForm(isDry ? 'dry' : 'liquid');
    setYeastSource((ingredient as any).yeastSource || 'fresh');
    setYeastBatch((ingredient as any).yeastBatch || '');
    setYeastGen((ingredient as any).yeastGen || '');
    if (!isDry) {
      const litres = ingredient.unit === 'ml' ? ingredient.amt * 0.001 : ingredient.amt;
      setAmt(litres.toFixed(2));
    }
    if (!extra) {
      const libY = yeastLib.find(y => y.id === ingredient.libId || (y.name || '').toLowerCase() === (ingredient.name || '').toLowerCase());
      if (libY?.atten) setExtra(String(libY.atten));
    }
  }, [type, ingredient, yeastLib, extra]);

  // ── Live "what-if" stats ──
  const draftStats = useMemo(() => {
    if (!recipe) return null;
    const batchL = recipe.batchL || 0;
    if (batchL <= 0) return null;

    const parsedAmt = parseFloat(amt) || 0;
    let storedAmt = parsedAmt;
    if (type === 'yeast' && yeastForm === 'liquid') storedAmt = parsedAmt * 1000;

    const patched = allIngredients.map(i => {
      if (i.id !== ingredient.id) return i;
      return { ...i, amt: storedAmt, extra, use, time: time ? parseFloat(time) : null, malted } as Ingredient;
    });

    const bhEff = recipe.bhEff || 67.60;
    const wpTemp = recipe.whirlpoolTemp ?? settings.whirlpoolTemp ?? 85;
    const grains = patched.filter(i => i.type === 'grain');
    const ogSg = calcOG(grains, maltLib, batchL, bhEff);
    const ogPlato = ogSg > 1 ? sgToPlato(ogSg) : 0;

    const yeastIng = patched.find(i => i.type === 'yeast');
    let atten = 0;
    if (yeastIng) {
      atten = parseFloat(yeastIng.extra || '0');
      if (!atten) {
        const libY = yeastLib.find(y => y.id === yeastIng.libId || y.name === yeastIng.name);
        atten = asNum(libY?.atten, 75);
      }
    }
    if (!atten) atten = 75;
    const fgSg = calcFG(ogSg, atten);
    const fgPlato = fgSg > 1 ? sgToPlato(fgSg) : 0;
    const abv = calcABV(ogSg, fgSg);

    const { total: ibu } = calcTotalIBU({
      method: settings.ibuMethod, hops: patched, hopLib, batchL, ogSg,
      whirlpoolTemp: wpTemp, mashHopAdj: settings.mashHopAdj,
      leafHopAdj: settings.leafHopAdj, largeBatchUtil: settings.largeBatchUtil,
    });
    const ebc = calcEBC(patched, maltLib, batchL);
    const totalGrainKg = grains.reduce((s, g) => s + (g.unit === 'g' ? g.amt * 0.001 : g.amt), 0);
    const totalHopG = patched.filter(i => i.type === 'hop').reduce((s, h) => s + (h.unit === 'kg' ? h.amt * 1000 : h.amt), 0);

    return { ogPlato, fgPlato, abv, ibu, ebc, totalGrainKg, totalHopG };
  }, [recipe, allIngredients, ingredient, amt, extra, use, time, malted, type, yeastForm,
      maltLib, hopLib, yeastLib, settings]);

  // ── Same-type ingredient list (matches HTML renderModalIngList) ──
  const sameTypeIngs = useMemo(() => allIngredients.filter(i => i.type === type), [allIngredients, type]);

  // ── Save ──
  const handleSave = useCallback(() => {
    const parsedAmt = parseFloat(amt) || 0;
    let finalAmt = parsedAmt;
    let finalUnit = ingredient.unit;

    if (type === 'yeast') {
      if (yeastForm === 'dry') {
        finalUnit = 'g';
      } else {
        finalUnit = 'ml';
        finalAmt = parsedAmt * 1000;
      }
    }

    const updates: Partial<Ingredient> & Record<string, any> = {
      amt: finalAmt,
      unit: finalUnit,
      extra,
      cost: parseFloat(cost) || 0,
      notes,
    };

    if (type !== 'grain' && type !== 'yeast') {
      updates.use = use;
      updates.time = time ? parseFloat(time) : null;
    }

    if (type === 'grain') {
      updates.malted = malted;
    }

    if (type === 'yeast') {
      updates.yeastSource = yeastSource;
      updates.yeastBatch = yeastBatch;
      updates.yeastGen = yeastGen;
    }

    updateIngredient(recipeId, ingredient.id, updates);
    onClose();
  }, [
    amt, extra, use, time, cost, notes, malted, type, yeastForm, yeastSource,
    yeastBatch, yeastGen, ingredient, recipeId, updateIngredient, onClose,
  ]);

  const typeLabel = { grain: 'FERMENTABLE', hop: 'HOP', yeast: 'YEAST', misc: 'MISC', water: 'WATER' }[type] || 'INGREDIENT';
  const unitLabel = type === 'yeast' ? (yeastForm === 'dry' ? 'g' : 'L') : ingredient.unit;
  const extraLabel = type === 'hop' ? 'AA%' : type === 'grain' ? 'EBC' : type === 'yeast' ? 'Atten%' : '';

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" style={{ width: 760, maxWidth: '96vw', display: 'flex', flexDirection: 'row', overflow: 'hidden', borderRadius: 16 }} onClick={e => e.stopPropagation()}>

        {/* ═══ LEFT PANEL: Stats (pinned) + Ingredients (scrollable) ═══ */}
        <div style={{ width: 200, flexShrink: 0, background: 'var(--panel2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Stats — pinned top */}
          <div style={{ padding: '14px 14px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 10 }}>Recipe Stats</div>
            {draftStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div className="ie-stat-row"><span className="ie-stat-lbl">OG</span><span className="ie-stat-val" style={{ color: 'var(--amber)' }}>{draftStats.ogPlato > 0 ? `${draftStats.ogPlato.toFixed(2)} °P` : '—'}</span></div>
                <div className="ie-stat-row"><span className="ie-stat-lbl">FG</span><span className="ie-stat-val">{draftStats.fgPlato > 0 ? `${draftStats.fgPlato.toFixed(2)} °P` : '—'}</span></div>
                <div className="ie-stat-row"><span className="ie-stat-lbl">ABV</span><span className="ie-stat-val" style={{ color: 'var(--green)' }}>{draftStats.abv > 0 ? `${draftStats.abv.toFixed(1)}%` : '—'}</span></div>
                <div className="ie-stat-row"><span className="ie-stat-lbl">IBU</span><span className="ie-stat-val">{draftStats.ibu > 0 ? draftStats.ibu.toFixed(1) : '—'}</span></div>
                <div className="ie-stat-row"><span className="ie-stat-lbl">EBC</span><span className="ie-stat-val">{draftStats.ebc > 0 ? draftStats.ebc.toFixed(1) : '—'}</span></div>
                <div className="ie-stat-row"><span className="ie-stat-lbl">Grain</span><span className="ie-stat-val">{draftStats.totalGrainKg > 0 ? `${draftStats.totalGrainKg.toFixed(2)} kg` : '—'}</span></div>
                <div className="ie-stat-row" style={{ borderBottom: 'none' }}><span className="ie-stat-lbl">Hops</span><span className="ie-stat-val">{draftStats.totalHopG > 0 ? `${draftStats.totalHopG.toFixed(0)} g` : '—'}</span></div>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>Updates live as you edit</div>
          </div>

          {/* Ingredients of same type — scrollable bottom */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 8 }}>Ingredients</div>
            {sameTypeIngs.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No {type}s in recipe yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {sameTypeIngs.map(i => {
                  const isEditing = i.id === ingredient.id;
                  const useLabel = i.use && i.time ? `${i.use} ${i.time}m` : i.use || '';
                  return (
                    <div key={i.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, fontWeight: isEditing ? 600 : 500, color: isEditing ? 'var(--amber)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={i.name}>{i.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtAmt(i.amt, i.unit)} {i.unit}</span>
                      </div>
                      {useLabel && <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingBottom: 2 }}>{useLabel}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL: Edit Form ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 4 }}>Edit {typeLabel}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{ingredient.name}</div>
          </div>

          {/* Form body */}
          <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>

            {/* Row 1: Amount + Extra */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Amount</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={amt}
                    onChange={e => setAmt(e.target.value)}
                    min="0"
                    step="any"
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', minWidth: 20 }}>{unitLabel}</span>
                </div>
              </div>
              {extraLabel && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label>{extraLabel}</label>
                  <input type="number" value={extra} onChange={e => setExtra(e.target.value)} min="0" step="0.1" placeholder="—" />
                </div>
              )}
            </div>

            {/* Row 2: Use + Time (not for grain or yeast) */}
            {type !== 'grain' && type !== 'yeast' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Use</label>
                  <select value={use} onChange={e => setUse(e.target.value)} style={{ width: '100%' }}>
                    {(type === 'hop' ? HOP_USES : MISC_USES).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                {use !== 'cold side' && (
                  <div className="form-group" style={{ width: 90 }}>
                    <label>Time (min)</label>
                    <input type="number" value={time} onChange={e => setTime(e.target.value)} min="0" step="1" placeholder="—" />
                  </div>
                )}
              </div>
            )}

            {/* Yeast-specific fields */}
            {type === 'yeast' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Form</label>
                    <select value={yeastForm} onChange={e => { setYeastForm(e.target.value as 'dry' | 'liquid'); setAmt(''); }} style={{ width: '100%' }}>
                      <option value="dry">Dry</option>
                      <option value="liquid">Liquid</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Fresh / Harvested</label>
                    <select value={yeastSource} onChange={e => setYeastSource(e.target.value as any)} style={{ width: '100%' }}>
                      <option value="fresh">Fresh</option>
                      <option value="harvested">Harvested</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>From Brew #</label>
                    <input type="text" value={yeastBatch} onChange={e => setYeastBatch(e.target.value)} placeholder="—" style={{ width: '100%' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Generation</label>
                    <input type="number" value={yeastGen} onChange={e => setYeastGen(e.target.value)} min="1" step="1" placeholder="1" style={{ width: '100%' }} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }} />
                </div>
                <YeastCalc
                  isDry={yeastForm === 'dry'}
                  amt={parseFloat(amt) || 0}
                  batchL={recipe?.batchL || 0}
                  ogPlato={draftStats?.ogPlato || 0}
                  yeastName={ingredient.name}
                  yeastLib={yeastLib}
                />
              </div>
            )}

            {/* Row 3: Price + Malted + Notes */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Price (¥/pkg)</label>
                <input type="number" value={cost} onChange={e => setCost(e.target.value)} min="0" step="1" placeholder="0" />
              </div>
              {type === 'grain' && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Malted</label>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
                    <input type="checkbox" checked={malted} onChange={e => setMalted(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--amber)' }} />
                  </div>
                </div>
              )}
              <div className="form-group" style={{ flex: 2 }}>
                <label>Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="—" style={{ width: '100%' }} />
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Yeast calculator (matches HTML updateIngEditYeastCalc) ──
function YeastCalc({ isDry, amt, batchL, ogPlato, yeastName, yeastLib }: {
  isDry: boolean; amt: number; batchL: number; ogPlato: number; yeastName: string; yeastLib: any[];
}) {
  const fmtB = (v: number) => !isFinite(v) ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} T` : `${v.toFixed(1)} B`;

  const libEntry = yeastLib.find((e: any) => (e.name || '').toLowerCase() === (yeastName || '').toLowerCase());

  let needed: string, available: string, delta: string, deltaColor: string;

  if (isDry) {
    const rateGl = libEntry?.pitch_rate ? parseFloat(libEntry.pitch_rate) : 0.75;
    const neededG = rateGl * batchL;
    const availG = amt;
    const diff = availG - neededG;
    needed = `${neededG.toFixed(0)} g  (~${fmtB(neededG * 10)})`;
    available = amt > 0 ? `${availG.toFixed(0)} g  (~${fmtB(availG * 10)})` : '—';
    delta = isFinite(diff) && amt > 0 ? `${diff >= 0 ? '+' : ''}${diff.toFixed(0)} g` : '—';
    deltaColor = diff >= 0 ? 'var(--amber-bright)' : '#c03030';
  } else {
    const neededB = 0.75 * batchL * 1000 * (ogPlato || 12) / 1e3;
    const availB = amt > 0 ? amt * 1000 * 1.0 : NaN;
    const diff = isFinite(availB) ? availB - neededB : NaN;
    needed = fmtB(neededB);
    available = isFinite(availB) ? fmtB(availB) : '—';
    delta = isFinite(diff) ? `${diff >= 0 ? '+' : ''}${fmtB(Math.abs(diff))}` : '—';
    deltaColor = isFinite(diff) ? (diff >= 0 ? 'var(--amber-bright)' : '#c03030') : '';
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="ie-stat-row"><span className="ie-stat-lbl">{isDry ? 'Needed (g)' : 'Cells Needed (B)'}</span><span className="ie-stat-val" style={{ color: 'var(--amber)' }}>{needed}</span></div>
      <div className="ie-stat-row"><span className="ie-stat-lbl">{isDry ? 'Available (g)' : 'Cells Available (B)'}</span><span className="ie-stat-val" style={{ color: 'var(--amber)' }}>{available}</span></div>
      <div className="ie-stat-row" style={{ borderBottom: 'none' }}><span className="ie-stat-lbl">Over/Under</span><span className="ie-stat-val" style={{ color: deltaColor }}>{delta}</span></div>
    </div>
  );
}
