import type { Compound, PaceMode } from './types';

export interface CompoundSpec {
  id: Compound;
  name: string;
  label: string;
  color: string;
  /** Pace offset vs a new medium, s/lap. */
  offset: number;
  /** Linear degradation, s per lap of wear-equivalent age. */
  deg: number;
  /** Wear-equivalent age where the cliff starts. */
  life: number;
  /** Out-lap warm-up penalty, s. */
  warmup: number;
}

export const COMPOUNDS: Record<Compound, CompoundSpec> = {
  S: { id: 'S', name: 'Soft', label: 'C4', color: '#E5484D', offset: -0.65, deg: 0.11, life: 13, warmup: 0.6 },
  M: { id: 'M', name: 'Medium', label: 'C3', color: '#F0B726', offset: 0, deg: 0.06, life: 24, warmup: 1.1 },
  H: { id: 'H', name: 'Hard', label: 'C1', color: '#E8ECF1', offset: 0.5, deg: 0.028, life: 42, warmup: 1.9 },
  I: { id: 'I', name: 'Intermediate', label: 'INT', color: '#3DCC91', offset: 0, deg: 0.06, life: 30, warmup: 1.0 },
  W: { id: 'W', name: 'Full wet', label: 'WET', color: '#4C90F0', offset: 0, deg: 0.04, life: 40, warmup: 1.2 },
};

/** Track wetness where intermediates beat slicks, and where full wets beat intermediates. */
export const INTER_CROSSOVER = 0.17;
export const WET_CROSSOVER = 0.8;

export const SLICKS: Compound[] = ['S', 'M', 'H'];
export const isSlick = (c: Compound) => c === 'S' || c === 'M' || c === 'H';

export const BASE_LAP = 94.2; // new mediums, empty tank, quickest car, dry
export const FUEL_PER_LAP = 0.055; // s of lap time per lap of fuel on board
export const PIT_LOSS_GREEN = 21;
export const PIT_LOSS_VSC = 13.5;
export const PIT_LOSS_SC = 11.5;

export const MODE: Record<PaceMode, { pace: number; wear: number; label: string }> = {
  PUSH: { pace: -0.35, wear: 1.4, label: 'Push' },
  STD: { pace: 0, wear: 1, label: 'Standard' },
  SAVE: { pace: 0.45, wear: 0.68, label: 'Manage' },
};

/** Degradation in seconds at a given wear-equivalent age. */
export function degAt(c: Compound, effAge: number): number {
  const s = COMPOUNDS[c];
  const over = Math.max(0, effAge - s.life);
  return s.deg * effAge + 0.022 * over * over;
}

/** How fast wear-equivalent age accrues per lap. */
export function wearRate(trackTemp: number, mode: PaceMode, tyreCare: number, wetness: number, c: Compound): number {
  const temp = 1 + 0.018 * (trackTemp - 38);
  // Wet-weather tyres overheat and shred on a dry track.
  const mismatch = !isSlick(c) && wetness < 0.12 ? 2.6 : 1;
  return Math.max(0.5, temp) * MODE[mode].wear * tyreCare * mismatch;
}

/** Lap-time penalty for running compound `c` on a track with `wetness` (0 dry .. 1 flooded). */
export function wetPenalty(c: Compound, wetness: number): number {
  if (isSlick(c)) return wetness < 0.04 ? 0 : 95 * Math.pow(wetness - 0.04, 1.25);
  if (c === 'I') return 6 + 18 * Math.pow(Math.abs(wetness - 0.42), 1.5) + (wetness < 0.1 ? 2.2 : 0);
  return 10 + 11 * Math.pow(Math.abs(wetness - 0.88), 1.5) + (wetness < 0.3 ? 3 : 0);
}

export function bestCompoundFor(wetness: number): Compound {
  if (wetness < 0.17) return 'M';
  return wetness < WET_CROSSOVER ? 'I' : 'W';
}

/** Remaining useful life as a 0..1 fraction (1 = new). */
export function lifeLeft(c: Compound, effAge: number): number {
  return Math.max(0, Math.min(1, 1 - effAge / (COMPOUNDS[c].life * 1.18)));
}

/** Total time of a stint of `n` laps on compound `c`, starting from `startAge`, excluding fuel. */
export function stintCost(c: Compound, startAge: number, n: number, wear = 1): number {
  let t = COMPOUNDS[c].warmup;
  for (let k = 0; k < n; k++) t += COMPOUNDS[c].offset + degAt(c, startAge + k * wear);
  return t;
}

export function fmtLap(t: number | null | undefined): string {
  if (t == null || !isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function fmtGap(g: number): string {
  return g >= 0 ? `+${g.toFixed(1)}` : g.toFixed(1);
}
