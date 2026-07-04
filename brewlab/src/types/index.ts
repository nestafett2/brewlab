// BrewLab Type Definitions — derived from SCHEMA.md

// === Recipe ===

export type Classification = 'Beer' | 'Happoshu';
export type BrewAgain = 'yes' | 'tweaks' | 'no' | '';
// Distinct from BrewAgain (cold-side): the recipes.brew_again column only
// accepts these three values. See SCHEMA.md.
export type RecipeBrewAgain = 'yes' | 'no' | 'maybe' | null;
// 'water' is a first-class ingredient type for water adjustments stored
// alongside the recipe. The HTML treats it as separate from misc and
// excludes it from tax misc totals — see SCHEMA.md and CLAUDE.md
// "Water Chemistry — Tax Exclusion Rules".
export type IngredientType = 'grain' | 'hop' | 'yeast' | 'misc' | 'water';
export type HopUse = 'mash' | 'boil' | 'whirlpool' | 'dry hop' | 'first wort' | 'flameout';
export type IbuMethod = 'tinseth' | 'rager' | 'daniels';
export type RecipeOrigin = 'own' | 'collab' | 'oem' | null;

export interface Recipe {
  id: string;                  // e.g. 'r1'
  lineageId: string;
  name: string;                // tax identifier (shikomi symbol)
  beerName: string;            // display/brand name
  style: string;
  styleKey: string;
  folder: string;              // folder_id
  batchL: number;
  classification: Classification;
  brewDate: string;            // ISO date
  /**
   * Brewery-wide manual NTA tax serial — free text, brewery-wide UNIQUE.
   * Renamed from `brewNum` in the Option C cleanup (2026-05-06):
   *   • Was confusing because "brew num" sounds like a per-lineage
   *     sequential counter (HTML's `r.batchNumber`), but this field is
   *     actually the tax-office serial number ("384"-style values).
   *   • The per-lineage counter now lives on `brewNumber` (separate
   *     field, distinct semantics).
   * Maps to Supabase column `recipes.tax_batch` (renamed from `brew_num`
   * in migrations/2026-05-06_rename_brew_num_to_tax_batch_and_add_brew_number.sql).
   */
  taxBatch: string;
  /**
   * Per-lineage sequential brew counter. Auto-incremented by the
   * "+ New Brew" action: max(brewNumber) over the lineage, plus one.
   * Distinct from `taxBatch`; no unique constraint (two different
   * lineages can both have brewNumber=1). Maps to Supabase column
   * `recipes.brew_number`. Optional — null on un-numbered legacy rows.
   */
  brewNumber?: number;
  version: string;
  versionNote: string;
  locked: boolean;
  rating: number;              // 1-5
  brewAgain: RecipeBrewAgain;
  cost: number;
  abv: number;
  ibu: number;
  ebc: number;
  ogPlato: number;
  fgPlato: number;
  bhEff: number;               // brewhouse efficiency %
  boilTime: number;            // boil time in minutes
  whirlpoolTemp: number;       // whirlpool temp °C
  bdFv: string;                // assigned FV id
  notes: string;
  /**
   * Free-text "Extra additions" — printed on the Prep Sheet under its own
   * section when non-empty. Distinct from `notes` (which the brewer uses
   * as a long-form recipe-design log). Round-trips through Supabase via
   * the `recipes.extra_additions` column (added 2026-05-12).
   */
  extraAdditions: string;
  /**
   * Per-recipe brewer name. Surfaced as the "Brewer" field in the Prep
   * Sheet and Brew Day Sheet header stats; falls back to
   * settings.breweryName when empty, then to "—". Round-trips through
   * Supabase via the `recipes.brewer` column (added 2026-05-12).
   */
  brewer: string;
  /**
   * Recipe origin classification — Own Brand, Collab, or OEM.
   * `null` means unclassified (most recipes). `oemFor` holds the
   * partner name when origin is 'collab' or 'oem'.
   */
  recipeOrigin?: RecipeOrigin;
  /** Partner brewery/brand name for OEM and Collab recipes. */
  oemFor?: string;
  /** Recipe-level pitch temp default (°C). Pre-fills bd.pitchTemp on Brew Day tab when that field is empty. Overrideable on Brew Day. */
  recipePitchTemp?: number;
  /** Recipe-level ferm temp default (°C). Pre-fills bd.fermTemp on Brew Day tab when that field is empty. Overrideable on Brew Day. */
  recipeFermTemp?: number;
  /** Recipe-level O₂ flow rate default (LPM). Pre-fills bd.o2Lpm on Brew Day tab when that field is empty. Overrideable on Brew Day. */
  recipeO2Lpm?: number;
  /** Recipe-level O₂ time default (min). Pre-fills bd.o2Time on Brew Day tab when that field is empty. Overrideable on Brew Day. */
  recipeO2Time?: number;
  /** Target finish pH after dry-hop. Pre-fills ferm_meta['target-post-dh-ph'] when that field is empty. Overrideable on Ferm tab. */
  targetFinishPh?: number;
  /** Planned carbonation (vols). Pre-fills cold_side['cs-carb-planned'] when that field is empty. Overrideable on Packaging tab. */
  plannedCarb?: number;
  /**
   * Vestigial column (Supabase `recipes.archived_at`, renamed from
   * `deleted_at` on 2026-05-07 — see migrations/). The two-tier
   * archive/delete model was reverted before shipping; the simplified
   * model is hard-delete only (see store hardDeleteRecipe). This field
   * stays NULL on every recipe and no code path sets it. Round-trips via
   * recipeToRow / rowToRecipe so the DB column doesn't drift, but it can
   * be removed from the schema in a future migration if desired.
   */
  archivedAt: string | null;
}

export interface Ingredient {
  id: string;                  // recipeId + '_' + index
  type: IngredientType;
  name: string;
  amt: number;
  unit: string;
  use: string;
  time: number | null;
  extra: string;               // AA% for hops, atten% for yeast, EBC for grains
  ibu: number | null;
  pct: number | null;          // grain bill %
  libId: string;
  cost: number;
  sortOrder: number;
  // Grains only. Cached from MaltLib.malted at add-from-library time. Tax
  // tab's pullIngredientTotals reads this (HTML brewlab-desktop.html:8472):
  // malted grain → `malt` bucket, unmalted → wheat/oats/other by name regex.
  // `undefined` is treated as `true` to match HTML (`g.malted !== false`).
  malted?: boolean;
  // Dry-hop split: per-slot grams for hops with use='dry hop'. Sparse —
  // keys present only for slots with a non-zero amount. Matches HTML
  // (brewlab-desktop.html:19660) and is consumed by DryHopModal at Ferm
  // time. Local-only — same as libId, never written to recipe_ingredients
  // by ingToRow / sbDispatch (HTML's sbSyncIngredients line 6617 also
  // omits it).
  dhSplit?: DhSplit;
}

