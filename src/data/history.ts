import type { Compound } from '../sim/types';

// Neutralisation priors for the risk model. Approximate, compiled from memory of
// past United States GPs at COTA; treat as model inputs rather than an official record.
export interface HistoryRow { year: number; sc: number; vsc: number; note: string }

export const COTA_HISTORY: HistoryRow[] = [
  { year: 2015, sc: 2, vsc: 2, note: 'Wet-dry race, multiple stoppages' },
  { year: 2016, sc: 0, vsc: 1, note: 'VSC for a stopped car' },
  { year: 2017, sc: 0, vsc: 0, note: 'Clean race' },
  { year: 2018, sc: 0, vsc: 1, note: 'Early VSC, shaped one-stop vs two-stop' },
  { year: 2019, sc: 0, vsc: 0, note: 'Late yellow flags only' },
  { year: 2021, sc: 0, vsc: 0, note: 'Clean race, undercut battle at the front' },
  { year: 2022, sc: 2, vsc: 0, note: 'Two Safety Cars before half distance' },
  { year: 2023, sc: 0, vsc: 0, note: 'Clean race' },
  { year: 2024, sc: 1, vsc: 0, note: 'Early Safety Car for a beached car' },
  { year: 2025, sc: 0, vsc: 1, note: 'Early VSC for debris after contact' },
];

export const PRIOR = (() => {
  const n = COTA_HISTORY.length;
  return {
    races: n,
    scRate: COTA_HISTORY.filter((r) => r.sc > 0).length / n,
    vscRate: COTA_HISTORY.filter((r) => r.vsc > 0).length / n,
    anyRate: COTA_HISTORY.filter((r) => r.sc + r.vsc > 0).length / n,
  };
})();

// Practice long runs for car 3 (synthetic). Lap times in seconds, fuel-corrected to race start load.
export interface PracticeRun {
  id: string;
  session: 'FP1' | 'FP2' | 'FP3';
  compound: Compound;
  condition: 'Dry' | 'Damp' | 'Wet';
  trackTemp: number;
  fuel: 'High' | 'Low';
  laps: number[];
}

function run(base: number, deg: number, n: number, seed: number, cliffAt = 99): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const noise = (s / 233280 - 0.5) * 0.28;
    const cliff = i > cliffAt ? (i - cliffAt) ** 2 * 0.05 : 0;
    out.push(+(base + deg * i + cliff + noise + (i === 0 ? 0.5 : 0)).toFixed(3));
  }
  return out;
}

export const PRACTICE_RUNS: PracticeRun[] = [
  { id: 'fp1-h', session: 'FP1', compound: 'H', condition: 'Dry', trackTemp: 34, fuel: 'High', laps: run(98.95, 0.03, 14, 11) },
  { id: 'fp2-m', session: 'FP2', compound: 'M', condition: 'Dry', trackTemp: 41, fuel: 'High', laps: run(98.35, 0.052, 13, 23) },
  { id: 'fp2-s', session: 'FP2', compound: 'S', condition: 'Dry', trackTemp: 40, fuel: 'High', laps: run(97.7, 0.09, 10, 37, 7) },
  { id: 'fp3-m', session: 'FP3', compound: 'M', condition: 'Dry', trackTemp: 31, fuel: 'High', laps: run(98.1, 0.044, 9, 51) },
  { id: 'fp3-i', session: 'FP3', compound: 'I', condition: 'Damp', trackTemp: 26, fuel: 'High', laps: run(106.4, -0.22, 7, 67) },
];

// Long-run pace of the front-runners relative to car 3, s/lap (positive = slower than us).
export const RIVAL_LONG_RUN: { team: string; M: number; H: number; S: number }[] = [
  { team: 'MCL', M: -0.04, H: 0.06, S: 0.02 },
  { team: 'MER', M: 0.05, H: -0.02, S: 0.1 },
  { team: 'FER', M: 0.14, H: 0.18, S: 0.04 },
];
