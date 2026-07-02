/**
 * Shared formatter for harvested-yeast brew references.
 *
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
export function formatPair(taxStr: string | undefined, beerStr: string | undefined): string {
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