/**
 * Dry-hop split shape on Ingredient.dhSplit. Numeric slot keys 1/2/3 map
 * 1:1 onto the Ferm tab's DH1/DH2/DH3 cards. Values are grams regardless
 * of the hop's recipe unit (kg vs g) — the modal converts on display.
 * Sparse: a key is present only if the slot has > 0 grams assigned.
 */
export interface DhSplit {
  1?: number;
  2?: number;
  3?: number;
}

// === Fermentation ===

export interface FermLogEntry {
  id: string;                  // crypto.randomUUID()
  date: string;                // ISO date
  plato: number | null;
  ph: number | null;
  temp: number | null;
  notes: string;
}

/**
 * Recipe template — snapshot of a recipe's ingredients + design fields,
 * reusable as a starting point for new recipes. Mirrors HTML's
 * `bl_templates` array (brewlab-desktop.html:5119–5150) with two
 * deliberate divergences from the HTML shape:
 *   • `batchL` instead of HTML's `batchSize` and `bhEff` instead of `bheff`
 *     — matches React's Recipe field naming so the create-from-template
 *     mapping is direct.
 *   • `mashTemp` / `mashTime` dropped — React's Recipe doesn't have flat
 *     mash fields (they live in the per-recipe Mash Profile blob), and
 *     templates aren't expected to inherit a Mash Profile. The Tariff
 *     Annual Planner (the upcoming consumer of `templateId`) only needs
 *     batchL anyway.
 */
export interface Template {
  id: string;             // 'tpl<ts>'
  name: string;
  style: string;
  styleKey: string;
  batchL: number;
  bhEff: number;
  boilTime: number;
  ingredients: Ingredient[];
  savedAt: string;        // ISO
}

// === Tariff Reduction (関税割当) ===

/**
 * Per-fiscal-year Tariff Reduction blob, persisted at `bl_tariff_<year>`.
 * Mirrors HTML brewlab-desktop.html:8910 with two deliberate trims:
 *   • `orders` field dropped — HTML wrote it as `[]` but never read or
 *     populated it (dead-on-write, see calcReservationBalances which
 *     reads `data.orders` but no UI ever calls it).
 *   • `defaultBatchL` made optional explicit string — HTML stored
 *     whatever the user typed in the "Default Batch Size" input.
 */
export interface TariffData {
  /** Annual-planner rows — one row per planned brew. */
  planner: TariffPlanRow[];
  /** Reservations made with suppliers — each holds a list of malts. */
  reservations: TariffReservation[];
  /** Pre-fills new planner rows' batchL field. Persisted as a string
   *  to match HTML behaviour. */
  defaultBatchL?: string;
  /** 需給表 monthly ledger overrides + report-block layout. */
  neekyuu?: NeekyuuData;
}

export interface TariffPlanRow {
  /** Three-letter month label, Apr..Mar. */
  month: string;
  /** Template id ('tpl<ts>') or empty if unselected. */
  templateId: string;
  /** Batch size in litres — string to allow partial input mid-edit. */
  batchL: string;
  /** Lower-case 'beer' | 'happoshu' (matches HTML wire format — note this
   *  diverges from Classification ('Beer' | 'Happoshu') used elsewhere
   *  because the Tariff page predates the case-sensitive classification
   *  cleanup). Calc helpers handle the normalisation. */
  classification: 'beer' | 'happoshu';
}

export interface TariffReservation {
  supplier: string;
  dateSent: string;       // YYYY-MM-DD or empty
  dateReceived: string;   // YYYY-MM-DD or empty
  status: 'pending' | 'received';
  notes: string;
  malts: TariffReservationMalt[];
}

export interface TariffReservationMalt {
  /** Malt name (matches `MaltLib.name`). */
  malt: string;
  /** Strings to allow partial input. */
  kgReserved: string;
  kgReceived?: string;
  // Note: HTML also stored a `tariff` flag here, but it was dead-on-write
  // (only updateTariffResMalt set it; nothing read it). Calc helpers
  // re-derive the TRQ flag from the malt library at call time.
}

export interface NeekyuuData {
  /** Starting malt balance for the FY in kg, persisted as a string. */
  openingStock?: string;
  /** Per-month manual override map keyed "YYYY-MM" → field overrides. */
  overrides?: Record<string, MonthOverride>;
  /** User-editable report-block layout (8 default blocks seeded from
   *  the NTA template — see seedNeekyuuBlocks in lib/tariff.ts). */
  reportBlocks?: NeekyuuBlock[];
}

export interface MonthOverride {
  purchTrq?: string;
  purchStd?: string;
  usageBeer?: string;
  usageHap?: string;
  beerKL?: string;
  hapKL?: string;
}

export interface NeekyuuBlock {
  /** User-facing label e.g. "2025.april~2025.september". */
  label: string;
  /** Block flavour — 'malt' shows TRQ/Std/Total in kg; 'production' shows
   *  Beer/Hap kL output. */
  type: 'malt' | 'production';
  /** "YYYY-MM" inclusive start. */
  from: string;
  /** "YYYY-MM" inclusive end. */
  to: string;
}

/** Aggregated malt usage map returned by calcMaltUsageFromMaster /
 *  calcPlannedMaltUsage. */
export type MaltUsageMap = Record<string, MaltUsageEntry>;
export interface MaltUsageEntry {
  beer: number;
  happoshu: number;
  total: number;
  tariff: boolean;
}

/** One row in the Needyuu Hyo monthly ledger. Output of buildMonthlyLedger. */
export interface NeekyuuMonthRow {
  /** "YYYY-MM" — the calendar month identity. */
  ms: string;
  /** Display label e.g. "Apr 2026". */
  label: string;
  /** Month is fully past (<= current month). Past months get auto-fill;
   *  future months get manual-edit inputs. */
  isPast: boolean;
  openStock: number;
  purchTrq: number;
  purchStd: number;
  usageBeer: number;
  usageHap: number;
  beerKL: number;
  hapKL: number;
  /** Sum of purchTrq + purchStd for convenience. */
  purch: number;
  /** Sum of usageBeer + usageHap for convenience. */
  usage: number;
  /** Closing stock = openStock + purch - usage. */
  closeStock: number;
}

/**
 * FermMeta — flat blob mirroring brewlab-desktop.html's saveFermMeta output
 * (line 19230). Keys are dashed strings to match HTML exactly so old blobs
 * load without migration. All values optional; the component fills fields
 * as the user types.
 */
export interface DryHopExtraHop { name: string; amt: string; }
export interface DryHopAdjunct  { name: string; amt: string; unit: string; }

