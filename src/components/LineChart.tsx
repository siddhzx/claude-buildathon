import { useEffect, useMemo, useRef, useState } from 'react';

export interface Series {
  id: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
  kind?: 'line' | 'scatter' | 'both' | 'bars';
  dashed?: boolean;
  endLabel?: boolean;
}

interface Props {
  series: Series[];
  height?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  xTitle?: string;
  bands?: { x0: number; x1: number; color: string; label?: string }[];
  markers?: { x: number; label: string; color?: string }[];
  hlines?: { y: number; label: string; color?: string }[];
  legend?: boolean;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(200, e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function LineChart({ series, height = 190, xDomain, yDomain, xFmt = (v) => `${v}`, yFmt = (v) => `${v}`, xTitle, bands = [], markers = [], hlines = [], legend = true }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 44, r: 30, t: 10, b: xTitle ? 34 : 22 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;

  const { xd, yd } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y).concat(hlines.map((h) => h.y));
    const xd: [number, number] = xDomain ?? (xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 1]);
    let yd: [number, number] = yDomain ?? (ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 1]);
    if (!yDomain) { const pad = (yd[1] - yd[0]) * 0.1 || 0.5; yd = [yd[0] - pad, yd[1] + pad]; }
    if (xd[0] === xd[1]) xd[1] = xd[0] + 1;
    return { xd, yd };
  }, [series, xDomain, yDomain, hlines]);

  const sx = (x: number) => m.l + ((x - xd[0]) / (xd[1] - xd[0])) * iw;
  const sy = (y: number) => m.t + ih - ((y - yd[0]) / (yd[1] - yd[0])) * ih;
  const clampY = (y: number) => Math.max(m.t, Math.min(m.t + ih, sy(y)));
  const xt = niceTicks(xd[0], xd[1], Math.max(3, Math.floor(iw / 70)));
  const yt = niceTicks(yd[0], yd[1], 4);

  const hoverRows = hover == null ? [] : series.map((s) => {
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (const p of s.points) { const d = Math.abs(p.x - hover); if (d < bd) { bd = d; best = p; } }
    return best && bd <= (xd[1] - xd[0]) * 0.04 + 0.5 ? { s, p: best } : null;
  }).filter((r): r is { s: Series; p: { x: number; y: number } } => r != null);

  return (
    <div className="chart" ref={ref}>
      {legend && series.length > 1 && (
        <div className="legend" style={{ marginBottom: 4 }}>
          {series.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <svg height={height} viewBox={`0 0 ${width} ${height}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = xd[0] + ((e.clientX - r.left - m.l) / iw) * (xd[1] - xd[0]);
          setHover(x >= xd[0] && x <= xd[1] ? x : null);
        }}
        onMouseLeave={() => setHover(null)}>
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={sx(Math.max(xd[0], b.x0))} y={m.t} width={Math.max(0, sx(Math.min(xd[1], b.x1)) - sx(Math.max(xd[0], b.x0)))} height={ih} fill={b.color} opacity={0.13} />
            {b.label && <text x={sx(Math.max(xd[0], b.x0)) + 4} y={m.t + 11} fill="var(--text-3)" fontSize={9.5} fontFamily="var(--mono)">{b.label}</text>}
          </g>
        ))}
        <g className="grid">{yt.map((v) => <line key={v} x1={m.l} x2={m.l + iw} y1={sy(v)} y2={sy(v)} />)}</g>
        <g className="axis">
          {yt.map((v) => <text key={v} x={m.l - 6} y={sy(v) + 3} textAnchor="end">{yFmt(v)}</text>)}
          {xt.map((v) => <text key={v} x={sx(v)} y={m.t + ih + 14} textAnchor="middle">{xFmt(v)}</text>)}
          {xTitle && <text x={m.l + iw / 2} y={height - 3} textAnchor="middle">{xTitle}</text>}
          <line x1={m.l} x2={m.l + iw} y1={m.t + ih} y2={m.t + ih} stroke="#364150" />
        </g>
        {hlines.map((h, i) => (
          <g key={i}>
            <line x1={m.l} x2={m.l + iw} y1={sy(h.y)} y2={sy(h.y)} stroke={h.color ?? 'var(--text-3)'} strokeDasharray="4 4" />
            <text x={m.l + iw - 2} y={sy(h.y) - 4} textAnchor="end" fill="var(--text-3)" fontSize={9.5} fontFamily="var(--mono)">{h.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const kind = s.kind ?? 'line';
          const pts = s.points.filter((p) => p.x >= xd[0] - 1e-9 && p.x <= xd[1] + 1e-9);
          if (kind === 'bars') {
            const bw = Math.max(1, iw / Math.max(1, pts.length) - 2);
            return <g key={s.id}>{pts.map((p, i) => <rect key={i} x={sx(p.x) - bw / 2} y={clampY(p.y)} width={bw} height={Math.max(0, m.t + ih - clampY(p.y))} fill={s.color} opacity={0.85} rx={1.5} />)}</g>;
          }
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${clampY(p.y).toFixed(1)}`).join('');
          const lastPt = pts[pts.length - 1];
          return (
            <g key={s.id}>
              {kind !== 'scatter' && <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />}
              {kind !== 'line' && pts.map((p, i) => <circle key={i} cx={sx(p.x)} cy={clampY(p.y)} r={3.2} fill={s.color} stroke="var(--bg-2)" strokeWidth={1.5} />)}
              {s.endLabel && lastPt && <text x={sx(lastPt.x) + 5} y={clampY(lastPt.y) + 3} fill="var(--text-2)" fontSize={10} fontFamily="var(--mono)" fontWeight={600}>{s.label}</text>}
            </g>
          );
        })}
        {markers.map((mk, i) => mk.x >= xd[0] && mk.x <= xd[1] && (
          <g key={i}>
            <line x1={sx(mk.x)} x2={sx(mk.x)} y1={m.t} y2={m.t + ih} stroke={mk.color ?? 'var(--ours)'} strokeWidth={1} strokeDasharray="2 3" />
            <text x={sx(mk.x)} y={m.t + 9} textAnchor="middle" fill={mk.color ?? 'var(--ours)'} fontSize={9.5} fontFamily="var(--mono)" fontWeight={700}>{mk.label}</text>
          </g>
        ))}
        {hover != null && hoverRows.length > 0 && (
          <g>
            <line x1={sx(hoverRows[0].p.x)} x2={sx(hoverRows[0].p.x)} y1={m.t} y2={m.t + ih} stroke="#5a687a" />
            {hoverRows.map(({ s, p }) => <circle key={s.id} cx={sx(p.x)} cy={clampY(p.y)} r={4} fill={s.color} stroke="var(--bg-2)" strokeWidth={2} />)}
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" />
      </svg>
      {hover != null && hoverRows.length > 0 && (
        <div className="tip" style={{ left: Math.max(70, Math.min(width - 70, sx(hoverRows[0].p.x))), top: m.t + 18 + (legend && series.length > 1 ? 20 : 0) }}>
          <div className="muted">{xTitle ? `${xTitle} ` : ''}{xFmt(hoverRows[0].p.x)}</div>
          {hoverRows.map(({ s, p }) => <div className="r" key={s.id}><i style={{ background: s.color }} />{s.label}<b style={{ marginLeft: 'auto' }}>{yFmt(p.y)}</b></div>)}
        </div>
      )}
    </div>
  );
}
