import { useState } from 'react';
import { LineChart } from '../components/LineChart';
import { Radar } from '../components/Radar';
import { Kpi, Panel, pct } from '../components/ui';
import { RACE_LAPS } from '../data/track';
import { compass } from '../sim/strategy';
import { INTER_CROSSOVER, WET_CROSSOVER } from '../sim/tyres';
import type { SimHandle } from '../useSim';

function Crossover({ wetness, peak }: { wetness: number; peak: number }) {
  const zones = [{ to: INTER_CROSSOVER, label: 'SLICKS', color: '#e8ecf1' }, { to: WET_CROSSOVER, label: 'INTERMEDIATE', color: '#3dcc91' }, { to: 1, label: 'FULL WET', color: '#4c90f0' }];
  let from = 0;
  return (
    <div>
      <div style={{ position: 'relative', height: 40, marginTop: 16 }}>
        <div style={{ display: 'flex', height: 12, gap: 2 }}>
          {zones.map((z) => { const w = z.to - from; from = z.to; return <div key={z.label} style={{ width: `${w * 100}%`, background: z.color, opacity: 0.75, borderRadius: 2 }} />; })}
        </div>
        <div style={{ position: 'absolute', left: `${Math.min(1, wetness) * 100}%`, top: -14, transform: 'translateX(-50%)', textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ours)' }}>NOW {pct(wetness)}</div>
          <div style={{ width: 2, height: 24, background: 'var(--ours)', margin: '0 auto' }} />
        </div>
        <div className="mono muted" style={{ display: 'flex', fontSize: 9.5, marginTop: 5 }}>
          <span style={{ width: `${INTER_CROSSOVER * 100}%` }}>SLICKS</span><span style={{ width: `${(WET_CROSSOVER - INTER_CROSSOVER) * 100}%` }}>INTERMEDIATE</span><span>FULL WET</span>
        </div>
      </div>
      <p className="note" style={{ marginTop: 6 }}>Crossover to intermediates at about {pct(INTER_CROSSOVER)} wetness, back to slicks near 13% on a drying track, full wets above {pct(WET_CROSSOVER)}. {peak > 0.3 ? `Forecast peak rain intensity ${pct(peak)} would take the track well into intermediate territory.` : 'No forecast rain strong enough to force a tyre change.'}</p>
    </div>
  );
}

export function WeatherTab({ h }: { h: SimHandle; slow: number }) {
  const { sim, analysis: a } = h;
  const [range, setRange] = useState(50);
  const w = sim.weather;
  const fc = a.forecast.filter((p) => p.min % 2 === 0);
  const tele = sim.telemetry;
  const act = (fn: () => void) => { fn(); h.refresh(); };

  return (
    <div className="grid two-col">
      <Panel title="Precipitation radar · Austin TX" bodyClass="flush" tag={<div className="seg">{[25, 50, 100].map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r} KM</button>)}</div>}>
        <Radar sim={sim} rangeKm={range} height={380} />
        <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 10.5, letterSpacing: '0.1em' }}>WHAT-IF</span>
          <button className="btn small" onClick={() => act(() => sim.injectRain(0.4))}>+ LIGHT SHOWER</button>
          <button className="btn small" onClick={() => act(() => sim.injectRain(0.85))}>+ HEAVY CELL</button>
          <button className="btn small" onClick={() => act(() => sim.clearRain())}>CLEAR RADAR</button>
          <span className="muted mono" style={{ fontSize: 10.5, marginLeft: 'auto' }}>STEERING FLOW {compass(w.steerDir)} {w.steerSpeed} KM/H</span>
        </div>
      </Panel>

      <div className="grid" style={{ alignContent: 'start' }}>
        <div className="kpis">
          <Kpi label="Rain now" value={pct(w.rain)} sub={w.rain < 0.05 ? 'Dry' : w.rain < 0.35 ? 'Light' : w.rain < 0.65 ? 'Moderate' : 'Heavy'} tone={w.rain > 0.05 ? 'up' : undefined} />
          <Kpi label="Track wetness" value={pct(w.wetness)} tone={w.wetness > 0.12 ? 'up' : undefined} sub="Racing line" />
          <Kpi label="Track temp" value={w.trackTemp.toFixed(1)} unit="°C" sub={`Air ${w.airTemp.toFixed(1)} °C`} />
          <Kpi label="Humidity" value={Math.round(w.humidity)} unit="%" sub={`Cloud ${pct(w.cloud)}`} />
          <Kpi label="Wind" value={w.windSpeed.toFixed(0)} unit="km/h" sub={`From ${compass(w.windDir)} (${Math.round(w.windDir)}°)`} />
          <Kpi label="Gusts" value={w.windGust.toFixed(0)} unit="km/h" tone={w.windGust > 32 ? 'up' : undefined} sub={w.windGust > 32 ? 'Affects braking' : 'Benign'} />
        </div>
        <Panel title="Rain forecast · next 60 min" tag={a.outlook.etaMin == null ? 'NO RAIN IN RANGE' : a.outlook.etaMin === 0 ? 'RAINING NOW' : `ETA ${a.outlook.etaMin} MIN · LAP ${Math.round(a.outlook.etaLap!)}`}>
          <LineChart height={170} xDomain={[0, 60]} yDomain={[0, 1]} xTitle="Minutes from now" xFmt={(v) => `+${Math.round(v)}`} yFmt={pct}
            series={[
              { id: 'i', label: 'Rain intensity at circuit', color: 'var(--s1)', kind: 'bars', points: fc.map((p) => ({ x: p.min, y: p.rain })) },
              { id: 'p', label: 'Probability of rain', color: 'var(--s2)', points: fc.map((p) => ({ x: p.min, y: p.prob })) },
            ]} />
        </Panel>
        <Panel title="Tyre crossover"><Crossover wetness={w.wetness} peak={a.outlook.peak} /></Panel>
      </div>

      <Panel title="Temperature trend" tag="PER LAP">
        {tele.length > 1 ? <LineChart height={180} xDomain={[1, RACE_LAPS]} xTitle="Lap" xFmt={(v) => `L${Math.round(v)}`} yFmt={(v) => `${v.toFixed(0)}°`}
          series={[{ id: 't', label: 'Track °C', color: 'var(--s2)', points: tele.map((s) => ({ x: s.lap, y: s.trackTemp })) }, { id: 'a', label: 'Air °C', color: 'var(--s1)', points: tele.map((s) => ({ x: s.lap, y: s.airTemp })) }]} /> : <p className="muted">Builds up as laps are completed.</p>}
      </Panel>

      <Panel title="Wind on the straights" tag={`${compass(w.windDir)} ${w.windSpeed.toFixed(0)} KM/H`}>
        <div className="kpis" style={{ marginBottom: 10 }}>
          <Kpi label="Main straight → T1" value={`${a.wind.mainStraight >= 0 ? 'HEAD' : 'TAIL'} ${Math.abs(a.wind.mainStraight).toFixed(0)}`} unit="km/h" tone={a.wind.mainStraight < -8 ? 'up' : undefined} />
          <Kpi label="Back straight → T12" value={`${a.wind.backStraight >= 0 ? 'HEAD' : 'TAIL'} ${Math.abs(a.wind.backStraight).toFixed(0)}`} unit="km/h" tone={a.wind.backStraight < -8 ? 'up' : undefined} />
        </div>
        <p className="note">{a.wind.note}</p>
        {tele.length > 1 && <LineChart height={110} legend={false} xDomain={[1, RACE_LAPS]} yFmt={(v) => `${v.toFixed(0)}`} xFmt={(v) => `L${Math.round(v)}`} series={[{ id: 'w', label: 'Wind km/h', color: 'var(--s3)', points: tele.map((s) => ({ x: s.lap, y: s.wind })) }]} />}
      </Panel>
    </div>
  );
}
