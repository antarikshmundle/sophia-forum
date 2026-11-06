"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CalendarDays, Download, Filter, Image as ImageIcon, Layers, Maximize2, Video } from "lucide-react";
import { GALLERY_PHOTOS, STATIC_VIDEOS, type GalleryMediaItem } from "@/data/staticGallery";
import { STATIC_EVENTS, type EventItem } from "@/data/staticEvents";
import { cn } from "@/lib/utils";
import { LightboxModal } from "./LightboxModal";
import { VideoCard } from "./VideoCard";

type MediaFilter = "all" | "photo" | "video";
const ALL = "all";

export interface GalleryFilters {
  year?: string;
  media?: string;
  event?: string;
}

function indexes(photos: GalleryMediaItem[], videos: GalleryMediaItem[], events: EventItem[]) {
  const allItems: GalleryMediaItem[] = [...photos, ...videos];
  return {
    YEARS: Array.from(new Set(allItems.map((item) => String(item.year)))).sort((a, b) => b.localeCompare(a)),
    EVENTS: Array.from(new Set(allItems.map((item) => item.event))).sort(),
    // Event links use ?event=<event id> (as on the original); gallery items are tagged by event name
    EVENT_NAME_BY_ID: new Map(events.map((e) => [e.id, e.name])),
    EVENT_ID_BY_NAME: new Map(events.map((e) => [e.name, e.id])),
  };
}

function resolveEvent(index: ReturnType<typeof indexes>, value?: string): string {
  if (!value) return ALL;
  if (index.EVENT_NAME_BY_ID.has(value)) return index.EVENT_NAME_BY_ID.get(value)!;
  return index.EVENTS.includes(value) ? value : ALL;
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-heading font-bold text-xs transition-colors",
        active ? "bg-foreground text-background" : "text-foreground/80 hover:bg-black/5"
      )}
    >
      {children}
    </button>
  );
}

function EventChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 py-2 rounded-full border-2 border-foreground font-heading font-bold text-xs transition-all",
        active ? "bg-google-yellow text-foreground shadow-[3px_3px_0px_hsl(var(--foreground))]" : "bg-card text-foreground/80 hover:-translate-y-px"
      )}
    >
      {label}
      {count !== undefined && <span className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">{count}</span>}
    </button>
  );
}

// Incremental loading: the original shows 24 photos and 8 videos per batch
const PHOTO_BATCH = 24;
const VIDEO_BATCH = 8;

interface GalleryClientProps {
  initialFilters: GalleryFilters;
  /** The built-in media (demo mode) or the published records (CMS backend mode). */
  photos?: GalleryMediaItem[];
  videos?: GalleryMediaItem[];
  events?: EventItem[];
}

