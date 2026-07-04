/**
 * Blank tasting scorecard — A4 portrait, pure black-on-white, designed to
 * be printed and filled in by hand. Mirrors the on-screen tasting panel
 * (hop & fruit / malt & fermentation descriptors, structured notes, brew
 * again + rating) but as a circle-a-score / write-on-the-lines paper form.
 *
 * Scoring layout: the two descriptor sections sit side by side in the top
 * half of the page. Each descriptor is a single compact row —
 * "Descriptor   0 ○ 1 ○ 2 ○ 3 ○ 4 ○ 5" — where the printed whole numbers
 * are the integer scores and each ○ between them is the half-point to
 * circle. The bottom half is left for the written tasting notes.
 */

import { printHtml, escapeHtml } from '../../lib/print';

const HOP_DESCRIPTORS = [
  'Citrus', 'Tropical', 'Berry', 'Stone Fruit', 'Floral',
  'Piney/Resinous', 'Dank', 'Earthy', 'Spicy/Herbal',
];

const MALT_DESCRIPTORS = [
  'Light Grain', 'Dark Grain', 'Sweet/Caramel', 'Nutty',
  'Sour/Acidic', 'Funky/Yeasty', 'Full Body', 'Clean/Dry',
];

// Whole numbers in regular text; the ○ between each pair is the half-point.
const SCALE = '0 ○ 1 ○ 2 ○ 3 ○ 4 ○ 5';

const NOTE_BOXES = ['Appearance', 'Aroma', 'Flavor', 'Mouthfeel', 'Overall Impression'];

/** One descriptor section (header + compact scored rows) for a column. */
function sectionColumn(title: string, descriptors: string[]): string {
  const rows = descriptors.map(d =>
    `<tr><td class="dn">${escapeHtml(d)}</td><td class="sc">${SCALE}</td></tr>`
  ).join('');
  return `<div class="sec-h">${escapeHtml(title)}</div><table class="desc-tbl"><tbody>${rows}</tbody></table>`;
}

function noteBox(label: string): string {
  return `<div class="note-box">
    <div class="note-label">${escapeHtml(label)}</div>
    <div class="rule"></div><div class="rule"></div><div class="rule"></div><div class="rule"></div>
  </div>`;
}

export function printTastingSheet(beerName: string, brewDate: string, breweryName: string): void {
  const body = `
<div class="sheet">
  <div class="top">
    <div class="brewery">${escapeHtml(breweryName || '')}</div>
    <div class="scorecard">TASTING SCORECARD</div>
  </div>

  <div class="fields">
    <span>Beer: <span class="fill">${escapeHtml(beerName || '')}</span></span>
    <span>Date: <span class="fill">${escapeHtml(brewDate || '')}</span></span>
    <span>Taster: <span class="fill"></span></span>
  </div>

  <table class="two-col"><tbody><tr>
    <td class="col">${sectionColumn('Hop & Fruit Character', HOP_DESCRIPTORS)}</td>
    <td class="col">${sectionColumn('Malt & Fermentation Character', MALT_DESCRIPTORS)}</td>
  </tr></tbody></table>

  <div class="section-h">Tasting Notes</div>
  <div class="note-grid">
    ${NOTE_BOXES.map(noteBox).join('')}
  </div>

  <div class="section-h">Overall</div>
  <div class="overall">
    <div><span class="ov-label">BREW AGAIN?</span>&nbsp;&nbsp;&#9744; Yes&nbsp;&nbsp;&nbsp;&#9744; Maybe&nbsp;&nbsp;&nbsp;&#9744; No</div>
    <div><span class="ov-label">RATING:</span> <span class="circles">${'○'.repeat(5)}</span></div>
  </div>
</div>`;

  const extraStyles = `
    body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #000; font-size: 11pt; }
    .sheet { max-width: 100%; }
    .top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; }
    .brewery { font-size: 20pt; font-weight: bold; }
    .scorecard { font-size: 12pt; font-weight: bold; letter-spacing: 2px; }
    .fields { display: flex; gap: 28px; margin-bottom: 12px; font-size: 11pt; }
    .fields .fill { display: inline-block; min-width: 130px; border-bottom: 1px solid #000; padding: 0 4px; }
    .section-h { font-size: 10pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; margin: 12px 0 4px; padding-bottom: 2px; }

    /* Two scoring sections side by side, top half of the page. */
    .two-col { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 4px; }
    .two-col > tbody > tr > td.col { width: 50%; vertical-align: top; border: none; padding: 0; }
    .two-col > tbody > tr > td.col:first-child { padding-right: 20px; }
    .sec-h { font-size: 10pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; margin: 0 0 4px; padding-bottom: 2px; }

    /* Compact descriptor rows: name left, "0 ○ 1 ○ … 5" scale right. */
    .desc-tbl { width: 100%; border-collapse: collapse; }
    .desc-tbl td { border: none; padding: 1px 0; }
    .desc-tbl .dn { font-size: 10pt; white-space: nowrap; padding-right: 8px; }
    .desc-tbl .sc { font-family: 'Courier New', monospace; font-size: 10pt; letter-spacing: 1px; text-align: right; white-space: nowrap; }

    .note-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .note-box { border: 1px solid #ccc; padding: 8px; min-height: 60px; }
    .note-label { font-size: 9pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
    .rule { border-bottom: 1px solid #ddd; margin: 8px 0; height: 20px; }
    .overall { display: flex; gap: 48px; margin-top: 6px; font-size: 11pt; }
    .ov-label { font-weight: bold; }
    .circles { font-size: 11pt; line-height: 14px; letter-spacing: 4px; }
  `;

  printHtml(body, {
    title: `Tasting Scorecard${beerName ? ' — ' + beerName : ''}`,
    pageSize: 'A4',
    landscape: false,
    extraStyles,
  });
}
