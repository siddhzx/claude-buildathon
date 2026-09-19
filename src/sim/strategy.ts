import { COTA_HISTORY, PRACTICE_RUNS, PRIOR, RIVAL_LONG_RUN } from '../data/history';
import { RACE_LAPS, TURNS, bearingAt } from '../data/track';
import type { RaceSim } from './engine';
import { COMPOUNDS, INTER_CROSSOVER, WET_CROSSOVER, MODE, PIT_LOSS_GREEN, PIT_LOSS_SC, PIT_LOSS_VSC, SLICKS, degAt, isSlick, lifeLeft, wearRate } from './tyres';
import type { Car, Compound, ForecastPoint, PaceMode } from './types';
import { forecast, headwind, rainOutlook, type RainOutlook } from './weather';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
export type AdviceAction = { type: 'BOX'; compound: Compound } | { type: 'MODE'; mode: PaceMode };

export interface Advice {
  id: string;
  priority: Priority;
  category: 'PIT' | 'PACE' | 'WEATHER' | 'RISK' | 'TRAFFIC' | 'TYRES';
  title: string;
  detail: string;
  confidence: number;
  action?: AdviceAction;
}

export interface StrategyOption {
  id: string;
  label: string;
  stops: { lap: number; compound: Compound }[];
  stints: { compound: Compound; from: number; to: number }[];
  time: number;
  delta: number;
}

export interface RivalAnalysis {
  code: string;
  relation: 'AHEAD' | 'BEHIND';
  gap: number;
  compound: Compound;
  tyreAge: number;
  stops: number;
  paceDelta: number;
  undercutGain: number;
  undercutProb: number;
  overcutGain: number;
  note: string;
}

export interface Rejoin { pos: number; behind: string | null; gapToCarAhead: number; traffic: boolean; text: string }

export interface RiskView {
  scPerLap: number; vscPerLap: number;
  sc5: number; sc10: number; scRace: number;
  vsc5: number; vsc10: number; vscRace: number;
  drivers: { code: string; rate: number; near: boolean; gap: number; pos: number }[];
  /** Cumulative probability by lap, from now to the flag. */
  scCurve: { x: number; y: number }[];
  vscCurve: { x: number; y: number }[];
}

export interface Analysis {
  lap: number;
  remaining: number;
  headline: { call: string; text: string; tone: 'box' | 'stay' | 'push' | 'caution' | 'neutral' };
  advice: Advice[];
  options: StrategyOption[];
  optionsNote: string | null;
  pitWindow: { open: number; best: number; close: number; curve: { lap: number; delta: number }[] } | null;
  rivals: RivalAnalysis[];
  rejoin: Rejoin;
  risk: RiskView;
  forecast: ForecastPoint[];
  outlook: RainOutlook;
  pitLossNow: number;
  tyre: { lifeLeft: number; lapsToCliff: number; degNow: number; wear: number };
  wind: { mainStraight: number; backStraight: number; note: string };
}

const BACK_STRAIGHT_DIST = (TURNS.find((t) => t.name === 'T11')!.dist + TURNS.find((t) => t.name === 'T12')!.dist) / 2;
const MAIN_STRAIGHT_DIST = 0.985;

// Each stop also costs track position: time lost clearing slower cars after rejoining.
export const TRAFFIC_ALLOWANCE = 3.5;

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Cumulative stint cost table: cost[n] = time of n laps from `startAge`, excluding fuel. */
function costTable(c: Compound, startAge: number, wear: number, n: number, withWarmup: boolean): number[] {
  const out = [withWarmup ? COMPOUNDS[c].warmup : 0];
  for (let k = 0; k < n; k++) out.push(out[k] + COMPOUNDS[c].offset + degAt(c, startAge + k * wear));
  return out;
}

interface RawOption { stops: { k: number; compound: Compound }[]; time: number }

function enumerate(sim: RaceSim, firstStopLoss: number): { all: RawOption[]; remaining: number; lap: number } {
  const our = sim.our;
  const lap = sim.lapOf(our);
  const done = Math.max(0, Math.floor(our.prog));
  const R = RACE_LAPS - done;
  const wear = wearRate(sim.weather.trackTemp, 'STD', our.driver.tyreCare, 0, 'M');
  const cur = costTable(our.compound, our.effAge, wear, R, false);
  const avail = new Map<Compound, number[]>();
  for (const c of SLICKS) avail.set(c, sim.availableSets(c).map((s) => s.laps));
  const tables = new Map<string, number[]>();
  const table = (c: Compound, age: number) => {
    const key = `${c}${age}`;
    if (!tables.has(key)) tables.set(key, costTable(c, age, wear, R, true));
    return tables.get(key)!;
  };
  const used = new Set(our.compoundsUsed);
  const ruleVoid = our.compoundsUsed.some((c) => !isSlick(c));
  const legal = (extra: Compound[]) => ruleVoid || new Set([...used, ...extra].filter(isSlick)).size >= 2;

  const all: RawOption[] = [];
  if (legal([])) all.push({ stops: [], time: cur[R] });
  for (let k1 = 1; k1 < R; k1++) {
    for (const c1 of SLICKS) {
      const sets1 = avail.get(c1)!;
      if (!sets1.length) continue;
      const t1 = table(c1, sets1[0]);
      if (legal([c1])) all.push({ stops: [{ k: k1, compound: c1 }], time: cur[k1] + firstStopLoss + TRAFFIC_ALLOWANCE + t1[R - k1] });
      for (let k2 = k1 + 6; k2 < R - 3; k2++) {
        for (const c2 of SLICKS) {
          const sets2 = avail.get(c2)!;
          const age2 = c2 === c1 ? sets2[1] : sets2[0];
          if (age2 === undefined || !legal([c1, c2])) continue;
          all.push({ stops: [{ k: k1, compound: c1 }, { k: k2, compound: c2 }], time: cur[k1] + firstStopLoss + t1[k2 - k1] + PIT_LOSS_GREEN + 2 * TRAFFIC_ALLOWANCE + table(c2, age2)[R - k2] });
        }
      }
    }
  }
  return { all, remaining: R, lap };
}

