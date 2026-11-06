import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";
import { STATIC_EVENTS, type EventItem } from "@/data/staticEvents";

export function UpcomingSection({ events = STATIC_EVENTS }: { events?: EventItem[] }) {
  const upcomingEvents = events.filter((event) => event.status === "upcoming");
  const featuredEvent = upcomingEvents.find((event) => event.isFeatured) ?? upcomingEvents[0];

  if (!featuredEvent) return null;

  return (
    <section className="graph-paper py-16 md:py-24 lg:py-28">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <div className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-glass text-xs font-heading font-black tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-google-green animate-pulse" />
            <span>WHAT&apos;S NEXT</span>
          </div>
          <h2 className="font-display text-heading-fluid uppercase text-foreground">
            UPCOMING EVENTS
          </h2>
        </div>

        {/* Featured Card */}
        <div className="glass relative rounded-[28px] border-2 border-foreground shadow-glass-lg overflow-hidden max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)] md:min-h-[380px]">
            {/* Poster Left */}
            <div className="relative aspect-[5/7] md:aspect-auto w-full h-full bg-muted flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r-2 border-foreground">
              <Image
                src={featuredEvent.poster}
                alt={`${featuredEvent.name} poster`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 40vw"
              />
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full border-2 border-foreground bg-google-green text-white font-heading font-black text-[10px] shadow-[3px_3px_0px_hsl(var(--foreground))]">
                UPCOMING
              </div>
            </div>

            {/* Content Right */}
            <div className="p-6 sm:p-8 md:p-10 flex flex-col justify-center space-y-5">
              <div>
                <h3 className="font-display text-2xl sm:text-3xl md:text-4xl leading-tight text-foreground">
                  {featuredEvent.name}
                </h3>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-foreground bg-white font-mono text-xs font-bold shadow-[2px_2px_0px_hsl(var(--foreground))]">
                  <Calendar className="w-3.5 h-3.5 text-google-blue" />
                  <span>{featuredEvent.date}</span>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-foreground bg-white font-mono text-xs font-bold shadow-[2px_2px_0px_hsl(var(--foreground))]">
                  <Sparkles className="w-3.5 h-3.5 text-google-yellow" />
                  <span>{featuredEvent.time}</span>
                </div>
              </div>

              {/* Summary */}
              <p className="font-body text-sm sm:text-base text-muted-foreground leading-relaxed">
                {featuredEvent.description}
              </p>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <Link
                  href={`/events/${featuredEvent.id}`}
                  className="btn-brutal px-6 py-3 bg-foreground text-background text-sm hover:bg-foreground/90 shadow-[4px_4px_0px_hsl(var(--foreground))]"
                >
                  <span>VIEW DETAILS</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
                <Link href="/events" className="btn-glass px-6 py-3 text-sm">
                  ALL EVENTS
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