export interface FermMeta {
  // Dry hop slot 1
  'dh1-date'?: string;
  'dh1-temp'?: string;
  'dh1-notes'?: string;
  'dh1-recorded'?: string;                    // ISO date when "Record to Inventory" fired
  'dh1-amounts'?: Record<string, string>;     // hopId → grams entered
  'dh1-extra-hops'?: DryHopExtraHop[];
  'dh1-adjuncts'?: DryHopAdjunct[];

  // Dry hop slot 2
  'dh2-date'?: string;
  'dh2-temp'?: string;
  'dh2-notes'?: string;
  'dh2-recorded'?: string;
  'dh2-amounts'?: Record<string, string>;
  'dh2-extra-hops'?: DryHopExtraHop[];
  'dh2-adjuncts'?: DryHopAdjunct[];

  // Dry hop slot 3
  'dh3-date'?: string;
  'dh3-temp'?: string;
  'dh3-notes'?: string;
  'dh3-recorded'?: string;
  'dh3-amounts'?: Record<string, string>;
  'dh3-extra-hops'?: DryHopExtraHop[];
  'dh3-adjuncts'?: DryHopAdjunct[];

  // Harvest section
  'harvest-amt'?:  string;
  'harvest-cont'?: string;

  // Carbonation (vols)
  carbonation?: string;

  // Dry-hop pH prediction inputs (Ferm tab card)
  'target-post-dh-ph'?:  string;          // user's target final pH after DH (default 4.3 in UI)
  'current-post-dh-ph'?: string;          // optional: measured beer pH after DH for correction
  'post-dh-acid-type'?:  'lactic' | 'phosphoric';   // dropdown — falls back to recipe water-chem acidType, then 'lactic'
  'dh-temp-c'?:          string;          // DH temperature in °C; feeds janishCoefficientForTemp (default 12 → 0.025)

  // Drives "active brew" / "Packaged" status. Set by the Checklist tab's
  // Complete & Archive toggle (not yet ported); preserved across saves.
  packaged?: boolean;
}

// === Brew Day ===

/**
 * BrewDayData — flat blob mirroring brewlab-desktop.html's saveBdData output
 * (line 8018+). Every value is the raw user-entered string (preserves
 * partial entries like "0." mid-typing) or a cached computed display string.
 *
 * All fields optional. Old blobs from the HTML app load as-is — no migration.
 */
export interface BrewDayData {
  // Mash readings — 5 readings + 1 pre-trans column × Time/Temp/pH/Gravity
  mashReadings?: {
    time?:    Record<MashReadingCol, string>;
    temp?:    Record<MashReadingCol, string>;
    ph?:      Record<MashReadingCol, string>;
    gravity?: Record<MashReadingCol, string>;
    notes?:   string;
  };

  // Sparge inputs
  firstRunPh?:   string;
  firstRunGrav?: string;
  lastRunPh?:    string;
  lastRunGrav?:  string;
  spargeAmt?:    string;

  // Boil inputs
  preboilL?:    string;
  preboilBbl?:  string;
  preboilGrav?: string;
  postboilL?:   string;
  postboilBbl?: string;
  measOg?:      string;

  // Pitch & Oxygen inputs
  pitchTemp?:  string;
  fermTemp?:   string;
  pitchPh?:    string;
  o2Lpm?:      string;
  o2Time?:     string;
  o2Measured?: string;

  // Fermenter
  fvCm?: string;

  // Free-form
  notes?: string;

  // Cached computed targets (read-only displays — written here so tablet/mobile
  // can show without recomputing; the desktop always recomputes live).
  mashWaterL?:       string;
  spargeVolL?:       string;
  strikeTempC?:      string;
  mashRatio?:        string;
  mashPhTarget?:     string;
  mashEffPredicted?: string;
  targetPreboilL?:   string;
  targetPostboilL?:  string;
  targetPreboilP?:   string;
  targetPitchTemp?:  string;
  targetO2ppm?:      string;
}

export type MashReadingCol = 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'pt';

// === Cold Side / Packaging ===

/**
 * ColdSideData — flat blob mirroring brewlab-desktop.html's saveColdSide
 * output (line 12726). Keys use HTML's dashed names verbatim. These keys
 * will later be snapshotted into the tax_records.snap_* columns at filing
 * time — they are stable schema and must not be renamed without a migration.
 */
export interface ColdKegRow { size: string; qty: string; }

export interface ColdSideData {
  // Transfer / conditioning
  'cs-transfer'?: string;            // 'Yes' | 'No'
  'cs-og-measured'?: string;         // legacy override; no UI in React (preserved on save)
  'cs-transfer-date'?: string;
  'cs-bt-vessel'?: string;
  'cs-mm-reading'?: string;
  'cs-yeast-harvested'?: string;     // legacy; modern source is ferm_meta['harvest-amt']
  'cs-yeast-gen'?: string;           // yeast generation # — display-only, read by Analysis tab
  'cs-bt-waste'?: string;

  // Final readings
  'cs-fg'?: string;
  'cs-ph'?: string;
  'cs-carb-planned'?: string;
  'cs-carb-actual'?: string;

  // Packaging
  'cs-keg-date'?: string;
  'cs-can-date'?: string;
  'cs-can-size'?: string;
  'cs-cans'?: string;
  'cs-flowmeter'?: string;
  'cs-can-waste-manual'?: string;
  'cs-can-do'?: string;
  'cs-keg-waste'?: string;
  'cs-keg-rows'?: ColdKegRow[];

  // Cached for Tax Master read
  'cs-liters-bt-saved'?: number;

  // Notes
  'cs-process-notes'?: string;
  'cs-tasting-notes'?: string;      // legacy single tasting-notes field (still
                                    // edited by PackagingTab / printed / HistoryTab);
                                    // migrated into `overallImpression` on the Analysis tab.
  'cs-changes-notes'?: string;
  'cs-analysis-notes'?: string;

  // Structured tasting notes (Analysis tab). All optional — the cold-side
  // blob defaults to {}. `overallImpression` falls back to the legacy
  // 'cs-tasting-notes' value so existing data isn't lost.
  appearance?: string;
  aroma?: string;
  flavor?: string;
  mouthfeel?: string;
  overallImpression?: string;

  // Cold-side variant of "Brew Again?" — distinct from recipe.brewAgain
  // (the recipe column accepts 'yes' | 'no' | 'maybe' per SCHEMA.md;
  // this cold-side rating accepts the four values below).
  brewAgain?: BrewAgain;
}

// === Water Chemistry ===

/**
 * The six brewing-relevant water ions tracked across source / target /
 * resulting profiles. Order matches the HTML grid layout left-to-right.
 */
