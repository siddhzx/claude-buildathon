import { DRIVERS, OUR_DRIVER } from '../data/grid';
import { PIT_ENTRY_TIME, PIT_EXIT_TIME, RACE_LAPS, TURNS, nearestTurn, sectorOf, timeToDist } from '../data/track';
import { Rng } from './rng';
import { BASE_LAP, COMPOUNDS, FUEL_PER_LAP, MODE, PIT_LOSS_GREEN, bestCompoundFor, degAt, isSlick, wearRate, wetPenalty } from './tyres';
import type { Car, Compound, Flag, Hazard, Neutralisation, PaceMode, RaceEvent, ScenarioId, TelemetrySample, TyreSet, Weather } from './types';
import { initWeather, makeCell, stepWeather } from './weather';

const REF_LAP = 95;
const PIT_TRANSIT = (1 - PIT_ENTRY_TIME + PIT_EXIT_TIME) * REF_LAP;
const DECISION_POINT = 0.86;
const SC_LAP = 140;
const SC_CATCHUP_LAP = 116;
const VSC_FACTOR = 1.38;

// Per car, per lap. Calibrated so a dry race lands near the COTA priors in data/history.ts.
const INCIDENT_BASE = 0.0011;
const MECHANICAL_BASE = 0.00035;
const P_CRASH = 0.28, P_DEBRIS = 0.22;
const P_SC_GIVEN_CRASH = 0.55, P_VSC_GIVEN_CRASH = 0.35;
const P_VSC_GIVEN_DEBRIS = 0.55;
const P_SC_GIVEN_MECH = 0.15, P_VSC_GIVEN_MECH = 0.45;

function ourTyreSets(scenario: ScenarioId): TyreSet[] {
  const mk = (compound: Compound, laps: number, n: number): TyreSet => ({ id: `${compound}${n}`, compound, laps, inUse: false, spent: false });
  const sets = [mk('H', 0, 1), mk('H', 3, 2), mk('M', 0, 1), mk('M', 0, 2), mk('S', 0, 1), mk('S', 4, 2), mk('S', 5, 3), mk('I', 0, 1), mk('I', 0, 2), mk('I', 0, 3), mk('W', 0, 1), mk('W', 0, 2)];
  const start = scenario === 'wet-start' ? 'I1' : 'M1';
  sets.find((s) => s.id === start)!.inUse = true;
  return sets;
}

function aiPlan(rng: Rng, scenario: ScenarioId): { start: Compound; plan: { lap: number; compound: Compound }[] } {
  if (scenario === 'wet-start') return { start: 'I', plan: [] };
  const r = rng.next();
  if (r < 0.5) return { start: 'M', plan: [{ lap: Math.round(rng.range(19, 26)), compound: 'H' }] };
  if (r < 0.68) return { start: 'H', plan: [{ lap: Math.round(rng.range(29, 36)), compound: 'M' }] };
  if (r < 0.9) return { start: 'M', plan: [{ lap: Math.round(rng.range(14, 18)), compound: 'H' }, { lap: Math.round(rng.range(37, 41)), compound: 'M' }] };
  return { start: 'S', plan: [{ lap: Math.round(rng.range(11, 14)), compound: 'H' }, { lap: Math.round(rng.range(36, 40)), compound: 'M' }] };
}

export class RaceSim {
  readonly seed: number;
  readonly scenario: ScenarioId;
  rng: Rng;
  t = 0;
  cars: Car[] = [];
  weather: Weather;
  hazards: Hazard[] = [];
  events: RaceEvent[] = [];
  neutral: Neutralisation | null = null;
  pendingNeutral: { type: 'SC' | 'VSC'; at: number; reason: string } | null = null;
  chequered = false;
  over = false;
  ourSets: TyreSet[];
  telemetry: TelemetrySample[] = [];
  neutralLog: { type: 'SC' | 'VSC'; lap: number }[] = [];
  private hazardId = 1;
  private finishCount = 0;

