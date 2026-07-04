/**
 * Blank tasting scorecard — A4 portrait, pure black-on-white, designed to
 * be printed and filled in by hand. Mirrors the on-screen tasting panel
 * (hop & fruit / malt & fermentation descriptors, structured notes, brew
 * again + rating) but as circle-a-score / write-on-the-lines paper form.
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

const SCORE_LABELS = ['0', '½', '1', '1½', '2', '2½', '3', '3½', '4', '4½', '5'];

const NOTE_BOXES = ['Appearance', 'Aroma', 'Flavor', 'Mouthfeel', 'Overall Impression'];

// 11 open circles to circle by hand.
const CIRCLE_ROW = '○'.repeat(SCORE_LABELS.length);

function descriptorRow(name: string): string {
  return `<div class="desc"><span class="desc-name">${escapeHtml(name)}</span><span class="circles">${CIRCLE_ROW}</span></div>`;
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

  <div class="section-h">Hop &amp; Fruit Character</div>
  <div class="legend">Circle a score →&nbsp;&nbsp;${SCORE_LABELS.join('&nbsp;&nbsp;')}</div>
  <div class="grid">
    ${HOP_DESCRIPTORS.map(descriptorRow).join('')}
  </div>

  <div class="section-h">Malt &amp; Fermentation Character</div>
  <div class="legend">Circle a score →&nbsp;&nbsp;${SCORE_LABELS.join('&nbsp;&nbsp;')}</div>
  <div class="grid">
    ${MALT_DESCRIPTORS.map(descriptorRow).join('')}
  </div>

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
    .legend { font-size: 9pt; color: #555; margin-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 28px; }
    .desc { display: flex; align-items: center; justify-content: space-between; padding: 2px 0; }
    .desc-name { font-size: 11pt; }
    .circles { font-size: 11pt; line-height: 14px; letter-spacing: 4px; }
    .note-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .note-box { border: 1px solid #ccc; padding: 8px; min-height: 60px; }
    .note-label { font-size: 9pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
    .rule { border-bottom: 1px solid #ddd; margin: 8px 0; height: 20px; }
    .overall { display: flex; gap: 48px; margin-top: 6px; font-size: 11pt; }
    .ov-label { font-weight: bold; }
  `;

  printHtml(body, {
    title: `Tasting Scorecard${beerName ? ' — ' + beerName : ''}`,
    pageSize: 'A4',
    landscape: false,
    extraStyles,
  });
}
