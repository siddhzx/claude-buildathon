import { useCallback, useEffect, useRef, useState } from 'react';
import { RaceSim } from './sim/engine';
import { analyse, type Analysis } from './sim/strategy';
import type { ScenarioId } from './sim/types';

const MAX_STEP = 0.5; // sim seconds per physics substep

export interface SimHandle {
  sim: RaceSim;
  analysis: Analysis;
  /** Bumps every rendered frame (map, timing). */
  frame: number;
  /** Bumps about twice a second (charts, tables). */
  slow: number;
  running: boolean;
  speed: number;
  autopilot: boolean;
  scenario: ScenarioId;
  setRunning: (v: boolean) => void;
  setSpeed: (v: number) => void;
  setAutopilot: (v: boolean) => void;
  restart: (scenario: ScenarioId) => void;
  /** Re-run the strategy model right after a manual intervention. */
  refresh: () => void;
}

export function useSim(): SimHandle {
  const [scenario, setScenario] = useState<ScenarioId>('rain-threat');
  const simRef = useRef<RaceSim | null>(null);
  if (!simRef.current) simRef.current = new RaceSim(Math.floor(Math.random() * 1e6), scenario);
  const [analysis, setAnalysis] = useState<Analysis>(() => analyse(simRef.current!));
  const [frame, setFrame] = useState(0);
  const [slow, setSlow] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(15);
  const [autopilot, setAutopilot] = useState(true);
  const live = useRef({ running, speed, autopilot });
  live.current = { running, speed, autopilot };

  const think = useCallback(() => {
    const sim = simRef.current!;
    const a = analyse(sim);
    if (live.current.autopilot && sim.our.status === 'RUN' && !sim.our.finished) {
      const box = a.advice.find((x) => x.action?.type === 'BOX' && (x.priority === 'CRITICAL' || x.priority === 'HIGH'));
      if (box?.action?.type === 'BOX' && !sim.our.pitCall) sim.callPit(box.action.compound);
      const mode = a.advice.find((x) => x.action?.type === 'MODE');
      if (mode?.action?.type === 'MODE') sim.setMode(mode.action.mode);
    }
    setAnalysis(a);
    setSlow((n) => n + 1);
  }, []);

  useEffect(() => {
    let last = performance.now();
    let lastThink = 0;
    // A timer rather than requestAnimationFrame: embedded previews can starve rAF, and a
    // throttled timer still keeps the race clock honest because we integrate real elapsed time.
    const loop = () => {
      const now = performance.now();
      const sim = simRef.current!;
      const real = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (live.current.running && !sim.over) {
        let left = real * live.current.speed;
        while (left > 1e-6) {
          const dt = Math.min(MAX_STEP, left);
          sim.step(dt);
          left -= dt;
        }
        setFrame((n) => n + 1);
        if (now - lastThink > 450) { lastThink = now; think(); }
      }
    };
    const timer = window.setInterval(loop, 33);
    return () => window.clearInterval(timer);
  }, [think]);

  const restart = useCallback((next: ScenarioId) => {
    simRef.current = new RaceSim(Math.floor(Math.random() * 1e6), next);
    setScenario(next);
    setRunning(true);
    think();
    setFrame((n) => n + 1);
  }, [think]);

  const refresh = useCallback(() => { think(); setFrame((n) => n + 1); }, [think]);

  return { sim: simRef.current, analysis, frame, slow, running, speed, autopilot, scenario, setRunning, setSpeed, setAutopilot, restart, refresh };
}
