import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { sectionValues } from "@/data/siteContent";

/** content: the Content section "Home · Call to action" (built-in text by default). */
export function CtaSection({ content = sectionValues("home.cta") }: { content?: Record<string, string | number> }) {
  return (
    <section className="relative py-20 md:py-28 overflow-hidden border-t-[3px] border-foreground bg-google-blue">
      {/* Radial ambient background glows */}
      <div className="ambient-glow absolute top-10 left-10 w-72 h-72 bg-white/20 rounded-full blur-[110px] pointer-events-none" />
      <div className="ambient-glow absolute bottom-10 right-10 w-72 h-72 bg-google-yellow/30 rounded-full blur-[110px] pointer-events-none" />

      <div className="relative max-w-[1100px] mx-auto px-4 sm:px-6 md:px-8 text-center">
        <div className="glass-strong rounded-[28px] shadow-glass-lg px-6 py-12 sm:px-10 sm:py-16 md:p-16">
          <h2 className="font-display text-heading-fluid text-foreground uppercase tracking-tight leading-tight">
            {content.heading1}
            <br />
            {content.heading2}
          </h2>

          <p className="font-body text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto mt-4 leading-relaxed">
            {content.paragraph}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3.5 mt-8">
            <Link
              href="/events"
              className="btn-brutal px-6 py-3 bg-google-yellow text-foreground text-sm sm:text-base hover:bg-google-yellow/90 shadow-[4px_4px_0px_hsl(var(--foreground))]"
            >
              <span>JOIN AN EVENT</span>
              <ArrowRight className="w-4 h-4 ml-2 stroke-[2.5]" />
            </Link>
            <Link
              href="/team"
              className="btn-brutal px-6 py-3 bg-card text-foreground text-sm sm:text-base hover:bg-card/90 shadow-[4px_4px_0px_hsl(var(--foreground))]"
            >
              MEET THE TEAM
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
