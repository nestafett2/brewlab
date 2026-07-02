// One-off generator for fake-monthly-report-data.json — a backup fixture
// used to smoke-test the Monthly Packaging Report print path on the Tax
// Master Total sub-tab. Run once with `node scripts/gen-fake-monthly-report-data.mjs`
// from the brewlab/ directory. Output lands at ../fake-monthly-report-data.json
// (project root).
//
// snap-* fields are populated directly — this fixture bypasses buildSnapshot
// intentionally. The numbers are internally consistent (totals derived from
// per-component values) so the print output looks plausible.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', '..', 'fake-monthly-report-data.json');

const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;
const pct   = (num, den) => den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

// ── 8 fake brews ───────────────────────────────────────────────────────
// Distribution chosen to exercise the per-month Beer/Happoshu sidebar
// split AND the all-Beer (no-split) case AND the unscheduled section:
//   • Feb 2026 packaged: r1 (Beer) + r2 (Happoshu)
//   • Mar 2026 packaged: r4 (Beer) + r5 (Happoshu)
//   • Apr 2026 packaged: r7 (Beer) + r8 (Beer, outlier waste)
//   • Unscheduled:       r3 (Beer) + r6 (Beer)
// 8 brews total · 6 Beer + 2 Happoshu · both Happoshu in different
// packaged months · April is Beer-only · 2 unscheduled both Beer.
//
// Brew-date distribution is preserved from the previous fixture (3 in
// Feb, 3 in Mar, 2 in Apr) — only the per-slot beerName + style +
// classification flips relative to r2/r3 and r5/r6.

const brews = [
  {
    id: 'r1', name: '432', beerName: '菫 / Sumire',         style: 'Witbier',         classification: 'Beer',
    brewDate: '2026-02-03', batchL: 1000,
    intoFV: 980, intoBT: 945, yeastHarvest: 25,
    canSizeMl: 350, cans: 1400, canWasteManual: 1.0, flowmeterWaste: 2.0,
    kegs15: 25, kegs10: 10, kegWaste: 2.0,
    pkgDate: '2026-02-22', btMm: '850', transferInto: 'BT1',
  },
  {
    id: 'r2', name: '433', beerName: '氷月 Happo / Hyo-getsu', style: 'Hazy Happoshu', classification: 'Happoshu',
    brewDate: '2026-02-10', batchL: 1000,
    intoFV: 985, intoBT: 948, yeastHarvest: 22,
    canSizeMl: 350, cans: 1100, canWasteManual: 0.5, flowmeterWaste: 3.0,
    kegs15: 30, kegs10: 5, kegWaste: 1.5,
    pkgDate: '2026-02-26', btMm: '870', transferInto: 'BT2',
  },
  {
    id: 'r3', name: '434', beerName: '桜セゾン / Sakura Saison', style: 'Saison', classification: 'Beer',
    brewDate: '2026-02-17', batchL: 1000,
    intoFV: 975, intoBT: 940, yeastHarvest: 20,
    canSizeMl: 350, cans: 1200, canWasteManual: 1.0, flowmeterWaste: 4.0,
    kegs15: 28, kegs10: 8, kegWaste: 2.0,
    pkgDate: '',  // ← unscheduled
    btMm: '855', transferInto: 'BT1',
  },
  {
    id: 'r4', name: '435', beerName: '雷 IPA / Kaminari',     style: 'West Coast IPA', classification: 'Beer',
    brewDate: '2026-03-02', batchL: 1100,
    intoFV: 1080, intoBT: 1040, yeastHarvest: 25,
    canSizeMl: 500, cans: 1000, canWasteManual: 2.0, flowmeterWaste: 5.0,
    kegs15: 32, kegs10: 5, kegWaste: 3.0,
    pkgDate: '2026-03-25', btMm: '920', transferInto: 'BT2',
  },
  {
    id: 'r5', name: '436', beerName: '秋柚子 / Aki Yuzu', style: 'Yuzu Saison', classification: 'Happoshu',
    brewDate: '2026-03-09', batchL: 1000,
    intoFV: 985, intoBT: 945, yeastHarvest: 28,
    canSizeMl: 350, cans: 1300, canWasteManual: 1.5, flowmeterWaste: 3.5,
    kegs15: 28, kegs10: 6, kegWaste: 2.0,
    pkgDate: '2026-03-30', btMm: '880', transferInto: 'BT1',
  },
  {
    id: 'r6', name: '437', beerName: '月見 / Tsukimi', style: 'Hazy DIPA', classification: 'Beer',
    brewDate: '2026-03-16', batchL: 900,
    intoFV: 885, intoBT: 850, yeastHarvest: 20,
    canSizeMl: 350, cans: 1050, canWasteManual: 1.0, flowmeterWaste: 3.0,
    kegs15: 25, kegs10: 4, kegWaste: 2.0,
    pkgDate: '',  // ← unscheduled
    btMm: '835', transferInto: 'BT2',
  },
  {
    id: 'r7', name: '438', beerName: '灯 Pale / Akari',        style: 'American Pale Ale', classification: 'Beer',
    brewDate: '2026-04-06', batchL: 1000,
    intoFV: 980, intoBT: 950, yeastHarvest: 22,
    canSizeMl: 350, cans: 1500, canWasteManual: 1.5, flowmeterWaste: 2.5,
    kegs15: 27, kegs10: 4, kegWaste: 1.5,
    pkgDate: '2026-04-28', btMm: '885', transferInto: 'BT1',
  },
  {
    id: 'r8', name: '439', beerName: '五郎 Pilsner / Goro',    style: 'German Pilsner', classification: 'Beer',
    brewDate: '2026-04-13', batchL: 1000,
    // Outlier waste — 5%+ FV→BT loss
    intoFV: 970, intoBT: 900, yeastHarvest: 18,
    canSizeMl: 350, cans: 1100, canWasteManual: 3.0, flowmeterWaste: 8.0,
    kegs15: 22, kegs10: 6, kegWaste: 4.0,
    pkgDate: '2026-04-30', btMm: '825', transferInto: 'BT2',
  },
];

