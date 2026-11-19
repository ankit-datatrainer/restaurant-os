import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children, as: Tag = 'div', ...props }: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li' }) {
  return (
    <Tag className={cn('rounded-2xl border border-line/10 bg-surface shadow-soft', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-semibold leading-tight">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 py-5', className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line/15 px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sunk text-muted">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} role="status" aria-label="Loading" />
  );
}
