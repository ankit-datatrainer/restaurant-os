'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, ExternalLink, Gamepad2, ListChecks, Play, VolumeX } from 'lucide-react';
import type { OrderWithItems, Restaurant } from '@restaurant-os/shared';
import { ORDER_STATUS_GUEST_COPY } from '@restaurant-os/shared';
import { Button, Skeleton } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, orderCode } from '@/lib/utils';
import { EASE_OUT, fadeUp, stagger } from '@/lib/motion';
import { gamesOn, storyOn } from './features';
import { HI_SAFE, useLang } from './i18n';
import { NotifyCard } from './notify-card';
import { tableScope } from './notify-prefs';
import { useOrderWatcher } from './order-watcher';
import { GuestPageHeader } from './page-header';
import { parseStoryVideo, storyParts, type StoryVideo } from './story-card';
import { useTable } from './table-provider';

/**
 * "While you wait": the screen right after an order is placed (once per order).
 *
 * 1. The restaurant's story video ("From the kitchen of …"), full screen, muted autoplay, with a
 *    Skip button that is always there and a Continue once it ends.
 * 2. "While your food is cooking": order code + live status, the notifications opt-in, Play a game,
 *    Track my order, Watch our story again.
 *
 * Games off → straight to the tracker after the video. Nothing to show → straight to the tracker.
 * "Seen" is stored per order in localStorage, so a refresh or a deep link never replays it.
 */

const SEEN_KEY = (orderId: string) => `ros:wait-seen:${orderId}`;
/** Orders whose flow started in this page load (survives React's dev double-mount), with the step reached. */
const openedHere = new Map<string, 'video' | 'wait'>();

function seen(orderId: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY(orderId)) === '1';
  } catch {
    return false;
  }
}

function markSeen(orderId: string) {
  try {
    window.localStorage.setItem(SEEN_KEY(orderId), '1');
  } catch {
    /* private mode */
  }
}

type FlowRestaurant = Pick<Restaurant, 'plan' | 'games_enabled' | 'feedback_enabled' | 'marketing_consent_enabled' | 'story_title' | 'story_text' | 'story_video_url'>;

/** The story video the flow can play in place (YouTube or a video file), if any. */
export function playableStory(r: FlowRestaurant | null | undefined): Exclude<StoryVideo, { kind: 'link' }> | null {
  if (!r || !storyOn(r)) return null;
  const v = parseStoryVideo(r.story_video_url);
  return v && v.kind !== 'link' ? v : null;
}

/** Whether placing an order should open the wait flow (otherwise go straight to the tracker). */
export function hasWaitFlow(r: FlowRestaurant | null | undefined): boolean {
  return Boolean(playableStory(r) || gamesOn(r));
}

export function waitFlowHref(code: string, orderId: string) {
  return `/t/${code}/wait/${orderId}`;
}

