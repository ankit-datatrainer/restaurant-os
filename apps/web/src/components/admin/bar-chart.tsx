'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatINR } from '@/lib/utils';
import { hourLabel } from './format';

export interface HourPoint {
  hour: number;
  orders: number;
  revenue: number;
}

/**
 * Hourly orders for today, drawn to scale with plain SVG. The current hour is highlighted;
 * hovering any bar reveals its count and revenue.
 */
export function BarChart({ data, currentHour, className }: { data: HourPoint[]; currentHour: number; className?: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = React.useState<number | null>(null);

  const points = React.useMemo(() => {
    const byHour = new Map(data.map((d) => [d.hour, d]));
    return Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? { hour: h, orders: 0, revenue: 0 });
  }, [data]);

  const W = 720;
  const H = 220;
  const padL = 28;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...points.map((p) => p.orders));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 2) * 2;
  const slot = innerW / 24;
  const barW = Math.max(6, slot * 0.6);
  const ticks = [0, niceMax / 2, niceMax];
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;

  const active = hover ?? currentHour;
  const activePoint = points[active] ?? points[0]!;

  return (
    <div className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{hourLabel(activePoint.hour)}</span>
          {' · '}
          <span className="tnum font-mono">{activePoint.orders}</span> order{activePoint.orders === 1 ? '' : 's'}
          {' · '}
          <span className="tnum font-mono">{formatINR(activePoint.revenue)}</span>
        </p>
        <p className="hidden font-mono text-2xs uppercase tracking-[0.14em] text-muted sm:block">Today, by hour</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Orders per hour today">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.25 : 0.08} strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity={0.55} className="font-mono tnum">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = (p.orders / niceMax) * innerH;
          const isNow = p.hour === currentHour;
          const isHover = hover === p.hour;
          return (
            <g key={p.hour} onMouseEnter={() => setHover(p.hour)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
              <motion.rect
                x={x}
                width={barW}
                rx={3}
                initial={reduce ? false : { y: y(0), height: 0 }}
                animate={{ y: y(p.orders), height: Math.max(h, p.orders > 0 ? 2 : 0) }}
                transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.015, ease: [0.16, 1, 0.3, 1] }}
                fill={isNow ? '#FF5C2A' : isHover ? '#0C0D10' : 'currentColor'}
                fillOpacity={isNow || isHover ? 1 : 0.22}
              />
              {p.orders === 0 && <rect x={x} y={y(0) - 2} width={barW} height={2} rx={1} fill="currentColor" fillOpacity={isNow ? 0.6 : 0.1} />}
              {(i % 3 === 0 || i === 23) && (
                <text x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity={isNow ? 1 : 0.55} fontWeight={isNow ? 600 : 400} className="font-mono">
                  {hourLabel(p.hour)}
                </text>
              )}
              <title>{`${hourLabel(p.hour)}: ${p.orders} order${p.orders === 1 ? '' : 's'}, ${formatINR(p.revenue)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
