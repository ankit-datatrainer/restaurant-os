'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, HeartHandshake, Pencil, Star } from 'lucide-react';
import type { OrderFeedback, OrderWithItems, Restaurant } from '@restaurant-os/shared';
import { Button, Textarea } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EASE_OUT, springBouncy } from '@/lib/motion';
import { safeHttpUrl } from './features';

const LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as const;
const MAX_COMMENT = 1000;

const ratingLabel = (n: number) => LABELS[Math.min(5, Math.max(1, Math.round(n))) - 1];

/** Read-only row of stars. */
function Stars({ value, size = 'h-5 w-5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars, ${ratingLabel(value)}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= value ? 'fill-saffron text-saffron' : 'text-fg/20')} strokeWidth={1.75} aria-hidden />
      ))}
    </span>
  );
}

/**
 * "How was your meal?" after the order is served: 1–5 stars + optional comment, editable later.
 * The Google review link, when the restaurant has one, is shown after every rating alike
 * (Google's policy: no gating on happy guests, no incentives).
 */
export function FeedbackCard({
  order,
  restaurant,
  guestSessionId,
  onSaved,
  id,
}: {
  order: OrderWithItems;
  restaurant: Pick<Restaurant, 'name' | 'google_review_url'>;
  guestSessionId: string | null;
  onSaved: (order: OrderWithItems) => void;
  id?: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const existing = order.feedback ?? null;
  const [saved, setSaved] = React.useState<OrderFeedback | null>(existing);
  const [mode, setMode] = React.useState<'form' | 'thanks'>(existing ? 'thanks' : 'form');
  const [rating, setRating] = React.useState(existing?.rating ?? 0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState(existing?.comment ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const name = React.useId();
  const headingId = React.useId();

  // Feedback that shows up on a later refresh (another tab, say) while nothing was saved here yet.
  const existingKey = existing ? `${existing.rating}|${existing.created_at}` : '';
  React.useEffect(() => {
    if (!existing || saved) return;
    setSaved(existing);
    setRating(existing.rating);
    setComment(existing.comment ?? '');
    setMode('thanks');
  }, [existingKey]); // `existing` is a new object on every refresh; the key is what actually changes

  const reviewUrl = safeHttpUrl(restaurant.google_review_url);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (rating < 1) {
      setError('Pick a rating from 1 to 5 stars.');
      return;
    }
    if (!guestSessionId) {
      setError('Give it a second and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    const text = comment.trim();
    try {
      const updated = await publicApi.submitFeedback(order.id, {
        guest_session_id: guestSessionId,
        rating,
        comment: text || undefined,
      });
      onSaved(updated);
      setSaved(updated.feedback ?? { rating, comment: text || null, created_at: new Date().toISOString() });
      setMode('thanks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your feedback. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const edit = () => {
    if (saved) {
      setRating(saved.rating);
      setComment(saved.comment ?? '');
    }
    setError(null);
    setMode('form');
  };

  const shown = hover || rating;
  const swap = {
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -8 },
    transition: { duration: reduce ? 0 : 0.3, ease: EASE_OUT },
  } as const;

  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-24 rounded-3xl border border-line/10 bg-surface p-5 shadow-soft">
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'form' || !saved ? (
          <motion.form key="form" onSubmit={submit} noValidate {...swap}>
            <h2 id={headingId} className="font-display text-lg font-bold">
              How was your meal?
            </h2>
            <p className="mt-0.5 text-sm text-muted">Your rating goes straight to the {restaurant.name} team.</p>

            <fieldset className="mt-4">
              <legend className="sr-only">Your rating, from 1 (poor) to 5 (excellent)</legend>
              <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = shown >= n;
                  return (
                    <label
                      key={n}
                      className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl transition-colors hover:bg-saffron-soft/60"
                      onMouseEnter={() => setHover(n)}
                    >
                      <input
                        type="radio"
                        name={name}
                        value={n}
                        checked={rating === n}
                        onChange={() => {
                          setRating(n);
                          setError(null);
                        }}
                        className="peer sr-only"
                      />
                      <motion.span
                        key={rating === n ? 'picked' : 'idle'}
                        initial={reduce || rating !== n ? false : { scale: 0.55 }}
                        animate={{ scale: 1 }}
                        transition={springBouncy}
                        className="flex"
                        aria-hidden
                      >
                        <Star
                          className={cn('h-8 w-8 transition-colors duration-200', active ? 'fill-saffron text-saffron' : 'text-fg/25')}
                          strokeWidth={1.75}
                        />
                      </motion.span>
                      <span className="sr-only">
                        {n} {n === 1 ? 'star' : 'stars'}, {LABELS[n - 1]}
                      </span>
                      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-ember peer-focus-visible:ring-2" aria-hidden />
                    </label>
                  );
                })}
              </div>
              <p className={cn('mt-1 h-5 pl-1 text-sm font-semibold', shown ? 'text-fg' : 'text-muted')} aria-hidden>
                {shown ? LABELS[shown - 1] : 'Tap a star'}
              </p>
            </fieldset>

            <div className="mt-3">
              <Textarea
                label="Anything to add? (optional)"
                placeholder="What you loved, or what we could do better"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
                maxLength={MAX_COMMENT}
                rows={3}
                hint={`${comment.length}/${MAX_COMMENT}`}
              />
            </div>

            {error && (
              <p className="mt-3 text-sm text-rose" role="alert">
                {error}
              </p>
            )}

            <div className={cn('mt-4 grid gap-2', saved && 'grid-cols-[auto_1fr]')}>
              {saved && (
                <Button type="button" variant="ghost" size="lg" onClick={() => setMode('thanks')}>
                  Cancel
                </Button>
              )}
              <Button type="submit" size="lg" loading={saving} disabled={rating < 1}>
                {saved ? 'Save changes' : 'Send feedback'}
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.div key="thanks" {...swap}>
            <div className="flex items-start gap-3" role="status">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-soft text-[#1b6f49]">
                <HeartHandshake className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id={headingId} className="font-display text-lg font-bold leading-tight">
                  Thanks for telling us
                </h2>
                <p className="mt-0.5 text-sm text-muted">Your feedback is with the {restaurant.name} team.</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-sunk p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Stars value={saved.rating} />
                  <span className="text-sm font-semibold">{ratingLabel(saved.rating)}</span>
                </div>
                <button
                  type="button"
                  onClick={edit}
                  className="-mr-2 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ember transition hover:bg-ember-soft"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </button>
              </div>
              {saved.comment && <p className="mt-2 whitespace-pre-line break-words text-sm italic text-fg/75">“{saved.comment}”</p>}
            </div>

            {reviewUrl && (
              <div className="mt-4 border-t border-line/10 pt-4">
                <p className="text-sm text-fg/80">If you have a minute, you can also review {restaurant.name} on Google.</p>
                <Button
                  href={reviewUrl}
                  external
                  variant="outline"
                  size="lg"
                  className="mt-3 w-full"
                  rightIcon={<ExternalLink className="h-4 w-4 opacity-60" aria-hidden />}
                >
                  Review on Google
                  <span className="sr-only">(opens in a new tab)</span>
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
