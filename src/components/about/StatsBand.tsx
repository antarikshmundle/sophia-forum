import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SiteCounts } from "@/data/siteContent";

// Colour per position as on the live About page (captured 2026-10-29). The figures are live published counts
// (siteData.loadCounts), never typed-in numbers; a count that is unknown or zero is not shown.
const STAT_DEFS: { key: keyof SiteCounts; label: string; text: string }[] = [
  { key: "hosted", label: "EVENTS HOSTED", text: "text-google-blue" },
  { key: "members", label: "TEAM MEMBERS", text: "text-google-red" },
  { key: "faculty", label: "FACULTY MEMBERS", text: "text-google-yellow" },
  { key: "gallery", label: "GALLERY ITEMS", text: "text-google-green" },
];
// the original band is 2 columns, 4 from md; fewer figures keep the same size
const STAT_GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 md:grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" };

export function StatsBand({ counts }: { counts?: SiteCounts }) {
  const STATS = counts
    ? STAT_DEFS.filter(({ key }) => typeof counts[key] === "number" && (counts[key] as number) > 0).map((d) => ({ ...d, value: String(counts[d.key]) }))
    : [];
  return (
    <section className="bg-foreground py-16 md:py-24 border-y-[3px] border-foreground" aria-label="Forum in numbers">
      <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
        {STATS.length > 0 && (
          <dl className={`grid ${STAT_GRID[STATS.length]} gap-8`}>
            {STATS.map(({ value, label, text }, i) => (
              <div key={label} className={`flex flex-col-reverse items-center gap-3${STATS.length === 3 && i === 2 ? " col-span-2 md:col-span-1" : ""}`}>
                <dt className="font-pixel text-[8px] sm:text-[9px] text-background/70">{label}</dt>
                <dd className={`font-display text-5xl md:text-6xl ${text}`}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <Link href="/events" className={`btn-brutal px-5 py-2.5 ${STATS.length > 0 ? "mt-10" : ""} bg-google-yellow text-foreground text-xs sm:text-sm`}>
          SEE WHAT WE&apos;VE DONE
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
