import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { EventCard } from "@/components/events/EventCard";
import { CmsUnavailable } from "@/components/ui/CmsUnavailable";
import { getEventTime, isRealLink, isUpcoming } from "@/lib/content";
import { loadEvents } from "@/lib/siteData";

export const metadata: Metadata = {
  title: "Events | SOPHIA FORUM",
  description: "Upcoming and past hackathons, competitions and cultural events by Sophia Forum.",
};

function SectionHeader({ label, title, aside, dot }: { label: string; title: string; aside: string; dot: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6 sm:mb-8">
      <div>
        <span className="inline-flex items-center gap-2 font-pixel text-[9px] sm:text-[10px] text-foreground/80">
          <span className={`w-2 h-2 rounded-full border border-foreground ${dot}`} aria-hidden="true" />
          {label}
        </span>
        <h2 className="font-display text-heading-fluid mt-2">{title}</h2>
      </div>
      <span className="font-pixel text-[8px] sm:text-[9px] text-muted-foreground">{aside}</span>
    </div>
  );
}

const metaChip =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-foreground/20 bg-card/70 font-mono text-xs text-muted-foreground";

export default async function EventsPage() {
  const loaded = await loadEvents();
  const events = loaded.ok ? loaded.data : [];
  const upcoming = events.filter(isUpcoming);
  const featured = upcoming.find((event) => event.isFeatured) ?? upcoming[0];
  const moreUpcoming = upcoming.filter((event) => event !== featured);
  const past = events.filter((event) => !isUpcoming(event)).sort((a, b) => b.date.localeCompare(a.date));
  const featuredTime = featured ? getEventTime(featured) : null;

  return (
    <>
      <PageHero
        accent="yellow"
        spacedTitle
        badge="WORKSHOPS • HACKATHONS • COMPETITIONS"
        title="EVENTS"
        subtitle="Discover workshops, hackathons, competitions, talks, and experiences hosted by Sophia Forum."
      />

      {featured && (
        <section className="graph-paper py-8 sm:py-12 md:py-16" aria-labelledby="featured-heading">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
            <SectionHeader label="FEATURED EVENT" title="DON'T MISS THIS" aside="NEXT UP" dot="bg-google-yellow" />
            <article className="glass rounded-[28px] shadow-glass-lg overflow-hidden grid lg:grid-cols-2">
              <div className="relative aspect-[16/10] sm:aspect-video lg:aspect-auto lg:min-h-[320px] bg-muted overflow-hidden">
                {/* Not `fill`: as on the original, the poster's own height sets the card height on desktop
                    (lg:aspect-auto), while the mobile/tablet aspect ratios crop it. width/height only
                    reserve space until the real image ratio is known. */}
                <FallbackImage
                  src={featured.poster}
                  alt={`${featured.name} poster`}
                  fallbackName={featured.name}
                  width={1080}
                  height={1512}
                  priority
                  className="w-full h-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-google-green text-primary-foreground border-2 border-foreground font-pixel text-[7px] sm:text-[8px] shadow-[2px_2px_0px_hsl(var(--foreground))]">
                  UPCOMING
                </span>
              </div>
              <div className="p-5 sm:p-6 md:p-8 flex flex-col justify-center gap-4">
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-full border-2 border-foreground bg-google-blue text-primary-foreground font-pixel text-[7px] sm:text-[8px]">
                    FEATURED
                  </span>
                  <span className="px-2.5 py-1 rounded-full border-2 border-foreground bg-card font-pixel text-[7px] sm:text-[8px]">
                    EVENT
                  </span>
                </div>
                <h3 id="featured-heading" className="font-display text-3xl sm:text-4xl leading-tight">
                  {featured.name}
                </h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Event details">
                  <li className={metaChip}>
                    <CalendarDays className="w-3.5 h-3.5 text-google-blue" aria-hidden="true" />
                    <span className="sr-only">Date: </span>
                    {featured.date}
                  </li>
                  {featuredTime && (
                    <li className={metaChip}>
                      <Clock className="w-3.5 h-3.5 text-google-red" aria-hidden="true" />
                      <span className="sr-only">Time: </span>
                      {featuredTime}
                    </li>
                  )}
                  <li className={`${metaChip} sm:col-span-2`}>
                    <MapPin className="w-3.5 h-3.5 text-google-green" aria-hidden="true" />
                    <span className="sr-only">Venue: </span>
                    {featured.venue}
                  </li>
                </ul>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">{featured.description}</p>
                <div className="flex flex-wrap gap-3 pt-1">
                  {isRealLink(featured.registrationLink) && (
                    <a
                      href={featured.registrationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-brutal px-5 py-2.5 text-xs bg-google-green text-primary-foreground"
                    >
                      REGISTER NOW
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                  <Link href={`/events/${featured.id}`} className="btn-brutal px-5 py-2.5 text-xs bg-card">
                    EVENT PAGE
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </section>
      )}

      {moreUpcoming.length > 0 && (
        <section className="py-10 sm:py-14 md:py-20 bg-background" aria-label="More upcoming events">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
            <SectionHeader label="WHAT'S NEXT" title="UPCOMING" aside={`${moreUpcoming.length} MORE EVENTS`} dot="bg-google-green" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {moreUpcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        </section>
      )}

      {loaded.ok ? (
      <section className="graph-paper py-10 sm:py-14 md:py-20" aria-label="Past events">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
          <SectionHeader label="EVENT ARCHIVE" title="PAST EVENTS" aside={`${past.length} EVENTS`} dot="bg-google-red" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </section>
      ) : (
        <CmsUnavailable what="Events are" />
      )}
    </>
  );
}
