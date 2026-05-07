# BrewLab — CALCULATIONS.md

All formulas, constants, and business logic used in BrewLab. This file exists so the React rebuild can re-implement every calculation correctly without guessing. Every formula here is pulled directly from the working HTML app.

---

## ORIGINAL GRAVITY (OG)

### Formula
```
og_sg = 1 + Σ(kg × yield_frac × BHeff × 384) / batchL / 1000
```

### Where:
- `384` = unit conversion constant = 46 PPG_max × 2.2046 lb/kg ÷ 0.264172 gal/L
- `yield_frac` = yield_pct / 100 (from malt library entry)
- `BHeff` = brewhouse efficiency as decimal (e.g. 0.72 for 72%)
- `batchL` = batch size in litres
- `kg` = grain amount in kg (convert grams: g × 0.001)

### Yield corrections (apply in this order):
1. If library entry has `moisture` > 0: `yield = yield × (1 - moisture/100)`
2. If library entry has `dbfg` > 0: `yield = yield × (1 - dbfg/100)`
3. If no yield found in library: default to 75%

### OG to °Plato conversion:
```
og_plato = -616.868 + 1111.14×sg - 630.272×sg² + 135.997×sg³
```
Same cubic formula used for FG. All gravity displayed to users in °Plato.

---

## FINAL GRAVITY (FG)

```
fg_sg = og_sg - (og_sg - 1) × (attenuation / 100)
```

- Attenuation pulled from yeast library entry
- Default attenuation: 75% if not set
- FG also converted to °Plato using same cubic formula as OG

---

## ABV

### From recipe (estimated):
```
abv = (og_sg - fg_sg) × 131.25
```

### From actual readings at packaging:
```
abv = (og_reading - fg_reading) × 131.25
```
Where readings are in SG. If readings are in °Plato, convert first:
```
sg = 1 + plato / (258.6 - (plato / 258.2 × 227.1))
```

---

## IBU — THREE METHODS

User selects method in Settings. All three use the same inputs:
- `aa` = alpha acid fraction (AA% / 100)
- `amtG` = hop amount in grams
- `batchL` = batch size in litres
- `boilTime` = minutes (0 for dry hops, whirlpool uses stand time)
- `og_sg` = wort OG in SG

### Tinseth (default)
```
bigness = 1.65 × 0.000125^(og_sg - 1)
boilFactor = (1 - e^(-0.04 × boilTime)) / 4.15
utilisation = bigness × boilFactor
IBU = (aa × utilisation × amtG × 1000) / batchL
```

### Rager
```
util = table lookup by boil time (see below)
GA = (og_sg > 1.050) ? (og_sg - 1.050) / 0.2 : 0
IBU = (amtG × util × aa × 74.89) / (batchL × (1 + GA))

Utilisation table:
≥75 min → 0.228
≥60 min → 0.202
≥45 min → 0.178
≥30 min → 0.146
≥20 min → 0.122
≥15 min → 0.106
≥10 min → 0.085
≥5 min  → 0.053
<5 min  → 0.005
```

### Daniels
```
util = table lookup by boil time:
≥60 min → 0.300
≥45 min → 0.261
≥30 min → 0.216
≥20 min → 0.161
≥10 min → 0.100
<10 min → 0.050

IBU = (amtG × util × aa × 7489) / (batchL × 10)
```

### IBU Adjustments (applied after base calc, in order)

**Whirlpool / Flameout hops:**
```
Apply wpFactor based on whirlpool temp (°C):
< 70°C  → wpFactor = 0
70–80°C → linear interpolation: 0 → 0.22
80–85°C → linear interpolation: 0.22 → 0.45
85–90°C → linear interpolation: 0.45 → 0.62
90–95°C → linear interpolation: 0.62 → 0.80
95–100°C → linear interpolation: 0.80 → 1.00
≥100°C → wpFactor = 1.0

IBU = IBU × wpFactor
```

**Mash hops:**
```
IBU = IBU × (1 + mashHopAdj / 100)
Default mashHopAdj = -80 (i.e. 80% reduction)
```

**Whole leaf hops:**
```
IBU = IBU × (1 + leafHopAdj / 100)
Default leafHopAdj = -10 (i.e. 10% reduction)
```

**Large batch (>76L):**
```
IBU = IBU × (largeBatchUtil / 100)
User-configurable setting, default 100 (no adjustment)
```

