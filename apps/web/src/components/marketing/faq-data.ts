import { PLAN_INFO, formatINR } from '@restaurant-os/shared';

export interface FaqItem {
  q: string;
  a: string;
}

const growth = formatINR(PLAN_INFO.growth.monthly);

/** Self-serve signup and the free trial. Shown on the home page and the pricing page. */
export const SIGNUP_FAQ: FaqItem[] = [
  {
    q: 'How do I sign up?',
    a: 'Go to the signup page and create your restaurant yourself; it takes a few minutes. You start with a sample menu that you edit into your own, add your tables, and print their QR codes straight from the dashboard. Prefer a hand? Book a demo and we set it up with you.',
  },
  {
    q: 'What happens after the free trial?',
    a: 'Your 14-day trial includes every feature. Before it ends, the Restaurant OS team gets in touch to help you pick the plan that fits. Nothing is charged automatically, because there is no card on file: you only pay once you choose a plan.',
  },
  {
    q: 'Can guests find my restaurant?',
    a: 'If you want them to. Listing in the Restaurant OS directory is optional and free. Switch it on and guests can find your page by name, cuisine or city, then order takeaway or book a table there on Growth and Premium.',
  },
];

export const HOME_FAQ: FaqItem[] = [
  SIGNUP_FAQ[0]!,
  SIGNUP_FAQ[1]!,
  {
    q: 'Do guests need to install an app?',
    a: 'No. The QR opens a normal web page from the phone’s camera or browser. It works on any recent Android phone or iPhone, and there is nothing to sign up for.',
  },
  {
    q: 'We already have waiters. Why would we need this?',
    a: 'It supports your waiters rather than replacing them. Guests place the routine orders themselves, so your team spends less time writing them down and more time looking after tables. Anyone who would rather talk to a person can tap “Call waiter” on the phone, or simply wave one over.',
  },
  {
    q: 'Can I use Restaurant OS as my billing / POS system?',
    a: 'Yes, on every plan. Staff ring up dine-in and takeaway orders at the counter, see every table on a live floor view, move or merge tables, combine a table’s orders into one bill and split it across cash, UPI, card and gift card. Tips, manager-only discounts, refunds with a reason, numbered GST receipts with CGST / SGST and HSN / SAC codes, a customer display with a UPI QR and a daily cash close are all included. It is cloud-based and prints through the browser; direct printer drivers and cash drawers are not built.',
  },
  {
    q: 'We already use Petpooja or another POS. Do we have to switch?',
    a: 'No. You can use Restaurant OS as your POS, or keep your current POS and use Restaurant OS for QR ordering, the kitchen board and retention. On Premium, every order event (placed, dishes added, status changed, cancelled, payment changed) is sent as a signed webhook to a URL you choose, so it works with any POS or middleware that accepts webhooks, as well as KOT software, Zapier or Make. A native connector for Petpooja or another POS needs that vendor’s partner API; we are happy to build one together with your POS vendor.',
  },
  {
    q: 'Our customers won’t scan QR codes.',
    a: 'Some won’t, and that is fine. During the pilot we measure how many tables actually order by QR, so you decide on real numbers from your own floor. Ordering through a waiter stays available for anyone who prefers it.',
  },
  {
    q: 'Does it work offline?',
    a: 'No. Restaurant OS is cloud-based and needs an internet connection, for the counter POS and billing as well as QR ordering. There is no offline or local-network mode. If a guest’s phone loses signal, they see a clear offline notice instead of a broken page; orders already placed are saved, and the dashboard reconnects on its own and catches up. Keep a mobile hotspot as a backup, and a paper pad ready for a real outage.',
  },
  {
    q: `Is ${growth} a month expensive?`,
    a: `For a restaurant doing ₹8–15 lakh a month, Growth at ${growth} (excl. GST) is about 0.3–0.5% of revenue. It only makes sense if it earns that back, which is exactly what the guided pilot is for: you see how it works on your own floor before you commit.`,
  },
  {
    q: 'Who owns the customer data?',
    a: 'You do. Each restaurant owns its guests’ data; we host and process it on your behalf. You can export your customer list as a CSV at any time, and your data is deleted within 30 days after your subscription ends.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes, on every plan. Download a full JSON backup of your restaurant’s data, or your orders as a CSV for your accountant, whenever you want. On Growth and Premium you can also export customer lists as a CSV. You are never locked in.',
  },
  {
    q: 'Can it track my stock?',
    a: 'Yes, on Premium. Add your ingredients and a recipe for each dish; when the kitchen accepts an order, the ingredients come off stock automatically, and go back if the order is cancelled. You get low-stock alerts, food cost % per dish, suppliers and purchase orders (received in part or in full, with weighted-average cost), a waste log and stock counts.',
  },
  {
    q: 'Can guests book a table or order takeaway online?',
    a: 'Yes, on Growth and Premium. Your restaurant gets its own page where guests book a table or order takeaway for a pickup time within your opening hours. Staff can add phone bookings too, a table can’t be double-booked for the same slot, and walk-ins go on a waitlist. Orders come straight to you, with no aggregator commission. Delivery and rider management are not built.',
  },
  {
    q: 'Can you send WhatsApp messages automatically?',
    a: 'Yes, on Premium. Messages go out through Meta’s official WhatsApp Cloud API from your own WhatsApp Business account: a welcome after a guest opts in, a win-back after a set number of days without a visit, a note when a loyalty reward unlocks, and one-tap offer broadcasts. They only go to guests who ticked the opt-in box, every message carries an unsubscribe link, and each one is kept in a message log. You need a Meta Business account and Meta-approved templates, and Meta bills its per-conversation fees to you directly.',
  },
  {
    q: 'How do loyalty rewards work?',
    a: 'On Premium you choose the rule, for example a free dessert on every 5th visit. When a guest reaches it, the reward unlocks automatically and a code appears on their phone. Your staff redeem the code in the dashboard, and an unused reward expires after the number of days you set.',
  },
  {
    q: 'Is the menu available in Hindi?',
    a: 'Yes, on every plan. Add Hindi names and descriptions for your dishes and categories, and guests switch between English and Hindi with an EN / हिं button. The key guest screens switch to Hindi too.',
  },
  {
    q: 'How do payments work?',
    a: 'At the table, the bill opens the guest’s UPI app with your UPI ID, the amount and a reference filled in; they tap “I have paid” and the counter confirms it. At the counter, staff settle by cash, UPI, card or gift card, split across several if the table wants, and the customer display can show a UPI QR for the exact amount. The money goes straight to you and never passes through us.',
  },
  {
    q: 'Can I print a KOT?',
    a: 'Yes. Any order can be printed as a kitchen order ticket from the dashboard. Dishes a guest adds to an open order are marked as new, so the kitchen knows exactly what to cook next.',
  },
  {
    q: 'How does setup work?',
    a: 'Your choice. Sign up and do it yourself in a few minutes, starting from a sample menu. Or we do it with you: send us your menu and we enter it, create your tables and QR codes, and train your staff. The guided pilot then runs on real services, with us checking in, before you commit to a plan.',
  },
  SIGNUP_FAQ[2]!,
];
