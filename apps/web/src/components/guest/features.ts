import type { OrderWithItems, Restaurant } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';

/**
 * Which optional guest features this restaurant has: the plan decides what is available,
 * the restaurant's own switches decide what is on. One place so every screen agrees.
 */
type R = Pick<
  Restaurant,
  'plan' | 'games_enabled' | 'feedback_enabled' | 'marketing_consent_enabled' | 'story_title' | 'story_text' | 'story_video_url'
>;

export const gamesOn = (r: R | null | undefined) => Boolean(r && r.games_enabled && planHas(r.plan, 'games'));
export const feedbackOn = (r: R | null | undefined) => Boolean(r && r.feedback_enabled && planHas(r.plan, 'feedback'));
/** Optional mobile number at checkout. */
export const phoneOn = (r: R | null | undefined) => Boolean(r && planHas(r.plan, 'crm'));
/** The separate WhatsApp offers checkbox (only ever shown next to a valid phone number). */
export const marketingOn = (r: R | null | undefined) => Boolean(r && r.marketing_consent_enabled && planHas(r.plan, 'marketing'));
export const allCallsOn = (r: R | null | undefined) => Boolean(r && planHas(r.plan, 'all_calls'));
/** Loyalty card (Premium). Whether the restaurant switched its program on is only known from GET /api/public/loyalty. */
export const loyaltyOn = (r: R | null | undefined) => Boolean(r && planHas(r.plan, 'loyalty'));

const filled = (s: string | null | undefined) => Boolean(s && s.trim());
export const storyOn = (r: R | null | undefined) =>
  Boolean(r && planHas(r.plan, 'story') && (filled(r.story_title) || filled(r.story_text) || filled(r.story_video_url)));

/** Statuses in which the kitchen still takes extra dishes for the same order. */
const ADDABLE = new Set<OrderWithItems['status']>(['placed', 'accepted', 'preparing']);
export const canAddToOrder = (o: Pick<OrderWithItems, 'status' | 'payment_status'>) => ADDABLE.has(o.status) && o.payment_status === 'pending';

/** Only http(s) links are ever rendered as external links. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
