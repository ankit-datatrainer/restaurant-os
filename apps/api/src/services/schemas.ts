import { z } from 'zod';
import {
  CALL_TYPES,
  CUSTOMER_SEGMENTS,
  ITEM_BADGES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  normalizeIndianPhone,
} from '@restaurant-os/shared';
import { TABLE_CODE_RE } from './tables.js';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional();
/** Nullable text where an empty string means "clear it". */
const nullableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), text(max).nullable());
/** Nullable URL where an empty string means "clear it". */
const nullableUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().url('Must be a valid URL').max(2000).nullable(),
);
const sortOrder = z.number().int().min(0).max(100000);
/** "HH:MM" or "HH:MM:SS" (24-hour). */
const timeOfDay = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use a 24-hour time like 15:30');
const nullableTime = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), timeOfDay.nullable());

export const tableCodeSchema = z
  .string()
  .trim()
  .min(3, 'Table code must be 3 to 12 characters')
  .max(12, 'Table code must be 3 to 12 characters')
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(TABLE_CODE_RE, 'Table code may only contain letters and digits'));

const uuid = (label: string) => z.string().uuid(`${label} must be a UUID`);

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

const orderLinesSchema = z
  .array(
    z.object({
      menu_item_id: uuid('menu_item_id'),
      quantity: z.number().int().min(1, 'Quantity must be at least 1').max(50, 'Quantity cannot exceed 50'),
      options: z
        .array(z.object({ group_id: z.string().trim().min(1).max(60), choice_id: z.string().trim().min(1).max(60) }))
        .max(20)
        .optional(),
      note: optionalText(200),
    }),
  )
  .min(1, 'Add at least one item to the order')
  .max(40, 'An order can have at most 40 lines');

/** Optional Indian mobile number: empty → undefined; otherwise must normalise to +91XXXXXXXXXX. */
const optionalPhone = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z
    .string()
    .trim()
    .max(20)
    .refine((v) => normalizeIndianPhone(v) !== null, 'Please enter a valid 10-digit Indian mobile number, or leave it empty.')
    .optional(),
);

export const placeOrderSchema = z.object({
  /** Required for dine-in, absent for online takeaway (checked below). */
  table_code: tableCodeSchema.optional(),
  order_type: z.enum(['dine_in', 'takeaway']).optional(),
  restaurant_slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Unknown restaurant').optional(),
  pickup_at: z.string().datetime({ offset: true, message: 'Pickup time must be an ISO-8601 date-time' }).optional(),
  coupon_code: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().toUpperCase().max(20).optional()),
  guest_session_id: uuid('guest_session_id'),
  guest_name: optionalText(60),
  payment_method: z.enum(PAYMENT_METHODS),
  note: optionalText(300),
  items: orderLinesSchema,
  guest_phone: optionalPhone,
  marketing_consent: z.boolean().optional(),
  consent_text: optionalText(500),
  client_ref: uuid('client_ref').optional(),
}).superRefine((v, ctx) => {
  if ((v.order_type ?? 'dine_in') === 'dine_in' && !v.table_code) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['table_code'], message: 'Scan the table QR code to order' });
  }
  if (v.order_type === 'takeaway' && !v.restaurant_slug) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['restaurant_slug'], message: 'Unknown restaurant' });
  }
});

export const addItemsSchema = z.object({
  guest_session_id: uuid('guest_session_id'),
  items: orderLinesSchema,
  client_ref: uuid('client_ref').optional(),
});

export const feedbackSchema = z.object({
  guest_session_id: uuid('guest_session_id'),
  rating: z.number().int().min(1, 'Pick a rating from 1 to 5').max(5, 'Pick a rating from 1 to 5'),
  comment: optionalText(1000),
});

export const sessionCallsQuerySchema = z.object({
  table: tableCodeSchema,
  session: uuid('session'),
});

export const sessionOrdersQuerySchema = z.object({
  table: tableCodeSchema,
  session: uuid('session'),
});

export const orderSessionQuerySchema = z.object({
  session: uuid('session'),
});

