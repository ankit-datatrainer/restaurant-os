'use client';

import * as React from 'react';
import { BellRing, Check, Clock, Droplets, Receipt, Utensils, HelpCircle } from 'lucide-react';
import type { AssistanceCall, CallType } from '@restaurant-os/shared';
import { CALL_TYPE_LABEL, minutesSince, tableDisplay } from '@restaurant-os/shared';
import { cn, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui';
import { formatElapsed } from './format';

const ICON: Record<CallType, React.ReactNode> = {
  waiter: <BellRing className="h-5 w-5" />,
  water: <Droplets className="h-5 w-5" />,
  cutlery: <Utensils className="h-5 w-5" />,
  bill: <Receipt className="h-5 w-5" />,
  other: <HelpCircle className="h-5 w-5" />,
};

export function CallCard({ call, now, busy, onAttend, className }: { call: AssistanceCall; now: number; busy?: boolean; onAttend: (call: AssistanceCall) => void; className?: string }) {
  const mins = minutesSince(call.created_at, now);
  const urgent = mins >= 3;
  return (
    <article className={cn('flex flex-col rounded-2xl border bg-surface p-4 shadow-soft', urgent ? 'border-rose/40' : 'border-saffron/40', className)} aria-label={`${tableDisplay(call.table)} ${CALL_TYPE_LABEL[call.type]}`}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', urgent ? 'bg-rose-soft text-rose' : 'bg-saffron-soft text-[#8a5a00]')} aria-hidden>
          {ICON[call.type]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold leading-tight">{tableDisplay(call.table)}</p>
          <p className="mt-0.5 text-sm font-medium text-fg/80">{CALL_TYPE_LABEL[call.type]}</p>
          {call.note && <p className="mt-1 text-sm text-muted">“{call.note}”</p>}
        </div>
        <span className={cn('tnum inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-semibold', urgent ? 'bg-rose text-white' : 'bg-sunk text-fg/80')} title={`Called at ${formatTime(call.created_at)}`}>
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {formatElapsed(mins)}
        </span>
      </div>
      <Button size="lg" variant="success" loading={busy} leftIcon={<Check className="h-4 w-4" />} onClick={() => onAttend(call)} className="mt-4 w-full">
        Attended
      </Button>
    </article>
  );
}
