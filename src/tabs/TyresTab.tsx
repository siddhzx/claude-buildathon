import { memo } from 'react';
import { LineChart, type Series } from '../components/LineChart';
import { Kpi, Meter, Panel, TyreRing, pct } from '../components/ui';
import { TEAMS } from '../data/grid';
import { PRACTICE_RUNS, RIVAL_LONG_RUN } from '../data/history';
import { RACE_LAPS } from '../data/track';
import { BASE_LAP, COMPOUNDS, FUEL_PER_LAP, MODE, SLICKS, degAt, fmtLap } from '../sim/tyres';
import type { Car } from '../sim/types';
import type { SimHandle } from '../useSim';

const cleanLaps = (car: Car) => car.laps.filter((l) => !l.pit && !l.neutral && l.lap > 1);

function slope(ys: number[]): number {
  const n = ys.length, mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  return den ? num / den : 0;
}

function Corners({ h }: { h: SimHandle }) {
  const { sim, analysis: a } = h;
  const our = sim.our;
  const w = sim.weather;
  // COTA loads the front-left hardest (esses, T16-18). Temperatures are indicative.
  const bias = { FL: 1.1, FR: 1.0, RL: 0.95, RR: 0.9 } as const;
  const wet = our.compound === 'I' || our.compound === 'W';
  const base = (wet ? 62 : 96) + (w.trackTemp - 38) * 0.7 + (our.mode === 'PUSH' ? 7 : our.mode === 'SAVE' ? -6 : 0) - (sim.neutral ? 22 : 0) - w.wetness * (wet ? 8 : 30);
  return (
    <div className="corners">
      {(Object.keys(bias) as (keyof typeof bias)[]).map((k, i) => {
        const wearPct = Math.min(1, (1 - a.tyre.lifeLeft) * bias[k]);
        const temp = base * (0.97 + bias[k] * 0.03) + Math.sin(sim.t / 7 + i * 1.7) * 2.2 + (k.startsWith('R') ? 4 : 0);
        const hot = temp > 112, cold = temp < (wet ? 45 : 78);
        return (
          <div className="cornerbox" key={k}>
            <div className="h"><span>{k}</span><span style={{ color: hot ? 'var(--serious)' : cold ? '#7fd6ff' : 'var(--good)' }}>{hot ? 'HOT' : cold ? 'COLD' : 'IN WINDOW'}</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 6px' }}><b>{temp.toFixed(0)}°</b><span className="mono dim">wear {pct(wearPct)}</span></div>
            <Meter value={1 - wearPct} color={wearPct > 0.75 ? 'var(--crit)' : wearPct > 0.55 ? 'var(--warn)' : 'var(--good)'} />
          </div>
        );
      })}
    </div>
  );
}

