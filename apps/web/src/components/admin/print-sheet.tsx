'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer } from 'lucide-react';
import { tableUrl } from '@/lib/utils';
import { Button, EmptyState, LogoMark } from '@/components/ui';
import { useAdmin } from './admin-provider';

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  html, body { background: #fff !important; }
  .print-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 6mm !important; }
  .print-card { break-inside: avoid; page-break-inside: avoid; height: 88mm; box-shadow: none !important; border: 1px solid #ddd !important; }
}
`;

/** A4-friendly sheet of table QR stickers: two columns, three rows per page. */
export function PrintSheet() {
  const { restaurant, tables } = useAdmin();
  const params = useSearchParams();
  const only = params.get('table');

  const list = React.useMemo(() => {
    const active = tables.filter((t) => t.is_active || t.id === only);
    const chosen = only ? active.filter((t) => t.id === only) : active;
    return [...chosen].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [tables, only]);

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <Link href="/admin/tables" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Tables
          </Link>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Print QR sheet</h2>
          <p className="mt-1 text-sm text-muted">
            {list.length} sticker{list.length === 1 ? '' : 's'} · A4, six per page. Cut along the card edges.
          </p>
        </div>
        <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={list.length === 0}>
          Print
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Nothing to print" description="Activate at least one table first." className="print:hidden" />
      ) : (
        <div className="print-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {list.map((t) => (
            <article key={t.id} className="print-card flex flex-col items-center rounded-2xl border border-line/10 bg-white p-6 text-center text-ink shadow-soft">
              <div className="flex items-center gap-2">
                <LogoMark size={22} className="text-ink" />
                <span className="truncate font-display text-base font-semibold">{restaurant.name}</span>
              </div>
              <p className="mt-3 font-display text-2xl font-semibold leading-none">Scan to order</p>
              <p className="mt-1 text-xs text-ink/60">Point your phone camera at the code</p>
              <div className="mt-4 rounded-xl border border-ink/10 p-2">
                <QRCodeSVG value={tableUrl(t.code)} size={168} level="M" bgColor="#ffffff" fgColor="#0C0D10" />
              </div>
              <p className="mt-4 font-display text-xl font-semibold leading-tight">{t.label}</p>
              {t.area && <p className="text-sm text-ink/60">{t.area}</p>}
              <p className="tnum mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink/50">{t.code}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