function toOption(raw: RawOption, lap: number, start: Compound, best: number): StrategyOption {
  const stops = raw.stops.map((s) => ({ lap: lap + s.k - 1, compound: s.compound }));
  const stints: StrategyOption['stints'] = [];
  let from = lap, c = start;
  for (const s of stops) { stints.push({ compound: c, from, to: s.lap }); from = s.lap + 1; c = s.compound; }
  stints.push({ compound: c, from, to: RACE_LAPS });
  return { id: [start, ...stops.map((s) => `${s.compound}${s.lap}`)].join('-'), label: [start, ...stops.map((s) => s.compound)].join(' → '), stops, stints, time: raw.time, delta: raw.time - best };
}

function cleanPace(sim: RaceSim, car: Car, compound: Compound, effAge: number): number {
  return car.driver.pace + COMPOUNDS[compound].offset + degAt(compound, effAge);
}

function projectRejoin(sim: RaceSim, loss: number): Rejoin {
  const our = sim.our;
  const lt = Math.max(90, sim.cleanLap(our));
  const rejoinProg = our.prog - loss / lt;
  const running = sim.cars.filter((c) => c !== our && c.status !== 'OUT' && !c.finished);
  const pos = 1 + running.filter((c) => c.prog > rejoinProg).length;
  let behind: Car | null = null, gap = Infinity;
  for (const c of running) {
    const d = ((((c.prog - rejoinProg) % 1) + 1) % 1) * lt;
    if (d < gap) { gap = d; behind = c; }
  }
  const slower = behind ? sim.cleanLap(behind) > lt - 0.8 : false;
  const traffic = gap < 1.6 && slower;
  const text = behind ? `P${pos}, ${gap.toFixed(1)} s behind ${behind.code}${traffic ? ' (traffic)' : gap > 3 ? ' (clear air)' : ''}` : `P${pos}, clear air`;
  return { pos, behind: behind?.code ?? null, gapToCarAhead: gap, traffic, text };
}

function analyseRivals(sim: RaceSim, nextCompound: Compound, rejoin: Rejoin): RivalAnalysis[] {
  const our = sim.our;
  const idx = sim.cars.indexOf(our);
  const out: RivalAnalysis[] = [];
  const pick = [sim.cars[idx - 2], sim.cars[idx - 1], sim.cars[idx + 1], sim.cars[idx + 2]];
  pick.forEach((car, i) => {
    if (!car || car.status === 'OUT' || car.finished) return;
    const ahead = i < 2;
    const gap = Math.abs(car.gapLeader - our.gapLeader);
    const usOld = cleanPace(sim, our, our.compound, our.effAge);
    const themOld = cleanPace(sim, car, car.compound, car.effAge);
    const usNew = cleanPace(sim, our, nextCompound, 0);
    const themNext: Compound = car.plan[0]?.compound ?? (car.compound === 'H' ? 'M' : 'H');
    const themNew = cleanPace(sim, car, themNext, 0);
    let undercutGain: number, overcutGain: number, prob: number, note: string;
    if (ahead) {
      // We stop first, they respond a lap later.
      undercutGain = themOld + 0.05 - (usNew + COMPOUNDS[nextCompound].warmup) - (rejoin.traffic ? 0.7 : 0);
      prob = logistic((undercutGain - gap - 0.3) / 0.6);
      // They stop first, we stay out two laps in clean air.
      overcutGain = 2 * (themNew - usOld) + COMPOUNDS[themNext].warmup - 2 * COMPOUNDS[our.compound].deg;
      note = car.status === 'PIT' ? 'In the pits now' : prob > 0.6 ? `Undercut on: ${undercutGain.toFixed(1)} s gain vs ${gap.toFixed(1)} s gap` : overcutGain > gap ? 'Overcut is the better play' : gap > 3.5 ? 'Out of undercut range' : 'Undercut marginal';
    } else {
      // Their undercut on us.
      undercutGain = usOld + 0.05 - (themNew + COMPOUNDS[themNext].warmup);
      prob = logistic((undercutGain - gap - 0.3) / 0.6);
      overcutGain = 0;
      note = prob > 0.55 ? `Undercut threat: they gain ${undercutGain.toFixed(1)} s, gap ${gap.toFixed(1)} s` : gap < 1 ? 'Within attack range' : 'Covered';
    }
    out.push({ code: car.code, relation: ahead ? 'AHEAD' : 'BEHIND', gap, compound: car.compound, tyreAge: Math.round(car.tyreAge), stops: car.stops.length, paceDelta: themOld - usOld, undercutGain, undercutProb: prob, overcutGain, note });
  });
  return out;
}

