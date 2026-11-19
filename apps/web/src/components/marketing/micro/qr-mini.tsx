'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useOnScreen } from '../hooks';
import { site } from '../site';

/** Small table-QR sticker with a scanning line. The code is real and opens the demo table. */
export function QRMini() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="flex h-full items-center gap-5">
      <div className="relative shrink-0 rounded-2xl bg-white p-2.5 shadow-lift">
        <QRCodeSVG value={site.demoTableUrl} size={92} bgColor="#ffffff" fgColor="#0C0D10" level="M" title="Demo table QR" />
        <motion.span
          aria-hidden
          className="absolute left-2 right-2 top-2 h-[2px] rounded-full bg-ember shadow-[0_0_14px_2px_rgba(255,92,42,0.7)]"
          animate={reduce || !inView ? undefined : { y: [0, 96, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="mt-1.5 block text-center font-mono text-[9px] uppercase tracking-[0.16em] text-ink">Table {site.demoTableCode}</span>
      </div>
      <ul className="space-y-2 text-sm text-muted">
        <li className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" /> One sticker per table
        </li>
        <li className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" /> Print from the dashboard
        </li>
        <li className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" /> Reset a code any time
        </li>
      </ul>
    </div>
  );
}
