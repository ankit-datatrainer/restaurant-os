'use client';

import * as React from 'react';
import { BookOpen, ChevronRight, ExternalLink, Play } from 'lucide-react';
import type { Restaurant } from '@restaurant-os/shared';
import { Button, Sheet } from '@/components/ui';
import { cn } from '@/lib/utils';

type StoryRestaurant = Pick<Restaurant, 'name' | 'story_title' | 'story_text' | 'story_video_url'>;

export type StoryVideo = { kind: 'youtube'; id: string } | { kind: 'file'; src: string } | { kind: 'link'; href: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Turn whatever the restaurant pasted into something safe to show:
 * YouTube (watch?v=, youtu.be/, /shorts/, /embed/, /live/) → privacy-enhanced embed,
 * a direct .mp4 / .webm file → native player, any other http(s) link → an external link button.
 * Anything that is not an http(s) URL is dropped. Never throws.
 */
export function parseStoryVideo(raw: string | null | undefined): StoryVideo | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live|v)\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
  }
  if (id && YOUTUBE_ID.test(id)) return { kind: 'youtube', id };
  if (/\.(mp4|webm)$/i.test(url.pathname)) return { kind: 'file', src: url.toString() };
  return { kind: 'link', href: url.toString() };
}

/** Title (falls back to "About <name>"), text and parsed video of a restaurant's story. */
export function storyParts(r: StoryRestaurant) {
  return {
    title: r.story_title?.trim() || `About ${r.name}`,
    text: r.story_text?.trim() || '',
    video: parseStoryVideo(r.story_video_url),
  };
}

function StoryVideoView({ video, title }: { video: StoryVideo; title: string }) {
  if (video.kind === 'youtube') {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }
  if (video.kind === 'file') {
    return (
      <video controls playsInline preload="metadata" src={video.src} aria-label={title} className="aspect-video w-full rounded-2xl bg-ink object-contain">
        <a href={video.src} target="_blank" rel="noreferrer">
          Watch our story
        </a>
      </video>
    );
  }
  return (
    <Button href={video.href} external variant="outline" size="lg" className="w-full sm:w-auto" leftIcon={<Play className="h-4 w-4" aria-hidden />}>
      Watch our story
      <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </Button>
  );
}

/** Text with a "Read more" toggle when it runs long. */
function StoryText({ text, className }: { text: string; className?: string }) {
  const long = text.length > 320;
  const [expanded, setExpanded] = React.useState(false);
  const id = React.useId();
  return (
    <div className={className}>
      <p id={id} className={cn('whitespace-pre-line text-[15px] leading-relaxed text-fg/80', long && !expanded && 'line-clamp-5')}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-1 inline-flex min-h-[44px] items-center font-mono text-[11px] uppercase tracking-[0.14em] text-ember"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

function StoryBody({ restaurant, headingId, showTitle = true }: { restaurant: StoryRestaurant; headingId?: string; showTitle?: boolean }) {
  const { title, text, video } = storyParts(restaurant);
  const media = video && video.kind !== 'link';
  return (
    <>
      {showTitle && (
        <h2 id={headingId} className="mt-1.5 font-display text-xl font-bold leading-tight tracking-tight">
          {title}
        </h2>
      )}
      {media && video && (
        <div className="mt-4">
          <StoryVideoView video={video} title={`${restaurant.name}: ${title}`} />
        </div>
      )}
      {text && <StoryText text={text} className="mt-3" />}
      {video && video.kind === 'link' && (
        <div className="mt-4">
          <StoryVideoView video={video} title={title} />
        </div>
      )}
    </>
  );
}

/** "Our story" card for the tracker (only render when storyOn(restaurant)). */
export function StoryCard({ restaurant, className }: { restaurant: StoryRestaurant; className?: string }) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className={cn('rounded-3xl border border-line/10 bg-surface p-5 shadow-soft', className)}>
      <p className="eyebrow">Our story</p>
      <StoryBody restaurant={restaurant} headingId={headingId} />
    </section>
  );
}

/** Compact teaser at the bottom of the menu; opens the full story in a sheet (the video loads only then). */
export function StoryTeaser({ restaurant, className }: { restaurant: StoryRestaurant; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const { title, text, video } = storyParts(restaurant);
  const Icon = video ? Play : BookOpen;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-ink p-4 text-left text-paper shadow-soft transition-transform duration-300 ease-out active:scale-[0.99]',
          className,
        )}
        aria-haspopup="dialog"
      >
        <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-ember/30 blur-3xl" aria-hidden />
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-paper/10 text-ember">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-paper/60">Our story</span>
          <span className="mt-0.5 block truncate font-display text-[17px] font-bold leading-tight">{title}</span>
          {text && <span className="mt-0.5 line-clamp-2 block text-[13px] text-paper/70">{text}</span>}
          <span className="sr-only">{video ? 'Watch our story' : 'Read our story'}</span>
        </span>
        <ChevronRight className="relative h-5 w-5 shrink-0 text-paper/60 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={title} description={`Our story · ${restaurant.name}`}>
        <div className="-mt-1 pb-2">
          <StoryBody restaurant={restaurant} showTitle={false} />
        </div>
      </Sheet>
    </>
  );
}
