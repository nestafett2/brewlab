/**
 * BeerXML library export — mirrors brewlab-desktop.html lines 16920–16951
 * (libExport).
 *
 * One serialiser per section. Output matches the HTML's exact tag/attr
 * shape so files round-trip cleanly between the React port and the HTML
 * reference app or any third-party BeerXML consumer.
 *
 * Color note: BeerXML <COLOR> is in SRM. We store EBC, so divide by 1.97
 * on export (HTML grainEBCtoSRM helper). On import we do the reverse.
 */

import type { MaltLib, HopLib, YeastLib, MiscLib } from '../../types';
import type { LibSection } from './libraryShared';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const num = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return isFinite(v) ? v : fallback;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  return fallback;
};

const grainEBCtoSRM = (ebc: number): number => ebc / 1.97;

export function exportMalts(data: MaltLib[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<FERMENTABLES>\n';
  for (const e of data) {
    xml += `  <FERMENTABLE>\n`;
    xml += `    <NAME>${esc(e.name)}</NAME>\n`;
    xml += `    <TYPE>${esc(e.malt_type || 'Grain')}</TYPE>\n`;
    xml += `    <COLOR>${grainEBCtoSRM(num(e.ebc)).toFixed(1)}</COLOR>\n`;
    xml += `    <NOTES>${esc(e.notes)}</NOTES>\n`;
    xml += `  </FERMENTABLE>\n`;
  }
  xml += '</FERMENTABLES>';
  return xml;
}

export function exportHops(data: HopLib[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<HOPS>\n';
  for (const e of data) {
    xml += `  <HOP>\n`;
    xml += `    <NAME>${esc(e.name)}</NAME>\n`;
    xml += `    <ALPHA>${num(e.aa, 0)}</ALPHA>\n`;
    xml += `    <BETA>${num(e.beta, 0)}</BETA>\n`;
    xml += `    <ORIGIN>${esc(e.origin)}</ORIGIN>\n`;
    xml += `    <FORM>${esc(e.hop_type || 'Pellet')}</FORM>\n`;
    xml += `    <NOTES>${esc(e.notes)}</NOTES>\n`;
    xml += `  </HOP>\n`;
  }
  xml += '</HOPS>';
  return xml;
}

export function exportYeast(data: YeastLib[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<YEASTS>\n';
  for (const e of data) {
    xml += `  <YEAST>\n`;
    xml += `    <NAME>${esc(e.name)}</NAME>\n`;
    xml += `    <LABORATORY>${esc(e.lab)}</LABORATORY>\n`;
    xml += `    <TYPE>${esc(e.yeast_type || 'Ale')}</TYPE>\n`;
    xml += `    <ATTENUATION>${num(e.atten, 75)}</ATTENUATION>\n`;
    xml += `    <MIN_TEMPERATURE>${num(e.temp_min, 16)}</MIN_TEMPERATURE>\n`;
    xml += `    <MAX_TEMPERATURE>${num(e.temp_max, 22)}</MAX_TEMPERATURE>\n`;
    xml += `    <NOTES>${esc(e.notes)}</NOTES>\n`;
    xml += `  </YEAST>\n`;
  }
  xml += '</YEASTS>';
  return xml;
}

export function exportMisc(data: MiscLib[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<MISCS>\n';
  for (const e of data) {
    xml += `  <MISC>\n`;
    xml += `    <NAME>${esc(e.name)}</NAME>\n`;
    xml += `    <TYPE>${esc(e.misc_type || 'Other')}</TYPE>\n`;
    xml += `    <USE>${esc(e.use || 'Boil')}</USE>\n`;
    xml += `    <NOTES>${esc(e.notes)}</NOTES>\n`;
    xml += `  </MISC>\n`;
  }
  xml += '</MISCS>';
  return xml;
}

export function exportSection(
  sec: LibSection,
  data: { malts: MaltLib[]; hops: HopLib[]; yeast: YeastLib[]; misc: MiscLib[] },
): string {
  switch (sec) {
    case 'malts': return exportMalts(data.malts);
    case 'hops':  return exportHops(data.hops);
    case 'yeast': return exportYeast(data.yeast);
    case 'misc':  return exportMisc(data.misc);
  }
}