// ── Build derived fixtures ─────────────────────────────────────────────

const recipes = brews.map((b) => ({
  id: b.id,
  lineageId: b.id,
  name: b.name,
  beerName: b.beerName,
  style: b.style,
  styleKey: '',
  folder: '',
  batchL: b.batchL,
  classification: b.classification,
  brewDate: b.brewDate,
  taxBatch: b.name,
  brewNumber: 1,
  version: '1.0',
  versionNote: '',
  locked: false,
  rating: 0,
  brewAgain: null,
  cost: 0,
  abv: 5.0,
  ibu: 30,
  ebc: 10,
  ogPlato: 12.0,
  fgPlato: 2.5,
  bhEff: 75,
  boilTime: 60,
  whirlpoolTemp: 80,
  bdFv: '',
  notes: '',
  archivedAt: null,
}));

const taxMaster = brews.map((b) => {
  const sellCanL = round3(b.cans * b.canSizeMl / 1000);
  const sellKegL = round1(b.kegs15 * 15 + b.kegs10 * 10);
  const sellTotal = round1(sellCanL + sellKegL);
  const totalCanWaste = round3(b.canWasteManual + b.flowmeterWaste);
  const fvBtWaste = round1(Math.max(0, b.intoFV - b.intoBT - b.yeastHarvest));
  const utWaste = 0; // transferYes=true → ut waste 0
  const totalWastePkg = round3(b.kegWaste + totalCanWaste + utWaste);
  const totalWaste = round1(fvBtWaste + totalWastePkg);

  return {
    recipeId: b.id,
    recordedAt: new Date('2026-05-01T00:00:00Z').toISOString(),
    date: b.brewDate,
    'brew-num': b.name,
    'recipe-name': b.name,
    'beer-name': b.beerName,
    classification: b.classification,
    class: b.classification,
    'in-fv': String(b.intoFV),
    // ── Snap-* ──
    'snap-into-bt':          b.intoBT,
    'snap-yeast-harvest':    b.yeastHarvest,
    'snap-can-size-ml':      b.canSizeMl,
    'snap-cans':             b.cans,
    'snap-sell-can-l':       sellCanL,
    'snap-can-waste-manual': b.canWasteManual,
    'snap-flowmeter':        b.flowmeterWaste + sellCanL + b.canWasteManual,
    'snap-flowmeter-waste':  round1(b.flowmeterWaste),
    'snap-total-can-waste':  totalCanWaste,
    'snap-keg-rows':         [
      { size: '15', qty: String(b.kegs15) },
      { size: '10', qty: String(b.kegs10) },
    ],
    'snap-sell-keg-l':       sellKegL,
    'snap-kegs-15':          b.kegs15,
    'snap-kegs-10':          b.kegs10,
    'snap-keg-waste':        b.kegWaste,
    'snap-transfer-yes':     true,
    'snap-ut-waste':         utWaste,
    'snap-fv-bt-waste':      fvBtWaste,
    'snap-fv-bt-pct':        pct(fvBtWaste, b.intoFV),
    'snap-total-waste-pkg':  totalWastePkg,
    'snap-total-waste':      totalWaste,
    'snap-sell-total':       sellTotal,
    'snap-pkg-date':         b.pkgDate,
    'snap-transfer-into':    b.transferInto,
    'snap-bt-mm':            b.btMm,
    'snap-pct-can-waste':    pct(totalCanWaste, sellCanL),
    'snap-pct-pkg-waste':    pct(totalWastePkg, sellTotal),
    'snap-pct-total':        pct(totalWaste, b.intoFV),
  };
});

