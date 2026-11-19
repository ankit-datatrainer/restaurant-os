import { PLAN_INFO, planHas, type PlanFeature, type PlanId } from '@restaurant-os/shared';
import { forbidden } from '../lib/errors.js';

const FEATURE_NAME: Record<PlanFeature, string> = {
  crm: 'Customer CRM',
  marketing: 'WhatsApp marketing',
  feedback: 'Feedback collection',
  games: 'Table games',
  story: 'Story videos',
  all_calls: 'All guest request types',
  customer_analytics: 'Customer analytics',
  advanced_analytics: 'Advanced analytics',
  loyalty: 'Loyalty rewards',
  whatsapp_automation: 'Automated WhatsApp messages',
  pos_integration: 'POS / webhook integration',
  reservations: 'Table reservations & waitlist',
  online_takeaway: 'Online takeaway ordering',
  promotions: 'Coupons, happy hours & gift cards',
  finance: 'Expenses & profit and loss',
  inventory: 'Inventory & purchasing',
};

/** Throws 403 unless the staff member is an owner or manager. */
export function requireManager(role: string, action = 'do this'): void {
  if (role !== 'owner' && role !== 'manager') throw forbidden(`Only owners and managers can ${action}.`);
}

/** Lowest plan that includes the feature. */
function planFor(feature: PlanFeature): PlanId {
  return planHas('growth', feature) ? 'growth' : 'premium';
}

/** Throws 403 with an upgrade message when the restaurant's plan does not include the feature. */
export function requireFeature(plan: PlanId | null | undefined, feature: PlanFeature): void {
  if (planHas(plan, feature)) return;
  throw forbidden(`${FEATURE_NAME[feature]} is part of the ${PLAN_INFO[planFor(feature)].name} plan. You are on ${PLAN_INFO[plan ?? 'starter'].name}.`);
}
