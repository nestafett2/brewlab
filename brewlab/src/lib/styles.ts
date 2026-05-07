/** BJCP 2021 Style Guide data — extracted from brewlab-desktop.html */

import type { CustomStyle } from '../types';
import { platoToSg } from './calculations';

export interface StyleDef {
  name: string;
  cat: string;
  og: [number, number];
  fg: [number, number];
  ibu: [number, number];
  srm: [number, number];
  abv: [number, number];
}

/**
 * Unified view over BJCP_2021 + customStyles for the Style Picker and
 * range-bar consumers. All numeric ranges are normalised to BJCP units —
 * og/fg in SG (1.040 etc.), srm in SRM, ibu and abv unchanged — so
 * StatsSidebar's existing styleMarkerPos calls work for either source.
 *
 * Custom styles store og/fg as °P and color as EBC (per the editor
 * inputs); this layer converts them. Any range whose min/max are both
 * null is set to null on the unified def so consumers can render '—'.
 */
export interface UnifiedStyle {
  key: string;
  name: string;
  cat: string;
  /** Display label for the picker's "Style Guide" column. */
  guide: string;
  source: 'bjcp' | 'custom';
  og:  [number, number] | null;
  fg:  [number, number] | null;
  ibu: [number, number] | null;
  srm: [number, number] | null;
  abv: [number, number] | null;
}