// Per-recipe cold-side blob — mirrors what buildSnapshot would have read
// from. Lets any future live-recompute path (Tax tab Update from Recipe)
// still find sane data even though the snap-* fields are the canonical
// source for the Total sub-tab.
const coldByRecipe = {};
for (const b of brews) {
  coldByRecipe[b.id] = {
    'cs-transfer':        'Yes',
    'cs-transfer-date':   b.pkgDate || b.brewDate,
    'cs-bt-vessel':       b.transferInto,
    'cs-mm-reading':      b.btMm,
    'cs-yeast-harvested': String(b.yeastHarvest),
    'cs-liters-bt-saved': b.intoBT,
    'cs-keg-date':        b.pkgDate,
    'cs-can-date':        b.pkgDate,
    'cs-can-size':        String(b.canSizeMl),
    'cs-cans':            String(b.cans),
    'cs-flowmeter':       String(round1(b.flowmeterWaste + (b.cans * b.canSizeMl / 1000) + b.canWasteManual)),
    'cs-can-waste-manual': String(b.canWasteManual),
    'cs-keg-waste':       String(b.kegWaste),
    'cs-keg-rows': [
      { size: '15', qty: String(b.kegs15) },
      { size: '10', qty: String(b.kegs10) },
    ],
    'cs-fg':              '2.5',
    'cs-ph':              '4.4',
    'cs-process-notes':   '',
    'cs-tasting-notes':   '',
    'cs-changes-notes':   '',
    'cs-analysis-notes':  '',
  };
}

// Minimal settings — credentials get scrubbed at restoreBackup time anyway,
// but include them so the restore path's "credentialsCleared" flag flips
// (cosmetic — surfaces the post-restore toast message correctly).
const settings = {
  breweryName: 'Nomodachi (fixture)',
  sbUrl: '',
  sbAnonKey: '',
  units: 'metric',
  ibuMethod: 'tinseth',
  whirlpoolTemp: 80,
  mashHopAdj: 100,
  leafHopAdj: 100,
  largeBatchUtil: 100,
  grainAbsorb: 0.75,
  coolingShrinkage: 4,
  defaultGrainTemp: 20,
};

// ── Assemble backup ────────────────────────────────────────────────────

const data = {
  bl_brew_settings: JSON.stringify(settings),
  bl_recipes:       JSON.stringify(recipes),
  bl_tax_master:    JSON.stringify(taxMaster),
};
for (const id of Object.keys(coldByRecipe)) {
  data['bl_cold_' + id] = JSON.stringify(coldByRecipe[id]);
}

const backup = {
  exportedAt: new Date().toISOString(),
  version: 1,
  appVersion: null,
  data,
};

writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf8');
console.log('Wrote', outPath);
console.log('Keys:', Object.keys(data).length, '(', Object.keys(data).join(', '), ')');
console.log('Brews:', brews.length);