  constructor(seed: number, scenario: ScenarioId) {
    this.seed = seed;
    this.scenario = scenario;
    this.rng = new Rng(seed);
    this.weather = initWeather(scenario, this.rng);
    this.ourSets = ourTyreSets(scenario);
    const grid = [...DRIVERS].sort((a, b) => a.grid - b.grid);
    this.cars = grid.map((driver, i) => {
      const ours = driver.code === OUR_DRIVER;
      const ai = aiPlan(this.rng, scenario);
      const compound: Compound = ours ? (scenario === 'wet-start' ? 'I' : 'M') : ai.start;
      return {
        code: driver.code, driver, prog: -i * 0.0016, pos: i + 1, status: 'RUN', compound, tyreAge: 0, effAge: 0, warmup: 0,
        compoundsUsed: [compound], stops: [], plan: ours ? [] : ai.plan, pitCall: null, pit: null, mode: 'STD',
        lapStart: 0, lastLap: null, bestLap: null, laps: [], lapNoise: 0, curLapTime: REF_LAP, gapLeader: 0, interval: 0,
        lapCount: 0, lapHadPit: false, lapHadNeutral: false, weatherReact: this.rng.range(0, 0.07), finished: false,
      } satisfies Car;
    });
    this.log('INFO', `Lights out at COTA. ${RACE_LAPS} laps, ${this.weather.wetness > 0.2 ? 'wet track, intermediates' : 'dry track'}.`);
  }

  get our(): Car { return this.cars.find((c) => c.code === OUR_DRIVER)!; }
  get leader(): Car { return this.cars[0]; }
  get leaderLap(): number { return Math.min(RACE_LAPS, Math.max(1, Math.floor(this.leader.prog) + 1)); }
  lapOf(car: Car): number { return Math.min(RACE_LAPS, Math.max(1, Math.floor(car.prog) + 1)); }

  get flag(): Flag {
    if (this.chequered) return 'CHEQUERED';
    if (this.neutral) return this.neutral.type;
    return this.hazards.length ? 'YELLOW' : 'GREEN';
  }
  get yellowSectors(): number[] { return [...new Set(this.hazards.map((h) => h.sector))]; }

  log(kind: RaceEvent['kind'], text: string, car?: string) {
    this.events.push({ t: this.t, lap: this.cars.length ? this.leaderLap : 1, kind, text, car });
    if (this.events.length > 250) this.events.splice(0, this.events.length - 250);
  }

  // ---------- lap time model ----------

  /** Clean-air green-flag lap time for a car right now. */
  cleanLap(car: Car): number {
    const w = this.weather;
    const spec = COMPOUNDS[car.compound];
    const fuel = Math.max(0, RACE_LAPS - Math.max(0, car.prog)) * FUEL_PER_LAP;
    const wetSkill = w.wetness > 0.1 ? (car.driver.risk - 1) * 1.5 * w.wetness : 0;
    let lt = BASE_LAP + car.driver.pace + spec.offset + degAt(car.compound, car.effAge) + fuel + wetPenalty(car.compound, w.wetness)
      + spec.warmup * 2 * car.warmup + MODE[car.mode].pace + car.lapNoise + wetSkill + Math.max(0, w.windGust - 30) * 0.012;
    if (car.prog < 0.3) lt *= 1.2; // standing start
    return lt;
  }

  private effectiveLap(car: Car): number {
    const clean = this.cleanLap(car);
    if (!this.neutral) return clean;
    if (this.neutral.type === 'VSC') return Math.max(clean, REF_LAP) * VSC_FACTOR;
    return car === this.leader ? SC_LAP : SC_CATCHUP_LAP;
  }

  // ---------- risk model (shared by the sim and the advisor) ----------

  incidentRate(car: Car, steady = false): number {
    if (car.status === 'OUT' || car.finished) return 0;
    const w = this.weather;
    const wrongTyre = wetPenalty(car.compound, w.wetness) > 4 ? 2.2 : 1;
    const wet = 1 + 3.2 * w.wetness;
    const lap1 = steady ? 1 : car.prog < 1 ? 5 : car.prog < 2 ? 2 : 1;
    const battle = car.interval > 0 && car.interval < 1 ? 1.7 : 1;
    const cliff = car.effAge > COMPOUNDS[car.compound].life ? 1.5 : 1;
    const gust = this.weather.windGust > 35 ? 1.3 : 1;
    const debris = this.hazards.some((h) => h.kind === 'DEBRIS') ? 1.25 : 1;
    const calm = this.neutral && !steady ? 0.15 : 1;
    return INCIDENT_BASE * car.driver.risk * wrongTyre * wet * lap1 * battle * cliff * gust * debris * calm;
  }

