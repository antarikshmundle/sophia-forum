import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { sectionValues } from "@/data/siteContent";

// Colour per position as on the live About page (captured 2026-10-29); figures and labels are content ("About · Statistics")
const STAT_TEXT = ["text-google-blue", "text-google-red", "text-google-yellow", "text-google-green"];

export function StatsBand({ content = sectionValues("about.stats") }: { content?: Record<string, string | number> }) {
  const STATS = STAT_TEXT.map((text, i) => ({ value: String(content[`value${i + 1}`]), label: String(content[`label${i + 1}`]), text }));
  return (
    <section className="bg-foreground py-16 md:py-24 border-y-[3px] border-foreground" aria-label="Forum in numbers">
      <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(({ value, label, text }) => (
            <div key={label} className="flex flex-col-reverse items-center gap-3">
              <dt className="font-pixel text-[8px] sm:text-[9px] text-background/70">{label}</dt>
              <dd className={`font-display text-5xl md:text-6xl ${text}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <Link href="/events" className="btn-brutal px-5 py-2.5 mt-10 bg-google-yellow text-foreground text-xs sm:text-sm">
          SEE WHAT WE&apos;VE DONE
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
