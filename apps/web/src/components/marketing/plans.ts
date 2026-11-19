import { FOUNDING_OFFER, PLAN_IDS, PLAN_INFO, formatINR, type PlanId } from '@restaurant-os/shared';
import type { FaqItem } from './faq-data';

export type { PlanId };
export type Billing = 'monthly' | 'yearly';

/** Every price on the site carries this note. */
export const PRICE_NOTE = 'excl. GST';
export const PRICE_FOOTNOTE = 'All prices are per outlet, in Indian rupees, and exclude GST and third-party charges (WhatsApp conversation fees charged by Meta, payment gateway charges).';

export interface PlanBullet {
  text: string;
  /** Not built yet: shown with a "Rolling out" tag, never sold as available. */
  rollingOut?: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Who it suits (from PLAN_INFO.idealFor). */
  idealFor: string;
  /** Rupees per month per outlet, excl. GST. */
  monthly: number;
  /** One-time setup in rupees, excl. GST. */
  setup: number;
  /** Rupees per year, when offered publicly. */
  yearly: number | null;
  highlight?: boolean;
  badge?: string;
  /** "Everything in Starter, plus" line above the bullets. */
  inherits?: string;
  cta: { label: string; href: string };
  bullets: PlanBullet[];
}

const BULLETS: Record<PlanId, { inherits?: string; bullets: PlanBullet[] }> = {
  starter: {
    bullets: [
      { text: 'QR menu and table ordering' },
      { text: 'Order dashboard with audible and spoken alerts, KOT printing' },
      { text: 'Counter POS for dine-in and takeaway, with a live floor view' },
      { text: 'Split payments (cash, UPI, card, gift card), tips and refunds' },
      { text: 'Numbered GST receipts (CGST + SGST, HSN / SAC) and daily cash close' },
      { text: 'Customer display with a UPI QR for the exact amount' },
      { text: 'Staff invites, roles, timesheets and an activity log' },
      { text: 'Menu in Hindi and English, serving windows, full data export' },
    ],
  },
  growth: {
    inherits: 'Everything in Starter, plus',
    bullets: [
      { text: 'Customer CRM and analytics' },
      { text: 'WhatsApp consent and offers to opted-in guests' },
      { text: 'Feedback with your Google review link' },
      { text: 'Table reservations and a walk-in waitlist' },
      { text: 'Online takeaway with scheduled pickup from your own page' },
      { text: 'Coupons, happy hours and gift cards' },
      { text: 'Expenses, monthly budgets and profit & loss' },
      { text: 'Games, your story video, all guest requests, add to an open order' },
    ],
  },
  premium: {
    inherits: 'Everything in Growth, plus',
    bullets: [
      { text: 'Inventory: recipes, automatic stock deduction, low-stock alerts' },
      { text: 'Food cost per dish, suppliers, purchase orders, waste log and stock counts' },
      { text: 'Advanced analytics and reports, with CSV export' },
      { text: 'Loyalty rewards that unlock every Nth visit' },
      { text: 'Automated WhatsApp messages via your own Meta account (Meta’s fees separate)' },
      { text: 'POS / webhook integration' },
      { text: 'Priority support and onboarding for multiple outlets' },
    ],
  },
};

const CTA: Record<PlanId, Plan['cta']> = {
  starter: { label: 'Book a demo', href: '/contact?plan=starter' },
  growth: { label: 'Start with Growth', href: '/contact?plan=growth' },
  premium: { label: 'Talk to us', href: '/contact?plan=premium' },
};

/** The three plans, priced from PLAN_INFO in @restaurant-os/shared (single source of truth). */
export const PLANS: Plan[] = PLAN_IDS.map((id) => {
  const info = PLAN_INFO[id];
  return {
    id,
    name: info.name,
    idealFor: info.idealFor,
    monthly: info.monthly,
    setup: info.setup,
    yearly: info.yearly,
    highlight: id === 'growth',
    badge: id === 'growth' ? 'Recommended' : undefined,
    cta: CTA[id],
    ...BULLETS[id],
  };
});

/* ----------------------------------------------------------------------------
   Founding restaurant partner offer
---------------------------------------------------------------------------- */
export const FOUNDING = {
  ...FOUNDING_OFFER,
  planName: PLAN_INFO[FOUNDING_OFFER.plan].name,
  standardMonthly: PLAN_INFO[FOUNDING_OFFER.plan].monthly,
  standardSetup: PLAN_INFO[FOUNDING_OFFER.plan].setup,
  href: '/contact?plan=founding_partner',
};

/* ----------------------------------------------------------------------------
   Comparison table
---------------------------------------------------------------------------- */
/** `{ rollingOut: true }` renders a "Rolling out" tag; use it only for something not built yet. */
export type CellValue = boolean | string | { rollingOut: true };