  /** Expected Safety Car and VSC deployments per lap, given the current state. */
  neutralHazard(steady = false): { sc: number; vsc: number } {
    let sc = 0, vsc = 0;
    for (const car of this.cars) {
      const inc = this.incidentRate(car, steady);
      sc += inc * P_CRASH * P_SC_GIVEN_CRASH + MECHANICAL_BASE * P_SC_GIVEN_MECH;
      vsc += inc * (P_CRASH * P_VSC_GIVEN_CRASH + P_DEBRIS * P_VSC_GIVEN_DEBRIS) + MECHANICAL_BASE * P_VSC_GIVEN_MECH;
    }
    return { sc, vsc };
  }

  // ---------- user / engineer controls ----------

  callPit(compound: Compound) { this.our.pitCall = compound; this.log('RADIO', `Box, box. ${COMPOUNDS[compound].name}s are ready.`, OUR_DRIVER); }
  cancelPit() { if (this.our.pitCall && !this.our.pit) { this.our.pitCall = null; this.log('RADIO', 'Stay out, stay out.', OUR_DRIVER); } }
  setMode(mode: PaceMode) { if (this.our.mode !== mode) { this.our.mode = mode; this.log('RADIO', `Mode ${MODE[mode].label.toLowerCase()}.`, OUR_DRIVER); } }

  availableSets(compound?: Compound): TyreSet[] {
    return this.ourSets.filter((s) => !s.inUse && !s.spent && (!compound || s.compound === compound)).sort((a, b) => a.laps - b.laps);
  }

  deploy(type: 'SC' | 'VSC', reason: string) {
    if (this.chequered || this.neutral?.type === 'SC' || (this.neutral && type === 'VSC')) return;
    const dur = type === 'SC' ? this.rng.range(430, 680) : this.rng.range(75, 150);
    this.neutral = { type, endsAt: this.t + dur, endingAnnounced: false, since: this.t };
    this.neutralLog.push({ type, lap: this.leaderLap });
    for (const c of this.cars) c.lapHadNeutral = true;
    this.log('FLAG', `${type === 'SC' ? 'SAFETY CAR' : 'VIRTUAL SAFETY CAR'} deployed. ${reason}`);
  }

  addHazard(kind: Hazard['kind'], timeFrac: number, note: string, duration: number): Hazard {
    const dist = timeToDist(timeFrac);
    const h: Hazard = { id: this.hazardId++, kind, dist, turn: nearestTurn(dist).name, sector: sectorOf(dist), since: this.t, clearsAt: this.t + duration, note };
    this.hazards.push(h);
    return h;
  }

  injectDebris() {
    const turn = this.rng.pick(TURNS.filter((t) => ['T1', 'T11', 'T12', 'T15', 'T19', 'T6'].includes(t.name)));
    const h = this.addHazard('DEBRIS', turn.time, 'Carbon fragments on the racing line', 150);
    this.log('INCIDENT', `Debris reported at ${h.turn}. Yellow flag sector ${h.sector}.`);
    if (this.rng.chance(P_VSC_GIVEN_DEBRIS)) this.pendingNeutral = { type: 'VSC', at: this.t + this.rng.range(10, 22), reason: `Marshals recovering debris at ${h.turn}.` };
  }

  injectRain(intensity: number) {
    const w = this.weather;
    const up = (w.steerDir * Math.PI) / 180;
    const d = 9 + (1 - intensity) * 4;
    w.cells.push(makeCell(this.rng, Math.sin(up) * d, Math.cos(up) * d, 5 + intensity * 4, intensity, w.steerDir, w.steerSpeed));
    this.log('WEATHER', `Radar: new ${intensity > 0.6 ? 'heavy' : 'light'} cell ${d.toFixed(0)} km upwind, tracking toward the circuit.`);
  }

  clearRain() { this.weather.cells = []; this.log('WEATHER', 'Radar clear. Remaining showers have dissipated.'); }

  // ---------- main step ----------

