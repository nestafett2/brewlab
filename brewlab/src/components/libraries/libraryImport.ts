/**
 * BeerXML + BSMX library import — mirrors brewlab-desktop.html
 *   • handleLibXML (16965)         — BeerXML, auto-detects FERMENTABLE/HOP/YEAST/MISC
 *   • importBSMX   (17058)         — BeerSmith .bsmx, F_*_NAME tag detection
 *
 * Pure functions: take XML text + the current libNextId counters + the
 * current inventory-stock map, return new arrays + updated counters +
 * updated inventory map. The page component plugs the result into the
 * store via setMaltLib / setHopLib / etc.
 *
 * Auto-detection rules (HTML 16972, 17207):
 *   • file name ends '.bsmx' OR text contains '<F_G_NAME>' → BSMX import
 *   • else BeerXML; section = whichever of FERMENTABLE/HOP/YEAST/MISC
 *     has nodes (not the active section).
 *
 * Supplier convention (HTML 17007–17009):
 *   • BeerXML <SUPPLIER> = the maltster/manufacturer (Weyermann, Crisp).
 *   • BrewLab `supplier` = local wholesaler — kept blank on import so
 *     the user can fill it in. Imports populate `maltster` instead.
 */

import type { MaltLib, HopLib, YeastLib, MiscLib } from '../../types';
import type { LibSection } from './libraryShared';

export interface LibCounters { malts: number; hops: number; yeast: number; misc: number }

export interface ImportResult {
  /** Per-section detected counts. The page surfaces the totals in a toast. */
  counts: { malts: number; hops: number; yeast: number; misc: number };
  /** Section that received the most entries — the page should switch
   *  the active sub-section to this. Null if nothing imported. */
  detectedSection: LibSection | null;
  /** New entries to merge into existing libs. */
  newEntries: {
    malts: MaltLib[];
    hops: HopLib[];
    yeast: YeastLib[];
    misc: MiscLib[];
  };
  /** Updated id counter — caller persists. */
  nextId: LibCounters;
  /** Inventory-stock additions keyed by `<sec>_<id>`. Caller merges
   *  these into the existing bl_inv_stock map. */
  stockAdditions: Record<string, number>;
}

const getText = (parent: Element, tag: string): string => {
  const el = parent.querySelector(tag);
  return el ? (el.textContent || '').trim() : '';
};

/** Detect file flavour. */
export function isBSMX(filename: string, text: string): boolean {
  return filename.toLowerCase().endsWith('.bsmx') || text.includes('<F_G_NAME>');
}

// ═════════════════════════════════════════════════════════════════════
// BeerXML
// ═════════════════════════════════════════════════════════════════════

export function importBeerXML(
  xmlText: string,
  fallbackSection: LibSection,
  counters: LibCounters,
  invStock: Record<string, number>,
): ImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const next: LibCounters = { ...counters };
  const stockAdditions: Record<string, number> = {};
  const result: ImportResult['newEntries'] = { malts: [], hops: [], yeast: [], misc: [] };

  const hasFerm  = doc.querySelectorAll('FERMENTABLE').length > 0;
  const hasHop   = doc.querySelectorAll('HOP').length > 0;
  const hasYeast = doc.querySelectorAll('YEAST').length > 0;
  const hasMisc  = doc.querySelectorAll('MISC').length > 0;

  const detected: LibSection = hasFerm ? 'malts' : hasHop ? 'hops' : hasYeast ? 'yeast' : hasMisc ? 'misc' : fallbackSection;

  if (detected === 'malts') {
    doc.querySelectorAll('FERMENTABLE').forEach(n => {
      const name = getText(n, 'NAME');
      if (!name) return;
      // Prefer DISPLAY_COLOR if it's already EBC, else convert SRM→EBC.
      const dispColor = getText(n, 'DISPLAY_COLOR');
      let ebc = 0;
      if (dispColor && dispColor.includes('EBC')) ebc = parseFloat(dispColor) || 0;
      else ebc = (parseFloat(getText(n, 'COLOR')) || 0) * 1.97;
      // BeerXML SUPPLIER = maltster (manufacturer). Brewlab supplier
      // stays blank on import (HTML 17007–17009).
      const maltster = getText(n, 'SUPPLIER');
      const id = next.malts++;
      const entry: MaltLib = {
        id,
        name,
        maltster,
        supplier: '',
        malt_type: getText(n, 'TYPE') || 'Grain',
        ebc: ebc.toFixed(1),
        price: '',
        dbfg:    getText(n, 'COARSE_FINE_DIFF'),
        max_pct: getText(n, 'MAX_IN_BATCH'),
        moisture: getText(n, 'MOISTURE'),
        diastatic_power: getText(n, 'DIASTATIC_POWER'),
        protein: getText(n, 'PROTEIN'),
        yield_pct: getText(n, 'YIELD'),
        potential: getText(n, 'POTENTIAL'),
        notes: getText(n, 'NOTES'),
      };
      result.malts.push(entry);
      // Auto-populate stock from <INVENTORY> if present (HTML 17013–17015).
      const invQty = parseFloat(getText(n, 'INVENTORY')) || 0;
      if (invQty > 0) stockAdditions[`malts_${id}`] = invQty;
    });
  } else if (detected === 'hops') {
    doc.querySelectorAll('HOP').forEach(n => {
      const name = getText(n, 'NAME');
      if (!name) return;
      const id = next.hops++;
      result.hops.push({
        id, name,
        hop_type: (getText(n, 'FORM') || 'Pellet') as HopLib['hop_type'],
        aa:       getText(n, 'ALPHA'),
        beta:     getText(n, 'BETA'),
        origin:   getText(n, 'ORIGIN'),
        supplier: getText(n, 'SUPPLIER'),
        notes:    getText(n, 'NOTES'),
      });
    });
  } else if (detected === 'yeast') {
    doc.querySelectorAll('YEAST').forEach(n => {
      const name = getText(n, 'NAME');
      if (!name) return;
      const id = next.yeast++;
      result.yeast.push({
        id, name,
        lab:        getText(n, 'LABORATORY'),
        yeast_type: getText(n, 'TYPE') || 'Ale',
        atten:      getText(n, 'ATTENUATION'),
        temp_min:   getText(n, 'MIN_TEMPERATURE'),
        temp_max:   getText(n, 'MAX_TEMPERATURE'),
        notes:      getText(n, 'NOTES'),
      });
    });
  } else if (detected === 'misc') {
    doc.querySelectorAll('MISC').forEach(n => {
      const name = getText(n, 'NAME');
      if (!name) return;
      const id = next.misc++;
      result.misc.push({
        id, name,
        misc_type: getText(n, 'TYPE') || 'Other',
        use:       getText(n, 'USE') || 'Boil',
        notes:     getText(n, 'NOTES'),
      });
    });
  }

  const counts = {
    malts: result.malts.length,
    hops:  result.hops.length,
    yeast: result.yeast.length,
    misc:  result.misc.length,
  };
  const total = counts.malts + counts.hops + counts.yeast + counts.misc;

  return {
    counts,
    detectedSection: total > 0 ? detected : null,
    newEntries: result,
    nextId: next,
    stockAdditions: { ...invStock, ...stockAdditions },
  };
}

