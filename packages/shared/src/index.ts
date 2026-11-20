/**
 * @restaurant-os/shared
 * Types, constants and small pure helpers shared by the Next.js app and the Express API.
 * Consumed as TypeScript source (Next.js transpiles it, the API runs through tsx).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = ['placed', 'accepted', 'preparing', 'ready', 'served', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The forward path an order normally takes. `cancelled` is a side exit. */
export const ORDER_FLOW: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'served'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

/** What the guest sees while waiting. */
export const ORDER_STATUS_GUEST_COPY: Record<OrderStatus, string> = {
  placed: 'Sent to the kitchen',
  accepted: 'The kitchen has your order',
  preparing: 'Being cooked right now',
  ready: 'Ready — coming to your table',
  served: 'Served. Enjoy your meal',
  cancelled: 'This order was cancelled',
};

export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(status);
  if (i === -1 || i === ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[i + 1];
}

export const PAYMENT_METHODS = ['upi', 'counter'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  counter: 'Pay at counter',
};

export const PAYMENT_STATUSES = ['pending', 'claimed', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Unpaid',
  claimed: 'Guest says paid',
  paid: 'Paid',
  refunded: 'Refunded',
};

export const CALL_TYPES = ['waiter', 'water', 'cutlery', 'bill', 'other'] as const;
export type CallType = (typeof CALL_TYPES)[number];
export const CALL_TYPE_LABEL: Record<CallType, string> = {
  waiter: 'Call waiter',
  water: 'Water refill',
  cutlery: 'Cutlery / napkins',
  bill: 'Bring the bill',
  other: 'Something else',
};

export const CALL_STATUSES = ['open', 'attended'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const ITEM_BADGES = ['bestseller', 'chef_special', 'new', 'spicy'] as const;
export type ItemBadge = (typeof ITEM_BADGES)[number];
export const ITEM_BADGE_LABEL: Record<ItemBadge, string> = {
  bestseller: 'Bestseller',
  chef_special: "Chef's special",
  new: 'New',
  spicy: 'Spicy',
};

export const STAFF_ROLES = ['owner', 'manager', 'kitchen', 'waiter'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// ---------------------------------------------------------------------------
// Plans (migration 0003). The plan is set by Restaurant OS, never by restaurant staff.
// ---------------------------------------------------------------------------

export const PLAN_IDS = ['starter', 'growth', 'premium'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Product features that depend on the plan. Everything not listed here (incl. the Hindi menu) is in every plan. */
export const PLAN_FEATURES = [
  'crm',
  'marketing',
  'feedback',
  'games',
  'story',
  'all_calls',
  'customer_analytics',
  // Premium (migration 0005)
  'advanced_analytics',
  'loyalty',
  'whatsapp_automation',
  'pos_integration',
  // Operations (migration 0006)
  'reservations',
  'online_takeaway',
  'promotions',
  'finance',
  'inventory',
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

const GROWTH_FEATURES: readonly PlanFeature[] = [
  'crm',
  'marketing',
  'feedback',
  'games',
  'story',
  'all_calls',
  'customer_analytics',
  'reservations',
  'online_takeaway',
  'promotions',
  'finance',
];

const FEATURES_BY_PLAN: Record<PlanId, readonly PlanFeature[]> = {
  starter: [],
  growth: GROWTH_FEATURES,
  premium: PLAN_FEATURES,
};

export function planHas(plan: PlanId | null | undefined, feature: PlanFeature): boolean {
  return FEATURES_BY_PLAN[plan ?? 'starter'].includes(feature);
}

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** Rupees per month per outlet, excluding GST. */
  monthly: number;
  /** One-time onboarding fee in rupees, excluding GST. */
  setup: number;
  /** Rupees per year paid upfront, when offered. */
  yearly: number | null;
  tagline: string;
  idealFor: string;
}

/** Introductory prices from the pricing strategy. Every amount excludes GST and third-party charges. */
export const PLAN_INFO: Record<PlanId, PlanInfo> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthly: 1999,
    setup: 4999,
    yearly: null,
    tagline: 'QR menu, table ordering, counter POS, floor view, split bills and GST receipts, cash/UPI, daily cash close, staff attendance, order dashboard with audible alerts.',
    idealFor: 'Smaller restaurants testing digital ordering.',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthly: 3999,
    setup: 9999,
    yearly: 39990,
    tagline: 'Everything in Starter, plus customer CRM, feedback, Google review link, reservations and waitlist, online takeaway, coupons, happy hours, gift cards, expenses and profit & loss.',
    idealFor: 'Family restaurants and busy casual-dining outlets.',
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    monthly: 6999,
    setup: 14999,
    yearly: null,
    tagline: 'Everything in Growth, plus inventory and purchasing, advanced analytics, loyalty rewards, automated WhatsApp messages, POS/webhook integration and priority support.',
    idealFor: 'Larger restaurants and growing chains.',
  },
};

/** Founding restaurant partner offer: Growth at a locked rate for the first 10 outlets. */
export const FOUNDING_OFFER = {
  plan: 'growth' as PlanId,
  monthly: 2999,
  setup: 4999,
  pilotDays: 14,
  outlets: 10,
  lockMonths: 12,
};

/** Starter includes the two most common requests; Growth and Premium include all of them. */
export const STARTER_CALL_TYPES = ['waiter', 'bill'] as const;

// ---------------------------------------------------------------------------
// Database row shapes (mirror supabase/migrations/0001_init.sql)
// ---------------------------------------------------------------------------

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  cover_url: string | null;
  address: string | null;
  phone: string | null;
  upi_id: string | null;
  upi_payee_name: string | null;
  currency: string; // 'INR'
  tax_rate: number; // percent, e.g. 5 → CGST 2.5 + SGST 2.5
  service_charge_rate: number; // percent
  gstin: string | null;
  is_open: boolean;
  accepts_upi: boolean;
  accepts_counter: boolean;
  /** Commercial plan, read-only for staff (see PLAN_INFO / planHas). */
  plan: PlanId;
  /** The restaurant's Google review link, shown to every guest after feedback (never only to happy ones). */
  google_review_url: string | null;
  /** "Our story" card shown to guests while they wait (Growth+). */
  story_title: string | null;
  story_text: string | null;
  /** YouTube link or a direct .mp4 URL. */
  story_video_url: string | null;
  games_enabled: boolean;
  feedback_enabled: boolean;
  /** Ask guests (optionally) for WhatsApp offers consent at checkout. */
  marketing_consent_enabled: boolean;
  /** Online click & collect from /r/[slug] (Growth+). */
  takeaway_enabled: boolean;
  /** Minutes the kitchen needs for a takeaway order; earliest pickup = now + this. */
  takeaway_prep_minutes: number;
  /** Online table booking requests from /r/[slug] (Growth+). */
  reservations_enabled: boolean;
  /** Default length of a booking in minutes. */
  reservation_minutes: number;
  /** Opening hours (IST, "HH:MM:SS"), used for pickup and booking times. May cross midnight. */
  open_time: string;
  close_time: string;
  /** SaaS profile (migration 0007). */
  city: string | null;
  cuisine: string | null;
  /** 14-digit FSSAI licence / registration number, printed on every bill (mandatory in India since Oct 2021). */
  fssai_number: string | null;
  /** Shown in the public directory at /restaurants. */
  listed: boolean;
  /** Set by the platform owner. A suspended restaurant takes no new orders. */
  status: RestaurantStatus;
  /** End of the free trial; null when not on a trial. */
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export const RESTAURANT_STATUSES = ['active', 'suspended'] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

/** Days left in the free trial (0 when it has ended), or null when the restaurant is not on a trial. */
export function trialDaysLeft(r: Pick<Restaurant, 'trial_ends_at'>, now: number = Date.now()): number | null {
  if (!r.trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(r.trial_ends_at).getTime() - now) / 86_400_000));
}