function riskView(sim: RaceSim, remaining: number, outlook: RainOutlook, lap: number): RiskView {
  const now = sim.neutralHazard();
  const steady = sim.neutralHazard(true);
  const rainSoon = (h: number) => (outlook.etaLap != null && outlook.etaLap - lap < h && sim.weather.wetness < 0.1 ? 1 + 1.6 * outlook.peak * outlook.maxProb : 1);
  const p = (rateNow: number, rateSteady: number, laps: number) => {
    const n = Math.max(0, Math.min(laps, remaining));
    return 1 - Math.exp(-(rateNow * Math.min(2, n) + rateSteady * rainSoon(laps) * Math.max(0, n - 2)));
  };
  const our = sim.our;
  const drivers = sim.cars.filter((c) => c !== our && c.status !== 'OUT' && !c.finished).map((c) => {
    const gap = Math.abs(c.gapLeader - our.gapLeader);
    return { code: c.code, rate: sim.incidentRate(c, true), near: gap < 4 || Math.abs(c.pos - our.pos) <= 2, gap, pos: c.pos };
  }).sort((a, b) => b.rate - a.rate);
  return {
    scPerLap: now.sc, vscPerLap: now.vsc,
    sc5: p(now.sc, steady.sc, 5), sc10: p(now.sc, steady.sc, 10), scRace: p(now.sc, steady.sc, remaining),
    vsc5: p(now.vsc, steady.vsc, 5), vsc10: p(now.vsc, steady.vsc, 10), vscRace: p(now.vsc, steady.vsc, remaining),
    drivers,
    scCurve: Array.from({ length: remaining + 1 }, (_, n) => ({ x: lap + n, y: p(now.sc, steady.sc, n) })),
    vscCurve: Array.from({ length: remaining + 1 }, (_, n) => ({ x: lap + n, y: p(now.vsc, steady.vsc, n) })),
  };
}

function slickForRemaining(sim: RaceSim, remaining: number): Compound {
  const order: Compound[] = remaining < 15 ? ['S', 'M', 'H'] : remaining < 30 ? ['M', 'H', 'S'] : ['H', 'M', 'S'];
  return order.find((c) => sim.availableSets(c).length) ?? 'M';
}