**First wort hops:**
```
IBU = IBU × 1.10 (+10% bonus)
```

**Dry hops:** No IBU contribution — skip entirely.

---

## EBC / COLOUR

### Morey Method
```
batchGal = batchL × 0.264172
lbs = kg × 2.20462
srm_of_grain = ebc_of_grain / 1.97

MCU = Σ(lbs × srm_of_grain) / batchGal
SRM = 1.4922 × MCU^0.6859
EBC = SRM × 1.97
```

EBC stored in malt library. SRM and EBC interconvert:
```
SRM = EBC / 1.97
EBC = SRM × 1.97
```

---

## FV VOLUME FROM DIPSTICK

Each fermenter has a calibration profile:
```
calib[fvId] = { threshold, coneVol, lPerMm, name }
```

Volume calculation:
```
if (mm <= threshold):
  volume = coneVol
else:
  volume = coneVol + (mm - threshold) × lPerMm
```

- `threshold` = mm reading at which the cylindrical section starts
- `coneVol` = litres in the cone below threshold
- `lPerMm` = litres per millimetre in the cylindrical section

---

## BREWHOUSE EFFICIENCY CHECK

Used on the brew day tab to show actual vs target efficiency:
```
theoreticalPts = grainKg × 384
actualEff = ((measuredSG - 1) × 1000 × batchL / theoreticalPts) × 100
```

---

## ABV FROM ACTUAL READINGS

At packaging, ABV is recalculated from actual OG and FG readings:
```
abv = (og_sg - fg_sg) × 131.25
```

If readings are stored as °Plato:
```
sg = 1 + plato / (258.6 - (plato / 258.2 × 227.1))
```

---

## NTA TAX CALCULATIONS (JAPANESE)

### Classification
```
Beer:     malted grain kg / total fermentable kg ≥ 0.80
Happoshu: malted grain kg / total fermentable kg < 0.80
          OR any ingredient with happoshu_trigger = true, regardless of ratio
```

Note: "Total fermentable" should include all grains, sugars, and adjuncts — not just malted grain. The current HTML app uses total grain weight only as the denominator, which may miss sugar/adjunct additions. This is a known discrepancy to fix in the rebuild.

Classification is stored once on the recipe and never independently recalculated on different pages. It syncs via `syncClassification()`.

### Recipe normalisation (for tax submission)
All ingredient amounts are normalised to per-1000L before comparing against the NTA register:
```
normalisedAmt = (ingredientAmt / batchL) × 1000
```

Same recipe brewed at different batch sizes must produce identical normalised figures.

### Special rules
- **1L yeast slurry = 1kg** for tax purposes
- **Water chemistry ingredients** (salts, acids like phosphoric acid) are water adjustments — they must NEVER appear in tax misc ingredient lists
- **snap-* fields**: all tax figures are written as snapshots at "Record to Tax Master" time and are never recalculated live from cold side data
- **Beer name vs recipe name**: `beerName` is the label shown to users; `name` (仕込記号) is the internal tax identifier. Tax submissions use `name`.

### Tariff quota
Tracks malt purchased under import quota (lower duty rate) vs standard tariff:
```
quota remaining = total quota allocation - Σ(malt kg used in qualifying brews)
```

---

## WATER CHEMISTRY — MASH pH ESTIMATION

Bru'n Water-style model using Kolbach Residual Alkalinity. Replaces an
earlier ad-hoc per-ppm coefficient model that ignored mash thickness and
under-handled dark malts.

### Kolbach Residual Alkalinity (RA)

Brewing-relevant alkalinity remaining in the mash after Ca²⁺ and Mg²⁺
partially neutralise it via phosphate precipitation. Expressed in mEq/L
(for math) and ppm CaCO₃ (for human display).

```
alkalinity_mEq_L = HCO3_ppm / 61
hardness_mEq_L   = (Ca_ppm / 20) / 3.5  +  (Mg_ppm / 12.15) / 7
RA_mEq_L         = alkalinity_mEq_L − hardness_mEq_L
RA_ppm_CaCO3     = RA_mEq_L × 50.04
```

The /3.5 (Ca) and /7 (Mg) divisors are Kolbach's empirical factors.
Reference: Kolbach (1953), *Der Einfluss des Brauwassers auf das Bier*.

### Grist distilled-water pH

Per-grain DI pH, in priority order:

