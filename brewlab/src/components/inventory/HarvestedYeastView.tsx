/**
 * Harvested Yeast view — port of brewlab-desktop.html lines 12853–12907
 * (renderHarvestedYeast).
 *
 * One section per strain. Each section shows:
 *   • Strain header — name, current generation, current balance.
 *   • + Log Harvest button (opens HarvestYeastModal pre-filled for this strain).
 *   • − Log Use     button (opens UseHarvestedYeastModal for this strain).
 *   • Table — Date · Got (L) · Used (L) · Beer · Have (L) · Harvest Date ·
 *     Harvested From · Gen · ✕ delete-row.
 *
 * Storage shape: HarvestedYeast (strain-keyed dict — see types/index.ts).
 * Rows: { date, got?, used?, beer?, harvestDate?, harvestedFrom?, generation?, container? }.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import HarvestYeastModal from './HarvestYeastModal';
import UseHarvestedYeastModal from './UseHarvestedYeastModal';

/**
 * Render a "TAX — Beer" composite when both fields are set; fall back
 * to whichever single value exists. Both inputs may be comma-separated
 * lists (a harvest entry that's been pulled into multiple brews
 * accumulates parallel comma-joined lists for `beer` and `taxBatch`);
 * we zip the two lists by index so each pair renders as "TAX — Beer".
 *
 * Legacy entries lack the secondary field — `formatPair('','Hazy IPA')`
 * → `'Hazy IPA'`, `formatPair('ABC-23','')` → `'ABC-23'`. The single
 * value renders as-is, no separator.
 */
function formatPair(taxStr: string | undefined, beerStr: string | undefined): string {
  const tax  = (taxStr  ?? '').trim();
  const beer = (beerStr ?? '').trim();
  if (!tax && !beer) return '—';
  if (!tax)  return beer;
  if (!beer) return tax;
  const taxParts  = tax.split(',').map(s => s.trim());
  const beerParts = beer.split(',').map(s => s.trim());
  const n = Math.max(taxParts.length, beerParts.length);
  const pairs: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = taxParts[i]  ?? '';
    const b = beerParts[i] ?? '';
    if (t && b) pairs.push(`${t} — ${b}`);
    else if (t) pairs.push(t);
    else if (b) pairs.push(b);
  }
  return pairs.join(', ');
}