export const claimPaymentSchema = z.object({
  guest_session_id: uuid('guest_session_id'),
});

export const createCallSchema = z.object({
  table_code: tableCodeSchema,
  guest_session_id: uuid('guest_session_id').optional(),
  type: z.enum(CALL_TYPES),
  note: optionalText(300),
});

export const leadSchema = z.object({
  name: text(100).min(1, 'Please tell us your name'),
  email: z.string().trim().email('Please enter a valid email address').max(200),
  phone: optionalText(30),
  restaurant_name: optionalText(120),
  message: optionalText(2000),
  city: optionalText(80),
  table_count: z.number().int().min(1).max(1000).optional(),
  plan_interest: z.enum(['demo', 'founding_partner', 'starter', 'growth', 'premium']).optional(),
});

export const customersQuerySchema = z.object({
  segment: z.enum(CUSTOMER_SEGMENTS).optional(),
  q: text(80).optional(),
});

// ---------------------------------------------------------------------------
// Admin: orders & calls
// ---------------------------------------------------------------------------

/** ISO-8601 instant, e.g. 2026-10-20T00:00:00.000Z or 2026-10-20T00:00:00+05:30. */
const isoInstant = z.string().datetime({ offset: true, message: 'Must be an ISO-8601 date-time' });

export const ordersQuerySchema = z.object({
  scope: z.enum(['active', 'past', 'all']).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  table_id: uuid('table_id').optional(),
  q: text(80).optional(),
  /** Only orders placed at or after this instant. */
  since: isoInstant.optional(),
  /** Only orders placed before this instant. */
  until: isoInstant.optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

export const billingSummaryQuerySchema = z.object({
  since: isoInstant.optional(),
});

export const orderStatusBodySchema = z.object({ status: z.enum(ORDER_STATUSES) });
export const paymentStatusBodySchema = z.object({ payment_status: z.enum(PAYMENT_STATUSES) });

export const callsQuerySchema = z.object({
  status: z.enum(['open', 'attended', 'all']).optional(),
});

// ---------------------------------------------------------------------------
// Admin: menu
// ---------------------------------------------------------------------------

export const categoryCreateSchema = z.object({
  name: text(80).min(1, 'Category name is required'),
  description: nullableText(300).optional(),
  name_hi: nullableText(80).optional(),
  description_hi: nullableText(300).optional(),
  sort_order: sortOrder.optional(),
  is_active: z.boolean().optional(),
  available_from: nullableTime.optional(),
  available_until: nullableTime.optional(),
  available_days: z.array(z.number().int().min(1).max(7)).max(7).nullable().optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial();

const slug = z.string().trim().min(1).max(40);

export const optionGroupSchema = z
  .object({
    id: slug,
    name: text(60).min(1, 'Option group name is required'),
    required: z.boolean(),
    multi: z.boolean(),
    choices: z
      .array(
        z.object({
          id: slug,
          label: text(60).min(1, 'Choice label is required'),
          price_delta: z.number().min(-100000).max(100000),
        }),
      )
      .min(1, 'Add at least one choice')
      .max(20),
  })
  .superRefine((group, ctx) => {
    const seen = new Set<string>();
    group.choices.forEach((choice, i) => {
      if (seen.has(choice.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['choices', i, 'id'], message: `Duplicate choice id "${choice.id}"` });
      }
      seen.add(choice.id);
    });
  });

const optionGroupsSchema = z
  .array(optionGroupSchema)
  .max(10)
  .superRefine((groups, ctx) => {
    const seen = new Set<string>();
    groups.forEach((group, i) => {
      if (seen.has(group.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'id'], message: `Duplicate option group id "${group.id}"` });
      }
      seen.add(group.id);
    });
  });

export const itemCreateSchema = z.object({
  name: text(100).min(1, 'Dish name is required'),
  description: nullableText(600).optional(),
  name_hi: nullableText(100).optional(),
  description_hi: nullableText(600).optional(),
  price: z.number().min(0, 'Price cannot be negative').max(1000000),
  category_id: uuid('category_id'),
  image_url: nullableUrl.optional(),
  is_veg: z.boolean().optional(),
  badges: z.array(z.enum(ITEM_BADGES)).max(ITEM_BADGES.length).optional(),
  option_groups: optionGroupsSchema.optional(),
  is_available: z.boolean().optional(),
  sort_order: sortOrder.optional(),
  prep_minutes: z.number().int().min(0).max(600).nullable().optional(),
  hsn_code: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().regex(/^\d{4,8}$/, 'HSN / SAC codes are 4 to 8 digits').nullable().optional(),
  ),
});
export const itemUpdateSchema = itemCreateSchema.partial();