export type WaterIon = 'ca' | 'mg' | 'na' | 'so4' | 'cl' | 'hco3';

/** The six minerals the user can dose into mash and sparge water. */
export type WaterMineral = 'gypsum' | 'cacl2' | 'epsom' | 'mgcl2' | 'nacl' | 'nahco3';

/**
 * WaterChemData — flat blob mirroring brewlab-desktop.html's wcSave output
 * (line 12504). Field names match HTML's keys verbatim so old local-only
 * blobs and new Supabase-synced blobs share the same shape.
 *
 * Persisted to `bl_water_chem_<recipeId>` → `water_chem` table (recipe_id PK).
 */
export interface WaterChemData {
  sourceProfileId?: string;
  targetProfileId?: string;
  mashVol?:   string;          // L
  spargeVol?: string;          // L
  targetPh?:  string;
  acidType?:  'lactic' | 'phosphoric';
  acidPct?:   string;          // 0–100
  acidMashMl?:   string;
  acidSpargeMl?: string;
  targets?:  Partial<Record<WaterIon, string>>;
  minerals?: Partial<Record<WaterMineral, { mash?: string; sparge?: string }>>;
}

// === Planner ===

export interface PlannerBrew {
  id: string;
  name: string;
  /** Linked recipe id, or null/empty for freeform brews with no recipe.
   *  HTML allows the latter (the modal yields '' when nothing selected). */
  recipeId?: string | null;
  vessel: string;
  start: string;
  end: string;
  color: string;
  actions?: PlannerAction[];
  notes?: string;
  /** React-only flag; HTML doesn't carry this. Used elsewhere in the
   *  app to mark a brew as fully captured into a recipe. */
  fullyRecorded?: boolean;
}

export interface PlannerAction {
  /** 'dh' | 'crash' | 'xfer' | 'custom' (extensible — HTML uses these four). */
  type: string;
  /** 1-based offset from brew start. Persisted alongside `date` for
   *  resilience: if the brew start moves, `day` lets us recompute the
   *  intended action date. */
  day: number;
  /** Optional explicit ISO date — written by the action editor; preferred
   *  over `day` when present. */
  date?: string;
  /** Free-form label, used when `type === 'custom'`. */
  label?: string;
  /** Duration in days. HTML defaults to 3 for new actions. */
  dur?: number;
  /** Emoji marker used in some HTML render paths. Optional, kept for
   *  forward-compat with mobile/tablet clients. */
  emoji?: string;
}

/** bl_yearly storage shape — keyed "<year>-<monthIndex>". */
export type YearlyEntry = { name: string; color: string };
export type YearlyData = Record<string, YearlyEntry[]>;

// === Libraries ===

// All four library types accept `string | number | undefined` on their
// numeric-looking fields. Reason: the HTML reference app stored every
// library field as a string (it round-tripped through DOM input.value).
// React consumers (IBU calc, EBC calc, AddIngredientModal) all use
// `parseFloat(String(x))` defensively, so the loose union is safe and
// avoids data-shape conflicts when the user imports legacy localStorage
// or a Supabase blob written by the HTML app.

/** Numeric library field — may be persisted as either string or number. */
type LibNum = number | string | undefined;

export interface MaltLib {
  id: string | number;
  name: string;
  /** Manufacturer / maltster (Weyermann, Crisp, etc.). HTML field name. */
  maltster?: string;
  /** Local supplier — the wholesaler the user buys from. Distinct from
   *  `maltster`. Defaults blank on import (BeerXML SUPPLIER tag is the
   *  manufacturer, not the local supplier — see HTML 17007–17009). */
  supplier?: string;
  /** Free-form grain category — read by ntaNormalise (HTML 11518) and
   *  the Recipe→Malt classifier as a fallback to the name regex.
   *  Examples: 'Base', 'Crystal', 'Wheat', 'Oat', 'Roasted', 'Adjunct'. */
  malt_type?: string;
  /** Library-level malted flag, read by autoClassifyRecipeById (HTML
   *  brewlab-desktop.html:12092). `undefined` is treated as `true`. */
  malted?: boolean;
  /** Tariff-eligible flag, read by Tariff Reduction (HTML 8930). */
  tariff?: boolean;
  ebc?: LibNum;
  price?: LibNum;
  dbfg?: LibNum;
  max_pct?: LibNum;
  moisture?: LibNum;
  diastatic_power?: LibNum;
  protein?: LibNum;
  yield_pct?: LibNum;
  potential?: LibNum;
  notes?: string;
  /**
   * Distilled-water mash pH for this malt — the pH a 5 L water + 100 g
   * malt mash with distilled water settles at. Used by the Bru'n Water
   * style mash-pH estimator. Optional — when missing, the estimator
   * falls back to a piecewise EBC heuristic. No editor UI yet.
   */
  di_pH?: number;
}

export interface HopLib {
  id: string | number;
  name: string;
  /** Alpha acid % — HTML/BeerXML field name. The phantom `alpha` field
   *  this used to declare was never read; AddIngredientModal already
   *  reads `aa`. Live data on disk is `aa`. */
  aa?: LibNum;
  beta?: LibNum;
  hop_type?: 'Pellet' | 'Cryo' | 'Whole' | 'Extract' | string;
  origin?: string;
  supplier?: string;
  price?: LibNum;
  lot_num?: string;
  notes?: string;
}

export interface YeastLib {
  id: string | number;
  name: string;
  lab?: string;
  yeast_type?: string;
  /** Dry vs. Liquid — drives 1L = 1kg slurry equivalence in tax calcs. */
  form?: 'Dry' | 'Liquid' | string;
  atten?: LibNum;
  temp_min?: LibNum;
  temp_max?: LibNum;
  supplier?: string;
  price?: LibNum;
  notes?: string;
}

export interface MiscLib {
  id: string | number;
  name: string;
  misc_type?: string;
  use?: string;
  /** Optional unit hint — older React data shape carried this; HTML
   *  schema doesn't. Kept optional for backwards compatibility. */
  unit?: string;
  supplier?: string;
  price?: LibNum;
  notes?: string;
  happoshu_trigger?: boolean;
}

// === Tank Calibration ===
//
// Doubles as the canonical tank list — the React app derives the FV / BT
// vessel set from `Object.keys(tankCalib)` (BrewDayTab.tsx:248,
// PackagingTab.tsx:208), so adding a new entry to bl_tank_calib creates
// a tank, deleting an entry removes it. HTML's PLANNER_VESSELS const was
// non-persistent; this React layout fixes that gap. Group is inferred
// from id prefix (`fv*` → fermenter, `bt*` → bright tank).
//
// All fields except `name` are optional because:
//   • HTML stores them as strings (`'55'`, `'2.0'`) and the live calib
//     blob mixes types — defensive parsing happens at consumer sites.
//   • The Tanks settings panel writes defaults on entry creation, but
//     legacy data may be missing fields.