export default function HarvestedYeastView() {
  const harvestedYeast    = useStore(s => s.harvestedYeast);
  const setHarvestedYeast = useStore(s => s.setHarvestedYeast);
  const pushToast         = useStore(s => s.pushToast);
  // Yeast entries reference brews by recipeId. When the source recipe has
  // been deleted, mark the row inline so a brewer knows why the Beer column
  // doesn't link anywhere — but keep the entry visible (the harvested yeast
  // is real even if the recipe row is gone).
  const recipes = useStore(s => s.recipes);
  const recipeIdSet = useMemo(() => new Set(recipes.map(r => r.id)), [recipes]);
  const isRecipeDeleted = (recipeId: string | undefined): boolean =>
    !!recipeId && !recipeIdSet.has(recipeId);

  const [logHarvestStrain, setLogHarvestStrain] = useState<string | null>(null);
  const [logUseStrain, setLogUseStrain]         = useState<string | null>(null);

  const strains = Object.keys(harvestedYeast);

  const balanceOf = (strain: string): number => {
    const entries = harvestedYeast[strain]?.entries ?? [];
    return entries.reduce(
      (s, e) => s + (Number(e.got) || 0) - (Number(e.used) || 0),
      0,
    );
  };

  const deleteRow = (strain: string, idx: number) => {
    if (!window.confirm('Delete this harvested yeast entry?')) return;
    const sd = harvestedYeast[strain];
    if (!sd) return;
    // Snapshot the FULL harvestedYeast dict — undo restores the strain
    // entry AND the strain itself if removing the last entry orphaned it.
    const before = harvestedYeast;
    const next = { ...harvestedYeast };
    next[strain] = { ...sd, entries: sd.entries.filter((_, i) => i !== idx) };
    if (next[strain].entries.length === 0) delete next[strain];
    setHarvestedYeast(next);
    pushToast({
      message: 'Deleted yeast entry',
      undo: () => setHarvestedYeast(before),
    });
  };

  if (strains.length === 0) {
    return (
      <>
        <div style={emptyStyle}>
          No harvested yeast recorded yet — use the 🧫 Log Harvest button on the Fermentation tab.
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <button className="btn primary" onClick={() => setLogHarvestStrain('')}>
            🧫 Log Harvest
          </button>
        </div>
        {logHarvestStrain != null && (
          <HarvestYeastModal
            initialStrain={logHarvestStrain || ''}
            onClose={() => setLogHarvestStrain(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div style={containerStyle}>
        {strains.map(strain => {
          const sd = harvestedYeast[strain];
          const entries = sd.entries ?? [];
          const balance = balanceOf(strain);
          // Running balance row-by-row.
          let running = 0;
          const rows = entries.map((e, i) => {
            running += (Number(e.got) || 0) - (Number(e.used) || 0);
            return { e, i, running };
          });
          return (
            <div key={strain}>
              <div style={strainHeaderStyle}>
                <span style={strainNameStyle}>{strain.toUpperCase()}</span>
                <span style={generationStyle}>Gen {sd.generation || 1}</span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 11,
                  color: balance > 0 ? 'var(--amber)' : 'var(--red)',
                }}>{balance.toFixed(1)} L in stock</span>
                <button
                  className="btn sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setLogHarvestStrain(strain)}
                >+ Log Harvest</button>
                <button
                  className="btn sm"
                  onClick={() => setLogUseStrain(strain)}
                >− Log Use</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Date', 'Got (L)', 'Used (L)', 'Used In', 'Have (L)', 'Harvest Date', 'From Tax Batch #', 'Gen', ''].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ e, i, running }) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{e.date || '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--amber)' }}>
                          {Number(e.got) > 0 ? Number(e.got).toFixed(1) : ''}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-muted)' }}>
                          {Number(e.used) > 0 ? Number(e.used).toFixed(1) : ''}
                        </td>
                        <td
                          style={tdStyle}
                          title={isRecipeDeleted(e.recipeId) ? 'Source recipe was deleted' : undefined}
                        >
                          {formatPair(e.taxBatch, e.beer)}
                          {isRecipeDeleted(e.recipeId) ? ' (recipe deleted)' : ''}
                        </td>
                        <td style={{
                          ...tdStyle, textAlign: 'right',
                          color: running > 0 ? 'var(--amber)' : 'var(--text)',
                        }}>{running.toFixed(1)}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{e.harvestDate || '—'}</td>
                        <td style={tdStyle}>{formatPair(e.harvestedFromTaxBatch, e.harvestedFrom)}</td>
                        <td style={tdStyle}>{e.generation || '—'}</td>
                        <td style={{ ...tdStyle, padding: '4px 6px' }}>
                          <button
                            className="btn sm"
                            style={{ color: 'var(--red)', borderColor: 'var(--red)', padding: '1px 6px' }}
                            onClick={() => deleteRow(strain, i)}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {logHarvestStrain != null && (
        <HarvestYeastModal
          initialStrain={logHarvestStrain}
          onClose={() => setLogHarvestStrain(null)}
        />
      )}
      {logUseStrain != null && (
        <UseHarvestedYeastModal
          strain={logUseStrain}
          onClose={() => setLogUseStrain(null)}
        />
      )}
    </>
  );
}

const containerStyle: React.CSSProperties = {
  flex: 1, padding: 16, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 20,
};

const emptyStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)',
  textAlign: 'center', padding: 40,
};

const strainHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8,
};

const strainNameStyle: React.CSSProperties = {
  fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--amber)',
};

const generationStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
};

const thStyle: React.CSSProperties = {
  padding: '5px 8px', textAlign: 'left',
  borderBottom: '2px solid var(--border2)',
  color: 'var(--text-muted)', fontSize: 8, letterSpacing: 1,
  whiteSpace: 'nowrap', fontFamily: 'var(--mono)',
};

const tdStyle: React.CSSProperties = {
  padding: '4px 8px', borderBottom: '1px solid var(--border)',
  fontSize: 10, fontFamily: 'var(--mono)',
};
