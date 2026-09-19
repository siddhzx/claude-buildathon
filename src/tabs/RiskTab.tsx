import { memo } from 'react';
import { LineChart } from '../components/LineChart';
import { Meter, Panel, pct, riskColor } from '../components/ui';
import { DRIVERS, TEAMS } from '../data/grid';
import { COTA_HISTORY, PRIOR } from '../data/history';
import { PIT_LOSS_GREEN, PIT_LOSS_SC, PIT_LOSS_VSC } from '../sim/tyres';
import type { SimHandle } from '../useSim';

function ProbBlock({ label, p5, p10, race, prior }: { label: string; p5: number; p10: number; race: number; prior: number }) {
  return (
    <div style={{ border: '1px solid var(--line)', background: 'var(--bg-3)', padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--text-2)', fontWeight: 600 }}>{label}</span>
        <span className="mono muted" style={{ fontSize: 10 }}>COTA PRIOR {pct(prior)} OF RACES</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
        {[['NEXT 5 LAPS', p5], ['NEXT 10 LAPS', p10], ['TO THE FLAG', race]].map(([k, v]) => (
          <div key={k as string}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: riskColor(v as number) }}>{pct(v as number)}</div>
            <div className="muted" style={{ fontSize: 9.5, letterSpacing: '0.08em', margin: '1px 0 5px' }}>{k}</div>
            <Meter value={v as number} color={riskColor(v as number)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const RiskTab = memo(function RiskTab({ h }: { h: SimHandle; slow: number }) {
  const { sim, analysis: a } = h;
  const r = a.risk;
  const act = (fn: () => void) => { fn(); h.refresh(); };
  const maxRate = Math.max(...r.drivers.map((d) => d.rate), 1e-6);

  return (
    <div className="grid two-col">
      <Panel title="Neutralisation probability" tag={sim.neutral ? `${sim.neutral.type} ACTIVE` : 'LIVE MODEL'}>
        <div className="grid">
          <ProbBlock label="SAFETY CAR" p5={r.sc5} p10={r.sc10} race={r.scRace} prior={PRIOR.scRate} />
          <ProbBlock label="VIRTUAL SAFETY CAR" p5={r.vsc5} p10={r.vsc10} race={r.vscRace} prior={PRIOR.vscRate} />
        </div>
        <p className="note" style={{ marginTop: 10 }}>Built from each car's incident index, scaled live by track wetness, tyre state, close battles, gusts and debris, then calibrated to the COTA record. A stop costs {PIT_LOSS_SC} s under a Safety Car and {PIT_LOSS_VSC} s under a VSC, against {PIT_LOSS_GREEN} s under green.</p>
      </Panel>

      <Panel title="Cumulative chance from now" tag="BY LAP">
        <LineChart height={222} yDomain={[0, 1]} xDomain={[a.lap, Math.max(a.lap + 2, 56)]} xTitle="Lap" xFmt={(v) => `L${Math.round(v)}`} yFmt={pct}
          series={[{ id: 'sc', label: 'Safety Car', color: 'var(--s2)', points: r.scCurve }, { id: 'vsc', label: 'Virtual Safety Car', color: 'var(--s1)', points: r.vscCurve }]} />
      </Panel>

      <Panel title="Track hazards" tag={sim.hazards.length ? `${sim.hazards.length} ACTIVE` : 'NONE'}>
        {sim.hazards.length ? (
          <table className="t">
            <thead><tr><th>Type</th><th>Location</th><th>Sector</th><th>Detail</th><th className="num">Age</th></tr></thead>
            <tbody>{sim.hazards.map((z) => <tr key={z.id}><td><span className="pill warn">{z.kind}</span></td><td className="mono">{z.turn}</td><td className="mono">S{z.sector}</td><td className="dim">{z.note}</td><td className="num">{Math.round(sim.t - z.since)} s</td></tr>)}</tbody>
          </table>
        ) : <p className="muted" style={{ margin: 0 }}>Track is clear: no debris, stopped cars or gravel reported.</p>}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 10.5, letterSpacing: '0.1em' }}>WHAT-IF</span>
          <button className="btn small" onClick={() => act(() => sim.injectDebris())}>+ DEBRIS ON TRACK</button>
          <button className="btn small" onClick={() => act(() => sim.deploy('VSC', 'Race control test.'))} disabled={sim.neutral != null}>DEPLOY VSC</button>
          <button className="btn small danger" onClick={() => act(() => sim.deploy('SC', 'Race control test.'))} disabled={sim.neutral?.type === 'SC'}>DEPLOY SAFETY CAR</button>
        </div>
        {sim.neutralLog.length > 0 && <p className="note" style={{ marginTop: 10 }}>This race so far: {sim.neutralLog.map((n) => `${n.type} lap ${n.lap}`).join(', ')}.</p>}
      </Panel>

      <Panel title="COTA record" tag={`${PRIOR.races} RACES · APPROXIMATE`} bodyClass="flush scroll" style={{ maxHeight: 300 }}>
        <table className="t">
          <thead><tr><th>Year</th><th className="num">SC</th><th className="num">VSC</th><th>Note</th></tr></thead>
          <tbody>{[...COTA_HISTORY].reverse().map((y) => <tr key={y.year}><td className="mono">{y.year}</td><td className="num" style={{ color: y.sc ? 'var(--serious)' : 'var(--text-3)' }}>{y.sc}</td><td className="num" style={{ color: y.vsc ? 'var(--warn)' : 'var(--text-3)' }}>{y.vsc}</td><td className="dim">{y.note}</td></tr>)}</tbody>
        </table>
      </Panel>

      <Panel title="Driver incident index" tag="LIVE · PER LAP · SIM ASSUMPTION" style={{ gridColumn: '1 / -1' }} bodyClass="flush scroll">
        <table className="t">
          <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th className="num">Base index</th><th style={{ width: '32%' }}>Live incident rate</th><th className="num">Gap to us</th><th>Exposure</th></tr></thead>
          <tbody>
            {r.drivers.slice(0, 12).map((d) => {
              const drv = DRIVERS.find((x) => x.code === d.code)!;
              return (
                <tr key={d.code}>
                  <td className="mono muted">P{d.pos}</td>
                  <td><b className="mono">{d.code}</b> <span className="dim">{drv.name}</span></td>
                  <td><span style={{ display: 'inline-block', width: 3, height: 11, background: TEAMS[drv.team].color, marginRight: 7, verticalAlign: 'middle' }} />{TEAMS[drv.team].name}</td>
                  <td className="num">{drv.risk.toFixed(2)}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Meter value={d.rate / maxRate} color={d.near ? 'var(--serious)' : 'var(--accent)'} /></div><span className="mono" style={{ width: 52, textAlign: 'right' }}>{(d.rate * 100).toFixed(2)}%</span></div></td>
                  <td className="num">{d.gap.toFixed(1)} s</td>
                  <td>{d.near ? <span className="pill warn">NEAR US</span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11, margin: 10 }}>Index values are assumptions made for this simulation, not assessments of the real drivers. The twelve highest live rates are shown.</p>
      </Panel>
    </div>
  );
}, (p, n) => p.slow === n.slow);
