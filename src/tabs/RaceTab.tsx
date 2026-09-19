import { Radar } from '../components/Radar';
import { TimingTower } from '../components/TimingTower';
import { TrackMap } from '../components/TrackMap';
import { Kpi, Panel, pct, riskColor } from '../components/ui';
import { compass } from '../sim/strategy';
import { INTER_CROSSOVER, WET_CROSSOVER } from '../sim/tyres';
import type { SimHandle } from '../useSim';

export function RaceTab({ h }: { h: SimHandle }) {
  const { sim, analysis: a, frame } = h;
  const w = sim.weather;
  const events = [...sim.events].reverse().slice(0, 60);
  const surface = w.wetness < 0.04 ? 'Dry line' : w.wetness < INTER_CROSSOVER ? 'Damp, slicks OK' : w.wetness < WET_CROSSOVER ? 'Intermediate' : 'Full wet';
  return (
    <div className="grid race-grid">
      <Panel title="Timing" tag="▲ = INTERVAL UNDER 1.0 s" bodyClass="flush">
        <TimingTower sim={sim} frame={frame} />
      </Panel>
      <div className="grid">
        <Panel title="Track position" tag={sim.hazards.length ? `${sim.hazards.length} HAZARD${sim.hazards.length > 1 ? 'S' : ''}` : 'TRACK CLEAR'} bodyClass="flush" style={{ height: 'min(52vh, 470px)' }}>
          <TrackMap sim={sim} frame={frame} />
        </Panel>
        <div className="kpis">
          <Kpi label="Track temp" value={w.trackTemp.toFixed(1)} unit="°C" sub={`Air ${w.airTemp.toFixed(1)} °C`} />
          <Kpi label="Wind" value={w.windSpeed.toFixed(0)} unit="km/h" sub={`${compass(w.windDir)} · gust ${w.windGust.toFixed(0)}`} />
          <Kpi label="Track wetness" value={pct(w.wetness)} sub={surface} tone={w.wetness > 0.12 ? 'up' : undefined} />
          <Kpi label="Rain ETA" value={a.outlook.etaMin == null ? '—' : a.outlook.etaMin === 0 ? 'NOW' : a.outlook.etaMin} unit={a.outlook.etaMin ? 'min' : undefined} sub={a.outlook.etaMin == null ? 'Radar clear 60 min' : `P ${pct(a.outlook.maxProb)} · peak ${pct(a.outlook.peak)}`} tone={a.outlook.etaMin != null ? 'up' : undefined} />
          <Kpi label="SC next 10 laps" value={<span style={{ color: riskColor(a.risk.sc10) }}>{pct(a.risk.sc10)}</span>} sub={`VSC ${pct(a.risk.vsc10)}`} />
          <Kpi label="Pit loss now" value={a.pitLossNow.toFixed(1)} unit="s" sub={`Rejoin ${a.rejoin.text.split(',')[0]}`} tone={a.pitLossNow < 20 ? 'ok' : undefined} />
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)' }}>
          <Panel title="Race control & radio" bodyClass="flush scroll" style={{ height: 250 }}>
            <div className="log">
              {events.map((e, i) => (
                <div key={`${e.t}-${i}`} className={`e ${e.kind}`}><span className="lap">L{e.lap}</span><span className="kind">{e.kind}</span><span>{e.text}</span></div>
              ))}
            </div>
          </Panel>
          <Panel title="Weather radar" tag="50 KM" bodyClass="flush" style={{ height: 250 }}>
            <Radar sim={sim} rangeKm={50} height={217} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
