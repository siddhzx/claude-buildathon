// Circuit of the Americas centreline. Coordinates (lon, lat) from the MIT-licensed
// bacinger/f1-circuits dataset (us-2012.geojson). North is up, direction of travel
// follows the array order (anticlockwise), index 0 sits on the pit straight.
const RAW: [number, number][] = [
  [-97.639651, 30.13176], [-97.637935, 30.130577], [-97.637461, 30.13029], [-97.637094, 30.130101], [-97.636958, 30.130045],
  [-97.636905, 30.130031], [-97.636846, 30.13004], [-97.636793, 30.130068], [-97.636757, 30.130115], [-97.636739, 30.130158],
  [-97.636745, 30.13021], [-97.637118, 30.131138], [-97.637284, 30.131567], [-97.637313, 30.131699], [-97.637319, 30.131812],
  [-97.637313, 30.131944], [-97.637284, 30.132067], [-97.637231, 30.132222], [-97.637148, 30.132354], [-97.637059, 30.132472],
  [-97.636935, 30.132595], [-97.636799, 30.13268], [-97.636615, 30.132779], [-97.635615, 30.133316], [-97.635206, 30.133538],
  [-97.635118, 30.133613], [-97.635041, 30.133703], [-97.634976, 30.133778], [-97.634922, 30.133882], [-97.634881, 30.133971],
  [-97.634774, 30.13423], [-97.634703, 30.134315], [-97.634614, 30.134414], [-97.634496, 30.13448], [-97.634401, 30.134523],
  [-97.634165, 30.134603], [-97.633981, 30.134683], [-97.633875, 30.134754], [-97.633809, 30.134824], [-97.63375, 30.134919],
  [-97.633727, 30.135032], [-97.633691, 30.135225], [-97.633673, 30.135348], [-97.633638, 30.135484], [-97.63359, 30.135583],
  [-97.633531, 30.135678], [-97.633454, 30.135772], [-97.633371, 30.135857], [-97.633247, 30.135951], [-97.633105, 30.136041],
  [-97.632951, 30.136116], [-97.632786, 30.136177], [-97.632643, 30.136206], [-97.632525, 30.13621], [-97.63243, 30.136206],
  [-97.632276, 30.136168], [-97.631294, 30.135777], [-97.631199, 30.135744], [-97.631099, 30.135744], [-97.631022, 30.135772],
  [-97.630826, 30.135876], [-97.630596, 30.136036], [-97.63043, 30.136182], [-97.630264, 30.136375], [-97.63014, 30.136502],
  [-97.630027, 30.136578], [-97.629903, 30.136625], [-97.629808, 30.136644], [-97.629672, 30.136644], [-97.629518, 30.136606],
  [-97.6294, 30.13655], [-97.629305, 30.136469], [-97.629252, 30.136413], [-97.629199, 30.136342], [-97.629151, 30.136262],
  [-97.62908, 30.136196], [-97.628997, 30.136168], [-97.628915, 30.136168], [-97.627145, 30.136507], [-97.627032, 30.13654],
  [-97.626961, 30.136573], [-97.626908, 30.136616], [-97.625872, 30.137704], [-97.624961, 30.138657], [-97.624612, 30.139043],
  [-97.624469, 30.139269], [-97.624458, 30.139326], [-97.624475, 30.139378], [-97.624517, 30.139406], [-97.62457, 30.139439],
  [-97.624629, 30.139453], [-97.624694, 30.139449], [-97.624783, 30.13943], [-97.626677, 30.138906], [-97.627997, 30.138586],
  [-97.629453, 30.13828], [-97.631193, 30.137978], [-97.632282, 30.137822], [-97.633289, 30.137695], [-97.636254, 30.137412],
  [-97.636585, 30.13736], [-97.636627, 30.137337], [-97.636645, 30.13729], [-97.636639, 30.137252], [-97.636597, 30.1372],
  [-97.636402, 30.137012], [-97.635727, 30.13621], [-97.635431, 30.135795], [-97.635413, 30.135734], [-97.635431, 30.135645],
  [-97.635473, 30.135583], [-97.63555, 30.135536], [-97.635615, 30.135522], [-97.635739, 30.135508], [-97.636289, 30.135546],
  [-97.636343, 30.135569], [-97.63639, 30.135607], [-97.636437, 30.135654], [-97.636479, 30.13572], [-97.636591, 30.135984],
  [-97.636639, 30.136088], [-97.636716, 30.136182], [-97.637077, 30.136502], [-97.63713, 30.13654], [-97.637195, 30.136564],
  [-97.63726, 30.136573], [-97.637615, 30.136601], [-97.637686, 30.136597], [-97.637728, 30.136573], [-97.637769, 30.136531],
  [-97.637787, 30.136474], [-97.637763, 30.136408], [-97.637077, 30.135385], [-97.636799, 30.134933], [-97.636775, 30.13481],
  [-97.636781, 30.134688], [-97.636804, 30.134589], [-97.636834, 30.13449], [-97.636911, 30.134306], [-97.637018, 30.134103],
  [-97.637089, 30.134023], [-97.637207, 30.133948], [-97.637343, 30.133891], [-97.637905, 30.13367], [-97.638018, 30.133646],
  [-97.63813, 30.133641], [-97.638337, 30.133655], [-97.638533, 30.133679], [-97.638722, 30.133731], [-97.638929, 30.133802],
  [-97.639113, 30.133896], [-97.639237, 30.133976], [-97.63932, 30.134098], [-97.639965, 30.134881], [-97.640468, 30.135428],
  [-97.640533, 30.135484], [-97.64061, 30.135513], [-97.640711, 30.135531], [-97.6408, 30.135527], [-97.640924, 30.135498],
  [-97.641072, 30.135456], [-97.641196, 30.135414], [-97.643274, 30.134626], [-97.643392, 30.134556], [-97.643439, 30.13449],
  [-97.643463, 30.134419], [-97.643439, 30.134367], [-97.643392, 30.13432], [-97.643333, 30.134273], [-97.642244, 30.133514],
];

