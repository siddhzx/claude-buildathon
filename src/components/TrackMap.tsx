import { useState } from 'react';
import { TEAMS, OUR_DRIVER } from '../data/grid';
import { PIT_PATH, TRACK_PATH, TRACK_VIEW, TURNS, pitPoint, pointAtDist, pointAtTime, sectorPath } from '../data/track';
import type { RaceSim } from '../sim/engine';
import { compass } from '../sim/strategy';

const SECTOR_COLORS = ['#3987e5', '#c98500', '#199e70'];
const sectorPaths = [1, 2, 3].map((s) => sectorPath(s as 1 | 2 | 3));
const sf = pointAtDist(0);
const sectorLabelAt = [0.13, 0.45, 0.8].map((d) => pointAtDist(d));

export function TrackMap({ sim }: { sim: RaceSim; frame: number }) {
  const [allLabels, setAllLabels] = useState(false);
  const our = sim.our;
  const yellow = sim.yellowSectors;
  const w = sim.weather;
  const neutral = sim.neutral != null;
  const keyCodes = new Set<string>([OUR_DRIVER, sim.cars[0]?.code, sim.cars[our.pos - 2]?.code, sim.cars[our.pos]?.code]);

  // Draw back-to-front so the leaders and our car sit on top.
  const cars = [...sim.cars].filter((c) => c.status !== 'OUT' && !c.finished).reverse();
  const windTo = ((w.windDir + 180) * Math.PI) / 180;

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${TRACK_VIEW.w} ${TRACK_VIEW.h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="rain" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#7fd6ff" strokeWidth="1" />
          </pattern>
        </defs>
        {w.rain > 0.04 && <rect width={TRACK_VIEW.w} height={TRACK_VIEW.h} fill="url(#rain)" opacity={Math.min(0.5, w.rain * 0.6)} />}

        <path d={TRACK_PATH} fill="none" stroke="#0a0d11" strokeWidth={19} strokeLinejoin="round" />
        <path d={TRACK_PATH} fill="none" stroke={w.wetness > 0.12 ? '#2c4258' : '#2a323e'} strokeWidth={14} strokeLinejoin="round" />
        {sectorPaths.map((d, i) => {
          const isYellow = yellow.includes(i + 1) || neutral;
          return <path key={i} d={d} fill="none" stroke={isYellow ? '#f0b726' : SECTOR_COLORS[i]} strokeWidth={isYellow ? 4 : 2} opacity={isYellow ? 0.95 : 0.75} className={isYellow ? 'hz' : ''} strokeLinejoin="round" />;
        })}
        <path d={PIT_PATH} fill="none" stroke="#56647a" strokeWidth={3} strokeDasharray="5 4" />

        {/* start / finish */}
        <g transform={`translate(${sf.x},${sf.y}) rotate(${(sf.angle * 180) / Math.PI})`}>
          <rect x={-2} y={-11} width={4} height={22} fill="#e6eaf0" />
        </g>
        <text x={sf.x - 22} y={sf.y + 26} fill="var(--text-3)" fontSize={10} fontFamily="var(--mono)">S/F</text>
        <text x={sf.x + 40} y={sf.y - 12} fill="#56647a" fontSize={9.5} fontFamily="var(--mono)">PIT LANE</text>

        {TURNS.map((t) => (
          <text key={t.name} x={t.lx} y={t.ly + 3} textAnchor="middle" fill="var(--text-3)" fontSize={10.5} fontFamily="var(--mono)" fontWeight={600}>{t.name.slice(1)}</text>
        ))}
        {sectorLabelAt.map((p, i) => (
          <text key={i} x={p.x + (i === 1 ? 0 : i === 0 ? 34 : -6)} y={p.y + (i === 1 ? -22 : i === 0 ? 8 : 40)} textAnchor="middle" fill={SECTOR_COLORS[i]} fontSize={11} fontFamily="var(--mono)" fontWeight={700} opacity={0.9}>S{i + 1}</text>
        ))}

        {sim.hazards.map((h) => {
          const p = pointAtDist(h.dist);
          return (
            <g key={h.id} transform={`translate(${p.x},${p.y})`} className="hz">
              <circle r={17} fill="none" stroke="#f0b726" strokeWidth={1} opacity={0.6} />
              <path d="M0,-11 L10,7 L-10,7 Z" fill="#f0b726" stroke="#0a0d11" strokeWidth={1.5} />
              <text y={5} textAnchor="middle" fontSize={11} fontWeight={800} fill="#0a0d11">!</text>
              <text x={20} y={-10} fill="#f0b726" fontSize={10} fontFamily="var(--mono)" fontWeight={700}>{h.kind} · {h.turn}</text>
            </g>
          );
        })}

        {cars.map((c) => {
          const ours = c.code === OUR_DRIVER;
          const p = c.status === 'PIT' ? pitPoint(sim.pitPathU(c)) : pointAtTime(c.prog);
          const color = TEAMS[c.driver.team].color;
          const label = allLabels || keyCodes.has(c.code);
          return (
            <g key={c.code} transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}>
              <title>{`P${c.pos} ${c.driver.name} · ${TEAMS[c.driver.team].name}`}</title>
              {ours && <circle className="halo" r={9} />}
              <circle r={ours ? 7.5 : 5.5} fill={color} stroke={ours ? '#2ee6d6' : '#0a0d11'} strokeWidth={ours ? 2.5 : 1.5} />
              {label && (
                <g transform="translate(10,-9)">
                  <rect x={-2} y={-10} width={ours ? 50 : 30} height={13} fill="#0a0d11" opacity={0.82} stroke={ours ? '#2ee6d6' : 'none'} strokeWidth={0.75} />
                  <text fill={ours ? '#2ee6d6' : '#e6eaf0'} fontSize={10} fontFamily="var(--mono)" fontWeight={700}>{c.code}{ours ? ` P${c.pos}` : ''}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* north + wind */}
        <g transform={`translate(${TRACK_VIEW.w - 62},58)`}>
          <circle r={34} fill="#0a0d11" opacity={0.7} stroke="#364150" />
          {[0, 90, 180, 270].map((a) => <line key={a} x1={0} y1={-34} x2={0} y2={-29} stroke="#56647a" transform={`rotate(${a})`} />)}
          <text y={-38} textAnchor="middle" fill="var(--text-3)" fontSize={9.5} fontFamily="var(--mono)">N</text>
          <g transform={`rotate(${(windTo * 180) / Math.PI})`}>
            <line x1={0} y1={20} x2={0} y2={-18} stroke="#7fd6ff" strokeWidth={2} />
            <path d="M0,-25 L6,-13 L-6,-13 Z" fill="#7fd6ff" />
          </g>
          <text y={50} textAnchor="middle" fill="var(--text-2)" fontSize={10} fontFamily="var(--mono)">{compass(w.windDir)} {w.windSpeed.toFixed(0)} km/h</text>
        </g>
      </svg>
      <div className="map-hud" style={{ left: 10, top: 8 }}>CIRCUIT OF THE AMERICAS · 5.513 KM · 20 TURNS · ANTICLOCKWISE</div>
      <div className="map-legend">
        <span><i style={{ background: SECTOR_COLORS[0] }} />S1</span>
        <span><i style={{ background: SECTOR_COLORS[1] }} />S2</span>
        <span><i style={{ background: SECTOR_COLORS[2] }} />S3</span>
        <span><i style={{ background: '#f0b726' }} />YELLOW</span>
        <button className="btn small" style={{ pointerEvents: 'auto', marginLeft: 6 }} onClick={() => setAllLabels((v) => !v)}>{allLabels ? 'KEY LABELS' : 'ALL LABELS'}</button>
      </div>
    </div>
  );
}