// ---------------------------------------------------------------------------
// Admin: tables & restaurant
// ---------------------------------------------------------------------------

const optionalCode = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), tableCodeSchema.optional());

export const tableCreateSchema = z.object({
  label: text(60).min(1, 'Table label is required'),
  area: nullableText(60).optional(),
  seats: z.number().int().min(1).max(50).optional(),
  code: optionalCode,
  sort_order: sortOrder.optional(),
  is_active: z.boolean().optional(),
});
export const tableUpdateSchema = tableCreateSchema.partial();

export const restaurantUpdateSchema = z.object({
  name: text(100).min(1, 'Restaurant name is required').optional(),
  tagline: nullableText(160).optional(),
  logo_url: nullableUrl.optional(),
  cover_url: nullableUrl.optional(),
  address: nullableText(300).optional(),
  phone: nullableText(30).optional(),
  upi_id: nullableText(100).optional(),
  upi_payee_name: nullableText(100).optional(),
  tax_rate: z.number().min(0).max(28, 'GST rate cannot exceed 28%').optional(),
  service_charge_rate: z.number().min(0).max(20, 'Service charge cannot exceed 20%').optional(),
  gstin: nullableText(20).optional(),
  is_open: z.boolean().optional(),
  accepts_upi: z.boolean().optional(),
  accepts_counter: z.boolean().optional(),
  // Guest experience (0003). `plan` is deliberately absent: Restaurant OS sets it, not staff.
  google_review_url: nullableUrl.optional(),
  story_title: nullableText(80).optional(),
  story_text: nullableText(800).optional(),
  story_video_url: nullableUrl.optional(),
  games_enabled: z.boolean().optional(),
  feedback_enabled: z.boolean().optional(),
  marketing_consent_enabled: z.boolean().optional(),
  // Operations (0006)
  takeaway_enabled: z.boolean().optional(),
  takeaway_prep_minutes: z.number().int().min(5).max(240).optional(),
  reservations_enabled: z.boolean().optional(),
  reservation_minutes: z.number().int().min(15).max(480).optional(),
  open_time: timeOfDay.optional(),
  close_time: timeOfDay.optional(),
  // SaaS profile (0007). plan / status / trial are managed by the platform owner only.
  city: nullableText(60).optional(),
  cuisine: nullableText(80).optional(),
  fssai_number: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s+/g, '') || null : v),
    z.string().regex(/^\d{14}$/, 'The FSSAI licence number has 14 digits').nullable().optional(),
  ),
  listed: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Premium: loyalty, analytics, integrations (migration 0005)
// ---------------------------------------------------------------------------

export const loyaltyProgramSchema = z.object({
  enabled: z.boolean().optional(),
  visits_required: z.number().int().min(2, 'At least 2 visits').max(50, 'At most 50 visits').optional(),
  reward_text: text(120).min(1, 'Describe the reward').optional(),
  reward_expiry_days: z.number().int().min(1).max(365).optional(),
});

export const rewardsQuerySchema = z.object({
  status: z.enum(['active', 'redeemed', 'expired', 'all']).optional(),
});

export const analyticsQuerySchema = z.object({
  from: isoInstant.optional(),
  to: isoInstant.optional(),
});

const optionalTemplate = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'Template names use lowercase letters, digits and underscores (as in WhatsApp Manager)').nullable().optional(),
);

