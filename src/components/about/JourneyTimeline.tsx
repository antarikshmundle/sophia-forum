"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DEFAULT_MILESTONES, type MilestoneEntry } from "@/data/siteContent";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

// bg-* colour class → matching top-border class for the active card
const BORDER_TOP: Record<string, string> = {
  "bg-google-blue": "border-t-google-blue",
  "bg-google-red": "border-t-google-red",
  "bg-google-yellow": "border-t-google-yellow",
  "bg-google-green": "border-t-google-green",
};

// Layout follows the original "OUR JOURNEY" section (captured 2026-10-29)
// Colours cycle per position (as the original's first four)
const COLORS = ["bg-google-blue", "bg-google-red", "bg-google-yellow", "bg-google-green"];

/** milestones: the Content list "About · Milestones" (built-in: the verified PCE/department anchors). */
export function JourneyTimeline({ milestones = DEFAULT_MILESTONES }: { milestones?: MilestoneEntry[] }) {
  const STATIC_MILESTONES = milestones.map((m, i) => ({ ...m, color: COLORS[i % COLORS.length] }));
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const total = STATIC_MILESTONES.length;
  const milestone = STATIC_MILESTONES[active];
  if (!milestone) return null; // no milestones: the section is not shown

  const goTo = (index: number) => {
    const next = (index + total) % total;
    setDirection(next > active ? 1 : -1);
    setActive(next);
  };

  return (
    <section className="graph-paper py-16 md:py-24 overflow-hidden" aria-labelledby="journey-heading">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 md:gap-4 mb-8 md:mb-10">
          <div className="min-w-0">
            <span className="font-pixel text-[10px] text-google-blue">MILESTONES</span>
            <h2 id="journey-heading" className="font-display text-4xl sm:text-5xl md:text-6xl mt-2">
              OUR JOURNEY
            </h2>
          </div>
          <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
            <span className="font-pixel text-[10px] text-muted-foreground" aria-live="polite">
              {pad(active + 1)} / {pad(total)}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => goTo(active - 1)} aria-label="Previous milestone" className="btn-brutal !min-h-0 !rounded-full p-2.5 bg-card">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => goTo(active + 1)} aria-label="Next milestone" className="btn-brutal !min-h-0 !rounded-full p-2.5 bg-card">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Dot timeline */}
        <div className="relative mb-8 md:mb-10">
          <div aria-hidden="true" className="absolute left-10 right-10 top-3 h-[3px] bg-foreground/15 rounded-full" />
          <ol className="relative flex justify-between" aria-label="Milestone years">
            {STATIC_MILESTONES.map((m, i) => {
              const isActive = i === active;
              return (
                <li key={m.year}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Show ${m.year} milestone`}
                    aria-current={isActive ? "step" : undefined}
                    className="group flex flex-col items-center gap-2.5"
                  >
                    <span className="relative z-10 flex h-6 items-center justify-center">
                      <span
                        className={cn(
                          "block w-4 h-4 rounded-full border-[3px] border-foreground transition-colors",
                          isActive ? cn(m.color, "shadow-[0_0_0_5px_hsl(var(--foreground)/0.12)]") : "bg-card group-hover:bg-muted"
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "font-heading font-black text-[10px] sm:text-xs tracking-wide transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {m.year}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.article
              key={milestone.year}
              custom={direction}
              initial={reduceMotion ? false : { opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -40 }}
              transition={{ duration: reduceMotion ? 0 : 0.25 }}
              className={cn(
                "rounded-[20px] border-[3px] border-t-[6px] border-foreground bg-card shadow-[6px_6px_0px_hsl(var(--foreground))] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8",
                BORDER_TOP[milestone.color]
              )}
            >
              <div className="shrink-0 sm:pr-8 sm:border-r-2 sm:border-foreground/15">
                <div className="font-display text-6xl sm:text-7xl leading-none">{milestone.year}</div>
                <div className="font-pixel text-[8px] text-muted-foreground mt-2">MILESTONE {pad(active + 1)}</div>
              </div>
              <div className="space-y-2">
                <h3 className="font-heading font-bold text-xl sm:text-2xl">{milestone.title}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed max-w-2xl">{milestone.description}</p>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
