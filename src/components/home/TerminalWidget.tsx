"use client";

import { sectionValues } from "@/data/siteContent";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

// fallback without counts: lines with a live-count placeholder ({members}, …) are left out
const DEFAULT_LINES = [1, 2, 3, 4, 5, 6, 7].map((i) => String(sectionValues("home.terminal")[`line${i}`])).filter((line) => !/\{[a-z]+\}/.test(line));

/**
 * The home "community.ts" terminal, animated as on the live INGENIOUS homepage (production bundle, 2026-11-06):
 * the card fades/scales in (0.6 s, delay 0.3 s); each line fades in at 0.3 s + its 0.3 s step; the last line ends in a
 * blinking cursor (animate-cursor-blink); the card follows the mouse by up to 10 px within the hero section.
 * Reduced motion: final state at once, no parallax, steady cursor. Only opacity/transform change, so no layout shift.
 * lines: the Content section "Home · Terminal lines" with live counts filled in (empty lines are skipped).
 */
export function TerminalWidget({ lines = DEFAULT_LINES }: { lines?: string[] }) {
  const LINES = useMemo(() => lines.filter((text) => text.trim()).map((text, i) => ({ text, delay: i * 0.3 })), [lines]);
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Mouse parallax relative to the hero section, as on the original (off for reduced motion)
  useEffect(() => {
    if (reduceMotion) return;
    const section = ref.current?.closest("section");
    if (!section) return;
    const onMove = (e: MouseEvent) => {
      const r = section.getBoundingClientRect();
      setOffset({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduceMotion]);

  // the same initial styles on the server and the client (no hydration mismatch); reduced motion only skips the timing
  const timing = (t: { duration?: number; delay?: number }) => (reduceMotion ? { duration: 0, delay: 0 } : t);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={timing({ duration: 0.6, delay: 0.3 })}
    >
      <div
        className="transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: `translate3d(${offset.x * 10}px, ${offset.y * 10}px, 0)` }}
      >
        <div className="rounded-[20px] border-[3px] border-foreground bg-foreground shadow-[6px_6px_0px_hsl(var(--foreground))] sm:shadow-[8px_8px_0px_hsl(var(--foreground))] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-background/20 bg-foreground">
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="w-3 h-3 rounded-full bg-google-red" />
              <span className="w-3 h-3 rounded-full bg-google-yellow" />
              <span className="w-3 h-3 rounded-full bg-google-green" />
            </div>
            <span className="font-mono text-xs text-background/60 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
              community.ts
            </span>
          </div>

          <div className="p-5 sm:p-6 space-y-2 font-mono text-xs sm:text-sm min-h-[260px] flex flex-col justify-center">
            {LINES.map((line, i) => (
              <motion.p
                key={line.text}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={timing({ delay: line.delay + 0.3 })}
                className={cn(
                  line.text.startsWith("$") ? "text-google-green font-bold" : line.text.startsWith(">") ? "text-background/70" : "text-background/90"
                )}
              >
                {line.text}
                {i === LINES.length - 1 && (
                  <span className="animate-cursor-blink ml-1 text-google-green" aria-hidden="true">
                    _
                  </span>
                )}
              </motion.p>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