export type TankType = 'Conical' | 'Unitank';

export interface TankCalibration {
  name: string;
  /** mm reading at which the cone meets the cylindrical section. */
  threshold?: number | string;
  /** Total cone volume below `threshold` (L). */
  coneVol?: number | string;
  /** Litres per mm above the cone threshold. */
  lPerMm?: number | string;
  /** FV-only: height of the conical section below mm 0 (mm). HTML stores
   *  as string. Tax volume calc adds this to raw mm reading. */
  coneHeight?: number | string;
  /** FV-only: tank construction type. UI-only. */
  type?: TankType;
}

// === Equipment Profile ===

/**
 * Equipment profile — port of HTML brewlab-desktop.html:2685–2726
 * (the editor modal) + line 20322 (the seed default values).
 *
 * The Brew Day calc reads only `trubLoss` and `boilOffRate` directly
 * (lib/calculations.ts:400, :495). The other fields are stored for the
 * editor's UI completeness but aren't yet consumed by other calcs.
 */
export type TunMaterial = 'Stainless Steel' | 'Copper' | 'Aluminium' | 'Other';

export interface EquipmentProfile {
  id: string;
  name: string;
  /** Brew kettle volume (L). UI only — not consumed by calcs yet. */
  kettleVol?: number;
  /** Mash tun volume (L). UI only. */
  mashTunVol?: number;
  /** Default batch size pre-fill when this profile is applied (L). UI only. */
  defaultBatchL?: number;
  /** Boil-off rate (L/hr). Brew Day pre-boil volume calc reads this. */
  boilOffRate?: number;
  /** Trub loss (L). Brew Day post-boil/pre-boil volume calc reads this. */
  trubLoss?: number;
  /** Mash tun weight (kg). For strike-temp Palmer formula (not yet wired). */
  tunWeightKg?: number;
  /** Tun construction material — drives `tunShc` via TUN_SHC lookup. */
  tunMaterial?: TunMaterial;
  /** Tun specific heat capacity (cal/g·°C). Set automatically from
   *  `tunMaterial` unless the user picks 'Other'. */
  tunShc?: number;
  /** Large-batch hop utilisation factor (% — 100 = no adjustment). Read by
   *  the IBU calc when passed through Settings → Bitterness; per-profile
   *  override is supported here for future per-equipment IBU tuning. */
  largeBatchUtil?: number;
  /** Default brewhouse efficiency (%) for new recipes using this profile. */
  defaultBhEff?: number;
  /** Default boil time (min) for new recipes using this profile. */
  defaultBoilTime?: number;
  notes?: string;
}

// === Water Profile ===

export interface WaterProfile {
  id: string;
  name: string;
  ca: number;
  mg: number;
  na: number;
  so4: number;
  cl: number;
  hco3: number;
  /** Source water pH. HTML default 7.0. */
  ph?: number;
  notes?: string;
}

// === Mash Profile ===
//
// Port of HTML brewlab-desktop.html:2786–2807 + line 20593 seed.
// Each step has `type` (Infusion/Decoction/etc.) — NOT `name`. BrewDayTab
// already handles either field name via inline cast at line 354 so the
// rename here is invisible to existing renders.

/**
 * Union of every mash step type used across the two HTML editor sites:
 *   - Per-recipe Mash Profile modal (HTML:17963 MASH_STEP_TYPES).
 *   - Settings → Mash Profiles editor (HTML:20530 STEP_TYPES).
 * Each editor offers its own subset of this union at the dropdown level.
 * The strike-temp calc filters specifically to Infusion / Step Mash /
 * Temperature Rest (HTML:18066) for the "first mash step" target.
 */
export type MashStepType =
  | 'Infusion'
  | 'Step Mash'
  | 'Decoction'
  | 'Double Decoction'
  | 'Temperature'
  | 'Temperature Rest'
  | 'Sparge'
  | 'Mash Out';

export interface MashStep {
  type: MashStepType;
  temp: number;
  time: number;
}

export interface MashProfile {
  id: string;
  name: string;
  /** Water-to-grist ratio (L/kg). Used by BrewDay mash water calc when set. */
  ratio?: number;
  /** Initial dough-in temperature (°C). UI only. */
  mashIn?: number;
  /** Mash-out temperature (°C). UI only. */
  mashOut?: number;
  steps: MashStep[];
  notes?: string;
}

// === Pitch Profile ===
//
// Port of HTML brewlab-desktop.html:2824–2842. BrewDayTab applies the
// profile's o2Lpm / o2Time fields when the user picks one from the
// Pitch / O₂ profile selector (BrewDayTab.tsx:230–242).

export interface PitchProfile {
  id: string;
  name: string;
  /** Free-form O₂ target string (e.g. "8–10" or "12 ppm"). */
  o2Target?: string;
  /** Oxygen flow rate (L/min). */
  o2Lpm?: number;
  /** Oxygen duration (sec). */
  o2Time?: number;
  notes?: string;
}

/**
 * Per-recipe profile selections — which Equipment / Water / Pitch / Mash
 * profile the recipe is currently bound to. Persisted to
 * `bl_recipe_profiles_<recipeId>`. Local-only (matches HTML behaviour).
 */
export type RecipeProfileKind = 'equip' | 'water' | 'pitch' | 'mash';

export interface RecipeProfileSelections {
  equip?: string;
  water?: string;
  pitch?: string;
  mash?: string;
}

// === Brewery Note ===

export interface BreweryNote {
  id: string;
  text: string;
  created_at: string;
}

// === Folder ===

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  /** Sidebar tree-expansion state. Persisted alongside the folder so
   *  expansion survives reloads and tracks across devices (mirrors
   *  HTML which mutates folder.open then writes the whole list to
   *  bl_folder_list — see selectFolder, brewlab-desktop.html:4392).
   *  Optional: legacy folders missing this default to closed. */
  open?: boolean;
}

// === Custom Style ===
//
// House styles, Japanese craft categories, etc. — anything outside the
// standard BJCP/BA guide data. Persisted as a dict keyed by `key` (e.g.
// 'custom_<timestamp>') so saves preserve the original key while the user
// edits. Mirrors HTML brewlab-desktop.html:6307 (openCustomStyleModal) +
// the customStyles dict.