export const BJCP_2021: Record<string, StyleDef> = {
  '1A':{ name:'American Light Lager',       cat:'1. Standard American Beer',  og:[1.028,1.040], fg:[0.998,1.008], ibu:[8,12],   srm:[2,3],   abv:[2.8,4.2] },
  '1B':{ name:'American Lager',             cat:'1. Standard American Beer',  og:[1.040,1.050], fg:[1.004,1.010], ibu:[8,18],   srm:[2,4],   abv:[4.2,5.3] },
  '1C':{ name:'Cream Ale',                  cat:'1. Standard American Beer',  og:[1.042,1.055], fg:[1.006,1.012], ibu:[8,20],   srm:[2,5],   abv:[4.2,5.6] },
  '1D':{ name:'American Wheat Beer',        cat:'1. Standard American Beer',  og:[1.040,1.055], fg:[1.008,1.013], ibu:[8,15],   srm:[3,6],   abv:[4.0,5.5] },
  '2A':{ name:'International Pale Lager',   cat:'2. International Lager',     og:[1.042,1.050], fg:[1.008,1.012], ibu:[18,25],  srm:[2,6],   abv:[4.6,6.0] },
  '2B':{ name:'International Amber Lager',  cat:'2. International Lager',     og:[1.042,1.055], fg:[1.008,1.014], ibu:[8,25],   srm:[7,14],  abv:[4.6,6.0] },
  '2C':{ name:'International Dark Lager',   cat:'2. International Lager',     og:[1.044,1.056], fg:[1.008,1.012], ibu:[8,20],   srm:[14,30], abv:[4.2,6.0] },
  '3A':{ name:'Czech Pale Lager',           cat:'3. Czech Lager',             og:[1.028,1.044], fg:[1.008,1.014], ibu:[20,35],  srm:[3,6],   abv:[3.0,4.1] },
  '3B':{ name:'Czech Premium Pale Lager',   cat:'3. Czech Lager',             og:[1.044,1.060], fg:[1.013,1.017], ibu:[30,45],  srm:[3,6],   abv:[4.2,5.8] },
  '3C':{ name:'Czech Amber Lager',          cat:'3. Czech Lager',             og:[1.044,1.060], fg:[1.013,1.017], ibu:[20,35],  srm:[10,16], abv:[4.4,5.8] },
  '3D':{ name:'Czech Dark Lager',           cat:'3. Czech Lager',             og:[1.044,1.060], fg:[1.013,1.017], ibu:[15,34],  srm:[17,35], abv:[4.4,5.8] },
  '4A':{ name:'Munich Helles',              cat:'4. Pale Malty European Lager', og:[1.044,1.048], fg:[1.006,1.012], ibu:[16,22], srm:[3,5],   abv:[4.7,5.4] },
  '4B':{ name:'Festbier',                   cat:'4. Pale Malty European Lager', og:[1.054,1.057], fg:[1.010,1.014], ibu:[18,25], srm:[4,7],   abv:[5.8,6.3] },
  '4C':{ name:'Helles Bock',                cat:'4. Pale Malty European Lager', og:[1.064,1.072], fg:[1.011,1.018], ibu:[23,35], srm:[6,11],  abv:[6.3,7.4] },
  '5A':{ name:'German Leichtbier',          cat:'5. Pale Bitter European Beer', og:[1.026,1.034], fg:[1.006,1.010], ibu:[15,28], srm:[2,5],   abv:[2.4,3.6] },
  '5B':{ name:'Kölsch',                     cat:'5. Pale Bitter European Beer', og:[1.044,1.050], fg:[1.007,1.011], ibu:[18,30], srm:[3,5],   abv:[4.4,5.2] },
  '5C':{ name:'German Helles Exportbier',   cat:'5. Pale Bitter European Beer', og:[1.048,1.056], fg:[1.010,1.015], ibu:[20,30], srm:[4,7],   abv:[4.8,6.0] },
  '5D':{ name:'German Pils',                cat:'5. Pale Bitter European Beer', og:[1.044,1.050], fg:[1.008,1.013], ibu:[22,40], srm:[2,5],   abv:[4.4,5.2] },
  '6A':{ name:'Märzen',                     cat:'6. Amber Malty European Lager', og:[1.054,1.060], fg:[1.010,1.014], ibu:[18,24], srm:[8,17],  abv:[5.6,6.3] },
  '6B':{ name:'Rauchbier',                  cat:'6. Amber Malty European Lager', og:[1.050,1.057], fg:[1.012,1.016], ibu:[20,30], srm:[12,22], abv:[4.8,6.0] },
  '6C':{ name:'Dunkles Bock',               cat:'6. Amber Malty European Lager', og:[1.064,1.072], fg:[1.013,1.019], ibu:[20,27], srm:[14,22], abv:[6.3,7.2] },
  '7A':{ name:'Vienna Lager',               cat:'7. Amber Bitter European Beer', og:[1.048,1.055], fg:[1.010,1.014], ibu:[18,30], srm:[9,15],  abv:[4.7,5.5] },
  '7B':{ name:'Altbier',                    cat:'7. Amber Bitter European Beer', og:[1.044,1.052], fg:[1.008,1.014], ibu:[25,50], srm:[11,17], abv:[4.3,5.5] },
  '7C':{ name:'Kellerbier',                 cat:'7. Amber Bitter European Beer', og:[1.048,1.056], fg:[1.012,1.016], ibu:[25,40], srm:[7,17],  abv:[4.7,5.4] },
  '8A':{ name:'Munich Dunkel',              cat:'8. Dark European Lager', og:[1.048,1.056], fg:[1.010,1.016], ibu:[18,28], srm:[14,28], abv:[4.5,5.6] },
  '8B':{ name:'Schwarzbier',               cat:'8. Dark European Lager', og:[1.046,1.052], fg:[1.010,1.016], ibu:[20,35], srm:[17,30], abv:[4.4,5.4] },
  '9A':{ name:'Doppelbock',                 cat:'9. Strong European Beer', og:[1.072,1.112], fg:[1.016,1.024], ibu:[16,26], srm:[6,25],  abv:[7.0,10.0] },
  '9B':{ name:'Eisbock',                    cat:'9. Strong European Beer', og:[1.078,1.120], fg:[1.020,1.035], ibu:[25,35], srm:[18,30], abv:[9.0,14.0] },
  '9C':{ name:'Baltic Porter',              cat:'9. Strong European Beer', og:[1.060,1.090], fg:[1.016,1.024], ibu:[20,40], srm:[17,30], abv:[6.5,9.5] },
  '10A':{ name:'Weissbier',                 cat:'10. German Wheat Beer', og:[1.044,1.052], fg:[1.010,1.014], ibu:[8,15],  srm:[2,6],   abv:[4.3,5.6] },
  '10B':{ name:'Dunkles Weissbier',         cat:'10. German Wheat Beer', og:[1.044,1.056], fg:[1.010,1.014], ibu:[10,18], srm:[14,23], abv:[4.3,5.6] },
  '10C':{ name:'Weizenbock',                cat:'10. German Wheat Beer', og:[1.064,1.090], fg:[1.015,1.022], ibu:[15,30], srm:[6,25],  abv:[6.5,9.0] },
  '11A':{ name:'Ordinary Bitter',           cat:'11. British Bitter', og:[1.030,1.039], fg:[1.007,1.011], ibu:[25,35], srm:[8,14],  abv:[3.2,3.8] },
  '11B':{ name:'Best Bitter',               cat:'11. British Bitter', og:[1.040,1.048], fg:[1.008,1.012], ibu:[25,40], srm:[8,16],  abv:[3.8,4.6] },
  '11C':{ name:'Strong Bitter',             cat:'11. British Bitter', og:[1.048,1.060], fg:[1.010,1.016], ibu:[30,50], srm:[8,18],  abv:[4.6,6.2] },
  '12A':{ name:'British Golden Ale',        cat:'12. Pale Commonwealth Beer', og:[1.038,1.053], fg:[1.006,1.012], ibu:[20,45], srm:[2,6],   abv:[3.8,5.0] },
  '12B':{ name:'Australian Sparkling Ale',  cat:'12. Pale Commonwealth Beer', og:[1.042,1.050], fg:[1.006,1.011], ibu:[20,35], srm:[4,7],   abv:[4.5,6.0] },
  '12C':{ name:'English IPA',               cat:'12. Pale Commonwealth Beer', og:[1.050,1.075], fg:[1.010,1.018], ibu:[40,60], srm:[6,14],  abv:[5.0,7.5] },
  '13A':{ name:'Dark Mild',                 cat:'13. Brown British Beer', og:[1.030,1.038], fg:[1.008,1.013], ibu:[10,25], srm:[12,25], abv:[3.0,3.8] },
  '13B':{ name:'British Brown Ale',         cat:'13. Brown British Beer', og:[1.040,1.052], fg:[1.008,1.013], ibu:[20,30], srm:[12,22], abv:[4.2,5.4] },
  '13C':{ name:'English Porter',            cat:'13. Brown British Beer', og:[1.040,1.052], fg:[1.008,1.014], ibu:[18,35], srm:[20,30], abv:[4.0,5.4] },
  '14A':{ name:'Scottish Light',            cat:'14. Scottish Ale', og:[1.030,1.035], fg:[1.010,1.013], ibu:[10,20], srm:[17,22], abv:[2.5,3.3] },
  '14B':{ name:'Scottish Heavy',            cat:'14. Scottish Ale', og:[1.035,1.040], fg:[1.010,1.015], ibu:[10,20], srm:[13,22], abv:[3.3,3.9] },
  '14C':{ name:'Scottish Export',           cat:'14. Scottish Ale', og:[1.040,1.060], fg:[1.010,1.016], ibu:[15,30], srm:[13,22], abv:[3.9,6.0] },
  '15A':{ name:'Irish Red Ale',             cat:'15. Irish Beer', og:[1.036,1.046], fg:[1.010,1.014], ibu:[18,28], srm:[9,18],  abv:[3.8,5.0] },
  '15B':{ name:'Irish Stout',               cat:'15. Irish Beer', og:[1.036,1.044], fg:[1.007,1.011], ibu:[25,45], srm:[25,40], abv:[4.0,4.5] },
  '15C':{ name:'Irish Extra Stout',         cat:'15. Irish Beer', og:[1.052,1.062], fg:[1.010,1.014], ibu:[35,50], srm:[25,40], abv:[5.5,6.5] },
  '16A':{ name:'Sweet Stout',               cat:'16. Dark British Beer', og:[1.044,1.060], fg:[1.012,1.024], ibu:[20,40], srm:[30,40], abv:[4.0,6.0] },
  '16B':{ name:'Oatmeal Stout',             cat:'16. Dark British Beer', og:[1.045,1.065], fg:[1.010,1.018], ibu:[25,40], srm:[22,40], abv:[4.2,5.9] },
  '16C':{ name:'Tropical Stout',            cat:'16. Dark British Beer', og:[1.056,1.084], fg:[1.010,1.018], ibu:[30,50], srm:[30,40], abv:[5.5,8.0] },
  '16D':{ name:'Foreign Extra Stout',       cat:'16. Dark British Beer', og:[1.056,1.075], fg:[1.010,1.018], ibu:[25,50], srm:[30,40], abv:[6.3,8.0] },
  '17A':{ name:'British Strong Ale',        cat:'17. Strong British Ale', og:[1.055,1.080], fg:[1.015,1.022], ibu:[30,60], srm:[8,22],  abv:[5.5,8.0] },
  '17B':{ name:'Old Ale',                   cat:'17. Strong British Ale', og:[1.055,1.088], fg:[1.015,1.022], ibu:[30,60], srm:[10,22], abv:[5.5,9.0] },
  '17C':{ name:'Wee Heavy',                 cat:'17. Strong British Ale', og:[1.070,1.130], fg:[1.018,1.040], ibu:[17,35], srm:[14,25], abv:[6.5,10.0] },
  '17D':{ name:'English Barleywine',        cat:'17. Strong British Ale', og:[1.080,1.120], fg:[1.018,1.030], ibu:[35,70], srm:[8,22],  abv:[8.0,12.0] },
  '18A':{ name:'Blonde Ale',                cat:'18. Pale American Ale', og:[1.038,1.054], fg:[1.008,1.013], ibu:[15,28], srm:[3,6],   abv:[3.8,5.5] },
  '18B':{ name:'American Pale Ale',         cat:'18. Pale American Ale', og:[1.045,1.060], fg:[1.010,1.015], ibu:[30,50], srm:[5,10],  abv:[5.0,6.0] },
  '19A':{ name:'American Amber Ale',        cat:'19. Amber and Brown American Beer', og:[1.045,1.060], fg:[1.010,1.015], ibu:[25,40], srm:[10,17], abv:[4.5,6.2] },
  '19B':{ name:'California Common',         cat:'19. Amber and Brown American Beer', og:[1.048,1.054], fg:[1.011,1.014], ibu:[30,45], srm:[10,14], abv:[4.5,5.5] },
  '19C':{ name:'American Brown Ale',        cat:'19. Amber and Brown American Beer', og:[1.045,1.060], fg:[1.010,1.016], ibu:[20,30], srm:[18,35], abv:[4.3,6.2] },
  '20A':{ name:'American Porter',           cat:'20. American Porter and Stout', og:[1.050,1.070], fg:[1.012,1.018], ibu:[25,50], srm:[22,40], abv:[4.8,6.5] },
  '20B':{ name:'American Stout',            cat:'20. American Porter and Stout', og:[1.050,1.075], fg:[1.010,1.022], ibu:[35,75], srm:[30,40], abv:[5.0,7.0] },
  '20C':{ name:'Imperial Stout',            cat:'20. American Porter and Stout', og:[1.075,1.115], fg:[1.018,1.030], ibu:[50,90], srm:[30,40], abv:[8.0,12.0] },
  '21A':{ name:'American IPA',              cat:'21. IPA', og:[1.056,1.070], fg:[1.008,1.014], ibu:[40,70], srm:[6,14],  abv:[5.5,7.5] },
  '21B':{ name:'Specialty IPA',             cat:'21. IPA', og:[1.056,1.070], fg:[1.008,1.014], ibu:[40,70], srm:[6,14],  abv:[5.5,9.0] },
  '21C':{ name:'Hazy IPA',                  cat:'21. IPA', og:[1.060,1.085], fg:[1.010,1.015], ibu:[25,60], srm:[3,7],   abv:[6.0,9.0] },
  '22A':{ name:'Double IPA',                cat:'22. Strong American Ale', og:[1.065,1.100], fg:[1.008,1.018], ibu:[60,120], srm:[6,14],  abv:[7.5,10.0] },
  '22B':{ name:'American Strong Ale',       cat:'22. Strong American Ale', og:[1.062,1.090], fg:[1.014,1.024], ibu:[50,100], srm:[7,19],  abv:[6.3,10.0] },
  '22C':{ name:'American Barleywine',       cat:'22. Strong American Ale', og:[1.080,1.120], fg:[1.016,1.030], ibu:[50,100], srm:[10,19], abv:[8.0,12.0] },
  '22D':{ name:'Wheatwine',                 cat:'22. Strong American Ale', og:[1.080,1.120], fg:[1.016,1.030], ibu:[30,60],  srm:[8,15],  abv:[8.0,12.0] },
  '23A':{ name:'Berliner Weisse',           cat:'23. European Sour Ale', og:[1.028,1.032], fg:[1.003,1.006], ibu:[3,8],   srm:[2,3],   abv:[2.8,3.8] },
  '23B':{ name:'Flanders Red Ale',          cat:'23. European Sour Ale', og:[1.048,1.057], fg:[1.002,1.012], ibu:[10,25], srm:[10,16], abv:[4.6,6.5] },
  '23C':{ name:'Oud Bruin',                 cat:'23. European Sour Ale', og:[1.040,1.074], fg:[1.008,1.012], ibu:[20,25], srm:[15,22], abv:[4.0,8.0] },
  '23D':{ name:'Lambic',                    cat:'23. European Sour Ale', og:[1.040,1.054], fg:[1.001,1.010], ibu:[0,10],  srm:[3,7],   abv:[5.0,6.5] },
  '23E':{ name:'Gueuze',                    cat:'23. European Sour Ale', og:[1.040,1.060], fg:[1.000,1.006], ibu:[0,10],  srm:[3,7],   abv:[5.0,8.0] },
  '23F':{ name:'Fruit Lambic',              cat:'23. European Sour Ale', og:[1.040,1.060], fg:[1.000,1.010], ibu:[0,10],  srm:[3,7],   abv:[5.0,7.0] },
  '23G':{ name:'Gose',                      cat:'23. European Sour Ale', og:[1.036,1.056], fg:[1.006,1.010], ibu:[5,12],  srm:[3,4],   abv:[4.2,4.8] },
  '24A':{ name:'Witbier',                   cat:'24. Belgian Ale', og:[1.044,1.052], fg:[1.008,1.012], ibu:[8,20],  srm:[2,4],   abv:[4.5,5.5] },
  '24B':{ name:'Belgian Pale Ale',          cat:'24. Belgian Ale', og:[1.048,1.054], fg:[1.010,1.014], ibu:[20,30], srm:[8,14],  abv:[4.8,5.5] },
  '24C':{ name:'Bière de Garde',            cat:'24. Belgian Ale', og:[1.060,1.080], fg:[1.008,1.016], ibu:[18,28], srm:[6,19],  abv:[6.0,8.5] },
  '25A':{ name:'Belgian Blond Ale',         cat:'25. Strong Belgian Ale', og:[1.062,1.075], fg:[1.008,1.018], ibu:[15,30], srm:[4,7],   abv:[6.0,7.5] },
  '25B':{ name:'Saison',                    cat:'25. Strong Belgian Ale', og:[1.048,1.065], fg:[1.002,1.012], ibu:[20,35], srm:[5,14],  abv:[3.5,9.0] },
  '25C':{ name:'Belgian Golden Strong Ale', cat:'25. Strong Belgian Ale', og:[1.070,1.095], fg:[1.005,1.016], ibu:[22,35], srm:[3,6],   abv:[7.5,10.5] },
  '26A':{ name:'Trappist Single',           cat:'26. Trappist Ale', og:[1.044,1.054], fg:[1.004,1.010], ibu:[25,45], srm:[3,5],   abv:[4.8,6.0] },
  '26B':{ name:'Belgian Dubbel',            cat:'26. Trappist Ale', og:[1.062,1.075], fg:[1.008,1.018], ibu:[15,25], srm:[10,17], abv:[6.0,7.6] },
  '26C':{ name:'Belgian Tripel',            cat:'26. Trappist Ale', og:[1.075,1.085], fg:[1.008,1.014], ibu:[20,40], srm:[4,7],   abv:[7.5,9.5] },
  '26D':{ name:'Belgian Dark Strong Ale',   cat:'26. Trappist Ale', og:[1.075,1.110], fg:[1.010,1.024], ibu:[20,35], srm:[12,22], abv:[8.0,12.0] },
  '27A':{ name:'Historical Beer',           cat:'27. Historical Beer', og:[1.040,1.090], fg:[1.006,1.016], ibu:[0,50],  srm:[2,30],  abv:[3.0,8.0] },
  '28A':{ name:'Brett Beer',                cat:'28. American Wild Ale', og:[1.045,1.072], fg:[1.004,1.012], ibu:[0,30],  srm:[3,30],  abv:[4.0,8.0] },
  '28B':{ name:'Mixed-Fermentation Sour',   cat:'28. American Wild Ale', og:[1.045,1.072], fg:[1.004,1.012], ibu:[3,25], srm:[3,25],  abv:[4.0,7.0] },
  '28C':{ name:'Wild Specialty Beer',       cat:'28. American Wild Ale', og:[1.045,1.072], fg:[1.004,1.012], ibu:[0,30],  srm:[3,30],  abv:[4.0,8.0] },
  '29A':{ name:'Fruit Beer',                cat:'29. Fruit Beer', og:[1.040,1.110], fg:[1.006,1.030], ibu:[0,45],  srm:[2,40],  abv:[1.0,12.0] },
  '29B':{ name:'Fruit and Spice Beer',      cat:'29. Fruit Beer', og:[1.040,1.110], fg:[1.006,1.030], ibu:[0,45],  srm:[2,40],  abv:[1.0,12.0] },
  '29C':{ name:'Specialty Fruit Beer',      cat:'29. Fruit Beer', og:[1.040,1.110], fg:[1.006,1.030], ibu:[0,45],  srm:[2,40],  abv:[1.0,12.0] },
  '30A':{ name:'Spice/Herb/Vegetable Beer', cat:'30. Spiced Beer', og:[1.030,1.110], fg:[1.006,1.030], ibu:[0,70], srm:[2,40], abv:[1.0,12.0] },
  '30B':{ name:'Autumn Seasonal Beer',      cat:'30. Spiced Beer', og:[1.050,1.100], fg:[1.010,1.022], ibu:[0,35],  srm:[5,50],  abv:[5.0,10.0] },
  '30C':{ name:'Winter Seasonal Beer',      cat:'30. Spiced Beer', og:[1.055,1.100], fg:[1.010,1.025], ibu:[0,60],  srm:[5,50],  abv:[6.0,12.0] },
  '30D':{ name:'Specialty Spice Beer',      cat:'30. Spiced Beer', og:[1.030,1.110], fg:[1.006,1.030], ibu:[0,70],  srm:[2,40],  abv:[1.0,12.0] },
  '34A':{ name:'Clone Beer',                cat:'34. Specialty Beer', og:[1.030,1.120], fg:[1.004,1.030], ibu:[0,100], srm:[2,40], abv:[1.0,14.0] },
  '34B':{ name:'Mixed-Style Beer',          cat:'34. Specialty Beer', og:[1.030,1.120], fg:[1.004,1.030], ibu:[0,100], srm:[2,40], abv:[1.0,14.0] },
  '34C':{ name:'Experimental Beer',         cat:'34. Specialty Beer', og:[1.030,1.120], fg:[1.004,1.030], ibu:[0,100], srm:[2,40], abv:[1.0,14.0] },
};