  step(dt: number) {
    if (this.over) return;
    this.t += dt;
    stepWeather(this.weather, dt, this.t, this.rng, true);
    this.stepRaceControl();

    for (const car of this.cars) {
      if (car.status === 'OUT' || car.finished) continue;
      if (car.status === 'PIT') { this.stepPit(car, dt); continue; }
      const lt = this.effectiveLap(car);
      car.curLapTime = lt;
      const before = car.prog;
      const dprog = dt / lt;
      car.prog += dprog;

      const neutralWear = this.neutral ? 0.35 : 1;
      const dirty = car.interval > 0 && car.interval < 1.2 ? 1.08 : 1;
      const wear = wearRate(this.weather.trackTemp, car.mode, car.driver.tyreCare, this.weather.wetness, car.compound) * neutralWear * dirty;
      car.tyreAge += dprog;
      car.effAge += dprog * wear;
      car.warmup = Math.max(0, car.warmup - dprog * (this.neutral ? 0.4 : 1));

      const f0 = before - Math.floor(before), f1 = f0 + dprog;
      if (before >= 0) {
        if (f0 < DECISION_POINT && f1 >= DECISION_POINT) this.aiDecide(car);
        if (f0 < PIT_ENTRY_TIME && f1 >= PIT_ENTRY_TIME && car.pitCall) { this.enterPit(car); continue; }
        if (car.code !== OUR_DRIVER && this.rng.chance(this.incidentRate(car) * dprog)) this.incident(car);
        else if (car.code !== OUR_DRIVER && !this.neutral && this.rng.chance(MECHANICAL_BASE * dprog)) this.mechanical(car);
      }
      if (Math.floor(car.prog) > car.lapCount) this.completeLap(car);
    }

    this.interact(dt);
    this.classify();
  }

  private stepRaceControl() {
    this.hazards = this.hazards.filter((h) => {
      if (this.t < h.clearsAt || this.neutral) return true;
      this.log('FLAG', `Track clear at ${h.turn}.`);
      return false;
    });
    if (this.pendingNeutral && this.t >= this.pendingNeutral.at) {
      this.deploy(this.pendingNeutral.type, this.pendingNeutral.reason);
      this.pendingNeutral = null;
    }
    const n = this.neutral;
    if (n) {
      if (!n.endingAnnounced && this.t >= n.endsAt - (n.type === 'SC' ? 90 : 12)) {
        n.endingAnnounced = true;
        this.log('FLAG', n.type === 'SC' ? 'Safety Car in this lap.' : 'VSC ending.');
      }
      if (this.t >= n.endsAt) {
        this.neutral = null;
        this.hazards = [];
        this.log('FLAG', 'GREEN FLAG. Track clear.');
      }
    }
  }

  private aiDecide(car: Car) {
    if (car.code === OUR_DRIVER || car.pitCall) return;
    const lap = this.lapOf(car);
    const remaining = RACE_LAPS - lap;
    if (remaining < 2) return;
    const w = this.weather;
    const slickFor = (): Compound => (remaining < 16 ? 'S' : remaining < 30 ? 'M' : 'H');
    if (isSlick(car.compound) && w.wetness > 0.17 + car.weatherReact) car.pitCall = bestCompoundFor(w.wetness + w.rain * 0.15);
    else if (!isSlick(car.compound) && w.wetness < 0.125 - car.weatherReact * 0.5 && w.rain < 0.05) car.pitCall = slickFor();
    else if (car.compound === 'I' && w.wetness > 0.82) car.pitCall = 'W';
    else if (car.compound === 'W' && w.wetness < 0.62) car.pitCall = 'I';
    else if (isSlick(car.compound)) {
      const next = car.plan[0];
      if (next && lap >= next.lap) car.pitCall = next.compound;
      else if (this.neutral && next && next.lap - lap <= 12 && car.tyreAge >= 6) car.pitCall = next.compound;
      else if (this.neutral && !next && car.tyreAge > 18 && remaining > 8) car.pitCall = slickFor();
      else if (!next && car.effAge > COMPOUNDS[car.compound].life + 4 && remaining > 6) car.pitCall = slickFor();
    }
  }

  private enterPit(car: Car) {
    const slow = this.rng.chance(0.05) ? this.rng.range(2.5, 7) : 0;
    const stopTime = 2.15 + Math.abs(this.rng.gauss()) * 0.3 + slow;
    const total = PIT_TRANSIT + PIT_LOSS_GREEN + (stopTime - 2.5);
    const lapBase = Math.floor(car.prog);
    car.status = 'PIT';
    car.lapHadPit = true;
    car.pit = { elapsed: 0, total, stopAt: (total - stopTime) * 0.5, stopTime, next: car.pitCall!, swapped: false, fromProg: lapBase + PIT_ENTRY_TIME, toProg: lapBase + 1 + PIT_EXIT_TIME };
    car.prog = car.pit.fromProg;
  }