export function analyse(sim: RaceSim): Analysis {
  const our = sim.our;
  const w = sim.weather;
  const lap = sim.lapOf(our);
  const flag = sim.flag;
  const pitLossNow = flag === 'SC' ? PIT_LOSS_SC : flag === 'VSC' ? PIT_LOSS_VSC : PIT_LOSS_GREEN;
  const lt = Math.max(90, sim.cleanLap(our));
  const fc = forecast(w, lt, lap + (our.prog - Math.floor(our.prog)));
  const outlook = rainOutlook(fc, w);
  const wetRunning = !isSlick(our.compound) || w.wetness > 0.12;

  // --- strategy options (dry model) ---
  const green = enumerate(sim, PIT_LOSS_GREEN);
  const remaining = green.remaining;
  const sorted = [...green.all].sort((a, b) => a.time - b.time);
  const best = sorted[0];
  const byShape = new Map<string, RawOption>();
  for (const o of sorted) {
    const key = o.stops.map((s) => s.compound).join('');
    if (!byShape.has(key)) byShape.set(key, o);
  }
  const options = best ? [...byShape.values()].slice(0, 5).map((o) => toOption(o, lap, our.compound, best.time)) : [];
  const optionsNote = wetRunning ? 'Wet running: slick-tyre plan is on hold until the crossover. Options below assume a dry track from here.' : null;

  let pitWindow: Analysis['pitWindow'] = null;
  if (best && best.stops.length) {
    const byFirst = new Map<number, number>();
    for (const o of green.all) if (o.stops.length) byFirst.set(o.stops[0].k, Math.min(byFirst.get(o.stops[0].k) ?? Infinity, o.time));
    const curve = [...byFirst.entries()].sort((a, b) => a[0] - b[0]).map(([k, t]) => ({ lap: lap + k - 1, delta: t - best.time }));
    const ok = curve.filter((c) => c.delta < 1.5);
    pitWindow = { open: ok[0].lap, best: lap + best.stops[0].k - 1, close: ok[ok.length - 1].lap, curve };
  }

  const nextCompound: Compound = best?.stops[0]?.compound ?? slickForRemaining(sim, remaining);
  const rejoin = projectRejoin(sim, pitLossNow);
  const rivals = analyseRivals(sim, nextCompound, rejoin);
  const risk = riskView(sim, remaining, outlook, lap);

  const spec = COMPOUNDS[our.compound];
  const wear = wearRate(w.trackTemp, our.mode, our.driver.tyreCare, w.wetness, our.compound);
  const tyre = { lifeLeft: lifeLeft(our.compound, our.effAge), lapsToCliff: Math.max(0, (spec.life - our.effAge) / wear), degNow: degAt(our.compound, our.effAge), wear };

  const mainHead = headwind(w, bearingAt(MAIN_STRAIGHT_DIST));
  const backHead = headwind(w, bearingAt(BACK_STRAIGHT_DIST));
  const windNote = backHead < -8 ? `Tailwind ${Math.abs(backHead).toFixed(0)} km/h into T12: brake earlier, lock-up risk.` : backHead > 8 ? `Headwind ${backHead.toFixed(0)} km/h on the back straight: later braking into T12, overtaking harder.` : mainHead < -8 ? `Tailwind ${Math.abs(mainHead).toFixed(0)} km/h up the hill into T1: watch the front axle.` : 'Crosswind through the esses, balance shifts T3 to T6.';

  // --- advice rules ---
  const advice: Advice[] = [];
  const add = (a: Advice) => advice.push(a);
  const ahead = rivals.filter((r) => r.relation === 'AHEAD').pop();
  const behind = rivals.find((r) => r.relation === 'BEHIND');
  const needStop = Boolean(best && best.stops.length);
  const k1 = best?.stops[0]?.k ?? Infinity;
  const deltaNow = pitWindow?.curve.find((c) => c.lap === lap)?.delta ?? Infinity;
  const rainNext8 = Math.max(0, ...fc.slice(0, 9).map((p) => p.rain));
  const racing = !sim.chequered && !our.finished && our.status !== 'OUT';
  const inPit = our.status === 'PIT';

  if (racing && !inPit && remaining > 1) {
    // Weather crossovers first: they dominate everything else.
    if (isSlick(our.compound)) {
      if (w.wetness >= 0.16 || (w.wetness >= 0.09 && w.rain > 0.4)) {
        const c: Compound = w.wetness > WET_CROSSOVER || w.rain > 0.85 ? 'W' : 'I';
        add({ id: 'wx-box', priority: 'CRITICAL', category: 'WEATHER', title: `Box for ${COMPOUNDS[c].name.toLowerCase()}s`, detail: `Track wetness ${pct(w.wetness)}, past the slick crossover (about ${pct(INTER_CROSSOVER)}). Slicks are losing ${(95 * Math.pow(Math.max(0, w.wetness - 0.04), 1.25)).toFixed(1)} s/lap and the rain is ${w.rain > 0.05 ? 'still falling' : 'easing'}.`, confidence: 0.9, action: { type: 'BOX', compound: c } });
      } else if (outlook.etaLap != null && outlook.etaLap - lap <= 8 && outlook.peak >= 0.3 && outlook.maxProb > 0.5 && needStop && k1 <= 5 && tyre.lapsToCliff + 4 >= outlook.etaLap - lap) {
        add({ id: 'wx-extend', priority: 'HIGH', category: 'WEATHER', title: `Stay out: rain due lap ${Math.round(outlook.etaLap)}`, detail: `Radar puts rain over the circuit in about ${outlook.etaMin} min (peak intensity ${pct(outlook.peak)}, ${pct(outlook.maxProb)} likely). These tyres have about ${Math.round(tyre.lapsToCliff)} laps before the cliff, enough to reach it. Stopping for slicks now means a second stop for intermediates. Extend this stint and make one stop at the crossover.`, confidence: 0.55 + outlook.maxProb * 0.3 });
      } else if (outlook.etaLap != null && outlook.peak >= 0.25 && outlook.etaLap - lap < 20) {
        add({ id: 'wx-watch', priority: 'MEDIUM', category: 'WEATHER', title: `Rain threat around lap ${Math.round(outlook.etaLap)}`, detail: `Cell tracking in from the ${compass(w.steerDir)}, ${pct(outlook.maxProb)} chance it crosses the circuit, lasting about ${outlook.durationMin} min. Intermediates are in the blankets from lap ${Math.max(lap, Math.round(outlook.etaLap) - 3)}.`, confidence: outlook.maxProb });
      }
    } else {
      if (our.compound === 'I' && w.wetness > WET_CROSSOVER + 0.02) add({ id: 'wx-wets', priority: 'CRITICAL', category: 'WEATHER', title: 'Box for full wets', detail: `Standing water building, wetness ${pct(w.wetness)}. Intermediates are aquaplaning.`, confidence: 0.8, action: { type: 'BOX', compound: 'W' } });
      else if (our.compound === 'W' && w.wetness < 0.62) add({ id: 'wx-inters', priority: 'HIGH', category: 'WEATHER', title: 'Box for intermediates', detail: `Wetness down to ${pct(w.wetness)}. Inters are quicker from here.`, confidence: 0.75, action: { type: 'BOX', compound: 'I' } });
      else if (w.wetness < 0.13 && w.rain < 0.05 && rainNext8 < 0.15) {
        const c = slickForRemaining(sim, remaining);
        add({ id: 'wx-slicks', priority: 'CRITICAL', category: 'WEATHER', title: `Box for slicks: ${COMPOUNDS[c].name.toLowerCase()}`, detail: `Dry line established, wetness ${pct(w.wetness)} and no rain within 8 min on radar. Intermediates are overheating; slicks are quicker now.`, confidence: 0.8, action: { type: 'BOX', compound: c } });
      } else if (w.wetness < 0.22 && w.rain < 0.05) add({ id: 'wx-cross', priority: 'MEDIUM', category: 'WEATHER', title: 'Slick crossover approaching', detail: `Wetness ${pct(w.wetness)} and drying. We switch at about 13%. Watch for the first car to gamble on slicks and read their sector times.`, confidence: 0.6 });
    }

    const weatherCall = advice.some((a) => a.id === 'wx-box' || a.id === 'wx-extend' || a.id === 'wx-wets' || a.id === 'wx-inters' || a.id === 'wx-slicks');

    if (!weatherCall && !wetRunning && needStop) {
      if (flag === 'SC' || flag === 'VSC') {
        const cheap = enumerate(sim, pitLossNow).all.filter((o) => o.stops[0]?.k === 1).sort((a, b) => a.time - b.time)[0];
        const later = sorted.find((o) => !o.stops.length || o.stops[0].k > 3);
        const saving = cheap && later ? later.time - cheap.time : 0;
        if (cheap && saving > 1.2 && remaining > 4) {
          add({ id: 'sc-box', priority: 'CRITICAL', category: 'PIT', title: `Box now: cheap stop under ${flag}`, detail: `Pit loss is about ${pitLossNow.toFixed(0)} s instead of ${PIT_LOSS_GREEN} s. Taking ${COMPOUNDS[cheap.stops[0].compound].name.toLowerCase()}s now is worth ${saving.toFixed(1)} s over stopping under green. Rejoin ${rejoin.text}.`, confidence: 0.85, action: { type: 'BOX', compound: cheap.stops[0].compound } });
        } else add({ id: 'sc-stay', priority: 'MEDIUM', category: 'PIT', title: `Stay out under ${flag}`, detail: `A stop now ${our.tyreAge < 5 ? 'throws away fresh tyres' : 'does not pay back'}: track position is worth more than the ${(PIT_LOSS_GREEN - pitLossNow).toFixed(0)} s saving.`, confidence: 0.65 });
      } else if (remaining <= 4) {
        add({ id: 'rule-box', priority: 'CRITICAL', category: 'PIT', title: 'Box: mandatory compound change', detail: 'Two dry compounds must be used. Running out of laps.', confidence: 0.99, action: { type: 'BOX', compound: nextCompound } });
      } else if (k1 <= 1) {
        if (rejoin.traffic && (pitWindow?.curve.find((c) => c.lap === lap + 1)?.delta ?? 9) < 1.2) {
          add({ id: 'pit-traffic', priority: 'HIGH', category: 'TRAFFIC', title: 'Extend one lap: traffic at pit exit', detail: `Stopping now rejoins ${rejoin.text}. One more lap costs ${(pitWindow!.curve.find((c) => c.lap === lap + 1)!.delta).toFixed(1)} s on tyres but should clear ${rejoin.behind}.`, confidence: 0.6 });
        } else add({ id: 'pit-now', priority: 'HIGH', category: 'PIT', title: `Box this lap for ${COMPOUNDS[nextCompound].name.toLowerCase()}s`, detail: `Optimal stop lap reached (${best!.stops.length}-stop, ${toOption(best!, lap, our.compound, best!.time).label}). Tyre deg is ${tyre.degNow.toFixed(2)} s/lap and rising. Rejoin ${rejoin.text}.`, confidence: 0.8, action: { type: 'BOX', compound: nextCompound } });
      } else if (behind && behind.undercutProb > 0.55 && behind.tyreAge >= 8 && k1 <= 5 && deltaNow < 2.2) {
        add({ id: 'pit-cover', priority: 'HIGH', category: 'PIT', title: `Box to cover ${behind.code}`, detail: `${behind.code} is ${behind.gap.toFixed(1)} s behind on ${behind.tyreAge}-lap ${COMPOUNDS[behind.compound].name.toLowerCase()}s. If they stop first they gain ${behind.undercutGain.toFixed(1)} s on the out-lap (${pct(behind.undercutProb)} to jump us). Stopping now costs only ${deltaNow.toFixed(1)} s against the optimum.`, confidence: 0.7, action: { type: 'BOX', compound: nextCompound } });
      } else if (ahead && ahead.undercutProb > 0.6 && k1 <= 6 && deltaNow < 2.6 && !rejoin.traffic) {
        add({ id: 'pit-undercut', priority: 'HIGH', category: 'PIT', title: `Box: undercut ${ahead.code}`, detail: `Gap ${ahead.gap.toFixed(1)} s, new ${COMPOUNDS[nextCompound].name.toLowerCase()}s are worth ${ahead.undercutGain.toFixed(1)} s on the out-lap against their ${ahead.tyreAge}-lap ${COMPOUNDS[ahead.compound].name.toLowerCase()}s. ${pct(ahead.undercutProb)} to come out ahead. Rejoin ${rejoin.text}.`, confidence: ahead.undercutProb, action: { type: 'BOX', compound: nextCompound } });
      } else {
        const scNote = risk.sc10 > 0.2 ? ` Safety Car risk is ${pct(risk.sc10)} over the next 10 laps, so going long keeps the cheap-stop option alive.` : '';
        add({ id: 'pit-plan', priority: 'INFO', category: 'PIT', title: `Stay out. Target lap ${pitWindow!.best}`, detail: `Plan ${toOption(best!, lap, our.compound, best!.time).label}. Window opens lap ${pitWindow!.open}, closes lap ${pitWindow!.close}.${scNote}`, confidence: 0.7 });
      }
      const pitted = sim.cars[sim.cars.indexOf(our) - 1];
      if (ahead && ahead.overcutGain > 0.3 && pitted?.status === 'PIT') add({ id: 'overcut', priority: 'HIGH', category: 'PACE', title: `Overcut ${ahead.code}: push now`, detail: `${ahead.code} has stopped. Their out-lap warm-up costs them; two quick laps in clear air are worth ${ahead.overcutGain.toFixed(1)} s.`, confidence: 0.6, action: { type: 'MODE', mode: 'PUSH' } });
    } else if (!weatherCall && !wetRunning && !needStop) {
      add({ id: 'to-flag', priority: 'INFO', category: 'PIT', title: 'No further stops planned', detail: `Tyres go to the flag: ${remaining} laps left, about ${Math.round(tyre.lapsToCliff)} laps to the cliff at this pace.${flag === 'SC' && our.tyreAge > 12 && remaining > 8 ? ' A free stop for softs under this Safety Car is worth a look if track position allows.' : ''}`, confidence: 0.7 });
    }

    // Pace management.
    const gapAhead = our.pos > 1 ? our.interval : Infinity;
    const gapBehind = sim.cars[sim.cars.indexOf(our) + 1]?.interval ?? Infinity;
    if (!sim.neutral && !advice.some((a) => a.action?.type === 'MODE')) {
      if (our.pitCall) add({ id: 'mode-inlap', priority: 'MEDIUM', category: 'PACE', title: 'Push on the in-lap', detail: 'Tyres are coming off anyway. Use everything left in them.', confidence: 0.9, action: { type: 'MODE', mode: 'PUSH' } });
      else if (gapAhead < 1.3 && ahead && ahead.paceDelta > -0.1) add({ id: 'mode-attack', priority: 'MEDIUM', category: 'PACE', title: `Attack ${ahead.code}`, detail: `Gap ${gapAhead.toFixed(1)} s and we have ${Math.max(0, ahead.paceDelta).toFixed(2)} s/lap in hand. Overtake mode available into T12 and T1.`, confidence: 0.6, action: { type: 'MODE', mode: 'PUSH' } });
      else if (gapBehind < 1.1) add({ id: 'mode-defend', priority: 'MEDIUM', category: 'PACE', title: 'Hold standard pace, defend T12', detail: `${behind?.code ?? 'Car behind'} is within ${gapBehind.toFixed(1)} s. Keep the battery for the back straight.`, confidence: 0.55, action: { type: 'MODE', mode: 'STD' } });
      else if (gapAhead > 3.5 && gapBehind > 3 && needStop && k1 > 3 && tyre.lapsToCliff < k1 + 4) add({ id: 'mode-save', priority: 'MEDIUM', category: 'TYRES', title: 'Manage tyres in free air', detail: `No car within 3 s either side. Lifting costs ${MODE.SAVE.pace.toFixed(2)} s/lap but cuts wear by ${Math.round((1 - MODE.SAVE.wear) * 100)}%, which buys the stint length the plan needs.`, confidence: 0.6, action: { type: 'MODE', mode: 'SAVE' } });
      else add({ id: 'mode-std', priority: 'INFO', category: 'PACE', title: 'Standard pace', detail: 'Pace and tyre wear are on plan.', confidence: 0.6, action: { type: 'MODE', mode: 'STD' } });
    }

    if (isSlick(our.compound) && tyre.lapsToCliff < 3 && !our.pitCall) add({ id: 'cliff', priority: 'HIGH', category: 'TYRES', title: 'Tyres close to the cliff', detail: `About ${tyre.lapsToCliff.toFixed(1)} laps of life left on these ${spec.name.toLowerCase()}s. Deg goes non-linear after that, roughly +0.3 s per lap per lap.`, confidence: 0.75 });
    for (const h of sim.hazards) add({ id: `hz-${h.id}`, priority: 'MEDIUM', category: 'RISK', title: `${h.kind === 'STOPPED CAR' ? 'Stopped car' : h.kind === 'DEBRIS' ? 'Debris' : 'Gravel'} at ${h.turn}, sector ${h.sector}`, detail: `${h.note}. Yellow flags, no overtaking in S${h.sector}.${h.kind !== 'GRAVEL' && !sim.neutral ? ' Neutralisation likely. Be ready for a cheap stop' + (needStop ? ': crew on standby.' : '.') : ''}`, confidence: 0.7 });
    if (w.windGust > 32) add({ id: 'wind', priority: 'INFO', category: 'RISK', title: `Gusts to ${w.windGust.toFixed(0)} km/h`, detail: windNote, confidence: 0.6 });
    if (risk.sc5 > 0.12 && !sim.neutral) add({ id: 'sc-risk', priority: 'INFO', category: 'RISK', title: `Safety Car risk elevated: ${pct(risk.sc5)} in 5 laps`, detail: `Drivers near us with the highest incident index: ${risk.drivers.filter((d) => d.near).slice(0, 3).map((d) => d.code).join(', ') || 'none'}.`, confidence: 0.5 });
  }

  const rank: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 };
  advice.sort((a, b) => rank[a.priority] - rank[b.priority]);

  // --- headline ---
  let headline: Analysis['headline'];
  const top = advice[0];
  const boxAdvice = advice.find((a) => a.action?.type === 'BOX');
  if (our.finished || sim.chequered) headline = { call: 'CHEQUERED FLAG', text: `Classified P${our.pos}.`, tone: 'neutral' };
  else if (inPit) headline = { call: 'IN THE PIT LANE', text: `Fitting ${COMPOUNDS[our.pit!.next].name.toLowerCase()}s.`, tone: 'box' };
  else if (our.pitCall) headline = { call: 'BOX THIS LAP', text: `${COMPOUNDS[our.pitCall].name}s ready. Pit entry after T20.`, tone: 'box' };
  else if (boxAdvice && (boxAdvice.priority === 'CRITICAL' || boxAdvice.priority === 'HIGH')) headline = { call: 'BOX, BOX', text: boxAdvice.title, tone: 'box' };
  else if (top?.id === 'wx-extend' || top?.id === 'pit-traffic') headline = { call: 'STAY OUT', text: top.title, tone: 'stay' };
  else if (sim.neutral) headline = { call: `${sim.neutral.type} · HOLD DELTA`, text: top?.title ?? 'Keep positive on the delta.', tone: 'caution' };
  else if (advice.some((a) => a.action?.type === 'MODE' && a.action.mode === 'PUSH')) headline = { call: 'PUSH', text: advice.find((a) => a.action?.type === 'MODE')!.title, tone: 'push' };
  else headline = { call: 'STAY OUT', text: advice.find((a) => a.category === 'PIT')?.title ?? 'On plan.', tone: 'stay' };

  return { lap, remaining, headline, advice, options, optionsNote, pitWindow, rivals, rejoin, risk, forecast: fc, outlook, pitLossNow, tyre, wind: { mainStraight: mainHead, backStraight: backHead, note: windNote } };
}