export interface CustomStyle {
  name: string;
  cat: string;
  /** Style guide this custom entry belongs to ("BJCP 2015", "Custom",
   *  whatever the user typed in the editor). Surfaced in the unified
   *  Style Picker's "Style Guide" column. Default 'Custom' if absent. */
  guide?: string;
  og_min: number | null;
  og_max: number | null;
  fg_min: number | null;
  fg_max: number | null;
  abv_min: number | null;
  abv_max: number | null;
  ibu_min: number | null;
  ibu_max: number | null;
  ebc_min: number | null;
  ebc_max: number | null;
  // ── Descriptive fields (added 2026-05-07) ────────────────────────────
  // All optional. Naming is camelCase to match the user-facing spec —
  // existing snake_case range fields stay snake_case for back-compat.
  // For BJCP entries (a hardcoded const, not editable in place), the
  // same field set lives on `StyleOverlay` and is merged at read time
  // by getUnifiedStyle.
  /** Vols CO2 range — same shape as existing ABV/IBU/EBC pair. */
  carbonationMin?: number | null;
  carbonationMax?: number | null;
  /** Multi-line free text. Saved as a single string with `\n` separators
   *  rather than an array so nothing fancy is needed for round-tripping. */
  notes?: string;
  description?: string;
  /** Aroma / appearance / flavor / mouthfeel narrative. */
  profile?: string;
  ingredients?: string;
  /** Comma-separated commercial examples. */
  examples?: string;
  /** Single URL — stored as-is, no validation. */
  webLink?: string;
}

/**
 * Per-style descriptive overlay. Persisted as `bl_style_overlays`,
 * a Record keyed by styleKey ('21A' for BJCP, 'custom_<ts>' for custom).
 *
 * The same field set could also live on CustomStyle directly — and it
 * does, for custom entries — but BJCP entries are a read-only const
 * (lib/styles.ts:BJCP_2021). Overlay records sit alongside the const
 * and the read layer (getUnifiedStyle) merges them in. Custom entries
 * write descriptive fields to their own CustomStyle record, NOT to the
 * overlay, so a single source-of-truth applies per style.
 */
export interface StyleOverlay {
  carbonationMin?: number | null;
  carbonationMax?: number | null;
  notes?: string;
  description?: string;
  profile?: string;
  ingredients?: string;
  examples?: string;
  webLink?: string;
}

/** Style guide selector — drives which BJCP year (or external guide) the
 *  Recipe tab style picker pulls categories from. */
export type StyleGuide = 'bjcp2021' | 'bjcp2015' | 'bjcp2008' | 'brewersassoc' | 'none';

// === Settings ===

export type DisplayPrecision = '0' | '1' | '2' | 'auto';
export type ColorUnit = 'EBC' | 'SRM';
export type ThemeMode = 'dark' | 'light';

export interface BrewSettings {
  breweryName: string;
  sbUrl: string;
  sbAnonKey: string;
  units: string;
  ibuMethod: IbuMethod;
  whirlpoolTemp: number;
  mashHopAdj: number;
  leafHopAdj: number;
  largeBatchUtil: number;
  // L of water absorbed per kg of grain — used by pullIngredientTotals to
  // compute spent-grain wet weight. HTML default is 0.75 (line 8496/8656).
  grainAbsorb?: number;
  // Shipping rate per kg, applied by the Analysis cost breakdown
  // (HTML brewlab-desktop.html:11153–11155).
  shipMalt?: number;     // ¥/kg
  shipHops?: number;     // ¥/kg
  orderTax?: number;     // % applied to (ingredients + shipping)

  // ── Settings → Units sub-tab ──
  // hopUnit / yeastUnit / pressureUnit / dateFormat were ported from HTML
  // but were dead in both apps (no consumer ever read them). Removed
  // 2026-05-04 audit; controls dropped from UnitsPanel.
  colorUnit?: ColorUnit;
  dpG?: DisplayPrecision;
  dpKg?: DisplayPrecision;
  dpMl?: DisplayPrecision;
  dpL?: DisplayPrecision;

  // ── Settings → Advanced sub-tab (HTML lines 2607–2640) ──
  /** Light/dark mode. App.tsx applies via body.light class. */
  theme?: ThemeMode;
  /** Cooling shrinkage % between post-boil and into-FV. HTML default 4. */
  coolingShrinkage?: number;
  /** Default grain temperature for strike-temp calc (°C). HTML default 20. */
  defaultGrainTemp?: number;
  /** Estimated finished-beer buffer capacity, pH per mEq/L of acid. Used by
   *  calcDhPhPrediction's residual-acid suggestion. Default 0.04; real beer
   *  ~0.02–0.06 depending on protein, residual extract, CO₂. */
  beerBufferPhPerMeqL?: number;

  // ── Settings → Styles sub-tab ──
  /** Active style-guide source. KNOWN NO-OP: the unified Style Picker
   *  always shows every BJCP_2021 entry plus every custom style regardless
   *  of this setting. The HTML reference also returned BJCP_2021 unchanged
   *  whatever this value was — kept here for settings-blob compatibility
   *  and possible future use, but currently has no functional effect. */
  styleGuide?: StyleGuide;

  // ── Settings → Suppliers sub-tab — Default Shipping Costs ──
  /** Yeast shipping (¥/pkg) — dry. */
  shipYeastDry?: number;
  /** Yeast shipping (¥/pkg) — liquid. */
  shipYeastLiquid?: number;
}

// === Tab Visibility ===

export interface TabVisibility {
  planner: boolean;
  inventory: boolean;
  orderPlanner: boolean;
  submitter: boolean;
  taxMaster: boolean;
  tariffReduction: boolean;
  libraries: boolean;
  settings: boolean;
  notes: boolean;
}

// === Tasting Panel (Analysis-tab sensory scoring) ===

export interface TasterScore {
  id: string;
  name: string;
  date: string;
  hopChart: {
    citrus: number; tropical: number; berry: number; stoneFruit: number;
    floral: number; piney: number; dank: number; earthy: number; spicy: number;
  };
  maltChart: {
    lightGrain: number; darkGrain: number; sweet: number; nutty: number;
    sour: number; funky: number; fullBody: number; clean: number;
  };
}

export interface TastingPanel {
  tasters: TasterScore[];
}

// === Tax Ledger ===

/**
 * One row in the per-ingredient tax ledger. Keyed by `<sec>_<libId>` in
 * the LedgerData dict. Mirrors HTML brewlab-desktop.html line 15913
 * (saveLedgerEntry) — a row has either `got` (IN) or `used` (OUT),
 * never both. The two date fields (`receivedDate` for IN, `usedDate`
 * for OUT) are stored alongside `date` (the sort/display date) for
 * forward-compat with the HTML's separate-display-vs-sort-date logic.
 */
