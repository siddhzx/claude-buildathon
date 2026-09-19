import { useState } from 'react';
import { EngineerRail } from './components/EngineerRail';
import { RACE_LAPS } from './data/track';
import type { ScenarioId } from './sim/types';
import { RaceTab } from './tabs/RaceTab';
import { RiskTab } from './tabs/RiskTab';
import { StrategyTab } from './tabs/StrategyTab';
import { TyresTab } from './tabs/TyresTab';
import { WeatherTab } from './tabs/WeatherTab';
import { useSim } from './useSim';

type TabId = 'race' | 'strategy' | 'tyres' | 'weather' | 'risk';
const TABS: { id: TabId; label: string }[] = [
  { id: 'race', label: 'RACE CONTROL' },
  { id: 'strategy', label: 'STRATEGY' },
  { id: 'tyres', label: 'TYRES & PACE' },
  { id: 'weather', label: 'WEATHER' },
  { id: 'risk', label: 'RISK' },
];
const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'rain-threat', label: 'Rain threat mid-race' },
  { id: 'dry', label: 'Hot and dry' },
  { id: 'wet-start', label: 'Wet start, drying' },
];
const FLAG_TEXT = { GREEN: 'GREEN', YELLOW: 'YELLOW FLAG', VSC: 'VIRTUAL SAFETY CAR', SC: 'SAFETY CAR', CHEQUERED: 'CHEQUERED' } as const;

function clock(t: number): string {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function App() {
  const h = useSim();
  const [tab, setTab] = useState<TabId>('race');
  const { sim, analysis: a } = h;
  const flag = sim.flag;
  const flagLabel = flag === 'YELLOW' ? `YELLOW · S${sim.yellowSectors.join(' S')}` : FLAG_TEXT[flag];

  // Pips draw the eye to a tab when something there needs attention.
  const pip: Partial<Record<TabId, 'warn' | 'crit'>> = {};
  if (a.advice.some((x) => x.category === 'WEATHER' && x.priority !== 'INFO')) pip.weather = a.advice.some((x) => x.category === 'WEATHER' && x.priority === 'CRITICAL') ? 'crit' : 'warn';
  if (sim.hazards.length || sim.neutral) pip.risk = 'warn';
  if (a.advice.some((x) => x.category === 'PIT' && (x.priority === 'CRITICAL' || x.priority === 'HIGH'))) pip.strategy = 'crit';
  if (a.tyre.lapsToCliff < 3 && sim.our.status === 'RUN') pip.tyres = 'warn';

  return (
    <div className="app">
      <header className="header">
        <div className="brand"><span className="brand-mark"><i /></span>PITWALL <small>RACE ENGINEER</small></div>
        <div className="event">UNITED STATES GRAND PRIX · CIRCUIT OF THE AMERICAS · AUSTIN TX</div>
        <div className="spacer" />
        <div className="lapbox"><span>LAP</span><b>{sim.leaderLap}</b><span>/ {RACE_LAPS}</span></div>
        <span className="mono dim" style={{ fontSize: 12 }}>{clock(sim.t)}</span>
        <span className={`flag ${flag}`}><i />{flagLabel}</span>
        <button className="btn primary" onClick={() => h.setRunning(!h.running)} disabled={sim.over} style={{ width: 74 }}>{sim.over ? 'FINISHED' : h.running ? '❚❚ PAUSE' : '▶ RUN'}</button>
        <div className="seg" role="group" aria-label="Simulation speed">
          {[1, 5, 15, 40].map((s) => <button key={s} className={h.speed === s ? 'on' : ''} onClick={() => h.setSpeed(s)}>{s}×</button>)}
        </div>
        <select className="select" value={h.scenario} onChange={(e) => h.restart(e.target.value as ScenarioId)} aria-label="Scenario">
          {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button className="btn" onClick={() => h.restart(h.scenario)}>↻ RESTART</button>
        <span className="sim-badge">SIMULATION</span>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}{pip[t.id] && <span className={`pip ${pip[t.id] === 'crit' ? 'crit' : ''}`} />}
          </button>
        ))}
      </nav>

      <div className="body">
        <main className="main">
          {tab === 'race' && <RaceTab h={h} />}
          {tab === 'strategy' && <StrategyTab h={h} slow={h.slow} />}
          {tab === 'tyres' && <TyresTab h={h} slow={h.slow} />}
          {tab === 'weather' && <WeatherTab h={h} slow={h.slow} />}
          {tab === 'risk' && <RiskTab h={h} slow={h.slow} />}
        </main>
        <EngineerRail h={h} activeTab={TABS.find((t) => t.id === tab)!.label} />
      </div>
    </div>
  );
}