  /** 0..1 position along the pit lane for a car in the pits. */
  pitPathU(car: Car): number {
    const p = car.pit;
    if (!p) return 0;
    const travel = p.total - p.stopTime;
    if (p.elapsed < p.stopAt) return (p.elapsed / travel);
    if (p.elapsed < p.stopAt + p.stopTime) return p.stopAt / travel;
    return (p.elapsed - p.stopTime) / travel;
  }

  private stepPit(car: Car, dt: number) {
    const p = car.pit!;
    p.elapsed += dt;
    if (!p.swapped && p.elapsed >= p.stopAt) this.fitTyres(car, p.next, p.stopTime);
    car.prog = p.fromProg + (p.toProg - p.fromProg) * Math.min(1, this.pitPathU(car));
    if (Math.floor(car.prog) > car.lapCount) this.completeLap(car);
    if (p.elapsed >= p.total) {
      car.status = 'RUN';
      car.pit = null;
      car.pitCall = null;
      car.warmup = 1 + Math.max(0, 30 - this.weather.trackTemp) * 0.03;
    }
  }

  private fitTyres(car: Car, compound: Compound, stopTime: number) {
    car.pit!.swapped = true;
    let startAge = 0;
    if (car.code === OUR_DRIVER) {
      const cur = this.ourSets.find((s) => s.inUse);
      if (cur) { cur.inUse = false; cur.spent = true; cur.laps = Math.round(car.tyreAge); }
      const next = this.availableSets(compound)[0] ?? this.availableSets().find((s) => isSlick(s.compound) === isSlick(compound));
      if (next) { next.inUse = true; compound = next.compound; startAge = next.laps; }
    } else if (car.plan[0]) car.plan.shift();
    car.compound = compound;
    car.tyreAge = startAge;
    car.effAge = startAge;
    if (!car.compoundsUsed.includes(compound)) car.compoundsUsed.push(compound);
    car.stops.push({ lap: this.lapOf(car), to: compound, stopTime, flag: this.flag });
    this.log('PIT', `${car.code} pits from P${car.pos}: ${COMPOUNDS[compound].name}${startAge ? ` (used, ${startAge} laps)` : ''}, ${stopTime.toFixed(1)} s stop.`, car.code);
  }

  private completeLap(car: Car) {
    const lapNo = Math.floor(car.prog);
    car.lapCount = lapNo;
    // Interpolate the moment the car crossed the line inside this step.
    const cross = this.t - (car.prog - lapNo) * car.curLapTime;
    const time = cross - car.lapStart;
    car.lapStart = cross;
    car.lastLap = time;
    const clean = !car.lapHadPit && !car.lapHadNeutral;
    if (clean && lapNo > 1 && (car.bestLap == null || time < car.bestLap)) car.bestLap = time;
    car.laps.push({ lap: lapNo, time, compound: car.compound, age: Math.round(car.tyreAge), pos: car.pos, pit: car.lapHadPit, neutral: car.lapHadNeutral, wetness: this.weather.wetness });
    car.lapHadPit = false;
    car.lapHadNeutral = this.neutral != null;
    car.lapNoise = this.rng.gauss() * 0.16;
    if (car.code === OUR_DRIVER) {
      const w = this.weather;
      this.telemetry.push({ lap: lapNo, trackTemp: w.trackTemp, airTemp: w.airTemp, wind: w.windSpeed, rain: w.rain, wetness: w.wetness });
    }
    if (lapNo >= RACE_LAPS && !this.chequered) {
      this.chequered = true;
      this.log('FLAG', `CHEQUERED FLAG. ${car.code} wins the United States Grand Prix.`);
    }
    if (this.chequered) {
      car.finished = true;
      car.finishTime = cross;
      car.prog = lapNo + (1 - ++this.finishCount * 1e-6);
      if (car.code === OUR_DRIVER) this.log('RADIO', `P${car.pos}. That's the flag, Max. Good job.`, OUR_DRIVER);
      if (this.cars.every((c) => c.finished || c.status === 'OUT')) this.over = true;
    }
  }

