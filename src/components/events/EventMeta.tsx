import React from "react";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import type { EventItem } from "@/data/staticEvents";
import { getEventTime, isUpcoming } from "@/lib/content";
import { cn } from "@/lib/utils";

const badge =
  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-foreground bg-card font-mono text-xs font-bold shadow-[2px_2px_0px_hsl(var(--foreground))]";

export function EventMeta({ event, className }: { event: EventItem; className?: string }) {
  const time = getEventTime(event);
  return (
    <ul className={cn("flex flex-wrap gap-2.5", className)} aria-label="Event details">
      <li className={badge}>
        <CalendarDays className="w-3.5 h-3.5 text-google-blue" aria-hidden="true" />
        <span className="sr-only">Date: </span>
        <time dateTime={event.date}>{event.date}</time>
      </li>
      {time && (
        <li className={badge}>
          <Clock className="w-3.5 h-3.5 text-[#8C6B00]" aria-hidden="true" />
          <span className="sr-only">Time: </span>
          {time}
        </li>
      )}
      <li className={badge}>
        <MapPin className="w-3.5 h-3.5 text-google-red" aria-hidden="true" />
        <span className="sr-only">Venue: </span>
        {event.venue}
      </li>
    </ul>
  );
}

export function StatusPill({ event, className }: { event: EventItem; className?: string }) {
  const upcoming = isUpcoming(event);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-foreground font-heading font-black text-[10px] tracking-wider text-white shadow-[2px_2px_0px_hsl(var(--foreground))]",
        upcoming ? "bg-google-green" : "bg-google-red",
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
      {upcoming ? "UPCOMING" : "COMPLETED"}
    </span>
  );
}
