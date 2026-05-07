/**
 * Fermentation Chart — canvas port of brewlab-desktop.html drawFermChart
 * (line 19764). Draws Plato (left axis, amber), pH (right axis, green),
 * Temp (faint background line, no axis), date labels along the bottom.
 *
 * Annotation lines for DH1/DH2/DH3/Crash/Pitch/Transfer match notes via
 * regex; recorded DH dates get a faint hop icon below the plot area.
 *
 * Re-renders on entries / brewDate / dhRecordedDates change. Resizes to
 * its parent on window resize.
 */

import { useEffect, useRef } from 'react';
import type { FermLogEntry } from '../../types';

interface Props {
  entries: FermLogEntry[];
  brewDate?: string;
  measuredOG?: number | null;
  /** Map of `dh1-recorded` / `dh2-recorded` / `dh3-recorded` for hop icons. */
  dhRecorded?: { 1?: string; 2?: string; 3?: string };
}

const ANNOTATION_KW: { re: RegExp; color: string; label: string }[] = [
  { re: /dh\s*1/i,    color: '#c07010', label: 'DH1' },
  { re: /dh\s*2/i,    color: '#c07010', label: 'DH2' },
  { re: /dh\s*3/i,    color: '#c07010', label: 'DH3' },
  { re: /crash/i,     color: '#3a70c0', label: 'Crash' },
  { re: /pitch/i,     color: '#60a860', label: 'Pitch' },
  { re: /transfer/i,  color: '#8855cc', label: 'Xfr' },
];

