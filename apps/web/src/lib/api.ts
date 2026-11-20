/**
 * Typed client for the Express API. Every page and component goes through this file
 * so the API contract lives in exactly one place on the web side.
 *
 * In development the Next.js server proxies /api/* → http://localhost:4000 (next.config.ts),
 * so requests are same-origin. Set NEXT_PUBLIC_API_URL in production to call the API directly.
 */
import type {
  AddItemsInput,
  AnalyticsReport,
  AutomationRunResult,
  IntegrationEventRow,
  IntegrationSettings,
  IntegrationSettingsInput,
  LoyaltyProgram,
  LoyaltyReward,
  LoyaltyStatus,
  WhatsAppMessageRow,
  ApiError,
  AssistanceCall,
  BillingSummary,
  CallType,
  CreateCallInput,
  CustomerDetail,
  CustomerSegment,
  CustomerSummary,
  CustomersResponse,
  DashboardStats,
  DiningTable,
  FeedbackInput,
  FeedbackResponse,
  Lead,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  OrderWithItems,
  PaymentStatus,
  PlaceOrderInput,
  Restaurant,
  StaffSession,
  TableMenuResponse,
  UnsubscribeInfo,
  // Operations (0006)
  AuditEntry,
  BillDiscountInput,
  BillPreview,
  BillWithDetails,
  CashClosing,
  CashDaySummary,
  Coupon,
  DishCost,
  Expense,
  ExpenseBudget,
  ExpenseCategory,
  FloorResponse,
  GiftCard,
  GiftCardTransaction,
  HappyHour,
  Ingredient,
  IngredientUnit,
  OrderQuote,
  PnlReport,
  PosOrderInput,
  PurchaseOrder,
  QuoteInput,
  RecipeItem,
  Reservation,
  ReservationRequestInput,
  ReservationRequestResult,
  ReservationStatus,
  RestaurantPageResponse,
  SettleBillInput,
  Staff,
  StaffInvite,
  StaffMember,
  StaffRole,
  StaffShift,
  StockMovement,
  StockReason,
  Supplier,
  WaitlistEntry,
  WaitlistStatus,
  // SaaS platform (0007)
  CreateRestaurantInput,
  DirectoryResponse,
  PlatformOverview,
  PlatformRestaurant,
  PlatformRestaurantUpdate,
  PushSubscriptionJSON,
} from '@restaurant-os/shared';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  query?: Query;
  signal?: AbortSignal;
  formData?: FormData;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`, typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiRequestError(0, 'Cannot reach the server. Check your connection and that the API is running.');
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(res.status, err.error ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Public (guest) endpoints — no auth
// ---------------------------------------------------------------------------
export const publicApi = {
  /** Restaurant + table + full menu for a table code. */
  tableMenu: (code: string, signal?: AbortSignal) =>
    request<TableMenuResponse>(`/api/public/tables/${encodeURIComponent(code)}`, { signal }),

  placeOrder: (input: PlaceOrderInput) => request<OrderWithItems>('/api/public/orders', { body: input }),

  getOrder: (orderId: string, guestSessionId: string, signal?: AbortSignal) =>
    request<OrderWithItems>(`/api/public/orders/${orderId}`, { query: { session: guestSessionId }, signal }),

  /** All orders this guest placed at this table in the last 12 hours (newest first). */
  sessionOrders: (tableCode: string, guestSessionId: string, signal?: AbortSignal) =>
    request<OrderWithItems[]>('/api/public/orders', { query: { table: tableCode, session: guestSessionId }, signal }),

  /** Guest pressed "I have paid" after a UPI payment → payment_status becomes "claimed". */
  claimPayment: (orderId: string, guestSessionId: string) =>
    request<OrderWithItems>(`/api/public/orders/${orderId}/claim-payment`, { body: { guest_session_id: guestSessionId } }),

  /** Add dishes to an order that is still open (placed / accepted / preparing and unpaid). */
  addItems: (orderId: string, input: AddItemsInput) =>
    request<OrderWithItems>(`/api/public/orders/${orderId}/items`, { body: input }),

  /** 1–5 rating + optional comment, only once the order is served. Re-submitting replaces it. */
  submitFeedback: (orderId: string, input: FeedbackInput) =>
    request<OrderWithItems>(`/api/public/orders/${orderId}/feedback`, { body: input }),

  createCall: (input: CreateCallInput) => request<AssistanceCall>('/api/public/calls', { body: input }),

  /** This guest's requests from the last 4 hours, newest first; status flips to "attended" when staff respond. */
  sessionCalls: (tableCode: string, guestSessionId: string, signal?: AbortSignal) =>
    request<AssistanceCall[]>('/api/public/calls', { query: { table: tableCode, session: guestSessionId }, signal }),

  submitLead: (input: {
    name: string;
    email: string;
    phone?: string;
    restaurant_name?: string;
    message?: string;
    city?: string;
    table_count?: number;
    plan_interest?: 'demo' | 'founding_partner' | 'starter' | 'growth' | 'premium';
  }) => request<Lead>('/api/public/leads', { body: input }),

  /** The guest's loyalty card at this table (Premium restaurants; `enabled: false` otherwise). */
  loyalty: (tableCode: string, guestSessionId: string, signal?: AbortSignal) =>
    request<LoyaltyStatus>('/api/public/loyalty', { query: { table: tableCode, session: guestSessionId }, signal }),

  /** Unsubscribe page: who is this link for (masked phone) and are they still subscribed. */
  unsubscribeInfo: (token: string) => request<UnsubscribeInfo>(`/api/public/unsubscribe/${encodeURIComponent(token)}`),
  unsubscribe: (token: string) => request<UnsubscribeInfo>(`/api/public/unsubscribe/${encodeURIComponent(token)}`, { method: 'POST' }),

  // ----- Restaurant page: online takeaway + table booking (0006) -----
  restaurantPage: (slug: string, signal?: AbortSignal) =>
    request<RestaurantPageResponse>(`/api/public/restaurants/${encodeURIComponent(slug)}`, { signal }),
  /** Live cart price: happy hour + coupon check (coupon_error explains why a code does not apply). */
  quote: (input: QuoteInput, signal?: AbortSignal) => request<OrderQuote>('/api/public/quote', { body: input, signal }),
  /** This phone's takeaway orders at the restaurant (last 3 days, newest first). */
  takeawayOrders: (slug: string, guestSessionId: string, signal?: AbortSignal) =>
    request<OrderWithItems[]>('/api/public/takeaway-orders', { query: { restaurant: slug, session: guestSessionId }, signal }),
  requestReservation: (input: ReservationRequestInput) => request<ReservationRequestResult>('/api/public/reservations', { body: input }),

  // ----- Notifications + SaaS (0007) -----
  /** VAPID public key; `enabled: false` when this server has no push keys. */
  pushConfig: () => request<{ enabled: boolean; publicKey: string | null }>('/api/public/push/config'),
  /** This phone wants order updates for its guest session (table code for dine-in, slug for takeaway). */
  guestPushSubscribe: (body: { table_code?: string; restaurant_slug?: string; guest_session_id: string; subscription: PushSubscriptionJSON }) =>
    request<{ ok: true }>('/api/public/push/subscribe', { body }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: true }>('/api/public/push/unsubscribe', { body: { endpoint } }),
  /** Restaurants listed in the public directory. */
  directory: (filter: { q?: string; city?: string } = {}, signal?: AbortSignal) =>
    request<DirectoryResponse>('/api/public/directory', { query: filter, signal }),
  slugAvailable: (slug: string, signal?: AbortSignal) =>
    request<{ slug: string; available: boolean }>('/api/public/slug-available', { query: { slug }, signal }),
};

// ---------------------------------------------------------------------------
// Account (signed in, not necessarily staff yet) — self-signup
// ---------------------------------------------------------------------------
export const accountApi = {
  /** Creates the restaurant (14-day trial) with this account as its owner. */
  createRestaurant: (token: string, body: CreateRestaurantInput) => request<Restaurant>('/api/account/restaurant', { token, body }),
};

// ---------------------------------------------------------------------------
// Platform console (Restaurant OS team only; rows in public.platform_admins)
// ---------------------------------------------------------------------------
export const platformApi = {
  me: (token: string) => request<{ admin: boolean; email: string | null }>('/api/platform/me', { token }),
  overview: (token: string) => request<PlatformOverview>('/api/platform/overview', { token }),
  restaurants: (token: string) => request<PlatformRestaurant[]>('/api/platform/restaurants', { token }),
  updateRestaurant: (token: string, id: string, body: PlatformRestaurantUpdate) =>
    request<Restaurant>(`/api/platform/restaurants/${id}`, { token, method: 'PATCH', body }),
  leads: (token: string) => request<Lead[]>('/api/platform/leads', { token }),
};

// ---------------------------------------------------------------------------
// Admin endpoints — require the staff access token
// ---------------------------------------------------------------------------
export type OrdersFilter = {
  /** 'active' = placed/accepted/preparing/ready, 'past' = served/cancelled, 'all' */
  scope?: 'active' | 'past' | 'all';
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  table_id?: string;
  q?: string;
  /** ISO instant: only orders placed at or after it. */
  since?: string;
  /** ISO instant: only orders placed before it. */
  until?: string;
  /** Newest first, at most 300. */
  limit?: number;
};

export const adminApi = {
  me: (token: string) => request<StaffSession>('/api/admin/me', { token }),

  stats: (token: string) => request<DashboardStats>('/api/admin/stats', { token }),

  // Orders
  orders: (token: string, filter: OrdersFilter = {}) =>
    request<OrderWithItems[]>('/api/admin/orders', { token, query: filter }),
  order: (token: string, id: string) => request<OrderWithItems>(`/api/admin/orders/${id}`, { token }),
  setOrderStatus: (token: string, id: string, status: OrderStatus) =>
    request<OrderWithItems>(`/api/admin/orders/${id}/status`, { token, method: 'PATCH', body: { status } }),
  setPaymentStatus: (token: string, id: string, payment_status: PaymentStatus) =>
    request<OrderWithItems>(`/api/admin/orders/${id}/payment`, { token, method: 'PATCH', body: { payment_status } }),

  // Billing: totals over every matching order (the orders list is capped at 300 rows).
  billingSummary: (token: string, since?: string) =>
    request<BillingSummary>('/api/admin/billing/summary', { token, query: { since } }),

  // Assistance calls
  calls: (token: string, status: 'open' | 'attended' | 'all' = 'open') =>
    request<AssistanceCall[]>('/api/admin/calls', { token, query: { status } }),
  attendCall: (token: string, id: string) =>
    request<AssistanceCall>(`/api/admin/calls/${id}/attend`, { token, method: 'PATCH' }),

  // Menu
  categories: (token: string) => request<MenuCategory[]>('/api/admin/menu/categories', { token }),
  createCategory: (token: string, body: Partial<MenuCategory> & { name: string }) =>
    request<MenuCategory>('/api/admin/menu/categories', { token, body }),
  updateCategory: (token: string, id: string, body: Partial<MenuCategory>) =>
    request<MenuCategory>(`/api/admin/menu/categories/${id}`, { token, method: 'PATCH', body }),
  deleteCategory: (token: string, id: string) =>
    request<void>(`/api/admin/menu/categories/${id}`, { token, method: 'DELETE' }),

  items: (token: string) => request<MenuItem[]>('/api/admin/menu/items', { token }),
  createItem: (token: string, body: Partial<MenuItem> & { name: string; price: number; category_id: string }) =>
    request<MenuItem>('/api/admin/menu/items', { token, body }),
  updateItem: (token: string, id: string, body: Partial<MenuItem>) =>
    request<MenuItem>(`/api/admin/menu/items/${id}`, { token, method: 'PATCH', body }),
  deleteItem: (token: string, id: string) => request<void>(`/api/admin/menu/items/${id}`, { token, method: 'DELETE' }),
  /** Upload a dish photo. Returns the public URL. */
  uploadImage: (token: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ url: string }>('/api/admin/menu/upload', { token, formData: fd });
  },

  // Tables
  tables: (token: string) => request<DiningTable[]>('/api/admin/tables', { token }),
  createTable: (token: string, body: { label: string; area?: string | null; seats?: number; code?: string }) =>
    request<DiningTable>('/api/admin/tables', { token, body }),
  updateTable: (token: string, id: string, body: Partial<DiningTable>) =>
    request<DiningTable>(`/api/admin/tables/${id}`, { token, method: 'PATCH', body }),
  /** Removes the table, or deactivates it (and returns the row) when it has order history. */
  deleteTable: (token: string, id: string) => request<DiningTable | undefined>(`/api/admin/tables/${id}`, { token, method: 'DELETE' }),
  /** Regenerates the table's code (old QR stickers stop working). */
  resetTableCode: (token: string, id: string) =>
    request<DiningTable>(`/api/admin/tables/${id}/reset-code`, { token, method: 'POST' }),
  /** URL of the QR image (SVG) for a table; opens/prints directly. */
  tableQrUrl: (id: string, format: 'svg' | 'png' = 'svg') => `${BASE}/api/admin/tables/${id}/qr.${format}`,

  // Restaurant settings (`plan` is read-only: the API ignores it)
  restaurant: (token: string) => request<Restaurant>('/api/admin/restaurant', { token }),
  updateRestaurant: (token: string, body: Partial<Restaurant>) =>
    request<Restaurant>('/api/admin/restaurant', { token, method: 'PATCH', body }),

  // Customers (CRM) — Growth and Premium; 403 with an upgrade message on Starter
  customers: (token: string, filter: { segment?: CustomerSegment; q?: string } = {}) =>
    request<CustomersResponse>('/api/admin/customers', { token, query: filter }),
  customer: (token: string, id: string) => request<CustomerDetail>(`/api/admin/customers/${id}`, { token }),
  /** Record a customer's request to stop WhatsApp offers. Staff can never opt someone in. */
  revokeConsent: (token: string, id: string) =>
    request<CustomerSummary>(`/api/admin/customers/${id}/revoke-consent`, { token, method: 'POST' }),
  /** Download URL for a CSV of customers (use as a plain link; the token travels in the query). */
  customersCsvUrl: (token: string, segment: CustomerSegment = 'all') =>
    `${BASE}/api/admin/customers/export.csv?segment=${encodeURIComponent(segment)}&token=${encodeURIComponent(token)}`,

  // Feedback — Growth and Premium
  feedback: (token: string) => request<FeedbackResponse>('/api/admin/feedback', { token }),

  // ----- Premium (403 with an upgrade message on other plans) -----

  // Loyalty rewards
  loyalty: (token: string) => request<{ program: LoyaltyProgram; stats: { active: number; redeemed: number } }>('/api/admin/loyalty', { token }),
  saveLoyalty: (token: string, body: Partial<Pick<LoyaltyProgram, 'enabled' | 'visits_required' | 'reward_text' | 'reward_expiry_days'>>) =>
    request<LoyaltyProgram>('/api/admin/loyalty', { token, method: 'PUT', body }),
  rewards: (token: string, status: 'active' | 'redeemed' | 'expired' | 'all' = 'active') =>
    request<LoyaltyReward[]>('/api/admin/loyalty/rewards', { token, query: { status } }),
  redeemReward: (token: string, id: string) => request<LoyaltyReward>(`/api/admin/loyalty/rewards/${id}/redeem`, { token, method: 'POST' }),

  // Advanced analytics (ISO instants; default = last 30 days)
  analytics: (token: string, range: { from?: string; to?: string } = {}) => request<AnalyticsReport>('/api/admin/analytics', { token, query: range }),

  // Integrations: order webhooks (POS / middleware) + WhatsApp Cloud API. Owners and managers only.
  integrations: (token: string) => request<IntegrationSettings>('/api/admin/integrations', { token }),
  saveIntegrations: (token: string, body: IntegrationSettingsInput) =>
    request<IntegrationSettings>('/api/admin/integrations', { token, method: 'PUT', body }),
  rotateWebhookSecret: (token: string) => request<IntegrationSettings>('/api/admin/integrations/webhook/rotate-secret', { token, method: 'POST' }),
  testWebhook: (token: string) =>
    request<{ ok: boolean; status: number | null; error: string | null }>('/api/admin/integrations/webhook/test', { token, method: 'POST' }),
  webhookEvents: (token: string) => request<IntegrationEventRow[]>('/api/admin/integrations/events', { token }),
  /** Deliver pending webhooks + send due WhatsApp journeys now. The open dashboard calls this. */
  runAutomation: (token: string) => request<AutomationRunResult>('/api/admin/automation/run', { token, method: 'POST' }),
  whatsappMessages: (token: string) => request<WhatsAppMessageRow[]>('/api/admin/whatsapp/messages', { token }),
  whatsappTest: (token: string, body: { to: string; kind?: 'welcome' | 'winback' | 'reward' | 'offer' }) =>
    request<{ ok: boolean; wamid: string | null; error: string | null; to: string }>('/api/admin/whatsapp/test', { token, body }),
  /** Sends the offer template to opted-in customers in the segment (max 200). */
  whatsappBroadcast: (token: string, body: { segment?: CustomerSegment; message: string }) =>
    request<{ audience: number; sent: number; failed: number; errors: string[] }>('/api/admin/whatsapp/broadcast', { token, body }),

  // ----- Counter POS, bills, floor (all plans) -----
  /** Staff order: goes straight to the kitchen as "accepted". */
  posOrder: (token: string, body: PosOrderInput) => request<OrderWithItems>('/api/admin/pos/orders', { token, body }),
  posQuote: (token: string, items: PosOrderInput['items']) => request<OrderQuote>('/api/admin/pos/quote', { token, body: { items } }),
  billPreview: (token: string, body: BillDiscountInput) => request<BillPreview>('/api/admin/bills/preview', { token, body }),
  /** Settle one or more unpaid orders as one bill: discount, tip and split payments (must add up to total + tip). */
  settleBill: (token: string, body: SettleBillInput) => request<BillWithDetails>('/api/admin/bills', { token, body }),
  bills: (token: string, filter: { since?: string; until?: string; status?: 'settled' | 'refunded' | 'all'; q?: string } = {}) =>
    request<BillWithDetails[]>('/api/admin/bills', { token, query: filter }),
  bill: (token: string, id: string) => request<BillWithDetails>(`/api/admin/bills/${id}`, { token }),
  refundBill: (token: string, id: string, reason: string) =>
    request<BillWithDetails>(`/api/admin/bills/${id}/refund`, { token, body: { reason } }),
  floor: (token: string) => request<FloorResponse>('/api/admin/floor', { token }),
  /** Move every open order of a table to another table (merges when the target already has orders). */
  transferTable: (token: string, fromTableId: string, toTableId: string) =>
    request<{ moved: number }>(`/api/admin/tables/${fromTableId}/transfer`, { token, body: { to_table_id: toTableId } }),

  // ----- Reservations & waitlist (Growth+) -----
  reservations: (token: string, filter: { from?: string; to?: string; status?: ReservationStatus | 'upcoming' | 'all' } = {}) =>
    request<Reservation[]>('/api/admin/reservations', { token, query: filter }),
  createReservation: (
    token: string,
    body: { customer_name: string; phone: string; party_size: number; reserved_for: string; duration_minutes?: number; table_id?: string | null; source?: 'staff' | 'phone'; note?: string | null },
  ) => request<Reservation>('/api/admin/reservations', { token, body }),
  updateReservation: (token: string, id: string, body: Partial<Pick<Reservation, 'customer_name' | 'phone' | 'party_size' | 'reserved_for' | 'duration_minutes' | 'table_id' | 'status' | 'note'>>) =>
    request<Reservation>(`/api/admin/reservations/${id}`, { token, method: 'PATCH', body }),
  deleteReservation: (token: string, id: string) => request<void>(`/api/admin/reservations/${id}`, { token, method: 'DELETE' }),
  waitlist: (token: string, status: 'active' | 'all' = 'active') => request<WaitlistEntry[]>('/api/admin/waitlist', { token, query: { status } }),
  addToWaitlist: (token: string, body: { customer_name: string; phone?: string; party_size: number; quoted_minutes?: number | null; note?: string | null }) =>
    request<WaitlistEntry>('/api/admin/waitlist', { token, body }),
  updateWaitlist: (token: string, id: string, body: { status?: WaitlistStatus; table_id?: string | null; quoted_minutes?: number | null; note?: string | null }) =>
    request<WaitlistEntry>(`/api/admin/waitlist/${id}`, { token, method: 'PATCH', body }),

  // ----- Promotions (Growth+) -----
  coupons: (token: string) => request<Coupon[]>('/api/admin/coupons', { token }),
  createCoupon: (token: string, body: Partial<Coupon> & Pick<Coupon, 'code' | 'kind' | 'value'>) => request<Coupon>('/api/admin/coupons', { token, body }),
  updateCoupon: (token: string, id: string, body: Partial<Coupon>) => request<Coupon>(`/api/admin/coupons/${id}`, { token, method: 'PATCH', body }),
  deleteCoupon: (token: string, id: string) => request<void>(`/api/admin/coupons/${id}`, { token, method: 'DELETE' }),
  happyHours: (token: string) => request<HappyHour[]>('/api/admin/happy-hours', { token }),
  createHappyHour: (token: string, body: Pick<HappyHour, 'name' | 'days' | 'start_time' | 'end_time' | 'percent'> & { category_ids?: string[] | null; is_active?: boolean }) =>
    request<HappyHour>('/api/admin/happy-hours', { token, body }),
  updateHappyHour: (token: string, id: string, body: Partial<HappyHour>) => request<HappyHour>(`/api/admin/happy-hours/${id}`, { token, method: 'PATCH', body }),
  deleteHappyHour: (token: string, id: string) => request<void>(`/api/admin/happy-hours/${id}`, { token, method: 'DELETE' }),
  giftCards: (token: string, q?: string) => request<GiftCard[]>('/api/admin/gift-cards', { token, query: { q } }),
  /** Leave `code` empty to generate one like GIFT-7KQ2-M9XD. */
  createGiftCard: (token: string, body: { code?: string; initial_value: number; issued_to_name?: string | null; issued_to_phone?: string; expires_at?: string | null }) =>
    request<GiftCard>('/api/admin/gift-cards', { token, body }),
  updateGiftCard: (token: string, id: string, body: { is_active?: boolean; expires_at?: string | null; issued_to_name?: string | null }) =>
    request<GiftCard>(`/api/admin/gift-cards/${id}`, { token, method: 'PATCH', body }),
  giftCardTransactions: (token: string, id: string) => request<GiftCardTransaction[]>(`/api/admin/gift-cards/${id}/transactions`, { token }),

  // ----- Inventory & purchasing (Premium) -----
  ingredients: (token: string) => request<Ingredient[]>('/api/admin/inventory/ingredients', { token }),
  createIngredient: (token: string, body: { name: string; unit: IngredientUnit; low_stock_threshold?: number; avg_cost?: number; opening_qty?: number }) =>
    request<Ingredient>('/api/admin/inventory/ingredients', { token, body }),
  updateIngredient: (token: string, id: string, body: Partial<Pick<Ingredient, 'name' | 'unit' | 'low_stock_threshold' | 'avg_cost' | 'is_active'>>) =>
    request<Ingredient>(`/api/admin/inventory/ingredients/${id}`, { token, method: 'PATCH', body }),
  /** Deletes, or hides (returns the row) when the ingredient is on a purchase order. */
  deleteIngredient: (token: string, id: string) => request<Ingredient | undefined>(`/api/admin/inventory/ingredients/${id}`, { token, method: 'DELETE' }),
  /** waste / opening: quantity used or added. adjustment: the counted stock level (the difference is recorded). */
  recordStock: (token: string, id: string, body: { reason: Extract<StockReason, 'waste' | 'adjustment' | 'opening'>; quantity: number; unit_cost?: number; note?: string }) =>
    request<StockMovement>(`/api/admin/inventory/ingredients/${id}/movements`, { token, body }),
  stockMovements: (token: string, filter: { ingredient_id?: string; reason?: StockReason; since?: string } = {}) =>
    request<StockMovement[]>('/api/admin/inventory/movements', { token, query: filter }),
  recipes: (token: string) => request<RecipeItem[]>('/api/admin/inventory/recipes', { token }),
  saveRecipe: (token: string, menuItemId: string, lines: Array<{ ingredient_id: string; quantity: number }>) =>
    request<RecipeItem[]>(`/api/admin/inventory/recipes/${menuItemId}`, { token, method: 'PUT', body: { lines } }),
  dishCosts: (token: string) => request<DishCost[]>('/api/admin/inventory/dish-costs', { token }),
  suppliers: (token: string) => request<Supplier[]>('/api/admin/inventory/suppliers', { token }),
  createSupplier: (token: string, body: Partial<Supplier> & { name: string }) => request<Supplier>('/api/admin/inventory/suppliers', { token, body }),
  updateSupplier: (token: string, id: string, body: Partial<Supplier>) => request<Supplier>(`/api/admin/inventory/suppliers/${id}`, { token, method: 'PATCH', body }),
  deleteSupplier: (token: string, id: string) => request<void>(`/api/admin/inventory/suppliers/${id}`, { token, method: 'DELETE' }),
  purchaseOrders: (token: string, status: 'open' | 'all' | PurchaseOrder['status'] = 'all') =>
    request<PurchaseOrder[]>('/api/admin/inventory/purchase-orders', { token, query: { status } }),
  createPurchaseOrder: (
    token: string,
    body: { supplier_id?: string | null; expected_on?: string | null; note?: string | null; place?: boolean; items: Array<{ ingredient_id: string; quantity: number; unit_cost: number }> },
  ) => request<PurchaseOrder>('/api/admin/inventory/purchase-orders', { token, body }),
  updatePurchaseOrder: (token: string, id: string, body: { status?: 'ordered' | 'cancelled'; expected_on?: string | null; note?: string | null; supplier_id?: string | null }) =>
    request<PurchaseOrder>(`/api/admin/inventory/purchase-orders/${id}`, { token, method: 'PATCH', body }),
  receivePurchaseOrder: (token: string, id: string, lines: Array<{ item_id: string; received_qty: number; unit_cost?: number }>) =>
    request<PurchaseOrder>(`/api/admin/inventory/purchase-orders/${id}/receive`, { token, body: { lines } }),

  // ----- Finance: expenses + P&L (Growth+), cash close (all plans). Owners and managers. -----
  expenses: (token: string, filter: { from?: string; to?: string; category?: ExpenseCategory } = {}) =>
    request<Expense[]>('/api/admin/finance/expenses', { token, query: filter }),
  createExpense: (token: string, body: Pick<Expense, 'category' | 'amount'> & Partial<Pick<Expense, 'spent_on' | 'paid_via' | 'vendor' | 'note'>>) =>
    request<Expense>('/api/admin/finance/expenses', { token, body }),
  updateExpense: (token: string, id: string, body: Partial<Expense>) => request<Expense>(`/api/admin/finance/expenses/${id}`, { token, method: 'PATCH', body }),
  deleteExpense: (token: string, id: string) => request<void>(`/api/admin/finance/expenses/${id}`, { token, method: 'DELETE' }),
  budgets: (token: string, month?: string) =>
    request<{ month: string; budgets: ExpenseBudget[]; spent: Partial<Record<ExpenseCategory, number>> }>('/api/admin/finance/budgets', { token, query: { month } }),
  /** month = "2026-10"; an amount of 0 removes that budget. */
  saveBudgets: (token: string, month: string, budgets: Array<{ category: ExpenseCategory; amount: number }>) =>
    request<ExpenseBudget[]>('/api/admin/finance/budgets', { token, method: 'PUT', body: { month, budgets } }),
  cashDay: (token: string, date?: string) => request<CashDaySummary>('/api/admin/finance/cash-day', { token, query: { date } }),
  closeCashDay: (token: string, body: { business_date: string; opening_float?: number; counted_cash: number; note?: string }) =>
    request<CashClosing>('/api/admin/finance/cash-close', { token, body }),
  cashClosings: (token: string) => request<CashClosing[]>('/api/admin/finance/cash-closings', { token }),
  pnl: (token: string, range: { from?: string; to?: string } = {}) => request<PnlReport>('/api/admin/finance/pnl', { token, query: range }),

  // ----- Staff, attendance, activity log, backup -----
  staff: (token: string) => request<StaffMember[]>('/api/admin/staff', { token }),
  updateStaff: (token: string, id: string, body: { role?: StaffRole; display_name?: string }) =>
    request<Staff>(`/api/admin/staff/${id}`, { token, method: 'PATCH', body }),
  removeStaff: (token: string, id: string) => request<void>(`/api/admin/staff/${id}`, { token, method: 'DELETE' }),
  staffInvites: (token: string) => request<StaffInvite[]>('/api/admin/staff-invites', { token }),
  createStaffInvite: (token: string, body: { role: StaffRole; display_name?: string }) => request<StaffInvite>('/api/admin/staff-invites', { token, body }),
  deleteStaffInvite: (token: string, id: string) => request<void>(`/api/admin/staff-invites/${id}`, { token, method: 'DELETE' }),
  /** A signed-in account that is not staff yet joins with an invite code. */
  joinRestaurant: (token: string, body: { code: string; display_name: string }) => request<Staff>('/api/admin/join', { token, body }),
  myShift: (token: string) => request<{ open_shift: StaffShift | null }>('/api/admin/attendance/me', { token }),
  clockIn: (token: string, note?: string) => request<StaffShift>('/api/admin/attendance/clock-in', { token, body: { note } }),
  clockOut: (token: string, note?: string) => request<StaffShift>('/api/admin/attendance/clock-out', { token, body: { note } }),
  attendance: (token: string, filter: { from?: string; to?: string; staff_id?: string } = {}) =>
    request<StaffShift[]>('/api/admin/attendance', { token, query: filter }),
  audit: (token: string, filter: { limit?: number; entity?: string; before?: number } = {}) => request<AuditEntry[]>('/api/admin/audit', { token, query: filter }),
  /** Download links (the token travels in the query, like the customers CSV). */
  backupUrl: (token: string) => `${BASE}/api/admin/export.json?token=${encodeURIComponent(token)}`,
  // ----- Staff device alerts (Web Push) -----
  staffPushSubscribe: (token: string, subscription: PushSubscriptionJSON) => request<{ ok: true }>('/api/admin/push/subscribe', { token, body: { subscription } }),
  staffPushUnsubscribe: (token: string, endpoint: string) => request<{ ok: true }>('/api/admin/push/unsubscribe', { token, body: { endpoint } }),
  /** Sends a test alert to every device of the signed-in staff member. */
  staffPushTest: (token: string) => request<{ devices: number; delivered: number }>('/api/admin/push/test', { token, method: 'POST' }),

  ordersCsvUrl: (token: string, range: { from?: string; to?: string } = {}) => {
    const q = new URLSearchParams({ token });
    if (range.from) q.set('from', range.from);
    if (range.to) q.set('to', range.to);
    return `${BASE}/api/admin/export/orders.csv?${q.toString()}`;
  },
};

export type { CallType };