export function WaitFlow() {
  const params = useParams<{ code: string; orderId: string }>();
  const orderId = params.orderId ?? '';
  const router = useRouter();
  const { code, data, session } = useTable();
  const watcher = useOrderWatcher();
  const restaurant = data?.restaurant ?? null;
  const trackerHref = `/t/${code}/orders/${orderId}`;

  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [stage, setStage] = React.useState<'video' | 'wait' | null>(null);

  // Once per order: a refresh, a shared link or Back lands on the tracker instead.
  React.useEffect(() => {
    if (!orderId) return;
    if (openedHere.has(orderId) || !seen(orderId)) {
      if (!openedHere.has(orderId)) openedHere.set(orderId, 'video');
      markSeen(orderId);
      setAllowed(true);
    } else {
      setAllowed(false);
      router.replace(trackerHref);
    }
  }, [orderId, router, trackerHref]);

  const video = playableStory(restaurant);
  const games = gamesOn(restaurant);

  React.useEffect(() => {
    if (!allowed || !restaurant || stage) return;
    // Back from the games: the video was already shown in this visit.
    if (video && openedHere.get(orderId) !== 'wait') setStage('video');
    else if (games) setStage('wait');
    else router.replace(trackerHref);
  }, [allowed, restaurant, stage, video, games, router, trackerHref, orderId]);

  // The order: from the watcher when it has it, else one direct load.
  const fromWatcher = watcher?.orders?.find((o) => o.id === orderId) ?? null;
  const hasFromWatcher = Boolean(fromWatcher);
  const [direct, setDirect] = React.useState<OrderWithItems | null>(null);
  React.useEffect(() => {
    if (fromWatcher || !session || !orderId) return;
    let cancelled = false;
    publicApi
      .getOrder(orderId, session.id)
      .then((o) => {
        if (cancelled) return;
        setDirect(o);
        watcher?.track(o);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Load once when the watcher does not have it (the watcher object changes on every poll).
  }, [hasFromWatcher, session, orderId]);
  const order = fromWatcher ?? direct;

  const afterVideo = () => {
    openedHere.set(orderId, 'wait');
    if (games) setStage('wait');
    else router.replace(trackerHref);
  };

  if (allowed === false) return null;

  if (stage === 'video' && video && restaurant) {
    return <StoryVideoStage restaurant={restaurant} video={video} onDone={afterVideo} />;
  }

  if (stage === 'wait' && restaurant) {
    return (
      <WaitScreen
        code={code}
        order={order}
        restaurant={restaurant}
        sessionId={session?.id ?? null}
        trackerHref={trackerHref}
        onReplay={video ? () => setStage('video') : null}
      />
    );
  }

  return (
    <div className="gutter grid gap-4 pt-6" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-3xl" />
      <Skeleton className="h-32 w-full rounded-3xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story video
// ---------------------------------------------------------------------------

const YT_ORIGINS = new Set(['https://www.youtube-nocookie.com', 'https://www.youtube.com']);

function StoryVideoStage({
  restaurant,
  video,
  onDone,
}: {
  restaurant: Pick<Restaurant, 'name' | 'story_title' | 'story_text' | 'story_video_url'>;
  video: Exclude<StoryVideo, { kind: 'link' }>;
  onDone: () => void;
}) {
  const { t, uiLang } = useLang();
  const reduce = Boolean(useReducedMotion());
  const { title, text } = storyParts(restaurant);
  const [ended, setEnded] = React.useState(false);
  const skipRef = React.useRef<HTMLButtonElement>(null);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const continueRef = React.useRef<HTMLButtonElement>(null);

  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  // Keyboard users land on Skip; Escape skips too.
  React.useEffect(() => {
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doneRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (ended) continueRef.current?.focus({ preventScroll: true });
  }, [ended]);

  // YouTube tells the page when the video ends through the iframe API messages.
  React.useEffect(() => {
    if (video.kind !== 'youtube') return;
    const onMessage = (e: MessageEvent) => {
      if (!YT_ORIGINS.has(e.origin) || typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data) as { event?: string; info?: unknown };
        const state = msg.event === 'onStateChange' ? msg.info : (msg.info as { playerState?: number } | null)?.playerState;
        if (state === 0) setEnded(true);
      } catch {
        /* not ours */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [video.kind]);

  const listen = () => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'story', channel: 'widget' }), '*');
  };

  const autoplay = reduce ? 0 : 1;
  const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-ink text-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0.01 : 0.5, ease: EASE_OUT }}
      role="dialog"
      aria-modal="true"
      aria-label={t('From the kitchen of {name}', { name: restaurant.name })}
      lang={uiLang}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ember/25 blur-3xl" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-[560px] flex-1 flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn('font-mono text-[11px] uppercase tracking-[0.18em] text-paper/55', HI_SAFE)}>{t('From the kitchen of')}</p>
            <p className="truncate font-display text-lg font-bold leading-tight">{restaurant.name}</p>
          </div>
          <button
            ref={skipRef}
            type="button"
            onClick={onDone}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-paper/10 px-4 text-sm font-semibold text-paper ring-1 ring-paper/20 backdrop-blur transition hover:bg-paper/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
          >
            {t('Skip')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center py-6">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.15, ease: EASE_OUT }}
            className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-[0_30px_80px_-30px_rgba(255,92,42,0.45)] ring-1 ring-paper/10"
          >
            {video.kind === 'youtube' ? (
              <iframe
                ref={frameRef}
                onLoad={listen}
                src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=${autoplay}&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${origin}`}
                title={`${restaurant.name}: ${title}`}
                allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <video
                src={video.src}
                autoPlay={!reduce}
                muted
                playsInline
                controls
                preload="auto"
                onEnded={() => setEnded(true)}
                aria-label={`${restaurant.name}: ${title}`}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
          </motion.div>
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-paper/50">
            <VolumeX className="h-3.5 w-3.5" aria-hidden />
            {t('Sound is off. Use the player to turn it on.')}
          </p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: reduce ? 0 : 0.35, ease: EASE_OUT }}
            className="mt-5"
          >
            <h2 className="font-display text-[26px] font-bold leading-tight tracking-tight">{title}</h2>
            {text && <p className="mt-2 line-clamp-5 whitespace-pre-line text-[14.5px] leading-relaxed text-paper/70">{text}</p>}
          </motion.div>
        </div>

        <div className="grid gap-2">
          {ended ? (
            <Button ref={continueRef} size="xl" onClick={onDone} rightIcon={<ChevronRight className="h-5 w-5" aria-hidden />}>
              {t('Continue')}
            </Button>
          ) : (
            <p className="text-center text-[12.5px] text-paper/45">{t('Your order is with the kitchen. Skip any time.')}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// While your food is cooking
// ---------------------------------------------------------------------------

function WaitScreen({
  code,
  order,
  restaurant,
  sessionId,
  trackerHref,
  onReplay,
}: {
  code: string;
  order: OrderWithItems | null;
  restaurant: Restaurant;
  sessionId: string | null;
  trackerHref: string;
  onReplay: (() => void) | null;
}) {
  const { t, uiLang } = useLang();
  const reduce = Boolean(useReducedMotion());
  const games = gamesOn(restaurant);
  const storyLink = storyOn(restaurant) ? parseStoryVideo(restaurant.story_video_url) : null;
  const status = order?.status ?? 'placed';
  const done = status === 'served' || status === 'cancelled';

  return (
    <div className="relative pb-16" lang={uiLang}>
      <GuestPageHeader title={t('While your food is cooking')} subtitle={restaurant.name} backHref={`/t/${code}`} backLabel={t('Back to menu')} />
      <motion.main className="gutter grid gap-4 pt-4" variants={stagger(0.07)} initial={reduce ? false : 'hidden'} animate="show">
        <motion.section variants={fadeUp} className="relative overflow-hidden rounded-3xl bg-ink p-5 text-paper" aria-live="polite">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-ember/25 blur-3xl" aria-hidden />
          <div className="relative">
            <p className={cn('font-mono text-[11px] uppercase tracking-[0.16em] text-paper/60 tnum', HI_SAFE)}>
              {order ? t('Order {code}', { code: orderCode(order.order_number) }) : t('Your order')}
            </p>
            <p className="mt-3 flex items-center gap-2.5 font-display text-[24px] font-bold leading-tight tracking-tight">
              {!done && (
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                  {!reduce && <span className="absolute inset-0 animate-ping rounded-full bg-ember/70" />}
                  <span className="relative h-2.5 w-2.5 rounded-full bg-ember" />
                </span>
              )}
              {t(ORDER_STATUS_GUEST_COPY[status])}
            </p>
            <p className="mt-1.5 text-sm text-paper/70">{t("We'll show every update here, on the games and on the tracker.")}</p>
          </div>
        </motion.section>

        <motion.div variants={fadeUp}>
          <NotifyCard scope={tableScope(code)} target={{ table_code: code }} sessionId={sessionId} />
        </motion.div>

        {games && (
          <motion.div variants={fadeUp}>
            {/* A client-side link: the table layout (and the order watcher in it) stays mounted on the games. */}
            <Button
              href={`/t/${code}/games`}
              size="xl"
              className="h-auto w-full justify-start gap-4 rounded-3xl px-5 py-4 text-left"
              leftIcon={
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <Gamepad2 className="h-6 w-6" aria-hidden />
                </span>
              }
            >
              <span className="min-w-0 flex-1 whitespace-normal">
                <span className="block font-display text-lg font-bold leading-tight">{t('Play a game')}</span>
                <span className="mt-0.5 block text-[13px] font-normal text-white/85">{t("Ludo, memory and more. We'll tap you when your food is ready.")}</span>
              </span>
            </Button>
          </motion.div>
        )}

        <motion.div variants={fadeUp} className="grid gap-2">
          <Button href={order ? `/t/${code}/orders/${order.id}` : trackerHref} variant="outline" size="lg" leftIcon={<ListChecks className="h-4 w-4" aria-hidden />}>
            {t('Track my order')}
          </Button>
          {onReplay ? (
            <Button variant="ghost" size="lg" onClick={onReplay} leftIcon={<Play className="h-4 w-4" aria-hidden />}>
              {t('Watch our story again')}
            </Button>
          ) : storyLink?.kind === 'link' ? (
            <Button href={storyLink.href} external variant="ghost" size="lg" leftIcon={<Play className="h-4 w-4" aria-hidden />}>
              {t('Watch our story')}
              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
              <span className="sr-only">{t('(opens in a new tab)')}</span>
            </Button>
          ) : null}
        </motion.div>
      </motion.main>
    </div>
  );
}
