import type { ReactNode } from 'react';
import { COMPOUNDS } from '../sim/tyres';
import type { Compound } from '../sim/types';

export function Panel({ title, tag, children, className = '', bodyClass = '', style }: { title: string; tag?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; style?: React.CSSProperties }) {
  return (
    <section className={`panel corner ${className}`} style={style}>
      <header>{title}{tag != null && <span className="tag">{tag}</span>}</header>
      <div className={`pbody ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function TyreRing({ c, large }: { c: Compound; large?: boolean }) {
  return <span className={`tyre-ring ${large ? 'lg' : ''}`} style={{ borderColor: COMPOUNDS[c].color }} title={COMPOUNDS[c].name}>{c}</span>;
}

export function Kpi({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'up' | 'ok' }) {
  return (
    <div className="kpi">
      <label>{label}</label>
      <b className={tone}>{value}{unit && <small>{unit}</small>}</b>
      {sub != null && <span>{sub}</span>}
    </div>
  );
}

export function Meter({ value, color, height = 5 }: { value: number; color?: string; height?: number }) {
  return <div className="meter" style={{ height }}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} /></div>;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const riskColor = (p: number) => (p > 0.5 ? 'var(--crit)' : p > 0.25 ? 'var(--serious)' : p > 0.12 ? 'var(--warn)' : 'var(--good)');
