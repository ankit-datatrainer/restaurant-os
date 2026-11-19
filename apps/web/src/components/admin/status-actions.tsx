'use client';

import * as React from 'react';
import { Check, ChefHat, CircleCheck, HandPlatter, IndianRupee, Undo2, X } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { nextOrderStatus } from '@restaurant-os/shared';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Primary button label for each step along ORDER_FLOW. */
export const ADVANCE_LABEL: Record<OrderStatus, string | null> = {
  placed: 'Accept',
  accepted: 'Start preparing',
  preparing: 'Mark ready',
  ready: 'Mark served',
  served: null,
  cancelled: null,
};

const ADVANCE_ICON: Record<OrderStatus, React.ReactNode> = {
  placed: <Check className="h-4 w-4" />,
  accepted: <ChefHat className="h-4 w-4" />,
  preparing: <CircleCheck className="h-4 w-4" />,
  ready: <HandPlatter className="h-4 w-4" />,
  served: null,
  cancelled: null,
};

const ADVANCE_VARIANT: Record<OrderStatus, 'primary' | 'secondary' | 'success' | 'dark'> = {
  placed: 'primary',
  accepted: 'dark',
  preparing: 'success',
  ready: 'secondary',
  served: 'secondary',
  cancelled: 'secondary',
};

export function StatusActions({
  order,
  busy,
  onAdvance,
  onCancel,
  onTogglePaid,
  size = 'md',
  className,
}: {
  order: OrderWithItems;
  busy?: boolean;
  onAdvance: (order: OrderWithItems, next: OrderStatus) => void;
  onCancel?: (order: OrderWithItems) => void;
  onTogglePaid?: (order: OrderWithItems) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const next = nextOrderStatus(order.status);
  // Takeaway orders are picked up, not served.
  const label = order.status === 'ready' && (order.order_type === 'takeaway' || !order.table_id) ? 'Mark picked up' : ADVANCE_LABEL[order.status];
  const canCancel = order.status !== 'served' && order.status !== 'cancelled';
  const paid = order.payment_status === 'paid';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {next && label && (
        <Button
          size={size}
          variant={ADVANCE_VARIANT[order.status]}
          loading={busy}
          leftIcon={ADVANCE_ICON[order.status]}
          onClick={() => onAdvance(order, next)}
          className="min-w-[132px]"
        >
          {label}
        </Button>
      )}
      {onTogglePaid && order.status !== 'cancelled' && (
        <Button
          size={size}
          variant="outline"
          disabled={busy}
          leftIcon={paid ? <Undo2 className="h-4 w-4" /> : <IndianRupee className="h-4 w-4" />}
          onClick={() => onTogglePaid(order)}
          title={paid ? 'Mark as unpaid' : 'Mark as paid'}
        >
          {paid ? 'Unmark paid' : 'Mark paid'}
        </Button>
      )}
      {onCancel && canCancel && (
        <Button size={size} variant="ghost" disabled={busy} leftIcon={<X className="h-4 w-4" />} onClick={() => onCancel(order)} className="text-rose hover:bg-rose-soft">
          Cancel
        </Button>
      )}
    </div>
  );
}
