'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { site } from './site';

/** Real, scannable QR for the demo table. */
export function QRCard({ className, size = 96, caption }: { className?: string; size?: number; caption?: string }) {
  const pretty = site.demoTableUrl.replace(/^https?:\/\//, '');
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-3xl border border-paper/10 bg-ink-2/90 p-4 text-paper shadow-lift backdrop-blur-md',
        className,
      )}
    >
      <div className="shrink-0 rounded-2xl bg-white p-2">
        <QRCodeSVG value={site.demoTableUrl} size={size} bgColor="#ffffff" fgColor="#0C0D10" level="M" title="QR code for the demo table" />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.18em] text-ember">
          <Smartphone className="h-3 w-3" aria-hidden /> Live demo table
        </p>
        <p className="mt-1.5 text-sm font-medium leading-snug">{caption ?? 'Scan with your phone to open the demo table.'}</p>
        <p className="mt-1.5 truncate font-mono text-[11px] text-muted" title={site.demoTableUrl}>
          {pretty}
        </p>
      </div>
    </div>
  );
}