export interface ComparisonRow {
  label: string;
  cells: Record<PlanId, CellValue>;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

const all = (v: CellValue = true): Record<PlanId, CellValue> => ({ starter: v, growth: v, premium: v });
const growthUp: Record<PlanId, CellValue> = { starter: false, growth: true, premium: true };
const premiumOnly: Record<PlanId, CellValue> = { starter: false, growth: false, premium: true };

export const COMPARISON: ComparisonGroup[] = [
  {
    title: 'Ordering and service',
    rows: [
      { label: 'QR menu and table ordering', cells: all() },
      { label: 'Duplicate-order protection', cells: all() },
      { label: 'Guest requests', cells: { starter: 'Waiter + bill', growth: 'All five', premium: 'All five' } },
      { label: 'Request acknowledged on the guest’s phone', cells: all() },
      { label: 'Add dishes to an open order', cells: growthUp },
      { label: 'Menu in Hindi and English (EN / हिं switch)', cells: all() },
      { label: 'Menu serving windows (e.g. breakfast till 11 AM)', cells: all() },
    ],
  },
  {
    title: 'Counter, kitchen and floor',
    rows: [
      { label: 'Order dashboard with audible + spoken alerts', cells: all() },
      { label: 'Kitchen board and status flow', cells: all() },
      { label: 'KOT printing (through the browser)', cells: all() },
      { label: 'Counter POS for dine-in and takeaway orders', cells: all() },
      { label: 'Live floor view of every table', cells: all() },
      { label: 'Move or merge tables', cells: all() },
    ],
  },
  {
    title: 'Billing and payments',
    rows: [
      { label: 'Cash and UPI payment options', cells: all() },
      { label: 'One bill for a whole table', cells: all() },
      { label: 'Split payment: cash, UPI, card, gift card', cells: all() },
      { label: 'Tips, manager-only discounts, refunds with a reason', cells: all() },
      { label: 'Numbered GST receipts (CGST + SGST, GSTIN, HSN / SAC)', cells: all() },
      { label: 'Customer-facing display with a UPI QR for the exact amount', cells: all() },
      { label: 'Daily cash close: expected vs counted, variance', cells: all() },
    ],
  },
  {
    title: 'Bookings, takeaway and promotions',
    rows: [
      { label: 'Table reservations: online booking page + staff bookings', cells: growthUp },
      { label: 'Walk-in waitlist', cells: growthUp },
      { label: 'Online takeaway / click and collect with scheduled pickup', cells: growthUp },
      { label: 'Coupons', cells: growthUp },
      { label: 'Happy hours (automatic, time-based, by category)', cells: growthUp },
      { label: 'Gift cards', cells: growthUp },
    ],
  },
  {
    title: 'Customers and retention',
    rows: [
      { label: 'Optional mobile number at checkout', cells: growthUp },
      { label: 'Customer CRM: visits, spend, rating', cells: growthUp },
      { label: 'Segments (repeat, new, lapsed, opted in) and CSV export', cells: growthUp },
      { label: 'WhatsApp consent and offers to opted-in guests', cells: growthUp },
      { label: 'Feedback with your Google review link', cells: growthUp },
      { label: 'Customer analytics', cells: growthUp },
      { label: 'Advanced analytics: trends, busiest hours, service speed, CSV export', cells: premiumOnly },
      { label: 'Loyalty rewards every Nth visit, redeemed in the dashboard', cells: premiumOnly },
      { label: 'Automated WhatsApp messages (your own Meta account, opted-in guests only)', cells: premiumOnly },
    ],
  },
  {
    title: 'While guests wait',
    rows: [
      { label: 'Live order status', cells: all() },
      { label: 'Games: tic-tac-toe, memory, reaction and Ludo (switch off any time)', cells: growthUp },
      { label: 'Your restaurant story or video', cells: growthUp },
    ],
  },
  {
    title: 'Inventory and accounts',
    rows: [
      { label: 'Expenses, monthly budgets and profit & loss', cells: growthUp },
      { label: 'Ingredients, recipes and automatic stock deduction', cells: premiumOnly },
      { label: 'Low-stock alerts and food cost % per dish', cells: premiumOnly },
      { label: 'Suppliers and purchase orders (part / full receiving, weighted-average cost)', cells: premiumOnly },
      { label: 'Waste log and stock counts', cells: premiumOnly },
    ],
  },
  {
    title: 'Team and data',
    rows: [
      { label: 'Staff invites by code, roles', cells: all() },
      { label: 'Clock in / out timesheets', cells: all() },
      { label: 'Activity log: refunds, discounts, cancellations, price and stock changes', cells: all() },
      { label: 'Full data export (JSON backup + orders CSV)', cells: all() },
    ],
  },
  {
    title: 'Setup and support',
    rows: [
      { label: 'One-time setup (excl. GST)', cells: { starter: formatINR(PLAN_INFO.starter.setup), growth: formatINR(PLAN_INFO.growth.setup), premium: formatINR(PLAN_INFO.premium.setup) } },
      { label: 'Menu setup, table QR codes, staff training, guided pilot', cells: all() },
      { label: 'Onboarding for multiple outlets', cells: premiumOnly },
      { label: 'POS / webhook integration (signed order events to any URL)', cells: premiumOnly },
      { label: 'Support', cells: { starter: 'Standard', growth: 'Standard', premium: 'Priority' } },
    ],
  },
];

/* ----------------------------------------------------------------------------
   What the subscription covers
---------------------------------------------------------------------------- */
export const COVERED: string[] = [
  'Secure cloud hosting',
  'Database and backups',
  'Product updates',
  'Menu and QR management',
  'Order dashboard and staff access',
  'Support',
  'Bug fixes and monitoring',
  'POS, billing, CRM, inventory and reports, as per your plan',
  'Full data export whenever you want it',
  'Security updates',
];

export const BILLED_SEPARATELY: string[] = [
  'Large menu-entry projects',
  'Printed QR stands',
  'Professional video production',
  'Custom integrations',
  'Hardware: tablets, receipt printers, customer display screens',
  'WhatsApp conversation fees charged by Meta',
  'Payment gateway charges',
  'GST',
];

/* ----------------------------------------------------------------------------
   Pricing FAQ
---------------------------------------------------------------------------- */
const g = PLAN_INFO.growth;

export const PRICING_FAQ: FaqItem[] = [
  {
    q: 'Do you take a commission on orders?',
    a: 'No. There is no per-order commission on any plan. UPI payments go straight from the guest’s app to your UPI ID, and counter payments never touch us. You pay the plan price per outlet, plus GST.',
  },
  {
    q: 'What does the one-time setup fee cover?',
    a: 'Menu setup from the menu you send us, QR codes for your tables, training for your staff, and the guided pilot. Very large menu-entry projects, printed QR stands and professional video production are quoted separately.',
  },
  {
    q: 'How does the pilot work?',
    a: `We load your menu, set up your tables, train the team and check in during real services. At the end you look at what actually happened, such as how many tables ordered by QR and how many guests left a number or a rating, and then decide. For founding partners, the ${FOUNDING_OFFER.pilotDays}-day guided pilot is credited toward the first subscription.`,
  },
  {
    q: 'Can I switch plans?',
    a: 'Yes. Tell us and we move you between Starter, Growth and Premium. Upgrades apply straight away; downgrades apply from the next billing period. Your menu, tables, orders and customer records stay where they are.',
  },
  {
    q: 'Is there a yearly price?',
    a: `Growth is ${formatINR(g.yearly ?? g.monthly * 10)} a year per outlet, which is about two months free compared with paying monthly. Annual billing for Starter and Premium is available on request. All prices exclude GST.`,
  },
  {
    q: 'Will I get a GST invoice?',
    a: 'Yes. Every charge comes with a GST invoice made out to your business and GSTIN. The prices on this page exclude GST, which is added on the invoice.',
  },
  {
    q: 'Are custom changes included in the subscription?',
    a: 'The subscription covers the product, hosting, updates, support and bug fixes. It does not include unlimited custom changes. Custom features and integrations are scoped and quoted separately, so you always know the cost before any work starts.',
  },
  {
    q: 'Is the POS and billing included in Starter?',
    a: 'Yes. Every plan includes the counter POS for dine-in and takeaway, the live floor view, one bill per table, split payments across cash, UPI, card and gift card, tips, manager-only discounts, refunds, numbered GST receipts, the customer display with a UPI QR, daily cash close, staff invites, timesheets, the activity log and full data export.',
  },
  {
    q: 'What does Growth add over Starter?',
    a: 'The customer side and the ways to fill tables: customer profiles and analytics, consent-based WhatsApp offers, feedback with your Google review link, table reservations with a walk-in waitlist, online takeaway from your own page, coupons, happy hours and gift cards, plus expenses, monthly budgets and a profit and loss statement. Games, your story video and all guest request types are on Growth too.',
  },
  {
    q: 'What does Premium add over Growth?',
    a: 'Inventory and purchasing (recipes, automatic stock deduction, low-stock alerts, food cost per dish, suppliers, purchase orders, waste log and stock counts), advanced reports with CSV export, loyalty rewards, automated WhatsApp messages, POS / webhook integration, priority support and onboarding across multiple outlets. The webhook sends every order event to a URL you choose, so any POS or middleware that accepts webhooks can receive your orders. A native connector for a specific POS needs that vendor’s partner API and is scoped separately.',
  },
  {
    q: 'Are WhatsApp messages included in the price?',
    a: 'Our side is. Automated messages on Premium go out through Meta’s official WhatsApp Cloud API from your own WhatsApp Business account, using templates Meta has approved. Meta charges per conversation and bills you directly; those fees are not part of our price. On Growth, your staff send each offer themselves from the WhatsApp app, so no Cloud API fees apply.',
  },
  {
    q: 'Do I need to buy special hardware?',
    a: 'No. Restaurant OS runs in a browser on the phones, tablets and computers you already have. Receipts and KOTs print through the browser, so a thermal printer that is set up in Windows, macOS or Android works. Direct USB / ESC-POS printer drivers and opening a cash drawer are not built. Any hardware you buy is your own cost and not part of the subscription.',
  },
];