export interface LedgerEntry {
  /** Sort/display date — equals receivedDate for IN, usedDate for OUT. */
  date: string;
  /** Amount received (kg) — set for IN entries; absent on OUT. */
  got?: number;
  /** Amount used (kg) — set for OUT entries; absent on IN. */
  used?: number;
  /** Beer name (`recipe.beerName || recipe.name`) on OUT entries.
   *  HTML 15754 originally stamped `brew.name` here and the planner's
   *  inventory grid recorded-check matched it via brew-name substring.
   *  React keeps writing the brew/beer name for legacy compatibility,
   *  but cross-references should prefer `taxBatch` when both are set
   *  (see RecordUsageModal.confirm + isBrewFullyRecorded). */
  beer?: string;
  /** NTA tax batch # of the brew that consumed this stock — silently
   *  derived from `brew.recipeId → recipe.taxBatch` at record time, so
   *  no new typing is required. Empty string when the brew has no
   *  linked recipe or the recipe's taxBatch is blank. Newer than `beer`
   *  — legacy rows omit this field. The forecast / order-XLSX /
   *  fully-recorded checks all prefer this for exact matching. */
  taxBatch?: string;
  /** Supplier name on IN entries. */
  supplier?: string;
  /** Explicit received date (IN entries). */
  receivedDate?: string;
  /** Explicit used date (OUT entries). */
  usedDate?: string;
  /** Marker for inventory-correction rows (HTML 16151). UI shows these
   *  with "Inventory correction" in the beer column. */
  correctionNote?: string;
  /** Source order id when the entry was created by the Order Planner's
   *  status='received' flow. The Edit Order modal looks this up to keep
   *  the ledger and the order in lockstep:
   *    • status pending/ordered → received  → create tagged entry
   *    • status received       → received  → update tagged entry
   *    • status received       → pending   → remove tagged entry
   *    • delete-received-order              → remove tagged entry
   *  Manually-entered ledger rows omit this field. */
  orderId?: string;
}

/** Ledger storage shape — keyed by `<sec>_<libId>` (e.g. "malts_42"). */
export type LedgerData = Record<string, LedgerEntry[]>;

// === Order ===

/**
 * One row in the Order Planner's `bl_orders` array. Mirrors HTML
 * brewlab-desktop.html line 15078 (saveAllOrders push). Confirm-and-log
 * also pushes a matching IN entry to the tax ledger so the forecast
 * picks up the order as incoming stock — see saveAllOrders 15082–15094.
 *
 * `delivery` is the expected delivery date used by the forecast. If the
 * brewer hasn't set one, `orderDate` is used as the fallback so the
 * order still surfaces on the timeline.
 */
export interface OrderEntry {
  id: string;
  /** Section: 'malts' | 'hops' | 'yeast' | 'misc'. */
  type: string;
  /** Library entry name. Forecast matches against this when projecting
   *  incoming stock — substring + ingNamesMatch is overkill here, the
   *  HTML uses an exact name compare (15524). */
  ingredient: string;
  qty: number;
  supplier?: string;
  /** Expected delivery date (YYYY-MM-DD). Drives forecast column placement. */
  delivery?: string;
  /** Status drives row colour in the Orders panel and whether the
   *  forecast counts the order as incoming (received orders are
   *  excluded — already deducted via the ledger IN entry). */
  status: 'pending' | 'ordered' | 'received';
  notes?: string;
  /** Date the order was placed/logged. Falls back to delivery when
   *  delivery is blank. */
  orderDate?: string;
}

// === Recurring Orders ===

/**
 * A recurring order template — auto-generates synthetic delivery-column
 * entries in the Order Planner forecast on a schedule (weekly/biweekly/
 * monthly), so routine ingredient buys don't need a real OrderEntry
 * logged every time. Persisted at `bl_recurring_orders` (same lsSet /
 * settings-table sync mechanism as `orders` — no dedicated table).
 */
export interface RecurringOrder {
  id: string;
  /** Section: 'malts' | 'hops' | 'yeast' | 'misc' — matches OrderEntry.type. */
  type: 'malts' | 'hops' | 'yeast' | 'misc';
  /** Library entry name, free text — matches OrderEntry.ingredient. */
  ingredient: string;
  qty: number;
  supplier?: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  /** ISO date (YYYY-MM-DD) — first occurrence. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) — optional last occurrence. */
  endDate?: string;
  notes?: string;
}

// === Harvested Yeast ===
//
// Strain-keyed dict matching HTML's bl_harvested_yeast shape (HTML
// 12749 getHarvestedYeast). Each strain has a current generation +
// entries array; each entry is either a harvest (`got > 0`) or a use
// (`used > 0`). React's AddIngredientModal already reads this shape
// from localStorage; supabase.ts hydrate path also produces it
// (lib/supabase.ts:387–417). The previous flat `HarvestedYeast[]`
// store-array shape was dormant — never consumed by UI — and is
// replaced here so the InventoryPage view + modals can read directly
// from the store.

export interface HarvestedYeastEntry {
  /** UUID — stable across edits, used as the Supabase row id. */
  id?: string;
  /** Sort/display date. */
  date: string;
  /** Original harvest date (preserved when entry is a usage). */
  harvestDate?: string;
  /** Amount harvested (litres). */
  got?: number;
  /** Amount used (litres). */
  used?: number;
  /** Beer name — for harvests this is the source brew's beer name (the
   *  recipe the yeast came out of); for usages it's the destination
   *  brew's beer name (where the yeast was pitched). On a row that's
   *  been used multiple times, joined with ", ".
   *  HTML history note: through the previous React pass `beer` briefly
   *  held the tax batch number; new writes go back to beer name and
   *  the tax batch lives on the sibling `taxBatch` field below. Old
   *  rows that pre-date that pass render gracefully — see
   *  HarvestedYeastView.formatBrewLabel. */
  beer?: string;
  /** NTA tax batch # of the destination brew (for usage rows). On
   *  multi-use rows joined with ", " — kept index-aligned with `beer`
   *  so the view can zip them into "TAX — Beer" pairs. */
  taxBatch?: string;
  /** Source brew's beer name (for harvest rows). HTML and the early
   *  React port both stored the tax batch here — legacy rows therefore
   *  hold a tax-batch string under this key. New writes after this
   *  pass put the beer name here and the tax batch on the
   *  `harvestedFromTaxBatch` sibling. The view formatter falls back to
   *  rendering whichever single value exists for legacy rows. */
  harvestedFrom?: string;
  /** NTA tax batch # of the source brew (for harvest rows). New field —
   *  pairs with `harvestedFrom`. Legacy harvest rows omit this. */
  harvestedFromTaxBatch?: string;
  /** Source brew number for harvests. */
  brewNum?: string;
  /** Source brew identifier (HTML stores the recipe_id here). */
  recipeId?: string;
  /** Yeast generation at this row. */
  generation?: number;
  /** Container ID (jar/bottle marker). */
  container?: string;
  /** Free-form note. */
  note?: string;
  /** 'harvest' or 'usage' — set by the modal at write time. Optional
   *  so legacy rows (no explicit type) still parse; got > 0 → harvest,
   *  used > 0 → usage. */
  type?: 'harvest' | 'usage';
}

