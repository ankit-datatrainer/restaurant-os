import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PageHero } from '@/components/marketing/page-hero';
import { site } from '@/components/marketing/site';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How Restaurant OS handles guest data, in plain language: what guests share, how a mobile number is used, WhatsApp consent and unsubscribing, Google reviews, retention, deletion and security.',
};

const UPDATED = '26 October 2026';

const SECTIONS: Array<{ id: string; title: string; body: ReactNode }> = [
  {
    id: 'who-does-what',
    title: 'Who does what',
    body: (
      <>
        <p>
          Each restaurant that uses Restaurant OS controls its own guests’ data. The restaurant decides what to ask for and what to do with it, such as
          whether to ask for a mobile number or to send offers.
        </p>
        <p>
          Restaurant OS hosts and processes that data for the restaurant, following its instructions, so that ordering, the dashboard, customer profiles and
          feedback work. We do not use a restaurant’s guest data for our own purposes.
        </p>
        <p>If you have a question about what a particular restaurant does with your details, ask the restaurant first. You can always write to us as well.</p>
      </>
    ),
  },
  {
    id: 'what-guests-share',
    title: 'What guests share',
    body: (
      <>
        <p>When you order through a table QR, the restaurant receives:</p>
        <ul>
          <li>
            <strong>Your order:</strong> the dishes, options and notes you choose, your table, the time, and how and whether you paid.
          </li>
          <li>
            <strong>Your name</strong>, only if you choose to give it.
          </li>
          <li>
            <strong>Your mobile number</strong>, only if you choose to give it.
          </li>
          <li>
            <strong>Your consent to WhatsApp offers</strong>, only if you tick that box yourself.
          </li>
          <li>
            <strong>Your feedback:</strong> a rating from 1 to 5 and any comment you add.
          </li>
          <li>
            <strong>Help requests:</strong> calling a waiter, asking for the bill, water, cutlery and so on.
          </li>
        </ul>
        <p>You never need an account, an email address or an app to order.</p>
      </>
    ),
  },
  {
    id: 'on-your-phone',
    title: 'What your phone stores',
    body: (
      <>
        <p>
          The menu page keeps two things in your browser’s local storage: a random session id, so it can show your orders and their status, and your cart,
          so it is still there if you close the tab. The session id is random and does not identify you on its own.
        </p>
        <p>
          There are no tracking cookies and no advertising trackers. You can remove both items at any time by clearing this site’s data in your browser.
        </p>
      </>
    ),
  },
  {
    id: 'mobile-number',
    title: 'How your mobile number is used',
    body: (
      <>
        <p>
          If you leave your number, the restaurant can recognise you as a returning guest and see your visits, what you spent and the ratings you gave.
          Leaving a number on its own never means messages: nothing is sent to it unless you also tick the offers box below.
        </p>
        <p>
          <strong>Offers are sent only if you tick the separate WhatsApp-offers box.</strong> That box starts unticked, and leaving it unticked never affects
          your order. Offers come from the restaurant you visited, and only from that restaurant.
        </p>
        <p>
          Some restaurants send these messages automatically once you have ticked the box: a welcome message, a note when you have earned a loyalty
          reward, a message after a while without a visit, and occasional offers. They are sent through Meta’s official WhatsApp Business platform from
          the restaurant’s own WhatsApp account, and each one includes an unsubscribe link.
        </p>
        <p>A number you give one restaurant is never shared with another restaurant.</p>
      </>
    ),
  },
  {
    id: 'consent-records',
    title: 'Consent records',
    body: (
      <p>
        When you tick the offers box, we keep a record of the date and time and the exact wording you agreed to. If you later unsubscribe, that is recorded
        too. This lets the restaurant show when and how you said yes, and makes sure your choice is respected.
      </p>
    ),
  },
  {
    id: 'unsubscribing',
    title: 'Unsubscribing',
    body: (
      <>
        <p>
          Every offer message includes an unsubscribe link. Tap it and you will not receive offers from that restaurant again. You can also simply ask the
          restaurant’s staff to switch offers off for you. Either way, it takes effect immediately.
        </p>
        <p>
          Unsubscribing stops offers. It does not erase your past orders, which the restaurant keeps for its records. If you would like your details deleted,
          ask the restaurant or write to us.
        </p>
      </>
    ),
  },
  {
    id: 'google-reviews',
    title: 'Google reviews',
    body: (
      <p>
        After you rate your meal, you may see a link to the restaurant’s Google reviews page. Every guest who rates sees the same link, whatever their score.
        Leaving a Google review is entirely optional and happens on Google, under Google’s own privacy policy. Nothing is posted for you, and nothing is
        offered in return for a review.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long data is kept',
    body: (
      <p>
        Data is kept for as long as the restaurant uses Restaurant OS. The restaurant can export its customer list at any time. When a restaurant’s
        subscription ends, its data is deleted within 30 days.
      </p>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Everything travels encrypted between your phone, the restaurant’s screens and our servers. Row-level access controls in the database mean that each
        restaurant’s staff can see only their own restaurant’s guests, and guests can see only their own orders.
      </p>
    ),
  },
  {
    id: 'never-sold',
    title: 'Never sold',
    body: (
      <p>
        We never sell guest data and never use it for advertising. We rely on hosting and database providers to run the service; they process data only to
        provide that service to us. When a restaurant sends automated WhatsApp messages, your number and the message are passed to Meta’s WhatsApp
        Business platform so the message can be delivered, under Meta’s own terms. When a restaurant connects its POS or other software, order details
        are also sent to the systems that restaurant chooses.
      </p>
    ),
  },
  {
    id: 'this-website',
    title: 'On this website',
    body: (
      <p>
        If you fill in the contact form on this site, we use what you send only to reply to you and arrange a demo. We do not add you to a newsletter or
        pass your details to anyone else.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <>
        <p>
          Questions, or a request to see, correct or delete your details? Write to{' '}
          <a href={`mailto:${site.email}`} className="text-fg underline decoration-ember/60 underline-offset-4 hover:decoration-ember">
            {site.email}
          </a>
          . If the request is about data a particular restaurant holds, we will pass it to that restaurant and help them act on it.
        </p>
        <p>If this notice changes, we update the date at the top of the page.</p>
      </>
    ),
  },
];

const SHORT_VERSION = [
  'Each restaurant controls its guests’ data; we host it for them.',
  'Your name and number are optional. Offers need a separate tick from you.',
  'Unsubscribe from any message, or ask the staff. It takes effect immediately.',
  'No tracking cookies. Never sold. Deleted within 30 days after a subscription ends.',
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Privacy notice"
        words={[{ text: 'Privacy,' }, { text: 'in' }, { text: 'plain' }, { text: 'language.', className: 'font-serif font-normal italic text-ember' }]}
        lede={`What guests share when they order through Restaurant OS, what happens to it, and the choices they have. Last updated ${UPDATED}.`}
      />

      <section className="pb-24 md:pb-32">
        <div className="container-x grid gap-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-20">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow">On this page</p>
            <nav aria-label="Privacy notice sections" className="mt-4">
              <ol className="grid gap-2 border-l border-paper/10">
                {SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="-ml-px flex items-baseline gap-3 border-l border-transparent py-0.5 pl-4 text-sm text-fg/65 transition-colors hover:border-ember hover:text-fg"
                    >
                      <span className="tnum font-mono text-2xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <p className="mt-8 font-mono text-2xs uppercase tracking-[0.16em] text-muted">Last updated {UPDATED}</p>
          </aside>

          <article className="max-w-[68ch]">
            <div className="rounded-3xl border border-ember/30 bg-ember/[0.05] p-6 md:p-8">
              <p className="eyebrow text-ember">The short version</p>
              <ul className="mt-4 grid gap-3">
                {SHORT_VERSION.map((s) => (
                  <li key={s} className="flex items-start gap-3 text-[16px] leading-relaxed text-fg/90">
                    <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-ember" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id} className="mt-12 scroll-mt-28 border-t border-paper/10 pt-10">
                <p className="tnum font-mono text-2xs uppercase tracking-[0.16em] text-ember">{String(i + 1).padStart(2, '0')}</p>
                <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-fg md:text-3xl">{s.title}</h2>
                <div className="mt-5 space-y-5 text-[17px] leading-[1.75] text-fg/75 [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.8em] [&_li]:before:h-1 [&_li]:before:w-1 [&_li]:before:rounded-full [&_li]:before:bg-ember [&_li]:before:content-[''] [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:space-y-2.5">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </section>
    </>
  );
}