export function GalleryClient({ initialFilters, photos: allPhotos = GALLERY_PHOTOS, videos: allVideos = STATIC_VIDEOS, events: allEvents = STATIC_EVENTS }: GalleryClientProps) {
  const index = useMemo(() => indexes(allPhotos, allVideos, allEvents), [allPhotos, allVideos, allEvents]);
  const { YEARS, EVENTS, EVENT_ID_BY_NAME } = index;
  const [year, setYear] = useState(YEARS.includes(initialFilters.year ?? "") ? initialFilters.year! : ALL);
  const [media, setMedia] = useState<MediaFilter>(
    initialFilters.media === "photo" || initialFilters.media === "video" ? initialFilters.media : "all"
  );
  const [event, setEvent] = useState(() => resolveEvent(index, initialFilters.event));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Keep the URL shareable without triggering a navigation
  useEffect(() => {
    const params = new URLSearchParams();
    if (year !== ALL) params.set("year", year);
    if (media !== "all") params.set("media", media);
    if (event !== ALL) params.set("event", EVENT_ID_BY_NAME.get(event) ?? event);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [year, media, event, EVENT_ID_BY_NAME]);

  const matches = (item: GalleryMediaItem) =>
    (year === ALL || String(item.year) === year) && (event === ALL || item.event === event);

  const photos = media === "video" ? [] : allPhotos.filter(matches);
  const videos = media === "photo" ? [] : allVideos.filter(matches);

  // Batch sizes reset whenever the filters change
  const filterKey = `${year}|${media}|${event}`;
  const [pages, setPages] = useState({ key: filterKey, photos: PHOTO_BATCH, videos: VIDEO_BATCH });
  // Record every filter change, so returning to an earlier filter also starts from the first batch
  // (Phase 6C fix: previously ALL → Flashmob → ALL restored the earlier expanded batch)
  if (pages.key !== filterKey) setPages({ key: filterKey, photos: PHOTO_BATCH, videos: VIDEO_BATCH });
  const photoLimit = pages.key === filterKey ? pages.photos : PHOTO_BATCH;
  const videoLimit = pages.key === filterKey ? pages.videos : VIDEO_BATCH;
  const visiblePhotos = photos.slice(0, photoLimit);
  const visibleVideos = videos.slice(0, videoLimit);

  // After "load more", move focus to the first newly revealed item
  const focusNext = useRef<{ kind: "photo" | "video"; index: number } | null>(null);
  const photoListRef = useRef<HTMLUListElement>(null);
  const videoListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const list = target.kind === "photo" ? photoListRef.current : videoListRef.current;
    list?.children[target.index]?.querySelector<HTMLElement>("button, a[href]")?.focus();
  }, [photoLimit, videoLimit]);

  const loadMore = (kind: "photo" | "video") => {
    focusNext.current = { kind, index: kind === "photo" ? photoLimit : videoLimit };
    setPages({
      key: filterKey,
      photos: kind === "photo" ? photoLimit + PHOTO_BATCH : photoLimit,
      videos: kind === "video" ? videoLimit + VIDEO_BATCH : videoLimit,
    });
  };

  const countFor = (predicate: (item: GalleryMediaItem) => boolean) => [...allPhotos, ...allVideos].filter(predicate).length;
  const resetFilters = () => {
    setYear(ALL);
    setMedia("all");
    setEvent(ALL);
  };

  return (
    <>
      {/* Filter toolbar (layout follows the original gallery, captured 2026-10-29) */}
      <section aria-label="Gallery filters" className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 pt-10 sm:pt-12 mb-10">
        <div className="rounded-[24px] border-[3px] border-foreground bg-card shadow-[6px_6px_0px_hsl(var(--foreground))] p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 font-heading font-bold text-xs text-muted-foreground mb-2.5">
                <CalendarDays className="w-3.5 h-3.5 text-google-blue" aria-hidden="true" />
                YEAR
              </p>
              <div role="group" aria-label="Filter by year" className="inline-flex flex-wrap gap-1 rounded-2xl border-2 border-foreground p-1">
                <Segment active={year === ALL} onClick={() => setYear(ALL)}>ALL</Segment>
                {YEARS.map((y) => (
                  <Segment key={y} active={year === y} onClick={() => setYear(y)}>
                    {y}
                  </Segment>
                ))}
              </div>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-heading font-bold text-xs text-muted-foreground mb-2.5">
                <Layers className="w-3.5 h-3.5 text-google-green" aria-hidden="true" />
                MEDIA
              </p>
              <div role="group" aria-label="Filter by media type" className="inline-flex flex-wrap gap-1 rounded-2xl border-2 border-foreground p-1">
                <Segment active={media === "all"} onClick={() => setMedia("all")}>ALL</Segment>
                <Segment active={media === "photo"} onClick={() => setMedia("photo")}>
                  <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  PHOTOS <span className="font-mono text-[10px] opacity-60">{countFor((i) => i.category === "photo")}</span>
                </Segment>
                <Segment active={media === "video"} onClick={() => setMedia("video")}>
                  <Video className="w-3.5 h-3.5" aria-hidden="true" />
                  VIDEOS <span className="font-mono text-[10px] opacity-60">{countFor((i) => i.category === "video")}</span>
                </Segment>
              </div>
            </div>
          </div>
          <div className="border-t-2 border-foreground/10 mt-4 pt-4">
            <p className="flex items-center gap-1.5 font-heading font-bold text-xs text-muted-foreground mb-2.5">
              <Filter className="w-3.5 h-3.5 text-[#8C6B00]" aria-hidden="true" />
              EVENTS
            </p>
            <div role="group" aria-label="Filter by event" className="flex flex-wrap gap-2">
              <EventChip active={event === ALL} onClick={() => setEvent(ALL)} label="ALL EVENTS" />
              {(EVENTS.includes(event) || event === ALL ? EVENTS : [...EVENTS, event]).map((name) => (
                <EventChip key={name} active={event === name} onClick={() => setEvent(name)} label={name} count={countFor((i) => i.event === name)} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        Showing {visiblePhotos.length} of {photos.length} photos and {visibleVideos.length} of {videos.length} videos
      </p>

      {photos.length === 0 && videos.length === 0 && (
        <div className="w-[calc(100%-2rem)] max-w-xl mx-auto mb-16 text-center brutal-card p-8">
          <p className="font-display text-2xl uppercase mb-3">Nothing here yet</p>
          {allPhotos.length === 0 && allVideos.length === 0 ? (
            // nothing published at all: there is no filter to reset
            <p className="font-body text-sm text-muted-foreground">Photos and videos will appear here once they are published.</p>
          ) : (
            <>
              <p className="font-body text-sm text-muted-foreground mb-5">No media matches these filters.</p>
              <button type="button" onClick={resetFilters} className="btn-brutal px-5 py-2 text-xs bg-foreground text-background">
                RESET FILTERS
              </button>
            </>
          )}
        </div>
      )}

      {photos.length > 0 && (
        <section aria-labelledby="photos-heading" className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 mb-14">
          <div className="flex items-center gap-3 pb-4 mb-6 border-b-2 border-foreground/10">
            <span className="w-10 h-10 rounded-xl border-2 border-foreground bg-google-blue/15 text-google-blue flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="photos-heading" className="font-display text-3xl sm:text-4xl leading-none">PHOTOS</h2>
              <p className="font-mono text-xs text-muted-foreground mt-1">
                Showing {visiblePhotos.length} of {photos.length} photos
              </p>
            </div>
          </div>
          <ul ref={photoListRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {visiblePhotos.map((photo, i) => (
              <li key={photo.id} className="rounded-[20px] border-[3px] border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))] overflow-hidden flex flex-col">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group relative aspect-[4/3] bg-muted border-b-[3px] border-foreground overflow-hidden"
                  aria-label={`Open photo: ${photo.title} (${photo.year})`}
                >
                  <Image
                    src={photo.thumbnailUrl ?? photo.url}
                    alt={photo.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full border-2 border-foreground bg-card font-mono text-[10px] font-bold">
                    {photo.year}
                  </span>
                  <span className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full border-2 border-foreground bg-card flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4" aria-hidden="true" />
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 px-3.5 py-3">
                  <span className="font-heading font-bold text-sm truncate">{photo.title}</span>
                  <a
                    href={photo.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 w-8 h-8 rounded-full border-2 border-foreground bg-card flex items-center justify-center hover:bg-google-yellow transition-colors"
                    aria-label={`Download ${photo.title}`}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {photos.length > visiblePhotos.length && (
            <div className="flex justify-center mt-8">
              <button type="button" onClick={() => loadMore("photo")} className="btn-brutal px-6 py-3 bg-card text-sm">
                LOAD MORE PHOTOS ({photos.length - visiblePhotos.length} remaining)
              </button>
            </div>
          )}
        </section>
      )}

      {videos.length > 0 && (
        <section aria-labelledby="videos-heading" className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 mb-14">
          <div className="flex items-center gap-3 pb-4 mb-6 border-b-2 border-foreground/10">
            <span className="w-10 h-10 rounded-xl border-2 border-foreground bg-google-red/15 text-google-red flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="videos-heading" className="font-display text-3xl sm:text-4xl leading-none">VIDEOS &amp; CLIPS</h2>
              <p className="font-mono text-xs text-muted-foreground mt-1">
                Showing {visibleVideos.length} of {videos.length} videos
              </p>
            </div>
          </div>
          <div ref={videoListRef} className="grid md:grid-cols-2 gap-6">
            {visibleVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
          {videos.length > visibleVideos.length && (
            <div className="flex justify-center mt-8">
              <button type="button" onClick={() => loadMore("video")} className="btn-brutal px-6 py-3 bg-card text-sm">
                LOAD MORE VIDEOS ({videos.length - visibleVideos.length} remaining)
              </button>
            </div>
          )}
        </section>
      )}

      {lightboxIndex !== null && (
        <LightboxModal
          items={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