export const integrationSettingsSchema = z.object({
  webhook_enabled: z.boolean().optional(),
  webhook_url: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().url('Must be a valid URL').max(2000).refine((u) => /^https?:\/\//.test(u), 'Must start with http:// or https://').nullable().optional(),
  ),
  wa_enabled: z.boolean().optional(),
  wa_phone_number_id: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().regex(/^\d{6,30}$/, 'The phone number ID is the long number from WhatsApp Manager → API setup').nullable().optional(),
  ),
  /** "" clears the stored token; omit to keep it. */
  wa_access_token: z.string().trim().max(1000).optional(),
  wa_language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Language code like en, en_US or hi').optional(),
  wa_template_welcome: optionalTemplate,
  wa_template_winback: optionalTemplate,
  wa_template_reward: optionalTemplate,
  wa_template_offer: optionalTemplate,
  winback_days: z.number().int().min(7).max(365).optional(),
});

export const whatsappTestSchema = z.object({
  to: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null, 'Enter a valid 10-digit Indian mobile number'),
  kind: z.enum(['welcome', 'winback', 'reward', 'offer']).optional(),
});

export const whatsappBroadcastSchema = z.object({
  segment: z.enum(CUSTOMER_SEGMENTS).optional(),
  /** Text for the offer template's {{2}} variable. */
  message: text(500).min(1, 'Write the offer'),
});

// ---------------------------------------------------------------------------
// Operations (migration 0006)
// ---------------------------------------------------------------------------

const money = (max = 10_000_000) => z.number().min(0, 'Cannot be negative').max(max);
const positiveMoney = (max = 10_000_000) => z.number().gt(0, 'Must be more than 0').max(max);
const optionalPhoneStrict = optionalPhone;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-26');
const nullableIsoInstant = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), isoInstant.nullable());
const nullableIsoDate = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), isoDate.nullable());

export const quoteSchema = z
  .object({
    table_code: tableCodeSchema.optional(),
    restaurant_slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Unknown restaurant').optional(),
    items: orderLinesSchema,
    coupon_code: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().toUpperCase().max(20).optional()),
    pickup_at: isoInstant.optional(),
  })
  .refine((v) => Boolean(v.table_code || v.restaurant_slug), { message: 'Unknown restaurant', path: ['table_code'] });

export const takeawayOrdersQuerySchema = z.object({
  restaurant: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Unknown restaurant'),
  session: uuid('session'),
});

export const reservationRequestSchema = z.object({
  restaurant_slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Unknown restaurant'),
  name: text(80).min(1, 'Please add your name'),
  phone: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null, 'Please add a valid 10-digit mobile number'),
  party_size: z.number().int().min(1, 'At least 1 guest').max(30, 'For more than 30 guests, please call the restaurant'),
  reserved_for: isoInstant,
  note: optionalText(300),
});

// ----- POS & bills -----

export const posOrderSchema = z
  .object({
    order_type: z.enum(['dine_in', 'takeaway']),
    table_id: uuid('table_id').optional(),
    items: orderLinesSchema,
    guest_name: optionalText(60),
    guest_phone: optionalPhoneStrict,
    note: optionalText(300),
    client_ref: uuid('client_ref').optional(),
  })
  .refine((v) => v.order_type === 'takeaway' || Boolean(v.table_id), { message: 'Pick a table for a dine-in order', path: ['table_id'] });

const discountFields = {
  order_ids: z.array(uuid('order id')).min(1, 'Pick at least one order').max(30),
  discount_type: z.enum(['none', 'percent', 'flat']).optional(),
  discount_value: z.number().min(0).max(10_000_000).optional(),
};

export const billPreviewSchema = z.object(discountFields);