// ═════════════════════════════════════════════════════════════════════
// BSMX (BeerSmith) — HTML 17058–17229
// ═════════════════════════════════════════════════════════════════════

// HTML's entity map — BeerSmith files include HTML named entities that
// the XML parser won't accept. Replace known ones, strip unknown ones,
// protect & via __AMP__ (HTML 17060–17074).
const BSMX_ENTITY_MAP: Record<string, string> = {
  '&auml;':'ä','&ouml;':'ö','&uuml;':'ü','&Auml;':'Ä','&Ouml;':'Ö','&Uuml;':'Ü',
  '&szlig;':'ß','&deg;':'°','&reg;':'®','&trade;':'™','&copy;':'©',
  '&ndash;':'-','&mdash;':'-','&nbsp;':' ','&times;':'x','&micro;':'µ',
  '&plusmn;':'+/-','&frac12;':'½','&frac14;':'¼','&frac34;':'¾',
  '&ldquo;':'"','&rdquo;':'"','&lsquo;':"'",'&rsquo;':"'",'&apos;':"'",
  '&egrave;':'è','&eacute;':'é','&ecirc;':'ê','&aring;':'å','&aelig;':'æ',
  '&oacute;':'ó','&iacute;':'í','&ntilde;':'ñ','&beta;':'β','&alpha;':'α',
  '&amp;':'__AMP__',
};

const GRAIN_TYPES: Record<number, string> = { 0: 'Base', 1: 'Crystal', 2: 'Roasted', 3: 'Base', 4: 'Adjunct', 5: 'Wheat', 6: 'Other' };
const YEAST_TYPES: Record<number, string> = { 0: 'Ale', 1: 'Lager', 2: 'Belgian', 3: 'Kveik', 4: 'Wheat', 5: 'Wine', 6: 'Champagne', 7: 'Other' };