export interface DiningTable {
  id: string;
  restaurant_id: string;
  code: string; // short, URL-safe, unique per deployment. e.g. "A1K7"
  label: string; // "Table 1"
  area: string | null; // "Indoor Window"
  seats: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  /** Hindi name / description (fall back to English when null). */
  name_hi: string | null;
  description_hi: string | null;
  sort_order: number;
  is_active: boolean;
  /** Optional serving window (IST "HH:MM:SS"); null = all day. May cross midnight. */
  available_from: string | null;
  available_until: string | null;
  /** ISO weekdays 1 (Mon) … 7 (Sun); null or empty = every day. */
  available_days: number[] | null;
}

export interface OptionChoice {
  id: string; // stable slug within the group, e.g. "half"
  label: string; // "Half"
  price_delta: number; // in rupees, can be 0 or negative
}

export interface OptionGroup {
  id: string; // stable slug, e.g. "portion"
  name: string; // "Portion"
  required: boolean;
  multi: boolean; // true → checkboxes, false → radios
  choices: OptionChoice[];
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  /** Hindi name / description (fall back to English when null). */
  name_hi: string | null;
  description_hi: string | null;
  price: number; // rupees
  image_url: string | null;
  is_veg: boolean;
  badges: ItemBadge[];
  option_groups: OptionGroup[];
  is_available: boolean;
  sort_order: number;
  prep_minutes: number | null;
  /** HSN / SAC code printed on GST invoices. */
  hsn_code: string | null;
  created_at: string;
}

export interface SelectedOption {
  group_id: string;
  group_name: string;
  choice_id: string;
  choice_label: string;
  price_delta: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string; // snapshot
  unit_price: number; // snapshot incl. option deltas
  quantity: number;
  is_veg: boolean;
  options: SelectedOption[];
  note: string | null;
  line_total: number;
  /** 0-based position in the guest's cart, so every screen lists the dishes in the same order. */
  position: number;
  /** 1 = original order; 2+ = dishes the guest added later (highlight these for the kitchen). */
  round: number;
}

export interface OrderFeedback {
  rating: number;
  comment: string | null;
  created_at: string;
}

