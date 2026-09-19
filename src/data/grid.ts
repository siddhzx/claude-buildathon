// 2026 entry list. Pace and risk numbers are simulation assumptions, not real-world ratings.
export interface Team { id: string; name: string; color: string }

export interface Driver {
  code: string;
  name: string;
  number: number;
  team: string;
  /** Race-pace deficit to the quickest car, s/lap (sim assumption). */
  pace: number;
  /** Incident propensity multiplier, 1.0 = field average (sim assumption). */
  risk: number;
  /** Tyre management: multiplier on degradation, lower is kinder. */
  tyreCare: number;
  grid: number;
}

export const TEAMS: Record<string, Team> = {
  RBR: { id: 'RBR', name: 'Red Bull Racing', color: '#4C6FE0' },
  MCL: { id: 'MCL', name: 'McLaren', color: '#F58A1F' },
  MER: { id: 'MER', name: 'Mercedes', color: '#2FD6BF' },
  FER: { id: 'FER', name: 'Ferrari', color: '#E8443E' },
  WIL: { id: 'WIL', name: 'Williams', color: '#55A8F2' },
  RB: { id: 'RB', name: 'Racing Bulls', color: '#8FA3FF' },
  AMR: { id: 'AMR', name: 'Aston Martin', color: '#2D9C78' },
  HAA: { id: 'HAA', name: 'Haas', color: '#C9CED6' },
  AUD: { id: 'AUD', name: 'Audi', color: '#D8584B' },
  ALP: { id: 'ALP', name: 'Alpine', color: '#F07AC0' },
  CAD: { id: 'CAD', name: 'Cadillac', color: '#B59A55' },
};

export const OUR_DRIVER = 'VER';

export const DRIVERS: Driver[] = [
  { code: 'NOR', name: 'Lando Norris', number: 1, team: 'MCL', pace: 0.0, risk: 0.9, tyreCare: 0.97, grid: 1 },
  { code: 'RUS', name: 'George Russell', number: 63, team: 'MER', pace: 0.04, risk: 0.9, tyreCare: 1.0, grid: 2 },
  { code: 'VER', name: 'Max Verstappen', number: 3, team: 'RBR', pace: 0.06, risk: 1.0, tyreCare: 0.96, grid: 3 },
  { code: 'PIA', name: 'Oscar Piastri', number: 81, team: 'MCL', pace: 0.03, risk: 0.85, tyreCare: 0.98, grid: 4 },
  { code: 'LEC', name: 'Charles Leclerc', number: 16, team: 'FER', pace: 0.12, risk: 1.0, tyreCare: 0.98, grid: 5 },
  { code: 'ANT', name: 'Kimi Antonelli', number: 12, team: 'MER', pace: 0.16, risk: 1.25, tyreCare: 1.04, grid: 6 },
  { code: 'HAM', name: 'Lewis Hamilton', number: 44, team: 'FER', pace: 0.2, risk: 0.85, tyreCare: 0.95, grid: 7 },
  { code: 'HAD', name: 'Isack Hadjar', number: 6, team: 'RBR', pace: 0.32, risk: 1.2, tyreCare: 1.03, grid: 8 },
  { code: 'SAI', name: 'Carlos Sainz', number: 55, team: 'WIL', pace: 0.55, risk: 1.0, tyreCare: 0.98, grid: 9 },
  { code: 'ALB', name: 'Alex Albon', number: 23, team: 'WIL', pace: 0.58, risk: 0.95, tyreCare: 0.97, grid: 10 },
  { code: 'ALO', name: 'Fernando Alonso', number: 14, team: 'AMR', pace: 0.7, risk: 0.9, tyreCare: 0.95, grid: 11 },
  { code: 'LAW', name: 'Liam Lawson', number: 30, team: 'RB', pace: 0.74, risk: 1.3, tyreCare: 1.03, grid: 12 },
  { code: 'BEA', name: 'Oliver Bearman', number: 87, team: 'HAA', pace: 0.78, risk: 1.3, tyreCare: 1.02, grid: 13 },
  { code: 'HUL', name: 'Nico Hülkenberg', number: 27, team: 'AUD', pace: 0.82, risk: 0.9, tyreCare: 0.99, grid: 14 },
  { code: 'GAS', name: 'Pierre Gasly', number: 10, team: 'ALP', pace: 0.88, risk: 1.0, tyreCare: 1.0, grid: 15 },
  { code: 'OCO', name: 'Esteban Ocon', number: 31, team: 'HAA', pace: 0.86, risk: 1.15, tyreCare: 1.0, grid: 16 },
  { code: 'LIN', name: 'Arvid Lindblad', number: 41, team: 'RB', pace: 0.9, risk: 1.35, tyreCare: 1.05, grid: 17 },
  { code: 'BOR', name: 'Gabriel Bortoleto', number: 5, team: 'AUD', pace: 0.92, risk: 1.15, tyreCare: 1.02, grid: 18 },
  { code: 'STR', name: 'Lance Stroll', number: 18, team: 'AMR', pace: 0.98, risk: 1.3, tyreCare: 1.02, grid: 19 },
  { code: 'COL', name: 'Franco Colapinto', number: 43, team: 'ALP', pace: 1.05, risk: 1.4, tyreCare: 1.04, grid: 20 },
  { code: 'PER', name: 'Sergio Pérez', number: 11, team: 'CAD', pace: 1.2, risk: 1.1, tyreCare: 0.98, grid: 21 },
  { code: 'BOT', name: 'Valtteri Bottas', number: 77, team: 'CAD', pace: 1.25, risk: 0.9, tyreCare: 0.99, grid: 22 },
];