export const TyresTab = memo(function TyresTab({ h }: { h: SimHandle; slow: number }) {
  const { sim, analysis: a } = h;
  const our = sim.our;
  const spec = COMPOUNDS[our.compound];

  // Model curves plus our fuel-corrected laps, as seconds lost against a new tyre.
  const degSeries: Series[] = SLICKS.map((c) => ({
    id: c, label: `${COMPOUNDS[c].name} model`, color: COMPOUNDS[c].color, endLabel: true,
    points: Array.from({ length: 41 }, (_, age) => ({ x: age, y: degAt(c, age * a.tyre.wear / MODE[our.mode].wear) })),
  }));
  const actual = cleanLaps(our).filter((l) => l.wetness < 0.04 && l.compound !== 'I' && l.compound !== 'W').map((l) => ({
    x: l.age, y: l.time - (BASE_LAP + our.driver.pace + COMPOUNDS[l.compound].offset + (RACE_LAPS - l.lap + 0.5) * FUEL_PER_LAP),
  }));
  degSeries.push({ id: 'act', label: 'VER race laps (fuel-corrected)', color: 'var(--ours)', kind: 'scatter', points: actual });

  const idx = sim.cars.indexOf(our);
  const compare = [our, sim.cars[idx - 1], sim.cars[idx + 1]].filter((c): c is Car => Boolean(c) && c.status !== 'OUT');
  const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
  const lapSeries: Series[] = compare.map((c, i) => ({ id: c.code, label: i === 0 ? 'VER' : `${c.code} (${c.pos < our.pos ? 'ahead' : 'behind'})`, color: colors[i], points: cleanLaps(c).map((l) => ({ x: l.lap, y: l.time })) }));
  const allTimes = lapSeries.flatMap((s) => s.points.map((p) => p.y));
  const fastest = allTimes.length ? Math.min(...allTimes) : 95;

  const dryRuns = PRACTICE_RUNS.filter((r) => r.condition === 'Dry');
  const practiceSeries: Series[] = dryRuns.map((r) => ({ id: r.id, label: `${r.session} ${COMPOUNDS[r.compound].name}`, color: COMPOUNDS[r.compound].color, dashed: r.session === 'FP3', kind: 'both', points: r.laps.map((t, i) => ({ x: i + 1, y: t })) }));

  return (
    <div className="grid two-col">
      <Panel title="Fitted set" tag={`${spec.name.toUpperCase()} · ${spec.label}`}>
        <div className="kpis" style={{ marginBottom: 10 }}>
          <Kpi label="Tyre age" value={Math.round(our.tyreAge)} unit="laps" sub={`Wear-equivalent ${our.effAge.toFixed(1)}`} />
          <Kpi label="Life left" value={pct(a.tyre.lifeLeft)} tone={a.tyre.lifeLeft < 0.3 ? 'up' : 'ok'} sub={`Cliff in ~${a.tyre.lapsToCliff.toFixed(0)} laps`} />
          <Kpi label="Deg now" value={a.tyre.degNow.toFixed(2)} unit="s/lap" sub="vs a new set" />
          <Kpi label="Wear rate" value={`×${a.tyre.wear.toFixed(2)}`} sub={`${MODE[our.mode].label} · ${sim.weather.trackTemp.toFixed(0)} °C track`} />
        </div>
        <Corners h={h} />
      </Panel>

      <Panel title="Tyre sets available" tag={`${sim.availableSets().length} UNUSED`}>
        <div className="sets">
          {sim.ourSets.map((s) => (
            <div key={s.id} className={`set ${s.inUse ? 'fitted' : ''} ${s.spent ? 'spent' : ''}`}>
              <TyreRing c={s.compound} large />
              <span>{COMPOUNDS[s.compound].name}</span>
              <span className={`pill ${s.inUse ? 'ours' : s.spent ? '' : s.laps ? 'warn' : 'good'}`}>{s.inUse ? 'FITTED' : s.spent ? `SPENT ${s.laps}L` : s.laps ? `USED ${s.laps}L` : 'NEW'}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '10px 0 0' }}>Two different dry compounds must be used unless intermediates or wets are fitted during the race.</p>
      </Panel>

      <Panel title="Degradation: model vs race laps" tag="SECONDS LOST VS A NEW TYRE">
        <LineChart height={230} series={degSeries} xDomain={[0, 40]} yDomain={[0, 4]} xTitle="Tyre age (laps)" yFmt={(v) => `${v.toFixed(1)}s`} legend
          markers={[{ x: our.tyreAge, label: 'NOW' }]} />
      </Panel>

      <Panel title="Lap times: us vs the cars around us" tag="PIT AND NEUTRALISED LAPS EXCLUDED">
        {allTimes.length ? <LineChart height={230} series={lapSeries} xDomain={[1, RACE_LAPS]} yDomain={[fastest - 0.4, fastest + 3.6]} xTitle="Lap" xFmt={(v) => `L${Math.round(v)}`} yFmt={(v) => fmtLap(v).slice(0, 6)} /> : <p className="muted">Waiting for the first timed laps.</p>}
      </Panel>

      <Panel title="Practice long runs · car 3" tag="HIGH FUEL · DASHED = FP3" style={{ gridColumn: '1 / -1' }}>
        <div className="grid two-col" style={{ alignItems: 'start' }}>
          <LineChart height={220} series={practiceSeries} xTitle="Lap of run" yFmt={(v) => fmtLap(v).slice(0, 6)} />
          <div style={{ overflow: 'auto' }}>
            <table className="t">
              <thead><tr><th>Run</th><th>Tyre</th><th>Track</th><th className="num">Temp</th><th className="num">Laps</th><th className="num">Average</th><th className="num">Deg / lap</th></tr></thead>
              <tbody>
                {PRACTICE_RUNS.map((r) => {
                  const body = r.laps.slice(1);
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.session}</td>
                      <td><span className="tyre"><TyreRing c={r.compound} />{COMPOUNDS[r.compound].name}</span></td>
                      <td>{r.condition}</td>
                      <td className="num">{r.trackTemp} °C</td>
                      <td className="num">{r.laps.length}</td>
                      <td className="num">{fmtLap(body.reduce((x, y) => x + y, 0) / body.length)}</td>
                      <td className="num">{slope(body) >= 0 ? '+' : ''}{slope(body).toFixed(3)} s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <table className="t" style={{ marginTop: 12 }}>
              <thead><tr><th>Rival long-run pace vs us</th><th className="num">Soft</th><th className="num">Medium</th><th className="num">Hard</th></tr></thead>
              <tbody>
                {RIVAL_LONG_RUN.map((r) => (
                  <tr key={r.team}>
                    <td><span style={{ display: 'inline-block', width: 3, height: 11, background: TEAMS[r.team].color, marginRight: 7, verticalAlign: 'middle' }} />{TEAMS[r.team].name}</td>
                    {[r.S, r.M, r.H].map((v, i) => <td key={i} className="num" style={{ color: v < 0 ? 'var(--serious)' : 'var(--good)' }}>{v >= 0 ? '+' : ''}{v.toFixed(2)} s</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note" style={{ marginTop: 10 }}>Read: the medium is our best race tyre and McLaren match us on it. Mercedes are quicker on the hard, so a long final stint on hards favours them. The damp FP3 run shows intermediates gaining 0.2 s per lap as the track dried.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}, (p, n) => p.slow === n.slow);
