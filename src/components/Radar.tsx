import { useEffect, useRef } from 'react';
import { TRACK_PTS, TRACK_VIEW, METRES_PER_UNIT } from '../data/track';
import type { RaceSim } from '../sim/engine';

// Reflectivity ramp, the convention used by weather radar displays.
const DBZ: [number, string][] = [[0.06, '#0f5f4b'], [0.14, '#13855f'], [0.24, '#27ad62'], [0.36, '#9bc53d'], [0.5, '#f0c419'], [0.64, '#f08a24'], [0.8, '#e5484d'], [2, '#c026d3']];
const TOWNS: [string, number, number][] = [['AUSTIN', -13, 15], ['KAUS', -3.5, 6.5], ['BASTROP', 31, -2], ['LOCKHART', -4, -28], ['SAN MARCOS', -30, -28], ['ELGIN', 25, 24], ['KYLE', -24, -16]];

function noise(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export function Radar({ sim, rangeKm = 50, height = 300 }: { sim: RaceSim; rangeKm?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const simRef = useRef(sim);
  simRef.current = sim;

  useEffect(() => {
    const cv = ref.current!;
    // A timer rather than requestAnimationFrame: embedded previews can starve rAF.
    const draw = () => {
      const now = performance.now();
      const s = simRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0b0f14';
      g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const k = Math.min(W, H) / 2 / rangeKm; // px per km
      const X = (km: number) => cx + km * k, Y = (km: number) => cy - km * k;

      // Reflectivity field on a coarse grid, for the blocky radar look.
      const cell = 5;
      for (let py = 0; py < H; py += cell) {
        for (let px = 0; px < W; px += cell) {
          const kx = (px + cell / 2 - cx) / k, ky = (cy - py - cell / 2) / k;
          let v = 0;
          for (const c of s.weather.cells) {
            const d = Math.hypot(c.x - kx, c.y - ky) / c.r;
            if (d > 1.7) continue;
            const tex = 0.72 + 0.56 * noise(Math.round((kx - c.x) * 1.3), Math.round((ky - c.y) * 1.3), c.seed);
            v = Math.max(v, c.intensity * Math.exp(-d * d * 1.4) * tex);
          }
          if (v < DBZ[0][0]) continue;
          g.fillStyle = DBZ.find((b) => v < b[0])?.[1] ?? DBZ[DBZ.length - 1][1];
          g.globalAlpha = 0.85;
          g.fillRect(px, py, cell - 0.5, cell - 0.5);
        }
      }
      g.globalAlpha = 1;

      // Range rings and bearings.
      g.strokeStyle = '#2a3441';
      g.fillStyle = '#6f7b8a';
      g.font = '500 9.5px JetBrains Mono, monospace';
      g.lineWidth = 1;
      const rings = rangeKm > 60 ? [25, 50, 75, 100] : rangeKm > 30 ? [10, 25, 50] : [5, 10, 25];
      for (const r of rings) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); g.fillText(`${r} km`, cx + 4, cy - r * k + 11); }
      g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();
      for (const [name, x, y] of TOWNS) {
        if (Math.abs(x) > rangeKm * (W / Math.min(W, H)) || Math.abs(y) > rangeKm) continue;
        g.fillStyle = '#56647a'; g.fillRect(X(x) - 1.5, Y(y) - 1.5, 3, 3);
        g.fillStyle = '#8894a3'; g.fillText(name, X(x) + 5, Y(y) + 3);
      }

      // Cell tracks: projected path and ETA ring crossings.
      const lead = [...s.weather.cells].sort((p, q) => Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y))[0];
      for (const c of s.weather.cells) {
        const kmh = Math.hypot(c.vx, c.vy) * 3600;
        if (Math.hypot(c.x, c.y) > rangeKm * 1.6) continue;
        g.strokeStyle = 'rgba(230,234,240,0.55)'; g.setLineDash([3, 4]);
        g.beginPath(); g.moveTo(X(c.x), Y(c.y)); g.lineTo(X(c.x + c.vx * 60 * 30), Y(c.y + c.vy * 60 * 30)); g.stroke(); g.setLineDash([]);
        if (c !== lead) continue;
        g.fillStyle = '#e6eaf0';
        g.fillText(`NEAREST CELL · ${Math.hypot(c.x, c.y).toFixed(0)} km · ${kmh.toFixed(0)} km/h`, X(c.x) + 8, Y(c.y) - 8);
      }

      // Circuit outline at true scale (tiny at long range), plus marker.
      const mPerPx = 1000 / k;
      g.strokeStyle = '#2ee6d6'; g.lineWidth = 1.2; g.beginPath();
      TRACK_PTS.forEach((p, i) => {
        const x = cx + ((p.x - TRACK_VIEW.w / 2) * METRES_PER_UNIT) / mPerPx, y = cy + ((p.y - TRACK_VIEW.h / 2) * METRES_PER_UNIT) / mPerPx;
        if (i % 6 === 0) { if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      });
      g.closePath(); g.stroke();
      g.strokeStyle = '#2ee6d6'; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#2ee6d6'; g.fillText('COTA', cx + 13, cy + 14);

      // Sweep.
      const a = (now / 1400) % (Math.PI * 2);
      const grad = g.createConicGradient(a - Math.PI / 2, cx, cy);
      grad.addColorStop(0, 'rgba(46,230,214,0)'); grad.addColorStop(0.92, 'rgba(46,230,214,0)'); grad.addColorStop(1, 'rgba(46,230,214,0.16)');
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, Math.max(W, H), 0, Math.PI * 2); g.fill();
    };
    draw();
    const timer = window.setInterval(draw, 140);
    return () => window.clearInterval(timer);
  }, [rangeKm]);

  return (
    <div style={{ position: 'relative', height }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 0, font: '500 9px var(--mono)', color: 'var(--text-3)' }}>
        <span style={{ marginRight: 6 }}>LIGHT</span>
        {DBZ.map(([, c]) => <i key={c} style={{ width: 12, height: 6, background: c, display: 'block' }} />)}
        <span style={{ marginLeft: 6 }}>SEVERE</span>
      </div>
    </div>
  );
}