export function compass(deg: number): string {
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Compact state for the Claude engineer chat. */
export function buildSnapshot(sim: RaceSim, a: Analysis, activeTab: string) {
  const our = sim.our;
  const w = sim.weather;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    note: 'Synthetic simulation data',
    activeTab,
    lap: a.lap, totalLaps: RACE_LAPS, flag: sim.flag,
    ourCar: { driver: 'VER', position: our.pos, gapToLeader: r1(our.gapLeader), gapAhead: r1(our.interval), compound: COMPOUNDS[our.compound].name, tyreAgeLaps: Math.round(our.tyreAge), tyreLifeLeftPct: Math.round(a.tyre.lifeLeft * 100), lapsToCliff: r1(a.tyre.lapsToCliff), degSecPerLapNow: r1(a.tyre.degNow), paceMode: our.mode, stopsMade: our.stops, compoundsUsed: our.compoundsUsed, lastLap: our.lastLap && r1(our.lastLap), pitCalled: our.pitCall },
    tyreSetsAvailable: sim.availableSets().map((s) => ({ compound: s.compound, lapsUsed: s.laps })),
    order: sim.cars.slice(0, 22).map((c) => ({ pos: c.pos, code: c.code, gap: r1(c.gapLeader), tyre: c.compound, age: Math.round(c.tyreAge), stops: c.stops.length, status: c.status })),
    builtInModelCall: a.headline,
    advice: a.advice.map((x) => ({ priority: x.priority, title: x.title, detail: x.detail })),
    strategyOptions: a.options.map((o) => ({ plan: o.label, stopLaps: o.stops.map((s) => s.lap), deltaToBestSec: r1(o.delta) })),
    pitWindow: a.pitWindow && { open: a.pitWindow.open, best: a.pitWindow.best, close: a.pitWindow.close },
    pitLossNowSec: a.pitLossNow, rejoinIfPitNow: a.rejoin.text,
    rivals: a.rivals.map((r) => ({ ...r, gap: r1(r.gap), paceDelta: r1(r.paceDelta), undercutGain: r1(r.undercutGain), undercutProb: r1(r.undercutProb), overcutGain: r1(r.overcutGain) })),
    risk: { safetyCarNext5: r1(a.risk.sc5), safetyCarNext10: r1(a.risk.sc10), safetyCarRestOfRace: r1(a.risk.scRace), vscNext5: r1(a.risk.vsc5), vscRestOfRace: r1(a.risk.vscRace), neutralisationsSoFar: sim.neutralLog },
    hazards: sim.hazards.map((h) => ({ kind: h.kind, turn: h.turn, sector: h.sector, note: h.note })),
    weather: { rainNow: r1(w.rain), trackWetness: r1(w.wetness), trackTempC: r1(w.trackTemp), airTempC: r1(w.airTemp), windKmh: r1(w.windSpeed), gustKmh: r1(w.windGust), windFrom: compass(w.windDir), humidity: Math.round(w.humidity), rainEtaMin: a.outlook.etaMin, rainEtaLap: a.outlook.etaLap && Math.round(a.outlook.etaLap), rainPeakIntensity: r1(a.outlook.peak), rainProbability: r1(a.outlook.maxProb), windNote: a.wind.note },
    recentEvents: sim.events.slice(-10).map((e) => `L${e.lap} [${e.kind}] ${e.text}`),
    ourRecentLaps: our.laps.slice(-8).map((l) => ({ lap: l.lap, time: r1(l.time), tyre: l.compound, tyreAge: l.age, pos: l.pos, pitLap: l.pit, neutralised: l.neutral })),
    tyreModel: Object.values(COMPOUNDS).map((c) => ({ compound: c.name, paceOffsetSec: c.offset, degSecPerLap: c.deg, cliffAtLaps: c.life, outLapWarmupSec: c.warmup })),
    crossovers: { slickToInterWetness: INTER_CROSSOVER, interToWetWetness: WET_CROSSOVER },
    forecastNext60Min: a.forecast.filter((p) => p.min % 5 === 0).map((p) => ({ min: p.min, lap: Math.round(p.lap), rain: r1(p.rain), prob: r1(p.prob) })),
    windOnStraights: { mainStraightHeadwindKmh: r1(a.wind.mainStraight), backStraightHeadwindKmh: r1(a.wind.backStraight) },
    driverIncidentIndex: a.risk.drivers.slice(0, 8).map((d) => ({ code: d.code, pos: d.pos, perLapRatePct: Math.round(d.rate * 10000) / 100, nearUs: d.near })),
    cotaRecord: { priorSafetyCarRate: PRIOR.scRate, priorVscRate: PRIOR.vscRate, years: COTA_HISTORY },
    practiceLongRuns: PRACTICE_RUNS.map((p) => ({ session: p.session, compound: COMPOUNDS[p.compound].name, condition: p.condition, trackTempC: p.trackTemp, laps: p.laps.length, avgLapSec: r1(p.laps.slice(1).reduce((x, y) => x + y, 0) / (p.laps.length - 1)) })),
    rivalLongRunPaceVsUsSecPerLap: RIVAL_LONG_RUN,
  };
}