export const TRACK_LENGTH_M = 5513;
export const RACE_LAPS = 56;
export const COTA_LATLON = { lat: 30.1346, lon: -97.6358 };

export interface Pt { x: number; y: number }

// Turn apexes (lon, lat), matched to the nearest centreline sample below.
const TURN_COORDS: [string, number, number][] = [
  ['T1', -97.636846, 30.13004], ['T2', -97.637319, 30.131812], ['T3', -97.635118, 30.133613], ['T5', -97.634614, 30.134414],
  ['T6', -97.633809, 30.134824], ['T8', -97.632525, 30.13621], ['T9', -97.631099, 30.135744], ['T10', -97.629672, 30.136644],
  ['T11', -97.624475, 30.139378], ['T12', -97.636627, 30.137337], ['T13', -97.635413, 30.135734], ['T14', -97.636343, 30.135569],
  ['T15', -97.637728, 30.136573], ['T16', -97.636775, 30.13481], ['T18', -97.63813, 30.133641], ['T19', -97.64061, 30.135513],
  ['T20', -97.643463, 30.134419],
];

const VIEW_W = 1000;
const VIEW_H = 590;
const PAD = 46;

function project(): { pts: Pt[]; toXY: (lon: number, lat: number) => Pt; mPerUnit: number } {
  const lat0 = COTA_LATLON.lat * (Math.PI / 180);
  const mx = (lon: number) => lon * 111320 * Math.cos(lat0);
  const my = (lat: number) => lat * 110574;
  const xs = RAW.map((p) => mx(p[0]));
  const ys = RAW.map((p) => my(p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((VIEW_W - PAD * 2) / (maxX - minX), (VIEW_H - PAD * 2) / (maxY - minY));
  const offX = (VIEW_W - (maxX - minX) * scale) / 2;
  const offY = (VIEW_H - (maxY - minY) * scale) / 2;
  const toXY = (lon: number, lat: number): Pt => ({
    x: offX + (mx(lon) - minX) * scale,
    y: VIEW_H - offY - (my(lat) - minY) * scale,
  });
  return { pts: RAW.map((p) => toXY(p[0], p[1])), toXY, mPerUnit: 1 / scale };
}

/** Hermite resample of a closed polyline; tangents are scaled to each segment so
 *  short corner segments next to long straights do not overshoot. */
function smoothClosed(p: Pt[], density: number): Pt[] {
  const out: Pt[] = [];
  const n = p.length;
  const dir = (a: Pt, b: Pt) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.round(segLen / density));
    const d1 = dir(p0, p2), d2 = dir(p1, p3);
    const m1x = d1.x * segLen, m1y = d1.y * segLen, m2x = d2.x * segLen, m2y = d2.y * segLen;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t, t3 = t2 * t;
      const h1 = 2 * t3 - 3 * t2 + 1, h2 = t3 - 2 * t2 + t, h3 = -2 * t3 + 3 * t2, h4 = t3 - t2;
      out.push({ x: h1 * p1.x + h2 * m1x + h3 * p2.x + h4 * m2x, y: h1 * p1.y + h2 * m1y + h3 * p2.y + h4 * m2y });
    }
  }
  return out;
}

