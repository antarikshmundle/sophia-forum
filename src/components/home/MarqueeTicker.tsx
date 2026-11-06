"use client";

import React from "react";
import { sectionValues } from "@/data/siteContent";

// Dot colours per position as in the original bundle; the words are content ("Home · Scrolling words")
const DOTS = ["bg-google-blue", "bg-google-red", "bg-google-yellow", "bg-google-green"];
const DEFAULT_WORDS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => String(sectionValues("home.marquee")[`word${i}`]));

export function MarqueeTicker({ words = DEFAULT_WORDS }: { words?: string[] }) {
  const MARQUEE_ITEMS = words.filter((w) => w.trim()).map((text, i) => ({ text, dotColor: DOTS[i % DOTS.length] }));
  return (
    <div className="w-full bg-[#121212] text-white border-y-[3px] border-foreground py-3 sm:py-3.5 overflow-hidden select-none">
      <div className="flex w-max animate-marquee">
        {/* Sequence 1 */}
        <div className="flex items-center shrink-0">
          {MARQUEE_ITEMS.map((item, index) => (
            <span
              key={`marquee-1-${index}`}
              className="inline-flex items-center gap-6 sm:gap-8 pr-6 sm:pr-8 font-display text-base sm:text-lg md:text-xl tracking-wide uppercase"
            >
              <span>{item.text}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${item.dotColor} shrink-0`} />
            </span>
          ))}
        </div>

        {/* Sequence 2 for continuous loop */}
        <div className="flex items-center shrink-0" aria-hidden="true">
          {MARQUEE_ITEMS.map((item, index) => (
            <span
              key={`marquee-2-${index}`}
              className="inline-flex items-center gap-6 sm:gap-8 pr-6 sm:pr-8 font-display text-base sm:text-lg md:text-xl tracking-wide uppercase"
            >
              <span>{item.text}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${item.dotColor} shrink-0`} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
