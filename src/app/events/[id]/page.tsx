import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Clock, ExternalLink, MapPin } from "lucide-react";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { CmsUnavailable } from "@/components/ui/CmsUnavailable";
import { ShareButton } from "@/components/events/ShareButton";
import { getEventTime, isRealLink, isUpcoming } from "@/lib/content";
import { loadEvent } from "@/lib/siteData";
import { cn } from "@/lib/utils";

type Params = Promise<{ id: string }>;

// Rendered per request: in CMS backend mode the events are the published records read on each request (a static,
// on-demand render can't read them), and Admin edits show at once. Demo mode serves the same HTML from the built-in data.
// Unknown IDs reach notFound() below, so the 404 is rendered for the real URL.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await loadEvent((await params).id);
  const event = loaded.ok ? loaded.data : undefined;
  if (!event) return {};
  return {
    title: `${event.name} | SOPHIA FORUM`,
    description: event.description,
  };
}

const metaChip =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-foreground/20 bg-card/70 font-mono text-xs text-muted-foreground";

// Layout follows the original event page (captured 2026-10-29)
export default async function EventDetailPage({ params }: { params: Params }) {
  const loaded = await loadEvent((await params).id);
  if (!loaded.ok) return <CmsUnavailable what="This event is" />;
  const event = loaded.data;
  if (!event) notFound();

  const upcoming = isUpcoming(event);
  const hasRegistration = upcoming && isRealLink(event.registrationLink);
  const time = getEventTime(event);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-12 sm:pb-16">
      <Link href="/events" className="btn-brutal px-4 py-2 bg-card text-sm">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        BACK TO EVENTS
      </Link>

      <article className="glass rounded-[28px] shadow-glass-lg overflow-hidden mt-8">
        <div className="relative aspect-video bg-muted overflow-hidden">
          <FallbackImage
            src={event.poster}
            alt={`${event.name} poster`}
            fallbackName={event.name}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>

        <div className="p-6 md:p-8">
          <span
            className={cn(
              "font-pixel text-[8px] px-3 py-1.5 rounded-full border-2 border-foreground inline-block mb-3 text-primary-foreground",
              upcoming ? "bg-google-green" : "bg-google-red"
            )}
          >
            ● {upcoming ? "UPCOMING" : "COMPLETED"}
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-tight">{event.name}</h1>

          <ul className="flex flex-wrap gap-2.5 mt-4" aria-label="Event details">
            <li className={metaChip}>
              <CalendarDays className="w-3.5 h-3.5 text-google-blue" aria-hidden="true" />
              <span className="sr-only">Date: </span>
              <time dateTime={event.date}>{event.date}</time>
            </li>
            {time && (
              <li className={metaChip}>
                <Clock className="w-3.5 h-3.5 text-google-red" aria-hidden="true" />
                <span className="sr-only">Time: </span>
                {time}
              </li>
            )}
            <li className={metaChip}>
              <MapPin className="w-3.5 h-3.5 text-google-green" aria-hidden="true" />
              <span className="sr-only">Venue: </span>
              {event.venue}
            </li>
          </ul>

          <p className="font-body text-muted-foreground mt-6 leading-relaxed">{event.description}</p>

          <div className="flex gap-3 mt-8 flex-wrap">
            {hasRegistration && (
              <a
                href={event.registrationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-brutal px-6 py-3 bg-google-green text-primary-foreground text-base sm:text-lg"
              >
                REGISTER NOW
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
            <Link href={`/gallery?event=${event.id}`} className="btn-brutal px-6 py-3 bg-card text-base sm:text-lg">
              VIEW GALLERY
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <ShareButton title={event.name} />
          </div>

          {upcoming && !hasRegistration && (
            <p className="font-mono text-xs text-muted-foreground mt-4">Registration link not available yet.</p>
          )}
        </div>
      </article>
    </div>
  );
}