  private incident(car: Car) {
    const frac = car.prog - Math.floor(car.prog);
    const turn = nearestTurn(timeToDist(frac)).name;
    const r = this.rng.next();
    if (r < P_CRASH) {
      car.status = 'OUT';
      car.outReason = 'Accident';
      this.addHazard('STOPPED CAR', frac, `${car.code} in the barrier`, 240);
      this.log('INCIDENT', `${car.code} is off at ${turn} and out of the race.`, car.code);
      const d = this.rng.next();
      if (d < P_SC_GIVEN_CRASH) this.pendingNeutral = { type: 'SC', at: this.t + this.rng.range(6, 14), reason: `Recovery vehicle required at ${turn}.` };
      else if (d < P_SC_GIVEN_CRASH + P_VSC_GIVEN_CRASH) this.pendingNeutral = { type: 'VSC', at: this.t + this.rng.range(6, 14), reason: `${car.code} stopped at ${turn}.` };
    } else if (r < P_CRASH + P_DEBRIS) {
      car.prog -= this.rng.range(2, 5) / car.curLapTime;
      this.addHazard('DEBRIS', frac, `Front wing endplate from ${car.code}`, 140);
      this.log('INCIDENT', `Contact at ${turn}. ${car.code} continues with damage, debris on track.`, car.code);
      if (this.rng.chance(P_VSC_GIVEN_DEBRIS)) this.pendingNeutral = { type: 'VSC', at: this.t + this.rng.range(12, 25), reason: `Debris recovery at ${turn}.` };
    } else {
      car.prog -= this.rng.range(5, 13) / car.curLapTime;
      this.addHazard('GRAVEL', frac, `${car.code} rejoined, gravel on track`, 45);
      this.log('INCIDENT', `${car.code} spins at ${turn} and rejoins.`, car.code);
    }
  }

  private mechanical(car: Car) {
    const frac = car.prog - Math.floor(car.prog);
    const turn = nearestTurn(timeToDist(frac)).name;
    car.status = 'OUT';
    car.outReason = this.rng.pick(['Power unit', 'Hydraulics', 'Gearbox', 'Battery', 'Brakes']);
    this.addHazard('STOPPED CAR', frac, `${car.code} stopped, ${car.outReason.toLowerCase()}`, 200);
    this.log('INCIDENT', `${car.code} slows and stops near ${turn}: ${car.outReason.toLowerCase()} failure.`, car.code);
    const d = this.rng.next();
    if (d < P_SC_GIVEN_MECH) this.pendingNeutral = { type: 'SC', at: this.t + this.rng.range(8, 16), reason: `${car.code} stopped in a dangerous position.` };
    else if (d < P_SC_GIVEN_MECH + P_VSC_GIVEN_MECH) this.pendingNeutral = { type: 'VSC', at: this.t + this.rng.range(8, 16), reason: `${car.code} stopped at ${turn}.` };
  }

  /** Following, overtaking and Safety Car queueing. Works front to back in race order. */
  private interact(dt: number) {
    const order = this.cars.filter((c) => c.status === 'RUN' && !c.finished).sort((a, b) => b.prog - a.prog);
    const yellow = this.yellowSectors;
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1], b = order[i];
      const gap = (a.prog - b.prog) * b.curLapTime;
      if (this.neutral) {
        const min = this.neutral.type === 'SC' ? 0.55 : 0.3;
        if (gap < min) b.prog = a.prog - min / b.curLapTime;
        continue;
      }
      if (gap >= 0.25 || b.prog < 0.05) continue;
      const frac = b.prog - Math.floor(b.prog);
      const adv = this.cleanLap(a) - this.cleanLap(b);
      const noPass = yellow.includes(sectorOf(timeToDist(frac))) || adv <= 0.15;
      const threshold = this.weather.wetness > 0.15 ? 0.9 : 0.55;
      const pPerSec = adv >= threshold * 2.2 ? 1 : 0.004 * (adv / threshold) ** 2;
      if (!noPass && this.rng.chance(Math.min(1, pPerSec * dt))) {
        b.prog = a.prog + 0.05 / b.curLapTime;
        a.prog = b.prog - 0.3 / a.curLapTime;
        order[i - 1] = b;
        order[i] = a;
      } else b.prog = a.prog - 0.25 / b.curLapTime;
    }
  }

  private classify() {
    const rank = (c: Car) => (c.status === 'OUT' ? -1000 + c.prog : c.prog);
    this.cars.sort((a, b) => rank(b) - rank(a));
    const lead = this.cars[0];
    this.cars.forEach((c, i) => {
      c.pos = i + 1;
      const ref = this.neutral ? REF_LAP : c.curLapTime;
      c.gapLeader = (lead.prog - c.prog) * ref;
      c.interval = i === 0 ? 0 : (this.cars[i - 1].prog - c.prog) * ref;
    });
  }
}