1. `lib.di_pH` if explicitly set in the malt library entry.
2. Acidulated-malt name match (`/acid|sauer/i`) → 4.30.
3. Piecewise EBC heuristic (single linear fit handles base malt OK but
   understates pH drop in dark crystal and roast):
   - Base    (EBC < 6):           `5.75 − 0.005  × EBC`
   - Crystal (6 ≤ EBC ≤ 150):     `5.65 − 0.0035 × EBC`
   - Roasted (EBC > 150):         `max(4.40, 5.00 − 0.001 × EBC)`

Final value clamped to `[4.30, 5.85]`.

The grist DI pH used in the mash-pH estimate is the kg-weighted mean of
per-grain DI pH over all grains.

### Mash pH formula

Palmer/Kaiser-style ΔpH coefficient, expressed in L/kg units. Thicker
mash carries more total alkalinity per kg of grain (the buffering
material), so should shift pH MORE per mEq/L of RA — the formula
multiplies thickness, doesn't divide:

```
WC_PH_RA_COEFF = 0.040            // ΔpH per (mEq/L RA × L/kg thickness)

acid_mEq_L = (acidMashMl × meqPerMl) / mashWaterL    // 0 if no acid
eff_RA     = RA_mEq_L − acid_mEq_L
thickness  = mashWaterL / totalGrainKg
ΔpH        = 0.040 × eff_RA × thickness
mashPh     = gristDiPh + ΔpH
```

### Inverse — suggested acid

To bring mash pH from its no-acid baseline down to a target pH:

```
ph_zero_acid       = gristDiPh + 0.040 × RA_mEq_L × thickness
gap                = ph_zero_acid − targetPh        // 0 if pH already at target
acid_mEq_per_L     = gap / (0.040 × thickness)      // mEq/L of acid needed in mash
suggested_mash_mL  = acid_mEq_per_L × mashWaterL   / meqPerMl
suggested_sparge_mL = acid_mEq_per_L × spargeWaterL / meqPerMl
```

The same per-litre acid concentration is applied to mash and sparge
volumes for the suggested-mL display. This is a simplification — sparge
water has no grain buffer to fight, so the formula is empirical for
sparge — but matches the existing UX (separate "Suggested mash" and
"Suggested sparge" cards, scaled by their own volumes).

### Acid mEq/mL

```
acid_mEq_per_mL_lactic     = (pct/100) × 1.206 × 1000 / 90.08
acid_mEq_per_mL_phosphoric = (pct/100) × density × 1000 / 98
   where density = 1 + (0.685/0.85) × (pct/100)
```

Phosphoric is **monoprotic at mash pH**: pKa₂ = 7.20, so at pH ~5.4 only
~1.6% of the second proton has dissociated and it contributes
negligibly. The HTML reference (`wcAcidMeqPerMl` line 11489) multiplied
the phosphoric branch by ×2 — an error that overstates phosphoric
strength roughly 2×. The React port deliberately diverges and does not
include the ×2.

### Constants reference

| Constant            | Value | Source                                                |
|---------------------|-------|-------------------------------------------------------|
| Ca divisor (Kolbach)| 3.5   | Kolbach (1953)                                        |
| Mg divisor (Kolbach)| 7     | Kolbach (1953)                                        |
| Ca eq.weight        | 20    | Ca²⁺ MW 40 / 2 charges                                |
| Mg eq.weight        | 12.15 | Mg²⁺ MW 24.3 / 2 charges                              |
| HCO3 eq.weight      | 61    | HCO3⁻ MW 61 / 1 charge                                |
| RA→ppm CaCO3        | 50.04 | CaCO₃ MW 100.09 / 2 charges                           |
| WC_PH_RA_COEFF      | 0.040 | Kaiser/Palmer 0.083 (qt/lb) × 0.480 conversion to L/kg |

---

## DRY-HOP pH PREDICTION

Hops raise finished-beer pH. Two surfaces consume the prediction:

- **Brew Day tab** — shows a read-only `Predicted DH rise: +X.XX pH` line under Target Pitch pH. The brewer reads it and chooses what to set pitch pH to manually. No suggested target, no auto-fill.
- **Fermentation tab** — interactive card for real-time correction once the beer is in the FV. Inputs: target final pH, current beer pH (optional), DH temperature, residual acid type. Outputs: temp-adjusted predicted rise and a suggested mL of acid when current pH overshoots target.

