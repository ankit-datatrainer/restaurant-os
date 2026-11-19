'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { Clock, Mail, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { EASE_OUT } from '@/lib/motion';
import { site } from '../site';

const NEXT = ['We reply within a working day to fix a time.', 'You send us your menu, as a photo, PDF or link.', 'We show you the 5-minute demo running on your own dishes.'];

export function ContactAside() {
  const [showNumber, setShowNumber] = React.useState(false);
  return (
    <div className="grid content-start gap-4">
      <Reveal className="rounded-3xl border border-ember/30 bg-ember/[0.05] p-6">
        <p className="eyebrow text-ember">What happens next</p>
        <ol className="mt-4 grid gap-3">
          {NEXT.map((n, i) => (
            <li key={n} className="flex items-start gap-3 text-sm text-fg/85">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ember font-mono text-[10px] text-ember">{i + 1}</span>
              {n}
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal delay={0.04} className="rounded-3xl border border-paper/10 bg-ink-2/60 p-6">
        <p className="eyebrow">Email</p>
        <a href={`mailto:${site.email}`} className="mt-3 inline-flex items-center gap-2 font-display text-xl font-semibold underline-offset-4 hover:underline">
          <Mail className="h-5 w-5 text-ember" aria-hidden />
          {site.email}
        </a>
        <p className="mt-2 text-sm text-muted">Best for anything with screenshots or a menu attached.</p>
      </Reveal>

      <Reveal delay={0.08} className="rounded-3xl border border-paper/10 bg-ink-2/60 p-6">
        <p className="eyebrow">Prefer WhatsApp?</p>
        <div className="mt-3 min-h-[44px]">
          <AnimatePresence mode="wait" initial={false}>
            {showNumber ? (
              <motion.p
                key="number"
                className="flex items-center gap-2 font-display text-xl font-semibold"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              >
                <MessageCircle className="h-5 w-5 text-mint" aria-hidden />
                <span className="tnum select-all">{site.whatsapp}</span>
              </motion.p>
            ) : (
              <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button variant="outline" size="md" onClick={() => setShowNumber(true)} leftIcon={<MessageCircle className="h-4 w-4" aria-hidden />}>
                  Show the number
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-2 text-sm text-muted">Message us; we don’t cold-call. Save it and say hi.</p>
      </Reveal>

      <Reveal delay={0.16} className="grid gap-4 rounded-3xl border border-paper/10 bg-ink-2/60 p-6 text-sm">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
          <div>
            <p className="font-semibold">{site.hours}</p>
            <p className="text-muted">Replies within one working day, usually faster.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
          <div>
            <p className="font-semibold">{site.location}</p>
            <p className="text-muted">We visit restaurants in the city for setup; everywhere else, a video call and a courier of QR codes.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
          <div>
            <p className="font-semibold">Your details stay with us</p>
            <p className="text-muted">
              Used only to reply to you. Read the{' '}
              <Link href="/privacy" className="text-fg/85 underline underline-offset-4 hover:text-fg">
                privacy notice
              </Link>
              .
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