export default function FermChart({ entries, brewDate, measuredOG, dhRecorded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const parent = canvas.parentElement;
      const W = parent?.clientWidth  || 600;
      const H = parent?.clientHeight || 260;
      // Only reassign when the value actually differs — `canvas.width = same`
      // still resets the bitmap per HTML spec, which caused jitter when
      // ResizeObserver was firing repeatedly.
      if (canvas.width  !== W) canvas.width  = W;
      if (canvas.height !== H) canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pad = { top: 24, right: 44, bottom: 36, left: 48 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top  - pad.bottom;

      ctx.clearRect(0, 0, W, H);

      // Build sorted entries — prepend brew day + measured OG if set
      let sorted: { date: string; plato: number | null; ph: number | null; temp: number | null; notes: string }[] =
        [...entries].sort((a, b) => a.date.localeCompare(b.date)).map(e => ({
          date: e.date,
          plato: e.plato != null ? e.plato : null,
          ph:    e.ph    != null ? e.ph    : null,
          temp:  e.temp  != null ? e.temp  : null,
          notes: e.notes || '',
        }));

      if (brewDate) {
        const alreadyHasBrewDate = sorted.some(e => e.date === brewDate);
        if (!alreadyHasBrewDate) {
          // Convert SG → Plato if needed: HTML's heuristic — values >2 are
          // already in Plato, otherwise (sg-1)*250 ≈ Plato.
          let ogPlato: number | null = null;
          if (measuredOG && isFinite(measuredOG)) {
            ogPlato = measuredOG > 2 ? measuredOG : (measuredOG - 1) * 250;
          }
          sorted = [{ date: brewDate, plato: ogPlato, ph: null, temp: null, notes: 'Brew Day' }, ...sorted];
          sorted.sort((a, b) => a.date.localeCompare(b.date));
        }
      }

      const dates  = sorted.map(e => e.date);
      const platos = sorted.map(e => e.plato);
      const phs    = sorted.map(e => e.ph);
      const temps  = sorted.map(e => e.temp);

      const platoVals = platos.filter((p): p is number => p != null);
      const phVals    = phs.filter((p): p is number => p != null);
      const maxPlato  = Math.max(15, ...platoVals);
      const platoTop  = Math.ceil(maxPlato / 5) * 5;
      const maxPh     = Math.max(5.5, ...phVals);
      const minPh     = Math.min(3.5, ...phVals);
      const phRange   = maxPh - minPh || 1;
      const n = dates.length;

      const xOf    = (i: number) => pad.left + plotW * (n > 1 ? i / (n - 1) : 0.5);
      const yPlato = (p: number) => pad.top + plotH * (1 - p / platoTop);
      const yPh    = (p: number) => pad.top + plotH * (1 - (p - minPh) / phRange);

      // Grid — always draw so the empty state still shows the chart frame.
      // (HTML returns early on empty, but the typical empty-state shows the
      // brew-day point and therefore axes; matching that visual here means
      // drawing axes even when the entry list is empty.)
      ctx.strokeStyle = 'rgba(80,80,110,0.25)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 5; i++) {
        const y = pad.top + plotH * (i / 5);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const x = xOf(i);
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
      }

      // Left axis — Plato
      ctx.fillStyle = '#888898'; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const val = platoTop * (1 - i / 5);
        const y = pad.top + plotH * (i / 5);
        ctx.fillText(val.toFixed(0) + 'P', pad.left - 6, y + 4);
      }

      // Right axis — pH
      ctx.fillStyle = '#4aaa70'; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'left';
      for (let i = 0; i <= 5; i++) {
        const val = maxPh - phRange * (i / 5);
        const y = pad.top + plotH * (i / 5);
        ctx.fillText(val.toFixed(1), pad.left + plotW + 5, y + 4);
      }

      // X-axis date labels
      ctx.fillStyle = '#666677'; ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'center';
      const stride = Math.max(1, Math.ceil(n / 12));
      dates.forEach((d, i) => {
        if (n <= 12 || i % stride === 0) {
          const label = d.length >= 10 ? d.slice(5) : d; // MM-DD
          ctx.fillText(label, xOf(i), pad.top + plotH + 20);
        }
      });

      // Annotation lines (DH1/2/3/Crash/Pitch/Xfr)
      sorted.forEach((e, i) => {
        if (!e.notes) return;
        const match = ANNOTATION_KW.find(k => k.re.test(e.notes));
        if (!match) return;
        const x = xOf(i);
        ctx.strokeStyle = match.color + '88';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = match.color;
        ctx.font = '9px IBM Plex Mono';
        ctx.textAlign = 'center';
        ctx.fillText(match.label, x, pad.top - 6);
      });

      // Temp — faint, no axis
      const hasTemps = temps.some(t => t != null);
      if (hasTemps) {
        const tempVals = temps.filter((t): t is number => t != null);
        const maxTemp = Math.max(30, ...tempVals);
        const tempTop = Math.ceil(maxTemp / 10) * 10;
        const yTemp = (t: number) => pad.top + plotH * (1 - t / tempTop);
        ctx.strokeStyle = 'rgba(160,160,170,0.3)';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        let started = false;
        temps.forEach((t, i) => {
          if (t == null) return;
          const x = xOf(i), y = yTemp(t);
          if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
        });
        ctx.stroke();
      }

      // Plato line + dots + labels
      ctx.strokeStyle = '#c07010'; ctx.lineWidth = 3.5; ctx.globalAlpha = 1;
      ctx.beginPath();
      let startedP = false;
      platos.forEach((p, i) => {
        if (p == null) return;
        const x = xOf(i), y = yPlato(p);
        if (!startedP) { ctx.moveTo(x, y); startedP = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
      platos.forEach((p, i) => {
        if (p == null) return;
        const x = xOf(i), y = yPlato(p);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#c07010'; ctx.fill();
        ctx.fillStyle = '#e09030'; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'center';
        ctx.fillText(p.toFixed(1), x, y - 8);
      });

      // pH line + dots + labels
      ctx.strokeStyle = '#4aaa70'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      let startedH = false;
      phs.forEach((p, i) => {
        if (p == null) return;
        const x = xOf(i), y = yPh(p);
        if (!startedH) { ctx.moveTo(x, y); startedH = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      phs.forEach((p, i) => {
        if (p == null) return;
        const x = xOf(i), y = yPh(p);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#4aaa70'; ctx.fill();
        ctx.fillStyle = '#6acc90'; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'center';
        ctx.fillText(p.toFixed(1), x, y - 8);
      });

      // DH "recorded" markers — small text labels below the plot.
      // (HTML draws a hop icon image; we use a simple amber DH<n> label,
      // since the embedded base64 image isn't worth porting.)
      ([1, 2, 3] as const).forEach(num => {
        const dhDate = dhRecorded?.[num];
        if (!dhDate) return;
        const idx = dates.findIndex(d => d === dhDate);
        if (idx < 0) return;
        const x = xOf(idx);
        const y = pad.top + plotH + 28;
        ctx.fillStyle = '#c07010';
        ctx.font = 'bold 9px IBM Plex Mono';
        ctx.textAlign = 'center';
        ctx.fillText(`🌿 DH${num}`, x, y);
      });

      // Empty-state overlay — drawn last so it sits over the (still-rendered)
      // axes and gridlines.
      if (sorted.length === 0) {
        ctx.fillStyle = '#555566';
        ctx.font = '11px IBM Plex Mono';
        ctx.textAlign = 'center';
        ctx.fillText('No fermentation data', W / 2, H / 2);
      }
    };

    draw();
    // Window resize is enough — the chart fills its parent, and the parent's
    // dimensions only change when the window does. Avoids the ResizeObserver
    // canvas-in-flex feedback loop where clientWidth fluctuates frame-to-frame.
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [entries, brewDate, measuredOG, dhRecorded]);

  // position:absolute removes the canvas from its parent's flex calculation
  // so its intrinsic bitmap size doesn't feed back into the parent's measured
  // size. Parent is set to position:relative in the consumer.
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