There is no "recommended post-boil pH" or floor-cap concept — Brew Day shows the rise, the brewer decides the pitch pH.

### Temperature-aware coefficient

```
predicted_rise = janishCoefficientForTemp(dh_temp_c) × (total_dry_hop_g / volume_L)

janishCoefficientForTemp(t):
    if t ≤  2  →  0.020
    if t ≥ 22  →  0.030
    else       →  0.020 + (t − 2) × 0.0005
```

Slope = 0.0005 pH/(g/L)/°C. At 12 °C this evaluates to **0.025** — exactly Janish's flat coefficient.

**Provenance:** the base 0.025 value comes from Scott Janish, *The New IPA* / "A Look at pH in Hoppy Beers" — an empirical fit across commercial hoppy beers measured at typical fermentation/dry-hop temperatures. The temperature scaling layered on top is **empirically motivated but not in the peer-reviewed literature**. Hop wettability, alpha-acid extraction, and resin solubility all rise with temperature, so warm dry hops pull more pH-raising species out of the cone material than cold-crashed ones. Treat it as a refinement of Janish's value, not a replacement. Default temperature when unset is 12 °C.

### Total dry-hop grams

For each recipe DH hop:
- If any of the Ferm-tab DH-card *actual amounts* (slots dh1/dh2/dh3) contain a value for that hop, sum those across slots and use the sum.
- Otherwise use the recipe's *planned* amount.

Plus: all ad-hoc *extra hops* added on the Ferm DH cards (regardless of slot), unconditionally summed.

Adjuncts (DH-card adjuncts) are NOT counted — they don't follow the coefficient.

### Volume

Preferred: FV volume from `bd.fvCm` × the selected FV's tank calibration (`fvVolume(mm, calib)`). Fallback: `recipe.batchL`.

### Suggested residual acid (Ferm tab only)

Fires when the user supplies a current beer pH greater than their target:

```
ΔpH_measured  = current_ph − target_final_ph     (if > 0; else card output suppressed)
acid_meq_per_L = ΔpH_measured / BEER_BUFFER_PH_PER_MEQ_L
total_meq      = acid_meq_per_L × volume_L
acid_mL        = total_meq / acidMeqPerMl(acidType, acidPct)
```

`BEER_BUFFER_PH_PER_MEQ_L = 0.04` is a mid-range estimate — real beer buffer ranges roughly 0.02–0.06 pH/(mEq/L) depending on protein, residual extract, CO₂ saturation, etc. The UI labels the output as an estimate and recommends taste + re-measure before dosing.

### Constants reference

| Constant                  | Value         | Source                                              |
|---------------------------|---------------|-----------------------------------------------------|
| Janish base coefficient   | 0.025         | Janish, *The New IPA* — flat, at typical DH temps  |
| Temp-scaled range         | 0.020–0.030   | Empirical refinement; NOT in the published literature |
| DH_DEFAULT_TEMP_C         | 12 °C         | Reproduces 0.025 against the temp-scaled function   |
| BEER_BUFFER_PH_PER_MEQ_L  | 0.04          | Mid-range beer buffer estimate — NOT well-validated |

---

## INGREDIENT PERCENTAGE (grain bill)

```
pct = (ingredientKg / totalGrainKg) × 100
```

Displayed on recipe ingredients table. Recalculated whenever grain bill changes.

---

## COST CALCULATION

```
cost per ingredient = price_per_kg × amtKg
total recipe cost = Σ(all ingredient costs)
```

Price pulled from library entry. Yeast is priced per unit (not per kg).

---

## ORDER PLANNER SHORTFALL

```
stock = current inventory balance for this ingredient
brewUsage[i] = recipe amount needed for brew[i]
running = stock
for each brew (sorted by date):
  running = running - brewUsage[i]
  balance[i] = running

shortfall = abs(finalBalance) if finalBalance < 0

orderQty (rounded up to sensible unit):
  malts → nearest 25kg
  hops  → nearest 1kg
  yeast/misc → nearest 0.1kg
```

---

## NOTES

- All gravity stored and displayed in °Plato
- All weights in kg (grams converted on input: g × 0.001)
- All volumes in litres
- Temperature always °C
- IBU stored per ingredient after calculation, summed for total
- The constant 384 must never be changed — it is the correct unit conversion factor for metric brewing
