import React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import type { EventItem } from "@/data/staticEvents";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { getEventTime, isUpcoming } from "@/lib/content";
import { cn } from "@/lib/utils";

// Card markup follows the original Events archive cards (captured 2026-10-29)
export function EventCard({ event }: { event: EventItem }) {
  const upcoming = isUpcoming(event);
  const time = getEventTime(event);

  return (
    <article className="glass rounded-[20px] shadow-glass hover:-translate-y-1 transition-transform duration-200 overflow-hidden flex flex-col h-full">
      <div className="relative aspect-video bg-muted overflow-hidden">
        <FallbackImage
          src={event.poster}
          alt={`${event.name} poster`}
          fallbackName={event.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {!upcoming && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-google-red text-primary-foreground border-2 border-foreground font-pixel text-[7px] sm:text-[8px] shadow-[2px_2px_0px_hsl(var(--foreground))]">
            COMPLETED
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5 flex flex-col flex-1">
        {upcoming && (
          <span className="self-start mb-2 px-2.5 py-1 rounded-full bg-google-green text-primary-foreground border-2 border-foreground font-pixel text-[7px] sm:text-[8px]">
            UPCOMING
          </span>
        )}
        <h3 className="font-heading font-black text-lg sm:text-xl leading-tight">{event.name}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 font-mono text-[10px] sm:text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">Date: </span>
            {event.date}
          </span>
          {upcoming && time ? (
            <span className="flex items-center gap-1">{time}</span>
          ) : (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">Venue: </span>
              <span className="truncate max-w-[180px]">{event.venue}</span>
            </span>
          )}
        </div>
        <p className="font-body text-sm text-muted-foreground mt-3 leading-relaxed line-clamp-3">{event.description}</p>
        <div className={cn("grid gap-2 mt-auto pt-5", upcoming ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
          <Link
            href={`/events/${event.id}`}
            className="btn-brutal px-3 py-2.5 bg-card text-xs"
            aria-label={`${upcoming ? "View details" : "Details"}: ${event.name}`}
          >
            {upcoming ? "VIEW DETAILS" : "DETAILS"}
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
          {!upcoming && (
            <Link
              href={`/gallery?event=${event.id}`}
              className="btn-brutal px-3 py-2.5 bg-google-green text-primary-foreground text-xs"
              aria-label={`Gallery: ${event.name}`}
            >
              GALLERY
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