const proj = project();
export const TRACK_VIEW = { w: VIEW_W, h: VIEW_H };
export const TRACK_PTS: Pt[] = smoothClosed(proj.pts, 2.5);
const N = TRACK_PTS.length;

// Cumulative distance fraction for each sample.
const cum: number[] = [0];
for (let i = 1; i <= N; i++) {
  const a = TRACK_PTS[i - 1], b = TRACK_PTS[i % N];
  cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
}
const TOTAL = cum[N];
export const DIST_FRAC: number[] = cum.map((c) => c / TOTAL);

// Speed profile from local curvature, then the time->distance map. The sim runs in the
// time domain (progress = fraction of lap time), so cars visibly brake for corners.
const speed: number[] = [];
for (let i = 0; i < N; i++) {
  const a = TRACK_PTS[(i - 6 + N) % N], b = TRACK_PTS[i], c = TRACK_PTS[(i + 6) % N];
  const ang = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
  const turn = Math.min(ang, Math.PI * 2 - ang);
  const arc = Math.hypot(c.x - b.x, c.y - b.y) + Math.hypot(b.x - a.x, b.y - a.y);
  const kappa = turn / Math.max(arc, 1e-6);
  // v = sqrt(a_lat / kappa), normalised to top speed (1 view unit is about 2 m).
  speed.push(Math.max(0.24, Math.min(1, 0.0976 / Math.sqrt(kappa + 1e-4))));
}
// Braking/acceleration smoothing: look ahead more than behind.
const smoothSpeed = speed.map((_, i) => {
  let s = 0, w = 0;
  for (let k = -10; k <= 22; k++) {
    const wt = k < 0 ? 0.5 : 1;
    s += Math.min(speed[i], speed[(i + k + N) % N]) * wt;
    w += wt;
  }
  return s / w;
});
const tCum: number[] = [0];
for (let i = 1; i <= N; i++) tCum.push(tCum[i - 1] + (cum[i] - cum[i - 1]) / smoothSpeed[(i - 1) % N]);
const T_TOTAL = tCum[N];
const TIME_FRAC = tCum.map((t) => t / T_TOTAL);

/** Relative speed (0..1) at a time-fraction of the lap. */
export function speedAt(timeFrac: number): number {
  return smoothSpeed[indexAtTime(timeFrac)];
}

function indexAtTime(timeFrac: number): number {
  const f = ((timeFrac % 1) + 1) % 1;
  let lo = 0, hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TIME_FRAC[mid] <= f) lo = mid; else hi = mid;
  }
  return lo;
}

function lerpPoint(i: number, t: number): Pt & { angle: number } {
  const a = TRACK_PTS[i % N], b = TRACK_PTS[(i + 1) % N];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Map position for a time-domain lap fraction. */
export function pointAtTime(timeFrac: number): Pt & { angle: number } {
  const f = ((timeFrac % 1) + 1) % 1;
  const i = indexAtTime(f);
  const span = TIME_FRAC[i + 1] - TIME_FRAC[i];
  return lerpPoint(i, span > 0 ? (f - TIME_FRAC[i]) / span : 0);
}

/** Map position for a distance fraction of the lap. */
export function pointAtDist(distFrac: number): Pt & { angle: number } {
  const f = ((distFrac % 1) + 1) % 1;
  let lo = 0, hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (DIST_FRAC[mid] <= f) lo = mid; else hi = mid;
  }
  const span = DIST_FRAC[lo + 1] - DIST_FRAC[lo];
  return lerpPoint(lo, span > 0 ? (f - DIST_FRAC[lo]) / span : 0);
}

export function timeToDist(timeFrac: number): number {
  const f = ((timeFrac % 1) + 1) % 1;
  const i = indexAtTime(f);
  const span = TIME_FRAC[i + 1] - TIME_FRAC[i];
  const t = span > 0 ? (f - TIME_FRAC[i]) / span : 0;
  return DIST_FRAC[i] + (DIST_FRAC[i + 1] - DIST_FRAC[i]) * t;
}