export const ORDER_TYPES = ['dine_in', 'takeaway'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export const ORDER_TYPE_LABEL: Record<OrderType, string> = { dine_in: 'Dine-in', takeaway: 'Takeaway' };

export const ORDER_SOURCES = ['qr', 'pos', 'online'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];
export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = { qr: 'Table QR', pos: 'Counter', online: 'Online' };

export interface Order {
  id: string;
  restaurant_id: string;
  /** Null for takeaway orders. */
  table_id: string | null;
  order_number: number; // per-restaurant running number → "#ORD-1003"
  guest_session_id: string;
  guest_name: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  note: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  total: number;
  placed_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
  paid_at: string | null;
  /** Customer profile, when the guest left a phone number (Growth+). */
  customer_id: string | null;
  /** Client-generated idempotency key: the same checkout submitted twice returns the same order. */
  client_ref: string | null;
  /** Last time the guest added dishes to this order. */
  items_added_at: string | null;
  order_type: OrderType;
  source: OrderSource;
  /** Takeaway pickup time. */
  pickup_at: string | null;
  /** Happy hour + coupon + bill discount, before service charge and GST. */
  discount_amount: number;
  discount_reason: string | null;
  coupon_code: string | null;
  /** Set once the order is settled on a bill. */
  bill_id: string | null;
  /** Staff member who took the order at the counter. */
  placed_by: string | null;
  stock_deducted: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  table?: Pick<DiningTable, 'id' | 'code' | 'label' | 'area'> | null;
  /** Present on guest RPC responses (order_json); admin list endpoints may omit it. */
  feedback?: OrderFeedback | null;
}

export interface AssistanceCall {
  id: string;
  restaurant_id: string;
  table_id: string;
  guest_session_id: string | null;
  type: CallType;
  note: string | null;
  status: CallStatus;
  created_at: string;
  attended_at: string | null;
  table?: Pick<DiningTable, 'id' | 'code' | 'label' | 'area'> | null;
}

export interface Staff {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: StaffRole;
  display_name: string;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  restaurant_name: string | null;
  message: string | null;
  city?: string | null;
  table_count?: number | null;
  /** 'demo' | 'founding_partner' | a PlanId */
  plan_interest?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Customer retention (CRM, consent, feedback)
// ---------------------------------------------------------------------------

/** One row of GET /api/admin/customers. */
export interface CustomerSummary {
  id: string;
  phone: string; // +91XXXXXXXXXX
  name: string | null;
  marketing_consent: boolean;
  consent_at: string | null;
  consent_revoked_at: string | null;
  unsubscribe_token: string;
  first_seen_at: string;
  last_seen_at: string;
  orders_count: number;
  /** Distinct table visits (guest sessions) with at least one non-cancelled order. */
  visits: number;
  total_spent: number;
  last_order_at: string | null;
  avg_rating: number | null;
}

export const CUSTOMER_SEGMENTS = ['all', 'repeat', 'new', 'lapsed', 'opted_in'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];
export const CUSTOMER_SEGMENT_LABEL: Record<CustomerSegment, string> = {
  all: 'All customers',
  repeat: 'Repeat (2+ visits)',
  new: 'New this week',
  lapsed: 'Not seen in 30 days',
  opted_in: 'WhatsApp opted in',
};

export interface CustomersResponse {
  customers: CustomerSummary[];
  summary: {
    total: number;
    opted_in: number;
    repeat: number;
    /** Share of customers with 2+ visits, 0..100 (one decimal). */
    repeat_rate: number;
    new_this_week: number;
    lapsed: number;
  };
}

export interface ConsentEvent {
  id: string;
  action: 'granted' | 'revoked';
  source: 'qr_checkout' | 'unsubscribe_link' | 'staff';
  consent_text: string | null;
  created_at: string;
}

/** GET /api/admin/customers/:id */
export interface CustomerDetail {
  customer: CustomerSummary;
  orders: OrderWithItems[];
  consent_events: ConsentEvent[];
  /** Loyalty rewards (Premium; empty otherwise). */
  rewards: LoyaltyReward[];
}

// ---------------------------------------------------------------------------
// Loyalty (Premium, migration 0005)
// ---------------------------------------------------------------------------

export interface LoyaltyProgram {
  restaurant_id: string;
  enabled: boolean;
  /** A reward is earned on every Nth visit (a visit = one table session with a served order). */
  visits_required: number;
  reward_text: string;
  reward_expiry_days: number;
  updated_at: string;
}

export interface LoyaltyReward {
  id: string;
  restaurant_id: string;
  customer_id: string;
  code: string;
  reward_text: string;
  visits_at_earn: number;
  earned_order_id: string | null;
  earned_at: string;
  expires_at: string;
  redeemed_at: string | null;
  /** Joined for lists */
  customer?: { name: string | null; phone: string } | null;
}

/** GET /api/public/loyalty?table=&session= — the guest's own card. */
export interface LoyaltyStatus {
  enabled: boolean;
  /** false until the guest has ordered with a phone number at this restaurant */
  linked: boolean;
  visits?: number;
  visits_required?: number | null;
  reward_text?: string | null;
  next_reward_in?: number;
  rewards?: Array<{ code: string; reward_text: string; expires_at: string }>;
}

// ---------------------------------------------------------------------------
// Integrations (Premium): order webhooks for POS / middleware, WhatsApp Cloud API
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = ['order.placed', 'order.items_added', 'order.status_changed', 'order.cancelled', 'order.payment_changed', 'ping'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** GET /api/admin/integrations — secrets are never returned, only hints. */
export interface IntegrationSettings {
  webhook_enabled: boolean;
  webhook_url: string | null;
  /** Full signing secret: shown so the owner can paste it into the POS/middleware. Owners/managers only. */
  webhook_secret: string;
  wa_enabled: boolean;
  wa_phone_number_id: string | null;
  /** True when an access token is stored (the token itself is never sent back). */
  wa_token_set: boolean;
  /** Last 4 characters of the stored token, for recognition. */
  wa_token_hint: string | null;
  wa_language: string;
  wa_template_welcome: string | null;
  wa_template_winback: string | null;
  wa_template_reward: string | null;
  wa_template_offer: string | null;
  winback_days: number;
  updated_at: string | null;
}

/** PUT /api/admin/integrations — omit a field to keep it; wa_access_token "" clears it. */
export type IntegrationSettingsInput = Partial<
  Omit<IntegrationSettings, 'webhook_secret' | 'wa_token_set' | 'wa_token_hint' | 'updated_at'> & { wa_access_token: string }
>;

export interface IntegrationEventRow {
  id: number;
  event: string;
  order_id: string | null;
  created_at: string;
  delivered_at: string | null;
  attempts: number;
  next_attempt_at: string;
  last_status: number | null;
  last_error: string | null;
}

export const WHATSAPP_KINDS = ['welcome', 'winback', 'reward', 'offer', 'test'] as const;
export type WhatsAppKind = (typeof WHATSAPP_KINDS)[number];

export interface WhatsAppMessageRow {
  id: string;
  customer_id: string | null;
  phone: string;
  kind: WhatsAppKind;
  template: string;
  status: 'sent' | 'failed';
  wamid: string | null;
  error: string | null;
  created_at: string;
}

/** POST /api/admin/automation/run — delivers pending webhooks and sends due WhatsApp journeys. */
export interface AutomationRunResult {
  ran_at: string;
  webhooks: { delivered: number; failed: number; pending: number; skipped_reason: string | null };
  whatsapp: { sent: number; failed: number; due: number; skipped_reason: string | null };
}

// ---------------------------------------------------------------------------
// Advanced analytics (Premium)
// ---------------------------------------------------------------------------

/** GET /api/admin/analytics?from=&to= */
export interface AnalyticsReport {
  range: { from: string; to: string };
  totals: { revenue: number; orders: number; cancelled: number; avg_order_value: number; items_sold: number; tax: number; visits: number };
  previous: { revenue: number; orders: number; avg_order_value: number };
  daily: Array<{ date: string; revenue: number; orders: number }>;
  /** isodow 1 = Monday … 7 = Sunday, hour 0–23 (IST) */
  heatmap: Array<{ dow: number; hour: number; orders: number }>;
  dishes: Array<{ name: string; quantity: number; revenue: number }>;
  payments: { upi: number; counter: number; unpaid: number };
  service: { avg_accept_minutes: number | null; avg_ready_minutes: number | null; avg_serve_minutes: number | null };
  customers: { identified: number; new: number; returning: number; identified_share: number };
  tables: Array<{ label: string; area: string | null; orders: number; revenue: number }>;
  ratings: { average: number | null; count: number };
  loyalty: { earned: number; redeemed: number };
  whatsapp: { sent: number; failed: number };
}

export interface FeedbackEntry {
  id: string;
  order_id: string;
  order_number: number | null;
  rating: number;
  comment: string | null;
  created_at: string;
  table: Pick<DiningTable, 'id' | 'code' | 'label' | 'area'> | null;
  customer_name: string | null;
}

/** GET /api/admin/feedback */
export interface FeedbackResponse {
  entries: FeedbackEntry[];
  summary: {
    count: number;
    /** null when there is no feedback yet */
    average: number | null;
    /** count per star, keys "1".."5" */
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
}

/** GET /api/public/unsubscribe/:token */
export interface UnsubscribeInfo {
  restaurant: string;
  /** Masked, e.g. "+9198 •••••345" */
  phone: string;
  subscribed: boolean;
}

/** The exact sentence the guest agrees to; it is stored with the consent record. */
export function marketingConsentText(restaurantName: string): string {
  return `Send me offers and updates from ${restaurantName} on WhatsApp. I can unsubscribe at any time.`;
}

/** "98450 12345", "+91 98450-12345", "098450 12345" → "+919845012345"; otherwise null. Mirrors normalize_in_phone(). */
export function normalizeIndianPhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** "+919845012345" → "+91 98450 12345" */
export function formatIndianPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Click-to-chat link (opens WhatsApp with the message typed in; the person still taps send). */
export function whatsappLink(phone: string | null, text: string): string {
  const digits = phone ? phone.replace(/\D/g, '') : '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

/** GET /api/public/tables/:code */
export interface TableMenuResponse {
  restaurant: Restaurant;
  table: DiningTable;
  categories: MenuCategory[];
  items: MenuItem[];
  /** Active happy hours (the cart shows the discount while one is running). */
  happy_hours?: HappyHour[];
}

export interface PlaceOrderItemInput {
  menu_item_id: string;
  quantity: number;
  options?: Array<{ group_id: string; choice_id: string }>;
  note?: string;
}

/** POST /api/public/orders */
export interface PlaceOrderInput {
  /** Required for dine-in; omitted for online takeaway. */
  table_code?: string;
  /** Default dine_in. Takeaway needs restaurant_slug, guest_name and guest_phone. */
  order_type?: OrderType;
  restaurant_slug?: string;
  /** Scheduled pickup (ISO). Omitted = as soon as possible. */
  pickup_at?: string;
  coupon_code?: string;
  guest_session_id: string;
  guest_name?: string;
  payment_method: PaymentMethod;
  note?: string;
  items: PlaceOrderItemInput[];
  /** Optional mobile number (Growth+). Creates / updates the customer profile. */
  guest_phone?: string;
  /** Separate, unticked-by-default opt-in. Ignored without a phone number. */
  marketing_consent?: boolean;
  /** The exact consent sentence shown (marketingConsentText). */
  consent_text?: string;
  /** UUID generated once per checkout; retries with the same value return the same order. */
  client_ref?: string;
}

/** POST /api/public/orders/:id/items */
export interface AddItemsInput {
  guest_session_id: string;
  items: PlaceOrderItemInput[];
  /** UUID per "Add to order" attempt; a retry with the same value does not add the dishes twice. */
  client_ref?: string;
}

/** POST /api/public/orders/:id/feedback */
export interface FeedbackInput {
  guest_session_id: string;
  rating: number;
  comment?: string;
}

/** POST /api/public/calls */
export interface CreateCallInput {
  table_code: string;
  guest_session_id?: string;
  type: CallType;
  note?: string;
}

/** GET /api/admin/stats */
export interface DashboardStats {
  today: {
    revenue: number;
    orders: number;
    avg_order_value: number;
    items_sold: number;
    active_orders: number;
    open_calls: number;
    occupied_tables: number;
  };
  hourly: Array<{ hour: number; orders: number; revenue: number }>; // 0..23, today
  top_items: Array<{ name: string; quantity: number; revenue: number }>;
  recent_orders: OrderWithItems[];
}

export interface StaffSession {
  staff: Staff;
  restaurant: Restaurant;
}

/** GET /api/admin/billing/summary — totals over every matching order, never a truncated page. */
export interface BillingSummary {
  /** Orders counted (cancelled ones excluded). */
  count: number;
  /** Sum of totals with payment_status = paid. */
  paid: number;
  /** Sum of totals still pending or claimed by the guest. */
  due: number;
  by_status: Record<PaymentStatus, number>;
}

/** Shape every API error uses. */
export interface ApiError {
  error: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Money helpers (prices are stored in rupees as numeric(10,2))
// ---------------------------------------------------------------------------

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatINR(amount: number, opts: { compact?: boolean } = {}): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (opts.compact && Math.abs(n) >= 100000) {
    return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  }
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export interface Totals {
  subtotal: number;
  tax_amount: number;
  cgst: number;
  sgst: number;
  service_charge: number;
  total: number;
}

/** Rupees → integer paise (absorbs float noise such as 0.1 * 3). */
const toPaise = (rupees: number) => Math.round(rupees * 100);
const fromPaise = (paise: number) => paise / 100;

/**
 * `numerator / denominator` on integers, rounded half away from zero: exactly what Postgres
 * `round(numeric, 2)` does in `place_order`, which `Math.round(x * 100) / 100` on a binary float
 * does not always match (20.10 at 5% is 1.005 → 1.01 in SQL but 1.00 with Math.round).
 */
function divRound(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  return sign * Math.floor((2 * n + denominator) / (2 * denominator));
}

/** Mirrors `place_order()`: every intermediate value is exact, so the cart total equals the stored total. */
export function computeTotals(subtotal: number, taxRate: number, serviceChargeRate = 0): Totals {
  const sub = toPaise(subtotal);
  const serviceBp = Math.round(serviceChargeRate * 100); // basis points
  const taxBp = Math.round(taxRate * 100);
  const service = divRound(sub * serviceBp, 10_000);
  const tax = divRound((sub + service) * taxBp, 10_000);
  const cgst = divRound(tax, 2);
  return {
    subtotal: fromPaise(sub),
    service_charge: fromPaise(service),
    tax_amount: fromPaise(tax),
    cgst: fromPaise(cgst),
    sgst: fromPaise(tax - cgst),
    total: fromPaise(sub + service + tax),
  };
}

/**
 * Tax and service-charge rates an order was actually charged at, derived from its stored amounts.
 * The restaurant's settings may have changed since, and a bill must not label an amount with a
 * rate it was not computed with. Falls back to `current` when the order has no base to derive from.
 */
export function orderRates(
  order: Pick<Order, 'subtotal' | 'service_charge' | 'tax_amount'> & { discount_amount?: number | null },
  current: { tax_rate: number; service_charge_rate: number },
): { tax_rate: number; service_charge_rate: number } {
  // Service charge and GST are computed on the discounted amount (migration 0006).
  const sub = Number(order.subtotal) - Number(order.discount_amount ?? 0);
  const service = Number(order.service_charge);
  const tax = Number(order.tax_amount);
  const taxBase = sub + service;
  const pct = (part: number, base: number) => Math.round((part / base) * 1000) / 10; // one decimal: 5, 12.5, 18
  return {
    tax_rate: taxBase > 0 ? pct(tax, taxBase) : current.tax_rate,
    service_charge_rate: sub > 0 ? pct(service, sub) : current.service_charge_rate,
  };
}

export function orderCode(orderNumber: number): string {
  return `#ORD-${orderNumber}`;
}

export function tableDisplay(t: Pick<DiningTable, 'label' | 'area'> | null | undefined): string {
  // Orders without a table are takeaway orders (migration 0006).
  if (!t) return 'Takeaway';
  return t.area ? `${t.label} (${t.area})` : t.label;
}

/**
 * Build a UPI deep link. Works with GPay / PhonePe / Paytm / BHIM on Android and most iOS UPI apps.
 * Percent-encoded by hand: URLSearchParams form-encodes spaces as "+", which UPI apps show
 * literally ("Saffron+Lane"), and the note is reduced to the characters every app accepts.
 */
export function buildUpiLink(params: { vpa: string; payee: string; amount: number; note?: string; ref?: string }): string {
  const enc = encodeURIComponent;
  let link = `upi://pay?pa=${enc(params.vpa)}&pn=${enc(params.payee)}&am=${params.amount.toFixed(2)}&cu=INR`;
  const note = params.note?.replace(/[^\w .-]/g, '').trim();
  if (note) link += `&tn=${enc(note)}`;
  const ref = params.ref?.replace(/[^\w.-]/g, '').trim();
  if (ref) link += `&tr=${enc(ref)}`;
  return link;
}

/** Minutes elapsed since an ISO timestamp (never negative). */
export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export const GUEST_SESSION_TTL_HOURS = 6;

// ---------------------------------------------------------------------------
// Operations (migration 0006): counter POS & bills, promotions, inventory,
// reservations, expenses & cash close, staff & audit
// ---------------------------------------------------------------------------

/** Is a time window open at `at` in India (IST)? Mirrors window_open() in SQL. */
export function windowOpen(from: string | null, until: string | null, days: number[] | null, at: Date = new Date()): boolean {
  const ist = new Date(at.getTime() + 330 * 60_000);
  const isoDow = ((ist.getUTCDay() + 6) % 7) + 1;
  if (days && days.length > 0 && !days.includes(isoDow)) return false;
  if (!from || !until) return true;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const f = toMin(from);
  const u = toMin(until);
  return f <= u ? mins >= f && mins <= u : mins >= f || mins <= u;
}

/** "15:00:00" → "3:00 PM" */
export function formatClock(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const hh = h ?? 0;
  return `${((hh + 11) % 12) + 1}:${String(m ?? 0).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** POST /api/public/quote — price preview (happy hour + coupon), never writes. */
export interface OrderQuote {
  subtotal: number;
  happy_hour_discount: number;
  happy_hour_names: string[];
  coupon_discount: number;
  coupon_code: string | null;
  /** Set when a coupon was entered but cannot be applied (the reason, in plain words). */
  coupon_error: string | null;
  discount: number;
  service_charge: number;
  tax: number;
  total: number;
}

export interface QuoteInput {
  table_code?: string;
  restaurant_slug?: string;
  items: PlaceOrderItemInput[];
  coupon_code?: string;
  pickup_at?: string;
}

// ----- Promotions ----------------------------------------------------------

export interface Coupon {
  id: string;
  restaurant_id: string;
  code: string;
  description: string | null;
  kind: 'percent' | 'flat';
  value: number;
  min_order: number;
  max_discount: number | null;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

export interface HappyHour {
  id: string;
  restaurant_id: string;
  name: string;
  /** ISO weekdays 1 (Mon) … 7 (Sun). */
  days: number[];
  start_time: string;
  end_time: string;
  percent: number;
  /** Null / empty = the whole menu. */
  category_ids: string[] | null;
  is_active: boolean;
  created_at: string;
}

export interface GiftCard {
  id: string;
  restaurant_id: string;
  code: string;
  initial_value: number;
  balance: number;
  issued_to_name: string | null;
  issued_to_phone: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GiftCardTransaction {
  id: string;
  gift_card_id: string;
  amount: number;
  bill_id: string | null;
  note: string | null;
  created_at: string;
}

// ----- Bills & payments ----------------------------------------------------

export const BILL_PAYMENT_METHODS = ['cash', 'upi', 'card', 'gift_card', 'other'] as const;
export type BillPaymentMethod = (typeof BILL_PAYMENT_METHODS)[number];
export const BILL_PAYMENT_METHOD_LABEL: Record<BillPaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  gift_card: 'Gift card',
  other: 'Other',
};

export interface BillPayment {
  id: string;
  bill_id: string;
  restaurant_id: string;
  method: BillPaymentMethod;
  amount: number;
  /** Gift card code, card slip or UPI reference. */
  reference: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  restaurant_id: string;
  /** Per-restaurant running number → "B-0001" (billCode). */
  bill_number: number;
  table_id: string | null;
  order_ids: string[];
  subtotal: number;
  discount_amount: number;
  service_charge: number;
  tax_amount: number;
  tip_amount: number;
  /** Before tip. Amount paid = total + tip_amount. */
  total: number;
  status: 'settled' | 'refunded';
  note: string | null;
  refund_reason: string | null;
  settled_by: string | null;
  settled_at: string;
  refunded_at: string | null;
}

export interface BillWithDetails extends Bill {
  payments: BillPayment[];
  orders: OrderWithItems[];
  table: Pick<DiningTable, 'id' | 'code' | 'label' | 'area'> | null;
}

export function billCode(n: number): string {
  return `B-${String(n).padStart(4, '0')}`;
}

export interface BillPreview {
  subtotal: number;
  /** All discounts on the orders, including the extra bill discount. */
  discount: number;
  extra_discount: number;
  service_charge: number;
  tax: number;
  total: number;
}

export interface BillDiscountInput {
  order_ids: string[];
  discount_type?: 'none' | 'percent' | 'flat';
  discount_value?: number;
}

/** POST /api/admin/bills */
export interface SettleBillInput extends BillDiscountInput {
  discount_reason?: string;
  tip?: number;
  /** Must add up to the bill total + tip. */
  payments: Array<{ method: BillPaymentMethod; amount: number; reference?: string }>;
  note?: string;
}

/** POST /api/admin/pos/orders */
export interface PosOrderInput {
  order_type: OrderType;
  table_id?: string;
  items: PlaceOrderItemInput[];
  guest_name?: string;
  guest_phone?: string;
  note?: string;
  client_ref?: string;
}

/** GET /api/admin/floor */
export type FloorTableState = 'free' | 'ordering' | 'in_kitchen' | 'served' | 'bill_requested' | 'reserved';

export interface FloorTable {
  table: DiningTable;
  state: FloorTableState;
  /** Unpaid, not cancelled orders on this table (oldest first). */
  open_orders: OrderWithItems[];
  open_total: number;
  /** Oldest open order time, for "seated 40 min". */
  since: string | null;
  open_calls: number;
  bill_requested: boolean;
  /** Next requested / confirmed booking for this table in the next 3 hours. */
  next_reservation: Reservation | null;
}

export interface FloorResponse {
  tables: FloorTable[];
  /** Unpaid takeaway orders (counter + online). */
  takeaway: OrderWithItems[];
}

// ----- Reservations & waitlist ---------------------------------------------

export const RESERVATION_STATUSES = ['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export interface Reservation {
  id: string;
  restaurant_id: string;
  customer_name: string;
  phone: string;
  party_size: number;
  reserved_for: string;
  duration_minutes: number;
  table_id: string | null;
  status: ReservationStatus;
  source: 'staff' | 'online' | 'phone';
  note: string | null;
  created_at: string;
  updated_at: string;
  table?: Pick<DiningTable, 'id' | 'code' | 'label' | 'area'> | null;
}

export const WAITLIST_STATUSES = ['waiting', 'notified', 'seated', 'left'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export interface WaitlistEntry {
  id: string;
  restaurant_id: string;
  customer_name: string;
  phone: string | null;
  party_size: number;
  quoted_minutes: number | null;
  status: WaitlistStatus;
  table_id: string | null;
  note: string | null;
  created_at: string;
  seated_at: string | null;
}

/** POST /api/public/reservations */
export interface ReservationRequestInput {
  restaurant_slug: string;
  name: string;
  phone: string;
  party_size: number;
  /** ISO instant. */
  reserved_for: string;
  note?: string;
}

export interface ReservationRequestResult {
  id: string;
  status: 'requested';
  restaurant: string;
  reserved_for: string;
  party_size: number;
}

/** GET /api/public/restaurants/:slug — the restaurant's own page (takeaway + booking). */
export interface RestaurantPageResponse {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
  happy_hours: HappyHour[];
}

// ----- Inventory & purchasing ----------------------------------------------

export const INGREDIENT_UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen'] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export interface Ingredient {
  id: string;
  restaurant_id: string;
  name: string;
  unit: IngredientUnit;
  stock_qty: number;
  low_stock_threshold: number;
  /** Weighted-average cost per unit, from purchases. */
  avg_cost: number;
  is_active: boolean;
  created_at: string;
}

export interface RecipeItem {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  /** In the ingredient's unit, per one portion. */
  quantity: number;
  ingredient?: Pick<Ingredient, 'id' | 'name' | 'unit' | 'avg_cost'> | null;
}

export const STOCK_REASONS = ['sale', 'sale_reversal', 'purchase', 'waste', 'adjustment', 'opening'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];
export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  sale: 'Used in orders',
  sale_reversal: 'Order cancelled',
  purchase: 'Purchase received',
  waste: 'Waste',
  adjustment: 'Stock count',
  opening: 'Opening stock',
};

export interface StockMovement {
  id: string;
  restaurant_id: string;
  ingredient_id: string;
  change: number;
  reason: StockReason;
  order_id: string | null;
  purchase_order_id: string | null;
  unit_cost: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  ingredient?: Pick<Ingredient, 'id' | 'name' | 'unit'> | null;
}

export interface Supplier {
  id: string;
  restaurant_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export const PURCHASE_ORDER_STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Part received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  quantity: number;
  unit_cost: number;
  received_qty: number;
  ingredient?: Pick<Ingredient, 'id' | 'name' | 'unit'> | null;
}

export interface PurchaseOrder {
  id: string;
  restaurant_id: string;
  supplier_id: string | null;
  /** "PO-0001" (poCode). */
  po_number: number;
  status: PurchaseOrderStatus;
  expected_on: string | null;
  note: string | null;
  total: number;
  created_by: string | null;
  created_at: string;
  received_at: string | null;
  supplier?: Pick<Supplier, 'id' | 'name' | 'phone'> | null;
  items?: PurchaseOrderItem[];
}

export function poCode(n: number): string {
  return `PO-${String(n).padStart(4, '0')}`;
}

/** GET /api/admin/inventory/dish-costs */
export interface DishCost {
  menu_item_id: string;
  name: string;
  price: number;
  food_cost: number;
  /** food_cost / price × 100, one decimal; null when the dish has no recipe. */
  food_cost_pct: number | null;
  ingredients: number;
}

// ----- Expenses, cash close, P&L -------------------------------------------

export const EXPENSE_CATEGORIES = ['ingredients', 'salaries', 'rent', 'utilities', 'gas', 'maintenance', 'marketing', 'packaging', 'licences', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  ingredients: 'Ingredients',
  salaries: 'Salaries',
  rent: 'Rent',
  utilities: 'Electricity & water',
  gas: 'Gas',
  maintenance: 'Repairs & maintenance',
  marketing: 'Marketing',
  packaging: 'Packaging',
  licences: 'Licences & fees',
  other: 'Other',
};

export const EXPENSE_PAID_VIA = ['cash', 'upi', 'card', 'bank'] as const;
export type ExpensePaidVia = (typeof EXPENSE_PAID_VIA)[number];

export interface Expense {
  id: string;
  restaurant_id: string;
  /** YYYY-MM-DD (IST). */
  spent_on: string;
  category: ExpenseCategory;
  amount: number;
  paid_via: ExpensePaidVia;
  vendor: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ExpenseBudget {
  id: string;
  restaurant_id: string;
  /** First day of the month, YYYY-MM-01. */
  month: string;
  category: ExpenseCategory;
  amount: number;
}

export interface CashDaySummary {
  business_date: string;
  cash_sales: number;
  cash_refunds: number;
  cash_expenses: number;
  by_method: Partial<Record<BillPaymentMethod, number>>;
  bills: number;
  already_closed: boolean;
}

export interface CashClosing {
  id: string;
  restaurant_id: string;
  business_date: string;
  opening_float: number;
  cash_sales: number;
  cash_refunds: number;
  cash_expenses: number;
  expected_cash: number;
  counted_cash: number;
  /** counted − expected: negative = short, positive = over. */
  variance: number;
  note: string | null;
  closed_by: string | null;
  created_at: string;
}

export interface PnlReport {
  from: string;
  to: string;
  gross_sales: number;
  discounts: number;
  service_charge: number;
  tax_collected: number;
  /** Sales after discounts, incl. service charge, excl. GST. */
  net_sales: number;
  tips: number;
  refunds: number;
  /** Ingredient cost of what was sold (needs recipes on the Inventory page). */
  food_cost: number;
  waste_cost: number;
  expenses: Partial<Record<ExpenseCategory, number>>;
  expenses_total: number;
  orders: number;
  /**
   * net_sales − expenses − waste_cost, and − food_cost only when no ingredient purchases were logged as
   * expenses in the period (otherwise ingredients would be counted twice). `food_cost_basis` says which.
   */
  operating_profit: number;
  food_cost_basis: 'recipes' | 'expenses';
}

// ----- Staff, attendance, audit --------------------------------------------

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  kitchen: 'Kitchen',
  waiter: 'Waiter / counter',
};

export interface StaffInvite {
  id: string;
  restaurant_id: string;
  code: string;
  role: StaffRole;
  display_name: string | null;
  created_by: string | null;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
}

export interface StaffShift {
  id: string;
  restaurant_id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  note: string | null;
  staff?: Pick<Staff, 'id' | 'display_name' | 'role'> | null;
}

export interface StaffMember extends Staff {
  /** The member's current open shift, if clocked in. */
  open_shift: StaffShift | null;
  /** Hours worked in the last 7 days (open shift counted up to now). */
  hours_7d: number;
}

export interface AuditEntry {
  id: number;
  restaurant_id: string;
  staff_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// SaaS platform (migration 0007): self-signup, directory, platform console, push
// ---------------------------------------------------------------------------

export const TRIAL_DAYS = 14;

/** POST /api/account/restaurant — a signed-in account without a restaurant creates one. */
export interface CreateRestaurantInput {
  name: string;
  /** Web address: /r/<slug>. 3–40 lowercase letters, numbers and dashes. */
  slug: string;
  city?: string;
  phone?: string;
  owner_name?: string;
  /** Tables to create (each gets its own QR code). */
  tables: number;
  /** Copy the demo café's menu as a starting point. */
  sample_menu?: boolean;
}

/** "Saffron Lane Café" → "saffron-lane-cafe" */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** GET /api/public/directory */
export interface DirectoryRestaurant {
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  cuisine: string | null;
  cover_url: string | null;
  logo_url: string | null;
  is_open: boolean;
  open_time: string;
  close_time: string;
  takeaway_enabled: boolean;
  reservations_enabled: boolean;
}

export interface DirectoryResponse {
  restaurants: DirectoryRestaurant[];
  cities: string[];
}

/** GET /api/platform/overview */
export interface PlatformOverview {
  restaurants: number;
  active: number;
  suspended: number;
  on_trial: number;
  trial_expired: number;
  listed: number;
  by_plan: Partial<Record<PlanId, number>>;
  signups_7d: number;
  signups_30d: number;
  orders_30d: number;
  gmv_30d: number;
  orders_today: number;
  leads_30d: number;
}

/** GET /api/platform/restaurants */
export interface PlatformRestaurant {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  phone: string | null;
  plan: PlanId;
  status: RestaurantStatus;
  listed: boolean;
  trial_ends_at: string | null;
  created_at: string;
  is_open: boolean;
  owner_email: string | null;
  staff_count: number;
  table_count: number;
  dish_count: number;
  orders_30d: number;
  gmv_30d: number;
  last_order_at: string | null;
}

/** PATCH /api/platform/restaurants/:id */
export interface PlatformRestaurantUpdate {
  plan?: PlanId;
  status?: RestaurantStatus;
  /** ISO instant; extend or shorten the trial. */
  trial_ends_at?: string;
  /** true = end the trial now (clears trial_ends_at). */
  end_trial?: boolean;
  listed?: boolean;
}

/** A browser PushSubscription as JSON (subscription.toJSON()). */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
