import type { LucideIcon } from 'lucide-react';
import {
  BadgeIndianRupee,
  Boxes,
  CalendarClock,
  LayoutGrid,
  MonitorSmartphone,
  TicketPercent,
  UsersRound,
  Wallet,
  BarChart3,
  BellRing,
  ChefHat,
  Contact,
  LayoutDashboard,
  Gift,
  ListOrdered,
  Plug,
  QrCode,
  Receipt,
  Settings,
  Star,
  UtensilsCrossed,
} from 'lucide-react';
import type { PlanFeature, StaffRole } from '@restaurant-os/shared';

export interface NavItem {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  icon: LucideIcon;
  badge?: 'orders' | 'calls';
  /** The page needs this plan feature; on plans without it the nav shows a small lock. */
  feature?: PlanFeature;
  /** Only these staff roles see the item (everyone when omitted). */
  roles?: StaffRole[];
  /** Sidebar section heading. */
  group: NavGroup;
}

export type NavGroup = 'Service' | 'Menu & stock' | 'Money' | 'Guests' | 'Team & setup';
export const NAV_GROUPS: NavGroup[] = ['Service', 'Menu & stock', 'Money', 'Guests', 'Team & setup'];

const FRONT: StaffRole[] = ['owner', 'manager', 'waiter'];
const MANAGERS: StaffRole[] = ['owner', 'manager'];

export const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, group: 'Service' },
  { href: '/admin/orders', label: 'Live orders', short: 'Orders', icon: ListOrdered, badge: 'orders', group: 'Service' },
  { href: '/admin/floor', label: 'Floor', short: 'Floor', icon: LayoutGrid, roles: FRONT, group: 'Service' },
  { href: '/admin/pos', label: 'Counter POS', short: 'POS', icon: MonitorSmartphone, roles: FRONT, group: 'Service' },
  { href: '/admin/kitchen', label: 'Kitchen board', short: 'Kitchen', icon: ChefHat, group: 'Service' },
  { href: '/admin/calls', label: 'Calls', short: 'Calls', icon: BellRing, badge: 'calls', group: 'Service' },
  { href: '/admin/reservations', label: 'Reservations', short: 'Bookings', icon: CalendarClock, feature: 'reservations', roles: FRONT, group: 'Service' },
  { href: '/admin/menu', label: 'Menu & dishes', short: 'Menu', icon: UtensilsCrossed, group: 'Menu & stock' },
  { href: '/admin/tables', label: 'Tables & QR', short: 'Tables', icon: QrCode, group: 'Menu & stock' },
  { href: '/admin/inventory', label: 'Inventory', short: 'Stock', icon: Boxes, feature: 'inventory', roles: MANAGERS, group: 'Menu & stock' },
  { href: '/admin/promotions', label: 'Promotions', short: 'Offers', icon: TicketPercent, feature: 'promotions', roles: MANAGERS, group: 'Menu & stock' },
  { href: '/admin/billing', label: 'Billing', short: 'Billing', icon: Receipt, roles: FRONT, group: 'Money' },
  { href: '/admin/finance', label: 'Cash & accounts', short: 'Accounts', icon: Wallet, roles: MANAGERS, group: 'Money' },
  { href: '/admin/reports', label: 'Reports', short: 'Reports', icon: BarChart3, feature: 'advanced_analytics', group: 'Money' },
  { href: '/admin/customers', label: 'Customers', short: 'Customers', icon: Contact, feature: 'crm', group: 'Guests' },
  { href: '/admin/feedback', label: 'Feedback', short: 'Feedback', icon: Star, feature: 'feedback', group: 'Guests' },
  { href: '/admin/loyalty', label: 'Loyalty', short: 'Loyalty', icon: Gift, feature: 'loyalty', group: 'Guests' },
  { href: '/admin/staff', label: 'Staff & attendance', short: 'Staff', icon: UsersRound, group: 'Team & setup' },
  { href: '/admin/integrations', label: 'Integrations', short: 'Integrations', icon: Plug, feature: 'pos_integration', roles: MANAGERS, group: 'Team & setup' },
  { href: '/admin/settings', label: 'Settings', short: 'Settings', icon: Settings, group: 'Team & setup' },
  { href: '/admin/subscription', label: 'Plan & billing', short: 'Plan', icon: BadgeIndianRupee, group: 'Team & setup' },
];

/** The nav items this staff role can see, in order. */
export function navFor(role: StaffRole | null | undefined): NavItem[] {
  return NAV.filter((n) => !n.roles || (role ? n.roles.includes(role) : false));
}

/** The four tabs that live in the bottom bar on phones; the rest sit behind "More". */
export const PRIMARY_TAB_COUNT = 4;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string): string {
  if (pathname.startsWith('/admin/tables/print')) return 'Print QR sheet';
  if (/^\/admin\/billing\/.+/.test(pathname)) return 'Bill';
  if (pathname.startsWith('/admin/display')) return 'Customer display';
  const item = NAV.find((n) => isNavActive(pathname, n.href));
  return item?.label ?? 'Dashboard';
}