export function importBSMX(
  rawText: string,
  counters: LibCounters,
  invStock: Record<string, number>,
): ImportResult {
  // Entity pre-pass (HTML 17070–17074).
  let xmlText = rawText;
  for (const [k, v] of Object.entries(BSMX_ENTITY_MAP)) {
    xmlText = xmlText.split(k).join(v);
  }
  // Strip any remaining unknown named entities (e.g. emoji).
  xmlText = xmlText.replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, '');
  xmlText = xmlText.replace(/__AMP__/g, '&amp;');

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const get = (n: Element, tag: string): string => {
    const el = n.querySelector(tag);
    return el ? (el.textContent || '').trim() : '';
  };

  const next: LibCounters = { ...counters };
  const stockAdditions: Record<string, number> = {};
  const result: ImportResult['newEntries'] = { malts: [], hops: [], yeast: [], misc: [] };

  // ── Grains ──
  doc.querySelectorAll('Grain').forEach(n => {
    const name = get(n, 'F_G_NAME');
    if (!name) return;
    const srmColor = parseFloat(get(n, 'F_G_COLOR')) || 0;
    const ebc = (srmColor * 1.97).toFixed(1);
    const typeNum = parseInt(get(n, 'F_G_TYPE')) || 0;
    const malt_type = GRAIN_TYPES[typeNum] || 'Base';
    // BeerSmith stores price as ¥/oz; 1 kg = 35.274 oz.
    const pricePerOz = parseFloat(get(n, 'F_G_PRICE')) || 0;
    const price: string | number = pricePerOz > 0 ? Math.round(pricePerOz * 35.274) : '';
    const maltster = get(n, 'F_G_SUPPLIER');
    const id = next.malts++;
    result.malts.push({
      id, name, maltster, supplier: '', malt_type, ebc, price,
      dbfg:            get(n, 'F_G_COARSE_FINE_DIFF'),
      max_pct:         get(n, 'F_G_MAX_IN_BATCH'),
      moisture:        get(n, 'F_G_MOISTURE'),
      diastatic_power: get(n, 'F_G_DIASTATIC_POWER'),
      protein:         get(n, 'F_G_PROTEIN'),
      yield_pct:       get(n, 'F_G_YIELD'),
      potential:       '',
      notes:           get(n, 'F_G_NOTES'),
    });
    const inv = parseFloat(get(n, 'F_G_INVENTORY')) || 0;
    if (inv > 0) stockAdditions[`malts_${id}`] = inv;
  });

  // ── Hops ──
  doc.querySelectorAll('Hops').forEach(n => {
    const name = get(n, 'F_H_NAME');
    if (!name) return;
    const hPriceRaw = parseFloat(get(n, 'F_H_PRICE')) || 0;
    const hPrice: string | number = hPriceRaw > 0 ? Math.round(hPriceRaw * 35.274) : '';
    const id = next.hops++;
    result.hops.push({
      id, name,
      hop_type: (get(n, 'F_H_FORM') || 'Pellet') as HopLib['hop_type'],
      aa:       get(n, 'F_H_ALPHA'),
      beta:     get(n, 'F_H_BETA'),
      origin:   get(n, 'F_H_ORIGIN'),
      supplier: '',
      price:    hPrice,
      lot_num:  '',
      notes:    get(n, 'F_H_NOTES'),
    });
  });

  // ── Yeast ──
  doc.querySelectorAll('Yeast').forEach(n => {
    const name = get(n, 'F_Y_NAME');
    if (!name) return;
    const typeNum = parseInt(get(n, 'F_Y_TYPE')) || 0;
    // °F → °C
    const tMinF = parseFloat(get(n, 'F_Y_MIN_TEMP')) || 0;
    const tMaxF = parseFloat(get(n, 'F_Y_MAX_TEMP')) || 0;
    const tMin: string | number = tMinF > 0 ? ((tMinF - 32) * 5 / 9).toFixed(1) : '';
    const tMax: string | number = tMaxF > 0 ? ((tMaxF - 32) * 5 / 9).toFixed(1) : '';
    const yPriceRaw = parseFloat(get(n, 'F_Y_PRICE')) || 0;
    const yPrice: string | number = yPriceRaw > 0 ? Math.round(yPriceRaw) : '';
    // BSMX may use any of these tags, value 0–1 OR 0–100.
    const attenRaw = get(n, 'F_Y_ATTENUATION') || get(n, 'F_Y_BEST_ATTEN')
                   || get(n, 'F_Y_AVG_ATTENUATION') || get(n, 'F_Y_FLOCCULATION') || '';
    let atten: string | number = '';
    if (attenRaw) {
      const a = parseFloat(attenRaw);
      if (!isNaN(a) && a > 0) atten = a <= 1.5 ? (a * 100).toFixed(0) : a.toFixed(0);
    }
    const id = next.yeast++;
    result.yeast.push({
      id, name,
      lab:        get(n, 'F_Y_LAB'),
      yeast_type: YEAST_TYPES[typeNum] || 'Ale',
      atten,
      temp_min:   tMin,
      temp_max:   tMax,
      price:      yPrice,
      notes:      get(n, 'F_Y_NOTES'),
    });
  });

  // ── Misc ──
  doc.querySelectorAll('Misc').forEach(n => {
    const name = get(n, 'F_M_NAME');
    if (!name) return;
    const id = next.misc++;
    result.misc.push({
      id, name,
      misc_type: get(n, 'F_M_TYPE') || 'Other',
      use:       get(n, 'F_M_USE') || 'Boil',
      notes:     get(n, 'F_M_NOTES'),
    });
  });

  const counts = {
    malts: result.malts.length,
    hops:  result.hops.length,
    yeast: result.yeast.length,
    misc:  result.misc.length,
  };
  // HTML picks the section with any data, in order: malts > hops > yeast > misc.
  const detected: LibSection | null =
    counts.malts ? 'malts' :
    counts.hops  ? 'hops' :
    counts.yeast ? 'yeast' :
    counts.misc  ? 'misc' : null;

  return {
    counts,
    detectedSection: detected,
    newEntries: result,
    nextId: next,
    stockAdditions: { ...invStock, ...stockAdditions },
  };
}