export function distToTime(distFrac: number): number {
  const f = ((distFrac % 1) + 1) % 1;
  let lo = 0, hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (DIST_FRAC[mid] <= f) lo = mid; else hi = mid;
  }
  const span = DIST_FRAC[lo + 1] - DIST_FRAC[lo];
  const t = span > 0 ? (f - DIST_FRAC[lo]) / span : 0;
  return TIME_FRAC[lo] + (TIME_FRAC[lo + 1] - TIME_FRAC[lo]) * t;
}

export function pathFromPts(pts: Pt[], close = true): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + (close ? 'Z' : '');
}

export const TRACK_PATH = pathFromPts(TRACK_PTS);

export interface Turn { name: string; dist: number; time: number; x: number; y: number; lx: number; ly: number }

export const TURNS: Turn[] = TURN_COORDS.map(([name, lon, lat]) => {
  const target = proj.toXY(lon, lat);
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(TRACK_PTS[i].x - target.x, TRACK_PTS[i].y - target.y);
    if (d < bd) { bd = d; best = i; }
  }
  const p = TRACK_PTS[best];
  // Push the label outward from the local centre of curvature.
  const a = TRACK_PTS[(best - 8 + N) % N], c = TRACK_PTS[(best + 8) % N];
  const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
  let ox = p.x - mx, oy = p.y - my;
  const len = Math.hypot(ox, oy) || 1;
  ox /= len; oy /= len;
  return { name, dist: DIST_FRAC[best], time: TIME_FRAC[best], x: p.x, y: p.y, lx: p.x + ox * 20, ly: p.y + oy * 20 };
});

export function nearestTurn(distFrac: number): Turn {
  let best = TURNS[0], bd = Infinity;
  for (const t of TURNS) {
    const d = Math.min(Math.abs(t.dist - distFrac), 1 - Math.abs(t.dist - distFrac));
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// Sector boundaries as distance fractions (S1 ends after the esses, S2 ends at T12 exit).
const t9 = TURNS.find((t) => t.name === 'T9')!;
const t12 = TURNS.find((t) => t.name === 'T12')!;
export const SECTOR_ENDS = [t9.dist + 0.012, t12.dist + 0.012, 1];

export function sectorOf(distFrac: number): 1 | 2 | 3 {
  return distFrac < SECTOR_ENDS[0] ? 1 : distFrac < SECTOR_ENDS[1] ? 2 : 3;
}

export function sectorPath(sector: 1 | 2 | 3): string {
  const start = sector === 1 ? 0 : SECTOR_ENDS[sector - 2];
  const end = SECTOR_ENDS[sector - 1];
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) if (DIST_FRAC[i] >= start && DIST_FRAC[i] <= end) pts.push(TRACK_PTS[i % N]);
  return pathFromPts(pts, false);
}

// Pit lane: offset to the infield side of the pit straight, from after T20 to before T1.
export const PIT_ENTRY_DIST = 0.948;
export const PIT_EXIT_DIST = 0.052;
export const PIT_ENTRY_TIME = distToTime(PIT_ENTRY_DIST);
export const PIT_EXIT_TIME = distToTime(PIT_EXIT_DIST);

function buildPitLane(): Pt[] {
  const pts: Pt[] = [];
  const span = 1 - PIT_ENTRY_DIST + PIT_EXIT_DIST;
  const steps = 40;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const p = pointAtDist(PIT_ENTRY_DIST + span * u);
    const ramp = Math.min(1, u / 0.18, (1 - u) / 0.18);
    const off = 15 * Math.sin((ramp * Math.PI) / 2);
    // Travel heads south-east here; the infield (left of travel) is screen-up-right.
    pts.push({ x: p.x + Math.sin(p.angle) * off, y: p.y - Math.cos(p.angle) * off });
  }
  return pts;
}
export const PIT_PTS = buildPitLane();
export const PIT_PATH = pathFromPts(PIT_PTS, false);

export function pitPoint(u: number): Pt {
  const f = Math.max(0, Math.min(1, u)) * (PIT_PTS.length - 1);
  const i = Math.min(PIT_PTS.length - 2, Math.floor(f));
  const t = f - i;
  return { x: PIT_PTS[i].x + (PIT_PTS[i + 1].x - PIT_PTS[i].x) * t, y: PIT_PTS[i].y + (PIT_PTS[i + 1].y - PIT_PTS[i].y) * t };
}

/** Compass bearing (deg, 0 = north) of travel at a distance fraction. */
export function bearingAt(distFrac: number): number {
  const a = pointAtDist(distFrac).angle; // screen angle, y down
  return ((Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI + 360) % 360;
}

export const METRES_PER_UNIT = proj.mPerUnit;