export const settleBillSchema = z
  .object({
    ...discountFields,
    discount_reason: optionalText(120),
    tip: money(100_000).optional(),
    payments: z
      .array(
        z.object({
          method: z.enum(['cash', 'upi', 'card', 'gift_card', 'other']),
          amount: positiveMoney(),
          reference: optionalText(60),
        }),
      )
      .min(1, 'Add how the bill was paid')
      .max(10),
    note: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.discount_type === 'percent' && (v.discount_value ?? 0) > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discount_value'], message: 'A percentage discount cannot be more than 100%' });
    }
    v.payments.forEach((p, i) => {
      if (p.method === 'gift_card' && !p.reference) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payments', i, 'reference'], message: 'Enter the gift card code' });
      }
    });
  });

export const refundSchema = z.object({ reason: text(300).min(3, 'Give a reason for the refund') });

export const billsQuerySchema = z.object({
  since: isoInstant.optional(),
  until: isoInstant.optional(),
  status: z.enum(['settled', 'refunded', 'all']).optional(),
  q: text(40).optional(),
});

export const transferSchema = z.object({ to_table_id: uuid('to_table_id') });

// ----- Reservations & waitlist -----

const reservationBase = {
  customer_name: text(80).min(1, 'Add the guest name'),
  phone: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null, 'Enter a valid 10-digit mobile number'),
  party_size: z.number().int().min(1).max(50),
  reserved_for: isoInstant,
  duration_minutes: z.number().int().min(15).max(480).optional(),
  table_id: uuid('table_id').nullable().optional(),
  source: z.enum(['staff', 'online', 'phone']).optional(),
  note: nullableText(300).optional(),
};
export const reservationCreateSchema = z.object(reservationBase);
export const reservationUpdateSchema = z
  .object({ ...reservationBase, status: z.enum(['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']) })
  .partial();

export const reservationsQuerySchema = z.object({
  from: isoInstant.optional(),
  to: isoInstant.optional(),
  status: z.enum(['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'upcoming', 'all']).optional(),
});

export const waitlistCreateSchema = z.object({
  customer_name: text(80).min(1, 'Add the guest name'),
  phone: optionalPhoneStrict,
  party_size: z.number().int().min(1).max(50),
  quoted_minutes: z.number().int().min(0).max(300).nullable().optional(),
  note: nullableText(300).optional(),
});
export const waitlistUpdateSchema = waitlistCreateSchema.partial().extend({
  status: z.enum(['waiting', 'notified', 'seated', 'left']).optional(),
  table_id: uuid('table_id').nullable().optional(),
});
export const waitlistQuerySchema = z.object({ status: z.enum(['active', 'all']).optional() });

// ----- Promotions -----

const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,20}$/, 'Codes are 3 to 20 letters, digits, - or _');

const couponBase = z.object({
  code: couponCode,
  description: nullableText(160).optional(),
  kind: z.enum(['percent', 'flat']),
  value: positiveMoney(1_000_000),
  min_order: money().optional(),
  max_discount: z.number().gt(0).max(1_000_000).nullable().optional(),
  valid_from: nullableIsoInstant.optional(),
  valid_until: nullableIsoInstant.optional(),
  usage_limit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  is_active: z.boolean().optional(),
});
const couponCheck = (v: { kind?: string; value?: number; valid_from?: string | null; valid_until?: string | null }, ctx: z.RefinementCtx) => {
  if (v.kind === 'percent' && (v.value ?? 0) > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'A percentage cannot be more than 100' });
  if (v.valid_from && v.valid_until && v.valid_from >= v.valid_until) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valid_until'], message: 'The end must be after the start' });
  }
};
export const couponCreateSchema = couponBase.superRefine(couponCheck);
export const couponUpdateSchema = couponBase.partial().superRefine(couponCheck);

const happyHourBase = z.object({
  name: text(80).min(1, 'Name the offer'),
  days: z.array(z.number().int().min(1).max(7)).min(1, 'Pick at least one day').max(7),
  start_time: timeOfDay,
  end_time: timeOfDay,
  percent: z.number().gt(0).max(90, 'At most 90% off'),
  category_ids: z.array(uuid('category id')).max(50).nullable().optional(),
  is_active: z.boolean().optional(),
});
export const happyHourCreateSchema = happyHourBase.refine((v) => v.start_time !== v.end_time, { message: 'Start and end cannot be the same', path: ['end_time'] });
export const happyHourUpdateSchema = happyHourBase.partial();

