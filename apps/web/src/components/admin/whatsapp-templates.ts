import type { IntegrationSettings } from '@restaurant-os/shared';

export type JourneyKind = 'welcome' | 'winback' | 'reward' | 'offer';

export interface JourneyTemplate {
  kind: JourneyKind;
  label: string;
  field: 'wa_template_welcome' | 'wa_template_winback' | 'wa_template_reward' | 'wa_template_offer';
  /** When the journey sends. */
  when: string;
  /**
   * Body variables in the exact order the API fills them
   * (see the header of apps/api/src/services/whatsapp.ts).
   */
  variables: string[];
  /** A body the owner can paste into WhatsApp Manager (Meta does not allow a variable at the very start or end). */
  suggested: (restaurantName: string) => string;
  placeholder: string;
}

export const JOURNEYS: JourneyTemplate[] = [
  {
    kind: 'welcome',
    label: 'Welcome',
    field: 'wa_template_welcome',
    when: 'Sent once, after a guest ticks the WhatsApp box at checkout.',
    variables: ['Guest name', 'Restaurant name', 'Unsubscribe link'],
    suggested: () => "Hi {{1}}, thanks for visiting {{2}}! We'll send you the occasional offer. Stop anytime: {{3}} or reply STOP.",
    placeholder: 'welcome_guest',
  },
  {
    kind: 'winback',
    label: 'Win-back',
    field: 'wa_template_winback',
    when: 'Sent after N days without a visit, once per lapse.',
    variables: ['Guest name', 'Restaurant name', 'Unsubscribe link'],
    suggested: () => 'Hi {{1}}, we miss you at {{2}}! Your table is waiting whenever you are ready. Stop these messages: {{3}} or reply STOP.',
    placeholder: 'we_miss_you',
  },
  {
    kind: 'reward',
    label: 'Reward',
    field: 'wa_template_reward',
    when: 'Sent when a loyalty reward is unlocked.',
    variables: ['Guest name', 'Reward', 'Reward code', 'Unsubscribe link'],
    suggested: () => 'Hi {{1}}, you have unlocked a reward: {{2}}. Show code {{3}} at the counter on your next visit. Stop these messages: {{4}} or reply STOP.',
    placeholder: 'loyalty_reward',
  },
  {
    kind: 'offer',
    label: 'Offer',
    field: 'wa_template_offer',
    when: 'Sent when you broadcast an offer from Customers → Send an offer.',
    variables: ['Guest name', 'Offer text', 'Unsubscribe link'],
    suggested: (name) => `Hi {{1}}, a little something from ${name}: {{2}} Stop these messages: {{3}} or reply STOP.`,
    placeholder: 'weekly_offer',
  },
];

/** Ready to send automatically: switched on, phone number ID and token stored. */
export function whatsappReady(s: IntegrationSettings | null | undefined): boolean {
  return !!s && s.wa_enabled && !!s.wa_phone_number_id && s.wa_token_set;
}