/** Offline answer when no Claude credentials are configured. */
export function localAnswer(q: string, sim: RaceSim, a: Analysis): string {
  const our = sim.our;
  const s = q.toLowerCase();
  const lines: string[] = [];
  if (/rain|weather|radar|wet|inter/.test(s)) {
    lines.push(a.outlook.etaMin == null ? 'Radar is clear for the next hour. No rain threat.' : a.outlook.etaMin === 0 ? `It is raining now, intensity ${pct(sim.weather.rain)}, track wetness ${pct(sim.weather.wetness)}.` : `Rain ETA ${a.outlook.etaMin} min (about lap ${Math.round(a.outlook.etaLap!)}), peak intensity ${pct(a.outlook.peak)}, probability ${pct(a.outlook.maxProb)}.`);
    lines.push(`Slick crossover is about ${pct(INTER_CROSSOVER)} wetness; we are at ${pct(sim.weather.wetness)}.`);
  } else if (/safety|sc\b|vsc|risk/.test(s)) {
    lines.push(`Safety Car: ${pct(a.risk.sc5)} next 5 laps, ${pct(a.risk.sc10)} next 10, ${pct(a.risk.scRace)} to the flag. VSC: ${pct(a.risk.vscRace)} to the flag.`);
    lines.push(`A stop under SC costs about ${PIT_LOSS_SC} s against ${PIT_LOSS_GREEN} s under green.`);
  } else if (/undercut|overcut|ahead|behind/.test(s)) {
    for (const r of a.rivals) lines.push(`${r.code} (${r.relation.toLowerCase()}, ${r.gap.toFixed(1)} s): ${r.note}.`);
  } else if (/tyre|tire|deg|cliff/.test(s)) {
    lines.push(`${COMPOUNDS[our.compound].name}s, ${Math.round(our.tyreAge)} laps old, ${Math.round(a.tyre.lifeLeft * 100)}% life, deg ${a.tyre.degNow.toFixed(2)} s/lap, about ${a.tyre.lapsToCliff.toFixed(0)} laps to the cliff.`);
  } else {
    lines.push(`${a.headline.call}. ${a.headline.text.replace(/\.?$/, '.')}`);
    if (a.advice[0]) lines.push(a.advice[0].detail);
    if (a.options[0]) lines.push(`Best plan: ${a.options[0].label}${a.options[0].stops.length ? `, stopping lap ${a.options[0].stops.map((x) => x.lap).join(' and ')}` : ''}.`);
  }
  return lines.join(' ');
}
