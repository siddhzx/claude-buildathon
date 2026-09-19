import { TEAMS, OUR_DRIVER } from '../data/grid';
import type { RaceSim } from '../sim/engine';
import { TyreRing } from './ui';

export function TimingTower({ sim }: { sim: RaceSim; frame: number }) {
  const lead = sim.cars[0];
  return (
    <div className="tower">
      {sim.cars.map((c) => {
        const lapsDown = Math.floor(lead.prog) - Math.floor(c.prog);
        const gap = c.status === 'OUT' ? 'OUT' : c.finished && c.pos === 1 ? 'WINNER' : c.pos === 1 ? 'LEADER' : lapsDown >= 1 && c.gapLeader > 60 ? `+${lapsDown} LAP` : `+${c.gapLeader.toFixed(1)}`;
        const state = c.status === 'OUT' ? c.outReason ?? '' : c.status === 'PIT' ? 'IN PIT' : c.finished ? 'FIN' : c.pos > 1 && c.interval < 1 ? `▲ ${c.interval.toFixed(1)}` : `${c.stops.length} STOP`;
        return (
          <div key={c.code} className={`row ${c.code === OUR_DRIVER ? 'ours' : ''} ${c.status === 'OUT' ? 'out' : ''}`} title={`${c.driver.name} · ${TEAMS[c.driver.team].name}`}>
            <span className="pos">{c.status === 'OUT' ? '–' : c.pos}</span>
            <span className="bar" style={{ background: TEAMS[c.driver.team].color }} />
            <span className="code">{c.code}</span>
            <span className={`state ${c.status === 'PIT' ? 'pit' : ''}`}>{state}</span>
            <span className="gap">{gap}</span>
            <span className="tyre"><TyreRing c={c.compound} />{Math.round(c.tyreAge)}</span>
          </div>
        );
      })}
    </div>
  );
}
