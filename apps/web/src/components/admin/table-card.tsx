'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, ExternalLink, Pencil, Printer, RefreshCw, Trash2, Users } from 'lucide-react';
import type { DiningTable } from '@restaurant-os/shared';
import { cn, tableUrl } from '@/lib/utils';
import { Toggle } from '@/components/ui';

/** Serialise the rendered QR <svg> to a standalone file and trigger a download. */
export function downloadQrSvg(container: HTMLElement | null, filename: string) {
  const svg = container?.querySelector('svg');
  if (!svg) return false;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function TableCard({
  table,
  busy,
  onToggleActive,
  onReset,
  onEdit,
  onDelete,
}: {
  table: DiningTable;
  busy?: boolean;
  onToggleActive: (table: DiningTable, active: boolean) => void;
  onReset: (table: DiningTable) => void;
  onEdit: (table: DiningTable) => void;
  onDelete: (table: DiningTable) => void;
}) {
  const qrRef = React.useRef<HTMLDivElement>(null);
  const url = tableUrl(table.code);
  const safeName = `${table.label}-${table.code}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

  return (
    <article className={cn('flex flex-col rounded-2xl border border-line/10 bg-surface p-4 shadow-soft transition', !table.is_active && 'opacity-70', busy && 'pointer-events-none opacity-60')} aria-label={table.label}>
      <div className="flex items-start gap-4">
        <div ref={qrRef} className="shrink-0 rounded-xl border border-line/10 bg-white p-2" aria-label={`QR code for ${table.label}`}>
          <QRCodeSVG value={url} size={96} level="M" bgColor="#ffffff" fgColor="#0C0D10" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold leading-tight">{table.label}</p>
              <p className="truncate text-sm text-muted">{table.area ?? 'No area set'}</p>
            </div>
            <Toggle size="sm" checked={table.is_active} onChange={(v) => onToggleActive(table, v)} id={`active-${table.id}`} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-muted">Code</dt>
            <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-muted">Seats</dt>
            <dd className="tnum font-mono font-semibold">{table.code}</dd>
            <dd className="tnum inline-flex items-center gap-1 font-mono">
              <Users className="h-3.5 w-3.5 text-muted" aria-hidden /> {table.seats}
            </dd>
          </dl>
          <p className={cn('mt-2 font-mono text-2xs uppercase tracking-[0.12em]', table.is_active ? 'text-[#1b6f49]' : 'text-muted')}>{table.is_active ? 'Active · QR works' : 'Inactive · QR shows closed'}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5 border-t border-line/5 pt-3">
        <ActionBtn href={url} external icon={<ExternalLink className="h-4 w-4" />} label="Open menu" />
        <ActionBtn onClick={() => downloadQrSvg(qrRef.current, `${safeName}.svg`)} icon={<Download className="h-4 w-4" />} label="Download SVG" />
        <ActionBtn href={`/admin/tables/print?table=${table.id}`} external icon={<Printer className="h-4 w-4" />} label="Print" />
        <ActionBtn onClick={() => onReset(table)} icon={<RefreshCw className="h-4 w-4" />} label="Reset code" />
        <ActionBtn onClick={() => onEdit(table)} icon={<Pencil className="h-4 w-4" />} label="Edit" />
        <ActionBtn onClick={() => onDelete(table)} icon={<Trash2 className="h-4 w-4" />} label="Delete" danger />
      </div>
    </article>
  );
}

function ActionBtn({ icon, label, onClick, href, external, danger }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; external?: boolean; danger?: boolean }) {
  const cls = cn(
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition',
    danger ? 'text-rose hover:bg-rose-soft' : 'text-fg/80 hover:bg-sunk hover:text-fg',
  );
  if (href) {
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className={cls}>
        {icon}
        <span className="truncate">{label}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
