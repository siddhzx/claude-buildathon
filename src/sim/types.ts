import type { Driver } from '../data/grid';

export type Compound = 'S' | 'M' | 'H' | 'I' | 'W';
export type PaceMode = 'PUSH' | 'STD' | 'SAVE';
export type Flag = 'GREEN' | 'YELLOW' | 'VSC' | 'SC' | 'CHEQUERED';
export type ScenarioId = 'rain-threat' | 'dry' | 'wet-start';

export interface TyreSet { id: string; compound: Compound; laps: number; inUse: boolean; spent: boolean }

export interface LapRecord {
  lap: number;
  time: number;
  compound: Compound;
  age: number;
  pos: number;
  pit: boolean;
  neutral: boolean;
  wetness: number;
}

export interface PitState { elapsed: number; total: number; stopAt: number; stopTime: number; next: Compound; swapped: boolean; fromProg: number; toProg: number }

export interface Car {
  code: string;
  driver: Driver;
  /** Laps completed as a float, measured in lap-time fraction (time domain). */
  prog: number;
  pos: number;
  status: 'RUN' | 'PIT' | 'OUT';
  compound: Compound;
  tyreAge: number;
  /** Wear-equivalent age: tyre age scaled by pace mode, temperature and driver. */
  effAge: number;
  warmup: number;
  compoundsUsed: Compound[];
  stops: { lap: number; to: Compound; stopTime: number; flag: Flag }[];
  plan: { lap: number; compound: Compound }[];
  pitCall: Compound | null;
  pit: PitState | null;
  mode: PaceMode;
  lapStart: number;
  lastLap: number | null;
  bestLap: number | null;
  laps: LapRecord[];
  lapNoise: number;
  curLapTime: number;
  gapLeader: number;
  interval: number;
  lapCount: number;
  lapHadPit: boolean;
  lapHadNeutral: boolean;
  weatherReact: number;
  outReason?: string;
  finished: boolean;
  finishTime?: number;
}

export interface Hazard {
  id: number;
  kind: 'DEBRIS' | 'STOPPED CAR' | 'STANDING WATER' | 'GRAVEL';
  dist: number;
  turn: string;
  sector: 1 | 2 | 3;
  since: number;
  clearsAt: number;
  note: string;
}

export interface RainCell { id: number; x: number; y: number; r: number; intensity: number; vx: number; vy: number; seed: number }

export interface Weather {
  cells: RainCell[];
  rain: number;
  wetness: number;
  airTemp: number;
  trackTemp: number;
  humidity: number;
  cloud: number;
  windSpeed: number;
  windGust: number;
  /** Direction the wind blows FROM, compass degrees. */
  windDir: number;
  steerDir: number;
  steerSpeed: number;
}

export interface ForecastPoint { min: number; lap: number; rain: number; prob: number }

export interface RaceEvent { t: number; lap: number; kind: 'FLAG' | 'PIT' | 'INCIDENT' | 'WEATHER' | 'RADIO' | 'INFO'; text: string; car?: string }

export interface Neutralisation { type: 'SC' | 'VSC'; endsAt: number; endingAnnounced: boolean; since: number }

export interface TelemetrySample { lap: number; trackTemp: number; airTemp: number; wind: number; rain: number; wetness: number }