export const giftCardCreateSchema = z.object({
  /** Leave empty to generate one. */
  code: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), couponCode.optional()),
  initial_value: positiveMoney(100_000),
  issued_to_name: nullableText(80).optional(),
  issued_to_phone: optionalPhoneStrict,
  expires_at: nullableIsoInstant.optional(),
});
export const giftCardUpdateSchema = z.object({
  is_active: z.boolean().optional(),
  expires_at: nullableIsoInstant.optional(),
  issued_to_name: nullableText(80).optional(),
});

// ----- Inventory & purchasing -----

const qty = z.number().gt(0, 'Must be more than 0').max(1_000_000);

export const ingredientCreateSchema = z.object({
  name: text(80).min(1, 'Name the ingredient'),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen']),
  low_stock_threshold: money(1_000_000).optional(),
  avg_cost: money(1_000_000).optional(),
  /** Opening stock, recorded as an "opening" movement. */
  opening_qty: money(1_000_000).optional(),
  is_active: z.boolean().optional(),
});
export const ingredientUpdateSchema = z.object({
  name: text(80).min(1).optional(),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen']).optional(),
  low_stock_threshold: money(1_000_000).optional(),
  avg_cost: money(1_000_000).optional(),
  is_active: z.boolean().optional(),
});

export const stockMovementSchema = z
  .object({
    reason: z.enum(['waste', 'adjustment', 'opening']),
    /** Waste / opening: quantity (positive). Adjustment: the counted stock level. */
    quantity: z.number().min(0).max(1_000_000),
    unit_cost: money(1_000_000).optional(),
    note: optionalText(200),
  })
  .refine((v) => v.reason === 'adjustment' || v.quantity > 0, { message: 'Enter a quantity', path: ['quantity'] });

export const movementsQuerySchema = z.object({
  ingredient_id: uuid('ingredient_id').optional(),
  reason: z.enum(['sale', 'sale_reversal', 'purchase', 'waste', 'adjustment', 'opening']).optional(),
  since: isoInstant.optional(),
});

export const recipeSchema = z.object({
  lines: z
    .array(z.object({ ingredient_id: uuid('ingredient_id'), quantity: qty }))
    .max(30)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((l, i) => {
        if (seen.has(l.ingredient_id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'ingredient_id'], message: 'Each ingredient once' });
        seen.add(l.ingredient_id);
      });
    }),
});

export const supplierCreateSchema = z.object({
  name: text(100).min(1, 'Name the supplier'),
  contact_name: nullableText(80).optional(),
  phone: nullableText(30).optional(),
  email: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().email('Enter a valid email').max(200).nullable().optional()),
  gstin: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, 'GSTIN is 15 letters and digits').nullable().optional(),
  ),
  notes: nullableText(500).optional(),
  is_active: z.boolean().optional(),
});
export const supplierUpdateSchema = supplierCreateSchema.partial();

export const purchaseOrderCreateSchema = z.object({
  supplier_id: uuid('supplier_id').nullable().optional(),
  expected_on: nullableIsoDate.optional(),
  note: nullableText(300).optional(),
  items: z
    .array(z.object({ ingredient_id: uuid('ingredient_id'), quantity: qty, unit_cost: money(1_000_000) }))
    .min(1, 'Add at least one item')
    .max(60),
  /** true = mark as ordered straight away. */
  place: z.boolean().optional(),
});
export const purchaseOrderUpdateSchema = z.object({
  status: z.enum(['ordered', 'cancelled']).optional(),
  expected_on: nullableIsoDate.optional(),
  note: nullableText(300).optional(),
  supplier_id: uuid('supplier_id').nullable().optional(),
});
export const receiveSchema = z.object({
  lines: z
    .array(z.object({ item_id: uuid('item_id'), received_qty: z.number().min(0).max(1_000_000), unit_cost: money(1_000_000).optional() }))
    .min(1)
    .max(60),
});
export const purchaseOrdersQuerySchema = z.object({
  status: z.enum(['open', 'draft', 'ordered', 'partially_received', 'received', 'cancelled', 'all']).optional(),
});

