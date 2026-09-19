import { memo } from 'react';
import { LineChart } from '../components/LineChart';
import { Meter, Panel, TyreRing, pct } from '../components/ui';
import { TEAMS, OUR_DRIVER } from '../data/grid';
import { RACE_LAPS } from '../data/track';
import { TRAFFIC_ALLOWANCE } from '../sim/strategy';
import { COMPOUNDS, PIT_LOSS_GREEN, PIT_LOSS_SC, PIT_LOSS_VSC } from '../sim/tyres';
import type { Compound } from '../sim/types';
import type { SimHandle } from '../useSim';

const ROW = { display: 'grid', gridTemplateColumns: '112px 1fr 64px', gap: 10, alignItems: 'center' } as const;

function StintBars({ h }: { h: SimHandle }) {
  const { sim, analysis: a } = h;
  const our = sim.our;
  // Completed stints from the stop log.
  const past: { compound: Compound; from: number; to: number }[] = [];
  let from = 1, comp = our.compoundsUsed[0];
  for (const s of our.stops) { past.push({ compound: comp, from, to: s.lap }); from = s.lap + 1; comp = s.to; }
  const x = (lap: number) => `${((lap - 1) / RACE_LAPS) * 100}%`;
  const wd = (f: number, t: number) => `${((t - f + 1) / RACE_LAPS) * 100}%`;
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {a.options.map((o, i) => (
        <div key={o.id} style={ROW}>
          <div>
            <div className="mono" style={{ fontWeight: 700 }}>{o.label}</div>
            <div className="muted" style={{ fontSize: 10.5 }}>{o.stops.length ? `Stop lap ${o.stops.map((s) => s.lap).join(', ')}` : 'To the flag'}</div>
          </div>
          <div style={{ position: 'relative', height: 22, background: 'var(--bg-3)' }}>
            {past.map((s, k) => <div key={`p${k}`} title={`${COMPOUNDS[s.compound].name} L${s.from}-${s.to}`} style={{ position: 'absolute', left: x(s.from), width: wd(s.from, s.to), top: 3, bottom: 3, background: COMPOUNDS[s.compound].color, opacity: 0.3, borderRight: '2px solid var(--bg-2)' }} />)}
            {o.stints.map((s, k) => {
              const f = k === 0 ? from : s.from;
              return <div key={k} title={`${COMPOUNDS[s.compound].name} L${f}-${s.to}`} style={{ position: 'absolute', left: x(f), width: wd(f, s.to), top: 3, bottom: 3, background: COMPOUNDS[s.compound].color, opacity: 0.88, borderRight: '2px solid var(--bg-2)', borderRadius: 2, display: 'flex', alignItems: 'center', paddingLeft: 5, font: '700 10px var(--mono)', color: '#0a0d11', overflow: 'hidden' }}>{s.compound} {s.to - f + 1}</div>;
            })}
            <div style={{ position: 'absolute', left: x(a.lap), top: -3, bottom: -3, width: 2, background: 'var(--ours)' }} />
          </div>
          <div className="mono" style={{ textAlign: 'right', fontWeight: 600, color: i === 0 ? 'var(--good)' : 'var(--text-2)' }}>{i === 0 ? 'BEST' : `+${o.delta.toFixed(1)} s`}</div>
        </div>
      ))}
      <div style={ROW} className="mono muted">
        <span />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span>L1</span><span>L14</span><span>L28</span><span>L42</span><span>L56</span></div>
        <span />
      </div>
    </div>
  );
}

function GapLadder({ h }: { h: SimHandle }) {
  const { sim, analysis: a } = h;
  const our = sim.our;
  const span = 34;
  const lo = our.gapLeader - 5;
  const cars = sim.cars.filter((c) => c.status !== 'OUT' && !c.finished && c.gapLeader >= lo && c.gapLeader <= lo + span);
  const x = (g: number) => `${((g - lo) / span) * 100}%`;
  const rejoinGap = our.gapLeader + a.pitLossNow;
  return (
    <div>
      <div style={{ position: 'relative', height: 74, margin: '4px 14px 0' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 46, height: 1, background: 'var(--line-2)' }} />
        {cars.map((c, i) => {
          const ours = c.code === OUR_DRIVER;
          // Alternate label rows so bunched cars stay readable.
          const low = i % 2 === 1;
          return (
            <div key={c.code} style={{ position: 'absolute', left: x(c.gapLeader), top: low ? 41 : 22, display: 'flex', flexDirection: low ? 'column-reverse' : 'column', transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: ours ? 'var(--ours)' : 'var(--text-2)' }}>{c.code}</div>
              <div style={{ width: ours ? 11 : 9, height: ours ? 11 : 9, borderRadius: '50%', background: TEAMS[c.driver.team].color, margin: '3px auto 0', border: `2px solid ${ours ? 'var(--ours)' : 'var(--bg-2)'}` }} />
            </div>
          );
        })}
        {rejoinGap <= lo + span && (
          <div style={{ position: 'absolute', left: x(rejoinGap), top: 0, bottom: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--warn)', whiteSpace: 'nowrap' }}>REJOIN P{a.rejoin.pos}</div>
            <div style={{ width: 0, height: 56, margin: '2px auto 0', borderLeft: '1.5px dashed var(--warn)' }} />
          </div>
        )}
      </div>
      <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, margin: '0 6px' }}><span>← AHEAD</span><span>gap to leader, {span} s window</span><span>BEHIND →</span></div>
      <p className="note" style={{ marginTop: 8 }}>Box now: lose {a.pitLossNow.toFixed(1)} s, rejoin {a.rejoin.text}.</p>
    </div>
  );
}

