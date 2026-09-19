import type { ForecastPoint, RainCell, ScenarioId, Weather } from './types';
import type { Rng } from './rng';

// Radar frame: km east (x) and north (y) of the circuit.
const toVec = (fromDeg: number, speed: number) => {
  // Wind FROM `fromDeg` moves things TOWARD fromDeg + 180.
  const to = ((fromDeg + 180) * Math.PI) / 180;
  return { vx: Math.sin(to) * speed, vy: Math.cos(to) * speed };
};

let cellId = 1;

export function makeCell(rng: Rng, x: number, y: number, r: number, intensity: number, steerDir: number, steerSpeed: number): RainCell {
  const v = toVec(steerDir + rng.range(-2.5, 2.5), steerSpeed * rng.range(0.92, 1.08));
  return { id: cellId++, x, y, r, intensity, vx: v.vx / 3600, vy: v.vy / 3600, // km per second
    seed: rng.next() * 1000 };
}

export function initWeather(scenario: ScenarioId, rng: Rng): Weather {
  const steerDir = 248 + rng.range(-8, 8); // showers track in from the WSW
  const steerSpeed = 34; // km/h
  const w: Weather = {
    cells: [],
    rain: 0,
    wetness: 0,
    airTemp: 27,
    trackTemp: 39,
    humidity: 58,
    cloud: 0.35,
    windSpeed: 14,
    windGust: 22,
    windDir: 165,
    steerDir,
    steerSpeed,
  };
  const up = ((steerDir) * Math.PI) / 180; // unit vector pointing upwind
  const ux = Math.sin(up), uy = Math.cos(up);
  const place = (distKm: number, lateralKm: number, r: number, intensity: number) =>
    w.cells.push(makeCell(rng, ux * distKm - uy * lateralKm, uy * distKm + ux * lateralKm, r, intensity, steerDir, steerSpeed));

  if (scenario === 'rain-threat') {
    // A broken line of showers roughly 50 minutes out; whether the core clips the circuit is uncertain.
    const miss = rng.range(-4.5, 4.5);
    place(31, miss, 6.5, 0.72);
    place(36, miss + 7, 5, 0.5);
    place(42, miss - 9, 7, 0.6);
    place(55, miss + 2, 8, 0.45);
    place(24, 22, 4, 0.35);
    w.cloud = 0.55;
    w.humidity = 66;
  } else if (scenario === 'wet-start') {
    place(2, 0, 9, 0.62);
    place(14, 3, 6, 0.4);
    place(48, -4, 7, 0.5);
    w.wetness = 0.5;
    w.rain = 0.5;
    w.cloud = 0.95;
    w.humidity = 92;
    w.airTemp = 21;
    w.trackTemp = 24;
  } else {
    place(60, 38, 5, 0.3);
    w.cloud = 0.2;
    w.airTemp = 29;
    w.trackTemp = 43;
  }
  return w;
}

export function rainAt(cells: RainCell[], x = 0, y = 0): number {
  let r = 0;
  for (const c of cells) {
    const d = Math.hypot(c.x - x, c.y - y) / c.r;
    if (d < 1.6) r = Math.max(r, c.intensity * Math.exp(-d * d * 1.4));
  }
  return r < 0.03 ? 0 : Math.min(1, r);
}

