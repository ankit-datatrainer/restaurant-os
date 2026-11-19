'use client';

import { cn } from '@/lib/utils';
import { CrmList } from '../micro/crm-list';
import { FeedbackStars } from '../micro/feedback-stars';

/** The owner's side: the customer list with segments, and the feedback strip with the Google link. */
export function CustomersBoard({ className }: { className?: string }) {
  return (
    <div className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className="rounded-[28px] border border-paper/10 bg-ink-2 p-5 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Customers</p>
            <p className="mt-1 font-display text-lg font-bold leading-tight">Who came back</p>
          </div>
          <span className="rounded-full bg-paper/10 px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-muted">Illustrative</span>
        </div>
        <CrmList />
      </div>
      <div className="ml-auto w-[88%] rounded-[24px] border border-paper/10 bg-ink-2 p-5 shadow-lift">
        <p className="eyebrow mb-3">Feedback</p>
        <FeedbackStars />
      </div>
    </div>
  );
}