export const StrategyTab = memo(function StrategyTab({ h }: { h: SimHandle; slow: number }) {
  const { sim, analysis: a } = h;
  const pw = a.pitWindow;
  return (
    <div className="grid two-col">
      <Panel title="Strategy options" tag={`OPTIMISER · ${a.remaining} LAPS LEFT`} style={{ gridColumn: '1 / -1' }}>
        {a.optionsNote && <p className="note" style={{ margin: '0 0 10px', borderColor: 'var(--warn)' }}>{a.optionsNote}</p>}
        <StintBars h={h} />
        <p className="muted" style={{ fontSize: 11, margin: '10px 0 0' }}>Model: tyre offsets and degradation from practice long runs, scaled for track temperature ({sim.weather.trackTemp.toFixed(0)} °C). Each stop costs {PIT_LOSS_GREEN} s plus a {TRAFFIC_ALLOWANCE} s track-position allowance. Faded bars are stints already run; the cyan line is the current lap.</p>
      </Panel>

      <Panel title="Pit window" tag={pw ? `OPEN L${pw.open} · BEST L${pw.best} · CLOSE L${pw.close}` : 'NO STOP PLANNED'}>
        {pw ? (
          <LineChart height={210} series={[{ id: 'd', label: 'Time lost vs best stop lap', color: 'var(--s1)', points: pw.curve.map((c) => ({ x: c.lap, y: c.delta })) }]}
            yDomain={[0, Math.min(14, Math.max(4, ...pw.curve.map((c) => c.delta)))]} xTitle="Lap of first stop" xFmt={(v) => `L${Math.round(v)}`} yFmt={(v) => `+${v.toFixed(1)}s`}
            xDomain={[pw.curve[0].lap, Math.min(56, pw.close + 8)]} bands={[{ x0: pw.open, x1: pw.close, color: '#3dcc91', label: 'WINDOW' }]} markers={[{ x: a.lap, label: 'NOW' }]} />
        ) : <p className="muted">The current tyres go to the flag on the best plan.</p>}
      </Panel>

      <Panel title="If we box this lap" tag={`PIT LOSS · GREEN ${PIT_LOSS_GREEN} · VSC ${PIT_LOSS_VSC} · SC ${PIT_LOSS_SC} s`}>
        <GapLadder h={h} />
      </Panel>

      <Panel title="Undercut / overcut" tag="CARS WITHIN TWO POSITIONS" style={{ gridColumn: '1 / -1' }} bodyClass="flush scroll">
        <table className="t">
          <thead><tr><th>Car</th><th>Rel</th><th className="num">Gap</th><th>Tyre</th><th className="num">Pace vs us</th><th className="num">Undercut gain</th><th style={{ width: 150 }}>Jump probability</th><th className="num">Overcut (2 laps)</th><th>Read</th></tr></thead>
          <tbody>
            {a.rivals.map((r) => (
              <tr key={r.code}>
                <td><b className="mono">{r.code}</b></td>
                <td><span className={`pill ${r.relation === 'AHEAD' ? '' : 'warn'}`}>{r.relation}</span></td>
                <td className="num">{r.gap.toFixed(1)} s</td>
                <td><span className="tyre"><TyreRing c={r.compound} />{r.tyreAge} laps · {r.stops} stop</span></td>
                <td className="num" style={{ color: r.paceDelta > 0.05 ? 'var(--good)' : r.paceDelta < -0.05 ? 'var(--serious)' : undefined }}>{r.paceDelta >= 0 ? '+' : ''}{r.paceDelta.toFixed(2)} s</td>
                <td className="num">{r.undercutGain.toFixed(1)} s</td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Meter value={r.undercutProb} color={r.relation === 'AHEAD' ? 'var(--good)' : 'var(--serious)'} /></div><span className="mono" style={{ width: 34, textAlign: 'right' }}>{pct(r.undercutProb)}</span></div></td>
                <td className="num">{r.relation === 'AHEAD' ? `${r.overcutGain >= 0 ? '+' : ''}${r.overcutGain.toFixed(1)} s` : '—'}</td>
                <td className="dim">{r.note}</td>
              </tr>
            ))}
            {!a.rivals.length && <tr><td colSpan={9} className="muted">No cars in range.</td></tr>}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11, margin: 10 }}>Ahead: probability that we come out in front if we stop first and they respond a lap later. Behind: probability that they jump us if they stop first. Positive pace means the rival is slower than us right now.</p>
      </Panel>
    </div>
  );
}, (p, n) => p.slow === n.slow);