export function stepWeather(w: Weather, dt: number, t: number, rng: Rng, racing: boolean) {
  for (const c of w.cells) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
  w.cells = w.cells.filter((c) => Math.hypot(c.x, c.y) < 140);
  w.rain = rainAt(w.cells);

  // Track wetness: rain fills it, heat, wind and running cars dry it.
  // Steady rain settles the track at a wetness that matches its intensity.
  const target = Math.min(1, w.rain * 1.35);
  const dry = (1 - w.rain) * (0.00022 + Math.max(0, w.trackTemp - 20) * 0.000006 + w.windSpeed * 0.000003) * (racing ? 1.25 : 1);
  const delta = w.rain > 0.05 && target > w.wetness ? (target - w.wetness) * 0.0065 : -dry * (w.rain > 0.05 ? 0.4 : 1);
  w.wetness = Math.max(0, Math.min(1, w.wetness + delta * dt));

  // Cloud follows nearby cells; temperatures relax toward a target.
  let near = 0;
  for (const c of w.cells) near = Math.max(near, Math.max(0, 1 - Math.hypot(c.x, c.y) / (c.r * 3.2)));
  const cloudTarget = Math.max(w.cloud * 0.999, Math.min(1, 0.3 + near * 0.7));
  w.cloud += (Math.min(1, cloudTarget) - w.cloud) * Math.min(1, dt / 240);
  if (near === 0) w.cloud += (0.3 - w.cloud) * Math.min(1, dt / 1500);
  const airTarget = 28 - w.cloud * 3 - w.rain * 5 - w.wetness * 2;
  w.airTemp += (airTarget - w.airTemp) * Math.min(1, dt / 600);
  const trackTarget = w.airTemp + 15 * (1 - w.cloud) - w.wetness * 6 - w.rain * 4 + 1;
  w.trackTemp += (trackTarget - w.trackTemp) * Math.min(1, dt / 420);
  w.humidity += (55 + w.cloud * 20 + w.rain * 25 - w.humidity) * Math.min(1, dt / 500);

  // Surface wind: slow drift plus gusts that build ahead of a shower.
  const wobble = Math.sin(t / 310) * 0.6 + Math.sin(t / 97) * 0.4;
  const base = 13 + near * 14 + wobble * 3;
  w.windSpeed += (base - w.windSpeed) * Math.min(1, dt / 60) + rng.range(-0.15, 0.15) * Math.sqrt(dt);
  w.windSpeed = Math.max(2, w.windSpeed);
  w.windGust = w.windSpeed * (1.45 + near * 0.5);
  const dirTarget = 165 + Math.sin(t / 540) * 25 + near * 60;
  w.windDir = (w.windDir + (dirTarget - w.windDir) * Math.min(1, dt / 200) + 360) % 360;
}

/** Project the rain cells forward and sample rain over the circuit once a minute. */
export function forecast(w: Weather, lapTime: number, currentLap: number, minutes = 60): ForecastPoint[] {
  const out: ForecastPoint[] = [];
  for (let m = 0; m <= minutes; m += 1) {
    const cells = w.cells.map((c) => ({ ...c, x: c.x + c.vx * m * 60, y: c.y + c.vy * m * 60 }));
    const rain = rainAt(cells);
    // Uncertainty: widen each cell with lead time and let confidence decay.
    let prob = 0;
    for (const c of cells) {
      const spread = c.r * 1.25 + m * 0.16;
      const d = Math.hypot(c.x, c.y) / spread;
      prob = Math.max(prob, Math.exp(-d * d * 1.1) * Math.min(1, c.intensity * 1.6) * (1 - Math.min(0.35, m * 0.004)));
    }
    out.push({ min: m, lap: currentLap + (m * 60) / lapTime, rain, prob: Math.min(0.98, prob) });
  }
  return out;
}

export interface RainOutlook { etaMin: number | null; etaLap: number | null; peak: number; durationMin: number; maxProb: number }

export function rainOutlook(fc: ForecastPoint[], w: Weather): RainOutlook {
  const first = fc.find((p) => p.rain > 0.12);
  const wetPts = fc.filter((p) => p.rain > 0.12);
  return {
    etaMin: w.rain > 0.12 ? 0 : first ? first.min : null,
    etaLap: w.rain > 0.12 ? fc[0].lap : first ? first.lap : null,
    peak: Math.max(0, ...fc.map((p) => p.rain)),
    durationMin: wetPts.length,
    maxProb: Math.max(0, ...fc.map((p) => p.prob)),
  };
}

/** Head/tail wind component (km/h, positive = headwind) for a car travelling on `bearing`. */
export function headwind(w: Weather, bearing: number): number {
  return w.windSpeed * Math.cos(((w.windDir - bearing) * Math.PI) / 180);
}