/** Calculate marker position (0-100%) for a value within a style range */
export function styleMarkerPos(value: number, range: [number, number]): number {
  if (range[1] <= range[0]) return 50;
  const pct = ((value - range[0]) / (range[1] - range[0])) * 100;
  return Math.max(0, Math.min(100, pct));
}

// ─── Unified Style helpers ────────────────────────────────────────────

function bjcpToUnified(key: string, s: StyleDef): UnifiedStyle {
  return {
    key, name: s.name, cat: s.cat, guide: 'BJCP 2021', source: 'bjcp',
    og: s.og, fg: s.fg, ibu: s.ibu, srm: s.srm, abv: s.abv,
  };
}

/** Pair (min, max) → range tuple, or null if both blank. Falls back to
 *  using one bound as the other when only one side is set so the bar
 *  still renders something. */
function pairOrNull(
  min: number | null | undefined,
  max: number | null | undefined,
): [number, number] | null {
  if (min == null && max == null) return null;
  const lo = min ?? max ?? 0;
  const hi = max ?? min ?? 0;
  return [lo, hi];
}

function customToUnified(key: string, s: CustomStyle): UnifiedStyle {
  // Custom OG/FG inputs are in °P → convert to SG so range bars use the
  // same axis as BJCP. Color is in EBC → convert to SRM (×0.508).
  const ogP = pairOrNull(s.og_min, s.og_max);
  const fgP = pairOrNull(s.fg_min, s.fg_max);
  const ebc = pairOrNull(s.ebc_min, s.ebc_max);
  return {
    key, name: s.name, cat: s.cat || 'Custom Styles',
    guide: s.guide?.trim() || 'Custom',
    source: 'custom',
    og:  ogP ? [platoToSg(ogP[0]), platoToSg(ogP[1])] : null,
    fg:  fgP ? [platoToSg(fgP[0]), platoToSg(fgP[1])] : null,
    ibu: pairOrNull(s.ibu_min, s.ibu_max),
    srm: ebc ? [ebc[0] / 1.97, ebc[1] / 1.97] : null,
    abv: pairOrNull(s.abv_min, s.abv_max),
  };
}