// ----- Finance -----

const expenseCategory = z.enum(['ingredients', 'salaries', 'rent', 'utilities', 'gas', 'maintenance', 'marketing', 'packaging', 'licences', 'other']);

export const expenseCreateSchema = z.object({
  spent_on: isoDate.optional(),
  category: expenseCategory,
  amount: positiveMoney(),
  paid_via: z.enum(['cash', 'upi', 'card', 'bank']).optional(),
  vendor: nullableText(100).optional(),
  note: nullableText(300).optional(),
});
export const expenseUpdateSchema = expenseCreateSchema.partial();
export const expensesQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: expenseCategory.optional(),
});

export const budgetsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10'),
  budgets: z.array(z.object({ category: expenseCategory, amount: money() })).max(10),
});
export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10').optional() });

export const cashDayQuerySchema = z.object({ date: isoDate.optional() });
export const cashCloseSchema = z.object({
  business_date: isoDate,
  opening_float: money().optional(),
  counted_cash: money(),
  note: optionalText(300),
});

export const rangeQuerySchema = z.object({
  from: isoInstant.optional(),
  to: isoInstant.optional(),
});

// ----- Staff -----

const staffRole = z.enum(['owner', 'manager', 'kitchen', 'waiter']);
export const inviteCreateSchema = z.object({ role: staffRole, display_name: optionalText(60) });
export const staffUpdateSchema = z.object({ role: staffRole.optional(), display_name: optionalText(60) });
export const joinSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/, 'Invite codes are 8 letters and digits'),
  display_name: text(60).min(1, 'Add your name'),
});
export const clockSchema = z.object({ note: optionalText(200) });
export const shiftsQuerySchema = z.object({ from: isoInstant.optional(), to: isoInstant.optional(), staff_id: uuid('staff_id').optional() });
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  entity: z.enum(['orders', 'bills', 'menu_items', 'staff', 'stock_movements', 'cash_closings', 'coupons', 'restaurants']).optional(),
  before: z.coerce.number().int().min(1).optional(),
});

// ---------------------------------------------------------------------------
// SaaS platform + push (migration 0007)
// ---------------------------------------------------------------------------

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3 to 40 lowercase letters, numbers and dashes');

export const slugQuerySchema = z.object({ slug: z.string().trim().toLowerCase().max(60) });

export const createRestaurantSchema = z.object({
  name: text(80).min(2, 'Add your restaurant name'),
  slug: slugField,
  city: optionalText(60),
  phone: optionalText(30),
  owner_name: optionalText(60),
  tables: z.number().int().min(1, 'At least 1 table').max(100, 'Up to 100 tables to start; add more later'),
  sample_menu: z.boolean().optional(),
});

export const directoryQuerySchema = z.object({
  q: text(60).optional(),
  city: text(60).optional(),
});

const pushSubscription = z.object({
  endpoint: z
    .string()
    .trim()
    .url()
    .max(1000)
    .refine((u) => u.startsWith('https://'), 'Invalid push endpoint'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export const guestPushSchema = z
  .object({
    table_code: tableCodeSchema.optional(),
    restaurant_slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Unknown restaurant').optional(),
    guest_session_id: uuid('guest_session_id'),
    subscription: pushSubscription,
  })
  .refine((v) => Boolean(v.table_code || v.restaurant_slug), { message: 'Unknown restaurant', path: ['table_code'] });

export const staffPushSchema = z.object({ subscription: pushSubscription });
export const pushEndpointSchema = z.object({ endpoint: z.string().trim().url().max(1000) });

export const platformUpdateSchema = z.object({
  plan: z.enum(['starter', 'growth', 'premium']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  trial_ends_at: isoInstant.optional(),
  end_trial: z.boolean().optional(),
  listed: z.boolean().optional(),
});
