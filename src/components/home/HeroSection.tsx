"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Users, GraduationCap, Images, type LucideIcon } from "lucide-react";
import { TerminalWidget } from "./TerminalWidget";
import { sectionValues, type SiteCounts } from "@/data/siteContent";

interface Stat {
  icon: LucideIcon;
  label: string;
  value: number;
  text: string;
  chip: string;
}

// Card colours in the order of the live homepage (captured 2026-10-29). The figures are live published counts
// (siteData.loadCounts), never typed-in numbers; a count that is unknown or zero is not shown.
const STAT_DEFS: (Omit<Stat, "value"> & { key: keyof SiteCounts })[] = [
  { key: "events", label: "Events", icon: Calendar, text: "text-google-blue", chip: "bg-google-blue/15 group-hover:bg-google-blue/25" },
  { key: "members", label: "Members", icon: Users, text: "text-google-red", chip: "bg-google-red/15 group-hover:bg-google-red/25" },
  { key: "faculty", label: "Faculty", icon: GraduationCap, text: "text-google-yellow", chip: "bg-google-yellow/20 group-hover:bg-google-yellow/30" },
  { key: "gallery", label: "Gallery", icon: Images, text: "text-google-green", chip: "bg-google-green/15 group-hover:bg-google-green/25" },
];
// the original row is 2 columns, 4 from lg; fewer cards keep the same card size and spacing
const STAT_GRID: Record<number, string> = { 1: "grid-cols-2", 2: "grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4" };

/** content: the Content section "Home · Hero"; terminal: the terminal lines; counts: live published counts. */
export function HeroSection({ content = sectionValues("home.hero"), terminal, counts }: { content?: Record<string, string | number>; terminal?: string[]; counts?: SiteCounts }) {
  const STATS: Stat[] = counts
    ? STAT_DEFS.filter(({ key }) => typeof counts[key] === "number" && (counts[key] as number) > 0).map(({ key, ...def }) => ({ ...def, value: counts[key] as number }))
    : [];
  // Final values render by default (server HTML, no-JS, reduced motion); only the count-up starts from 0
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    // Skip the count-up for low-power devices and reduced-motion users
    const skipAnimation =
      document.documentElement.classList.contains("low-power") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (skipAnimation) return;

    // Number count-up animation
    const duration = 1800;
    const steps = 36;
    let step = 0;
    setProgress(0);
    const timer = setInterval(() => {
      step++;
      setProgress(Math.min(step / steps, 1));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="graph-paper min-h-[85vh] lg:min-h-screen flex flex-col justify-center relative overflow-hidden -mt-20 sm:-mt-24 pt-20 sm:pt-24 md:pt-28 pb-12 sm:pb-16 md:pb-20">
      {/* Ambient background glows */}
      <div className="ambient-glow absolute top-1/4 right-1/4 w-96 h-96 bg-google-blue/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="ambient-glow absolute bottom-1/4 left-1/4 w-96 h-96 bg-google-yellow/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 w-full">
        <div className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-center mb-8 sm:mb-12 lg:mb-16">
          {/* Left Column: Headlines & CTA */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5 lg:space-y-6">
            {/* Pill Badge */}
            <div className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-glass text-xs font-heading font-bold">
              <span className="w-2 h-2 rounded-full bg-google-green animate-pulse" />
              <span className="tracking-wide text-foreground/90">{content.badge}</span>
            </div>

            {/* Pixel Main Title */}
            <h1 className="font-display text-display-fluid">
              {content.title1}
              <br />
              {content.title2}
            </h1>

            {/* Subtitle */}
            <p className="font-body text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
              {content.subtitleBefore} {content.subtitleBold && <span className="font-bold text-foreground">{content.subtitleBold}</span>} {content.subtitleAfter}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Link href="/events" className="btn-brutal px-6 py-3 bg-foreground text-background text-sm sm:text-base">
                EXPLORE EVENTS
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </Link>
              <Link href="/about" className="btn-glass px-6 py-3 text-sm sm:text-base">
                ABOUT US
              </Link>
            </div>
          </div>

          {/* Right Column: Interactive Terminal Widget */}
          <div className="lg:col-span-5">
            <TerminalWidget lines={terminal} />
          </div>
        </div>

        {/* Stats Row: live published counts */}
        {STATS.length > 0 && (
        <div className={`grid ${STAT_GRID[STATS.length]} gap-3 sm:gap-4 lg:gap-5`}>
          {STATS.map(({ icon: Icon, label, value, text, chip }, i) => (
            <div
              key={label}
              className={`group glass rounded-[20px] shadow-glass hover:shadow-glass-lg hover:-translate-y-1 transition-all duration-200 p-3 sm:p-4 lg:p-5 flex items-center gap-2.5 sm:gap-3${STATS.length === 3 && i === 2 ? " col-span-2 lg:col-span-1" : ""}`}
            >
              <div className={`p-2 sm:p-2.5 rounded-xl border-2 border-foreground transition-colors shrink-0 ${chip}`}>
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5] ${text}`} />
              </div>
              <div>
                <div className={`font-display text-xl sm:text-2xl lg:text-3xl leading-none ${text}`}>
                  <span aria-hidden="true">{Math.round(value * progress)}</span>
                  <span className="sr-only">{value}</span>
                </div>
                <div className="font-heading text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5 sm:mt-1">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </section>
  );
}