/** All styles, unified — BJCP first (in BJCP key order), then custom. */
export function getAllUnifiedStyles(
  customStyles: Record<string, CustomStyle>,
): UnifiedStyle[] {
  const bjcp = Object.entries(BJCP_2021).map(([k, s]) => bjcpToUnified(k, s));
  const custom = Object.entries(customStyles).map(([k, s]) => customToUnified(k, s));
  return [...bjcp, ...custom];
}

/** Single-style lookup. Recipe.styleKey may point at either source —
 *  this returns the right one or null. */
export function getUnifiedStyle(
  key: string | undefined | null,
  customStyles: Record<string, CustomStyle>,
): UnifiedStyle | null {
  if (!key) return null;
  if (BJCP_2021[key]) return bjcpToUnified(key, BJCP_2021[key]);
  if (customStyles[key]) return customToUnified(key, customStyles[key]);
  return null;
}

/**
 * Picker label format. Stored on `recipe.style` for tax records / exports.
 *   • BJCP → `Name (BJCP <key>)` (matches HTML lines 6294, 5057)
 *   • Custom → `Name (<guide>)` if guide is set, else `Name (Custom)`.
 */
export function formatStyleLabel(s: UnifiedStyle): string {
  if (s.source === 'bjcp') return `${s.name} (BJCP ${s.key})`;
  return `${s.name} (${s.guide || 'Custom'})`;
}
