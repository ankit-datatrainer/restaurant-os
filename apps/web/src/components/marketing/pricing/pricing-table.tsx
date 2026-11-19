'use client';

import { Check, Minus } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { RollingOutTag } from '../plan-card';
import { COMPARISON, PLANS, type CellValue } from '../plans';
import { SectionHeading } from '../section-heading';

function Cell({ value, highlight }: { value: CellValue; highlight?: boolean }) {
  if (value === true)
    return (
      <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full', highlight ? 'bg-ember text-white' : 'bg-mint/20 text-mint')}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-label="Included" />
      </span>
    );
  if (value === false)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper/5 text-muted">
        <Minus className="h-3.5 w-3.5" aria-label="Not included" />
      </span>
    );
  if (typeof value === 'object') return <RollingOutTag />;
  return <span className="text-sm text-fg/90">{value}</span>;
}

export function PricingTable() {
  return (
    <section className="border-t border-paper/10 py-20 md:py-28">
      <div className="container-x">
        <SectionHeading
          index="03"
          eyebrow="Every feature"
          title="What each plan includes."
          lede="Starter runs the whole service: QR ordering, the counter POS, billing with split payments and GST receipts, cash close and your team. Growth adds the customer side and ways to fill tables: profiles, consent-based offers, feedback, reservations, online takeaway, promotions and P&L. Premium adds inventory and purchasing, advanced reports, loyalty rewards, automated WhatsApp messages, POS / webhook integration and priority support."
        />
        <Reveal className="no-scrollbar mt-12 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="align-bottom">
                <th scope="col" className="w-[40%] py-4 pr-4 font-mono text-2xs font-medium uppercase tracking-[0.16em] text-muted">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th key={p.id} scope="col" className={cn('py-4 pr-4 font-medium', p.highlight && 'bg-ember/[0.04]')}>
                    <span className={cn('block font-mono text-2xs uppercase tracking-[0.16em]', p.highlight ? 'text-ember' : 'text-muted')}>{p.name}</span>
                    <span className="tnum mt-1 block font-display text-lg font-semibold text-fg">
                      {formatINR(p.monthly)}
                      <span className="font-sans text-xs font-normal text-muted"> / mo</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {COMPARISON.map((group) => (
              <tbody key={group.title}>
                <tr>
                  <th scope="colgroup" colSpan={PLANS.length + 1} className="border-t border-paper/10 pb-3 pt-8 text-left font-display text-lg font-semibold">
                    {group.title}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.label} className="border-t border-paper/[0.06]">
                    <th scope="row" className="py-3.5 pr-4 text-sm font-medium text-fg/85">
                      {row.label}
                    </th>
                    {PLANS.map((p) => (
                      <td key={p.id} className={cn('py-3.5 pr-4 align-middle', p.highlight && 'bg-ember/[0.04]')}>
                        <Cell value={row.cells[p.id]} highlight={p.highlight} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Reveal>
        <p className="mt-6 font-mono text-xs leading-relaxed text-muted">
          Monthly prices per outlet, excl. GST. The Hindi menu is in every plan. Automated WhatsApp messages need your own Meta Business account and Meta-approved templates; Meta bills its conversation fees to you directly. Native POS connectors need the POS vendor’s partner API and are scoped separately. Restaurant OS is cloud-based and needs an internet connection; printing works through the browser, and direct printer drivers and cash drawers are not built.
        </p>
      </div>
    </section>
  );
}
