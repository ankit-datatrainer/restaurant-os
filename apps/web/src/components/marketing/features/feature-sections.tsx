'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PhoneMock } from '../phone-mock';
import { SectionHeading } from '../section-heading';
import { CounterBoard } from './board-mock';
import { CustomersBoard } from './customers-mock';
import { AccountsMock, BillingMock, BookingsMock, FloorMock, InventoryMock, PromotionsMock, TeamMock } from './ops-mocks';
import { PremiumBoard } from './premium-mock';
import { KitchenTicket } from './ticket-mock';

interface Item {
  title: string;
  body: string;
}

function FeatureSection({
  id,
  index,
  eyebrow,
  title,
  lede,
  items,
  visual,
  flip,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  lede: string;
  items: Item[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-paper/10 py-20 md:py-28">
      <div className={cn('container-x grid gap-12 lg:grid-cols-2 lg:gap-20', flip && 'lg:[&>*:first-child]:order-2')}>
        <div className="flex items-start justify-center lg:sticky lg:top-28 lg:self-start">
          <Reveal className="relative w-full max-w-md lg:max-w-none">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/[0.1] blur-[120px]" />
            <div className="relative flex justify-center">{visual}</div>
          </Reveal>
        </div>
        <div>
          <SectionHeading index={index} eyebrow={eyebrow} title={title} lede={lede} />
          <ul className="mt-10 grid gap-5">
            {items.map((it, i) => (
              <Reveal as="li" key={it.title} delay={0.06 * i} className="flex gap-4 border-t border-paper/10 pt-5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember text-white">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold leading-tight">{it.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const GUEST_ITEMS: Item[] = [
  { title: 'Opens from the camera app', body: 'No app store, no sign-up. The sticker’s QR is a normal link; iPhone and Android both open it straight from the camera.' },
  { title: 'Menu that reads well on a phone', body: 'Categories as sticky pills, veg marks, photos that load as you scroll, search across every dish.' },
  { title: 'English or Hindi, their choice', body: 'An EN / हिं switch shows dish and category names and descriptions in Hindi, and the key guest screens follow. In every plan.' },
  { title: 'Portions, add-ons and notes', body: 'Half or full, extra cheese, “less spicy”. Required choices are enforced before the dish goes in the cart.' },
  { title: 'Live status, same page', body: 'Placed, accepted, preparing, ready, served. The guest doesn’t need to refresh or ask. Your story video and games, from tic-tac-toe to Ludo against the computer, can fill the wait.' },
  { title: 'One more naan, same order', body: 'Guests add dishes to the order that is already open, and to the same bill. The kitchen sees them marked as new. On Growth and Premium.' },
  { title: 'Call for help in one tap', body: 'Call a waiter or ask for the bill; water, cutlery and a free-text note too on Growth. When someone picks it up, the guest’s phone says so.' },
  { title: 'Bill and UPI, no waiting', body: 'An itemised bill with CGST and SGST; a UPI link that opens their app with the amount filled in.' },
  { title: 'Rate the meal', body: 'One to five stars and a comment after the meal, then your Google review link for every guest who rates. On Growth and Premium.' },
];

const COUNTER_ITEMS: Item[] = [
  { title: 'Chime and spoken order', body: 'Every new order plays a chime and is read aloud with the table number and dishes. Volume and voice are yours to set.' },
  { title: 'One tap moves an order', body: 'Accept, preparing, ready, served. Cancel from any state before it’s served; the guest sees it straight away.' },
  { title: 'KOT printing', body: 'Print a kitchen order ticket for any order, for kitchens that still like paper on the rail.' },
  { title: 'No double orders', body: 'If a guest taps “Place order” twice on a slow connection, you get one order, not two.' },
  { title: 'Payment at a glance', body: 'UPI “guest says paid” claims show up for confirmation; counter payments are marked paid in one tap.' },
  { title: 'Tables and QR stickers', body: 'Add a table, name the area, print its QR as SVG or PNG. Lost a sticker? Reset the code and reprint.' },
  { title: 'Menu edits go live instantly', body: 'Sold out of paneer? Toggle availability and it disappears from every phone in the room. No reprint, ever.' },
  { title: 'Today in numbers', body: 'Revenue, orders, average ticket, top dishes and a quiet hourly chart. Enough to run the day. Premium adds a full Reports page for the owner.' },
];

const OWNER_ITEMS: Item[] = [
  { title: 'An optional number at checkout', body: 'Guests can leave a mobile number so you recognise them next time. It is never needed to place an order.' },
  { title: 'A separate, unticked box for offers', body: 'WhatsApp offers need their own tick, from the guest. We keep the exact wording they agreed to and when.' },
  { title: 'Profiles that build themselves', body: 'Visits, spend, average rating and order history for every guest who left a number.' },
  { title: 'Segments and CSV export', body: 'Repeat guests, new this week, not seen in 30 days, opted in. Export any list as a CSV whenever you like.' },
  { title: 'Offers you send yourself', body: 'Pick an opted-in guest and WhatsApp opens with your message typed in. You press send. On Premium, messages can also go out automatically.' },
  { title: 'Unsubscribe that works', body: 'Every message carries an unsubscribe link, or the guest can simply ask your staff. It takes effect immediately.' },
  { title: 'Feedback with your Google link', body: 'Every guest who rates sees your Google review link, whatever the score. No gating, no rewards.' },
];

const PREMIUM_ITEMS: Item[] = [
  { title: 'Reports that answer real questions', body: 'Revenue by day, busiest days and hours, top dishes and slow movers, payment split, minutes to accept, ready and serve, new vs returning guests, tables by revenue and ratings. Compared with the previous period, exportable as CSV.' },
  { title: 'Loyalty rewards that run themselves', body: 'Choose the rule, say a free dessert every 5th visit. The reward unlocks on its own with a code on the guest’s phone; staff redeem it in the dashboard, and it expires after the days you set.' },
  { title: 'Automated WhatsApp messages', body: 'A welcome after opt-in, a win-back after a set number of days, a loyalty-reward note and one-tap offer broadcasts, sent through Meta’s official WhatsApp Cloud API from your own WhatsApp Business account. Opted-in guests only, an unsubscribe link in every message, and a log of everything sent.' },
  { title: 'What Meta needs from you', body: 'Your own Meta Business account and message templates approved by Meta. Meta bills its per-conversation fees to you directly; they are not part of our price.' },
  { title: 'Orders into your POS or any tool', body: 'Every order event (placed, dishes added, status changed, cancelled, payment changed) is sent to a URL you choose, signed with HMAC, retried if it fails, and listed in a delivery log. Works with any POS or middleware that accepts webhooks, KOT software, Zapier, Make or your own server.' },
  { title: 'Native POS connectors, honestly', body: 'A direct connector for Petpooja or another POS needs that vendor’s partner API. We are happy to build one together with your POS vendor; it is scoped separately.' },
];

const POS_ITEMS: Item[] = [
  { title: 'Take orders at the counter', body: 'Staff ring up dine-in or takeaway orders on the counter screen. They go straight to the kitchen board, with the same chime and KOT as an order from a guest’s phone.' },
  { title: 'Every table at a glance', body: 'The floor view shows each table as free, ordering, in the kitchen, served, bill requested or reserved, and changes by itself as orders move.' },
  { title: 'Move or merge tables', body: 'Guests changed tables? Move the open order across. Two tables pushed together for a birthday? Merge them so the kitchen and the bill see one party.' },
  { title: 'One queue for the kitchen', body: 'QR orders and counter orders land on the same board, so the kitchen cooks from one list, not two.' },
  { title: 'Menu serving windows', body: 'Breakfast till 11 AM, a lunch thali on weekdays only. Set when each category is served and it appears and disappears on its own, on phones and at the counter.' },
  { title: 'Printing, honestly', body: 'Receipts and KOTs print from the browser to any printer your computer or tablet already uses, including thermal printers set up in the operating system. Direct USB / ESC-POS drivers and opening a cash drawer are not built.' },
];

const BILLING_ITEMS: Item[] = [
  { title: 'One bill for the whole table', body: 'Starters, mains and that late dessert round? Combine the table’s orders into a single bill before you settle.' },
  { title: 'Split it the way they pay', body: 'Part cash, part UPI, part card or gift card, on one bill. It only closes when the payments add up to the total.' },
  { title: 'Tips and manager-only discounts', body: 'Add a tip when you settle. Discounts need an owner or manager, and every one of them lands in the activity log.' },
  { title: 'Refunds with a reason', body: 'Refund a settled bill with a written reason. Gift card balances go back automatically, and the refund shows in the day’s cash close.' },
  { title: 'Numbered GST receipts', body: 'Every receipt takes the next number in sequence, with CGST and SGST split from your rate, your GSTIN, HSN / SAC codes on the lines and your service charge if you add one.' },
  { title: 'A screen that faces the guest', body: 'Open the customer display on a second screen or an old tablet. It shows the bill and a UPI QR for the exact amount, so nobody types the wrong number.' },
  { title: 'Daily cash close', body: 'Count the drawer at the end of the day. Restaurant OS works out the cash you should have from the opening float, cash sales, refunds and cash paid out, and records the variance.' },
];

const BOOKINGS_ITEMS: Item[] = [
  { title: 'A booking page of your own', body: 'Guests pick a date, a time and how many people on your restaurant’s page. The booking lands in your dashboard straight away.' },
  { title: 'Phone bookings in seconds', body: 'Someone calls for Saturday at eight. Add the booking, assign a table, done.' },
  { title: 'No double bookings', body: 'A table that is already booked for a slot can’t be booked again, whether the booking comes from a guest online or from your staff.' },
  { title: 'A waitlist for walk-ins', body: 'Full house? Add walk-ins to the waitlist with their party size, see who is next, and seat them when a table frees up.' },
  { title: 'Online takeaway, click and collect', body: 'Guests order from your own page and choose a pickup time. The order reaches the kitchen like any other, with no aggregator in between and no commission.' },
  { title: 'Your hours, respected', body: 'Bookings and pickups outside your opening hours are refused, and the prep time you set decides the earliest pickup.' },
];

const PROMO_ITEMS: Item[] = [
  { title: 'Coupons', body: 'Percent or flat off, with a minimum order, a maximum discount, dates and a usage limit if you want them. Guests enter the code in the cart and see the discount before they order.' },
  { title: 'Happy hours', body: 'Twenty percent off beverages from 4 to 7 PM, Monday to Thursday. Pick the categories, days and hours; the discount applies by itself, on phones and at the counter.' },
  { title: 'Gift cards', body: 'Issue a gift card with a code and a value. Guests pay with it at the counter, in full or in part, and the balance carries over.' },
  { title: 'Every discount explained', body: 'Coupon and happy-hour discounts are named on the bill and the receipt, so guests and your accounts both know where the money went.' },
];

const INVENTORY_ITEMS: Item[] = [
  { title: 'Ingredients and recipes', body: 'List your ingredients with their units, then set what goes into each dish: 120 g paneer, 20 g butter, one portion of marinade.' },
  { title: 'Stock that moves by itself', body: 'When the kitchen accepts an order, the recipe quantities come off stock. Cancel the order and they go back.' },
  { title: 'Low-stock alerts', body: 'Set a level for each ingredient and see what is running low before service, not halfway through it.' },
  { title: 'Food cost per dish', body: 'Recipe cost against menu price, as a percentage, so you can see which dishes earn their place on the menu.' },
  { title: 'Suppliers and purchase orders', body: 'Raise a purchase order to a supplier, receive it in part or in full, and the ingredient’s average cost updates as a weighted average.' },
  { title: 'Waste log and stock counts', body: 'Log spoilage as it happens, and run a stock count to bring the books in line with the shelf. Every adjustment is in the activity log.' },
];

const ACCOUNTS_ITEMS: Item[] = [
  { title: 'Expenses by category', body: 'Ingredients, salaries, rent, utilities, gas, maintenance and more. Log each one with the amount, how it was paid and who it went to.' },
  { title: 'Monthly budgets', body: 'Set a budget for each category and watch spending against it as the month goes, not after it ends.' },
  { title: 'A profit and loss statement', body: 'Net sales after discounts, refunds, tips, tax collected and expenses for any period. On Premium, food cost and waste from inventory are included too.' },
  { title: 'Cash that adds up', body: 'Expenses paid in cash count toward the day’s expected cash, so the cash close and the books agree.' },
];

const TEAM_ITEMS: Item[] = [
  { title: 'Invite staff with a code', body: 'Create an invite for a role, share the code, and the new team member joins with their own login. No shared passwords on a sticky note.' },
  { title: 'Clock in, clock out', body: 'Staff clock in and out from their own login, and the timesheet shows who worked when and for how long.' },
  { title: 'An activity log for the sensitive stuff', body: 'Refunds, discounts, cancellations, price changes and stock adjustments are recorded with who did it and when.' },
  { title: 'Your data, whenever you want it', body: 'Download a full JSON backup of your restaurant, or your orders as a CSV, at any time. It is your data, and you are never locked in.' },
];

const KITCHEN_ITEMS: Item[] = [
  { title: 'A ticket per order, on any screen', body: 'The kitchen view is a plain list of what to cook next, biggest text first. Works on an old tablet or a phone taped to the wall.' },
  { title: 'Requests go to the right people', body: 'Waiter calls ring on waiter phones. Kitchen only sees food. Managers see everything.' },
  { title: 'Roles that match a real restaurant', body: 'Owner, manager, kitchen, waiter. Each login sees what it needs and nothing it shouldn’t.' },
  { title: 'Realtime, with no refresh', body: 'Orders, status changes and calls appear within a second on every logged-in device. Reconnects on its own after a dropout.' },
  { title: 'Works through the rush', body: 'Nothing is stored on one device. If a phone dies, log in on another and carry on.' },
];

export function FeatureSections() {
  return (
    <>
      <FeatureSection
        id="guests"
        index="01"
        eyebrow="For guests"
        title="A menu they already know how to use."
        lede="It behaves like the web pages people use every day, because it is one."
        items={GUEST_ITEMS}
        visual={<PhoneMock sequence={['scan', 'menu', 'placed', 'pay', 'feedback']} interval={3000} width={280} />}
      />
      <FeatureSection
        id="counter"
        index="02"
        eyebrow="For the counter"
        title="Hear it, tap it, done."
        lede="The counter board is built for one person with wet hands and a queue."
        items={COUNTER_ITEMS}
        visual={<CounterBoard />}
        flip
      />
      <FeatureSection
        id="kitchen"
        index="03"
        eyebrow="For the kitchen and waiters"
        title="The right ticket on the right screen."
        lede="Kitchen sees food. Waiters see tables. Nobody digs through a feed."
        items={KITCHEN_ITEMS}
        visual={<KitchenTicket />}
      />
      <FeatureSection
        id="pos"
        index="04"
        eyebrow="Counter POS and floor view · Every plan"
        title="The whole floor on one screen."
        lede="Walk-ins, phone orders and takeaway get rung up at the counter, and every table’s state is visible at a glance."
        items={POS_ITEMS}
        visual={<FloorMock />}
        flip
      />
      <FeatureSection
        id="billing"
        index="05"
        eyebrow="Billing · Every plan"
        title="Settle any table, any way they pay."
        lede="One bill per table, split across payment methods, with numbered GST receipts and a cash close that tells you if the drawer is short."
        items={BILLING_ITEMS}
        visual={<BillingMock />}
      />
      <FeatureSection
        id="bookings"
        index="06"
        eyebrow="Reservations and takeaway · Growth and Premium"
        title="Book the table. Queue the walk-ins. Pack the takeaway."
        lede="A booking page and an order-ahead page that belong to your restaurant, not to an aggregator."
        items={BOOKINGS_ITEMS}
        visual={<BookingsMock />}
        flip
      />
      <FeatureSection
        id="promotions"
        index="07"
        eyebrow="Promotions · Growth and Premium"
        title="Offers that apply themselves."
        lede="Coupons for the guests you invite, happy hours for the quiet afternoons, and gift cards for the regulars who bring friends."
        items={PROMO_ITEMS}
        visual={<PromotionsMock />}
      />
      <FeatureSection
        id="customers"
        index="08"
        eyebrow="For the owner · Growth and Premium"
        title="Know who comes back."
        lede="Customer profiles build from the orders guests already place, and offers only go to the people who said yes."
        items={OWNER_ITEMS}
        visual={<CustomersBoard />}
        flip
      />
      <FeatureSection
        id="premium"
        index="09"
        eyebrow="For the owner · Premium"
        title="Rewards, reports and messages that run themselves."
        lede="Reports for the owner, rewards for regulars, messages that go out by themselves, and every order event delivered to the tools you already run."
        items={PREMIUM_ITEMS}
        visual={<PremiumBoard />}
      />
      <FeatureSection
        id="inventory"
        index="10"
        eyebrow="Inventory and purchasing · Premium"
        title="Know what’s on the shelf before service."
        lede="Recipes tie every dish to its ingredients, so stock, food cost and reorders follow the orders you already take."
        items={INVENTORY_ITEMS}
        visual={<InventoryMock />}
        flip
      />
      <FeatureSection
        id="accounts"
        index="11"
        eyebrow="Accounts · Growth and Premium"
        title="See what the month actually made."
        lede="Expenses and budgets next to the sales Restaurant OS already records, so profit isn’t a guess at month end."
        items={ACCOUNTS_ITEMS}
        visual={<AccountsMock />}
      />
      <FeatureSection
        id="team"
        index="12"
        eyebrow="Team and your data · Every plan"
        title="Every login accounted for."
        lede="Staff join with a code, clock in from their own login, and the sensitive actions leave a trail. Your data stays exportable."
        items={TEAM_ITEMS}
        visual={<TeamMock />}
        flip
      />
    </>
  );
}
