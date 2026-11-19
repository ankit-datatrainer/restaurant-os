'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type PanMood = 'idle' | 'waiting' | 'go' | 'early' | 'result';

const INNER: Record<PanMood, string> = {
  idle: '#E5DED1', // paper-3
  waiting: '#2A2E36', // ink-4
  go: '#FF5C2A', // ember
  early: '#E5484D', // rose
  result: '#2FB87A', // mint
};

/**
 * A skillet drawn in SVG. When `mood` is "go" the surface turns ember and
 * sizzles (steam wisps + sparks); otherwise it sits calmly on the hob.
 */
export function Pan({ mood, className }: { mood: PanMood; className?: string }) {
  const reduce = useReducedMotion();
  const sizzling = mood === 'go' && !reduce;
  const inner = INNER[mood];

  return (
    <svg viewBox="0 0 260 180" className={className} aria-hidden>
      {/* Handle */}
      <rect x="168" y="86" width="84" height="18" rx="9" fill="#1F2228" />
      <rect x="236" y="90" width="12" height="10" rx="4" fill="#F2B33D" />
      {/* Pan body */}
      <ellipse cx="100" cy="104" rx="84" ry="40" fill="#0C0D10" />
      <ellipse cx="100" cy="98" rx="84" ry="40" fill="#1F2228" />
      {/* Cooking surface: colour switches instantly on "go" so the reaction clock is fair. */}
      <motion.ellipse
        cx="100"
        cy="98"
        rx="68"
        ry="29"
        initial={false}
        animate={{ fill: inner }}
        transition={{ duration: mood === 'go' ? 0 : 0.3 }}
      />
      {/* Oil sheen */}
      <ellipse cx="78" cy="90" rx="28" ry="9" fill="#FFFFFF" opacity={mood === 'waiting' ? 0.06 : 0.18} />

      {/* Sparks that pop out of the oil while it sizzles */}
      {sizzling &&
        [0, 1, 2, 3, 4, 5].map((i) => {
          const x = 52 + i * 19;
          return (
            <motion.circle
              key={`spark-${i}`}
              cx={x}
              cy={96}
              r={2.6}
              fill="#F2B33D"
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], y: [0, -26 - (i % 3) * 8, -40], scale: [0.6, 1.1, 0.4] }}
              transition={{ duration: 0.75, repeat: Infinity, delay: i * 0.11, ease: 'easeOut' }}
            />
          );
        })}

      {/* Steam wisps */}
      {sizzling &&
        [0, 1, 2].map((i) => {
          const x = 70 + i * 28;
          return (
            <motion.path
              key={`steam-${i}`}
              d={`M${x} 70 c -6 -8 6 -14 0 -22 c -6 -8 6 -14 0 -22`}
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: [0, 0.75, 0], y: [8, -14, -30] }}
              transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.3, ease: 'easeOut' }}
            />
          );
        })}

      {/* Flame under the pan on "go" */}
      {sizzling &&
        [0, 1, 2, 3, 4].map((i) => {
          const x = 56 + i * 22;
          return (
            <motion.path
              key={`flame-${i}`}
              d={`M${x} 150 c -8 -10 -2 -18 4 -24 c 4 8 10 12 6 22 c -2 4 -8 6 -10 2 z`}
              fill={i % 2 === 0 ? '#FF5C2A' : '#F2B33D'}
              initial={{ scaleY: 0.8, opacity: 0.7 }}
              animate={{ scaleY: [0.8, 1.15, 0.9], opacity: [0.7, 1, 0.7] }}
              style={{ originX: `${x}px`, originY: '150px' }}
              transition={{ duration: 0.5 + i * 0.07, repeat: Infinity, ease: 'easeInOut' }}
            />
          );
        })}

      {/* Hob ring */}
      <ellipse cx="100" cy="152" rx="76" ry="10" fill="#0C0D10" opacity="0.18" />
    </svg>
  );
}