export interface HarvestedYeastStrain {
  /** Current generation of this strain — bumped on each new harvest. */
  generation: number;
  entries: HarvestedYeastEntry[];
}

export type HarvestedYeast = Record<string, HarvestedYeastStrain>;

// === Tax Record ===

/**
 * The working-tax-record blob persisted to `bl_tax_<recipeId>` and synced to
 * the `tax_records` Supabase table. Keys are dashed strings to match
 * brewlab-desktop.html verbatim (TAX_FIELDS at line 8456 + recordToTaxMaster
 * snap-* writes at lines 8835–8861) so old localStorage blobs and HTML/React
 * shared the same shape.
 *
 * Editable input fields are strings (DOM input.value); computed snap-* fields
 * are numbers. Two parallel keys exist for the classification — `class` (set
 * by tr-class) and `classification` (set by tax-classification). Both are
 * kept in sync by the canonical setRecipeClassification action.
 *
 * Snap-* fields are produced exclusively by `buildSnapshot` in `lib/tax.ts`
 * and are NEVER recalculated from live data afterwards. See §5 of the
 * approved port plan and CLAUDE.md "NTA Tax Snapshots".
 */
export interface ColdKegRowSnap { size: string | number; qty: string | number; }

export interface TaxRecord {
  // ── Working / input fields (TAX_FIELDS at brewlab-desktop.html:8456) ──
  date?: string;
  'brew-num'?: string;
  'recipe-name'?: string;       // recipe.name (仕込記号) — wire-format identifier
  'beer-name'?: string;         // recipe.beerName — display label
  malt?: string;
  wheat?: string;
  oats?: string;
  other?: string;
  hops?: string;
  yeast?: string;
  water?: string;
  'spent-grain'?: string;
  'kettle-waste'?: string;
  'fv-num'?: string;
  'fv-mm'?: string;
  'in-fv'?: string;
  'start-brix'?: string;
  'finish-brix'?: string;
  abv?: string | number;
  tank?: string;
  mm?: string;
  'in-bt'?: string;
  'keg-qty'?: string;
  'keg-total'?: string;
  'can-size-ml'?: string;
  // 'can-size' (litres) is a side-write from pullTaxDataFromTabs at line 8738;
  // not in TAX_FIELDS but written to the record for downstream consumers.
  'can-size'?: string;
  cans?: string;
  'can-total'?: string;
  'total-packaged'?: string;
  // 'canning-waste' is a side-write from pullTaxDataFromTabs at line 8776.
  'canning-waste'?: number;
  class?: string;               // 'Beer' | 'Happoshu' (from tr-class)
  classification?: string;      // 'Beer' | 'Happoshu' (from tax-classification)
  notes?: string;

  // ── Snap-* fields (write-once via buildSnapshot — NEVER recalculate) ──
  'snap-into-bt'?: number;
  'snap-yeast-harvest'?: number;
  'snap-can-size-ml'?: number;
  'snap-cans'?: number;
  'snap-sell-can-l'?: number;
  'snap-can-waste-manual'?: number;
  'snap-flowmeter'?: number;
  'snap-flowmeter-waste'?: number;
  'snap-total-can-waste'?: number;
  'snap-keg-rows'?: ColdKegRowSnap[];
  'snap-sell-keg-l'?: number;
  'snap-kegs-15'?: number;
  'snap-kegs-10'?: number;
  'snap-keg-waste'?: number;
  'snap-transfer-yes'?: boolean;
  'snap-ut-waste'?: number;
  'snap-fv-bt-waste'?: number;
  'snap-fv-bt-pct'?: number;
  'snap-total-waste-pkg'?: number;
  'snap-total-waste'?: number;
  'snap-sell-total'?: number;
  'snap-pkg-date'?: string;
  'snap-transfer-into'?: string;
  'snap-bt-mm'?: string;
  'snap-pct-can-waste'?: number;
  'snap-pct-pkg-waste'?: number;
  'snap-pct-total'?: number;

  // ── Tax-master row identity (only present after recordToTaxMaster) ──
  recipeId?: string;
  recordedAt?: string;
}

/**
 * A row that has been recorded to `bl_tax_master` (and synced to the
 * `tax_master` Supabase table). Same shape as TaxRecord but with
 * recipeId / recordedAt required. Treated as immutable once filed.
 */
export interface TaxMasterRow extends TaxRecord {
  recipeId: string;
  recordedAt: string;
}

// === NTA Submission Register ===

/**
 * One row in the NTA submitter's register (`bl_nta_register`). Mirrors the
 * shape produced by HTML's `ntaSubmitNew` (line 11858). All ingredient
 * amounts are stored per-1000L so the same beer brewed at any batch size
 * matches the same row.
 */
export interface NtaSubmissionMisc {
  name: string;
  kgRaw: number;
  kgPer1000: number;
  happoshuTrigger: boolean;
}

export interface NtaSubmission {
  /** Recipe code / 仕込記号 entered at submit time. */
  code: string;
  /** ISO date the row was submitted. */
  date: string;
  /** Source recipe id, if the submission came from an in-app recipe. */
  recipeId?: string;
  /** Optional NTA-side classification snapshot (Beer / Happoshu). */
  classification?: string;
  // Per-1000L ingredient totals — HTML lines 11860–11871
  maltKg: number;
  wheatKg: number;
  oatsKg: number;
  otherGrainKg: number;
  hopsKg: number;
  yeastKg: number;
  waterL: number;
  miscList: NtaSubmissionMisc[];
  // Stats
  ogP: number;
  abv: number;
  intoFV: number;
  packaged: number;
  // Free-form basis (HTML's "製造見込数量の算出根基等" field on the form)
  basis?: string;
  // Cached match keys — let the comparison grid skip recomputing on every render
  hopRatio?: number;
  yeastRatio?: number;
  miscNames?: string;
}

// === Order ===

export interface Order {
  id: string;
  items: OrderItem[];
  deliveryDate: string;
  supplier: string;
  confirmed: boolean;
  brewIds: string[];
}

export interface OrderItem {
  name: string;
  type: IngredientType;
  qty: number;
  unit: string;
}

// === Checklist ===

export interface Checklist {
  submitted: boolean;
  brewDay: boolean;
  fermentation: boolean;
  packaging: boolean;
  tax: boolean;
  taxSummary: boolean;
  analysis: boolean;
  inventory: boolean;
}
