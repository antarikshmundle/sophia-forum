"use client";

import { sectionValues } from "@/data/siteContent";
import React, { useState, useEffect, useMemo } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_LINES = [1, 2, 3, 4, 5, 6, 7].map((i) => String(sectionValues("home.terminal")[`line${i}`]));

/** lines: the Content section "Home · Terminal lines" (empty lines are skipped); reveal delays as in the original bundle. */
export function TerminalWidget({ lines = DEFAULT_LINES }: { lines?: string[] }) {
  const LINES = useMemo(() => lines.filter((text) => text.trim()).map((text, i) => ({ text, delay: i * 0.3 })), [lines]);
  const [visibleCount, setVisibleCount] = useState(LINES.length);

  useEffect(() => {
    const skipAnimation =
      document.documentElement.classList.contains("low-power") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (skipAnimation) return;

    // Progressive line reveal
    setVisibleCount(0);
    const timers = LINES.map((line, i) => window.setTimeout(() => setVisibleCount(i + 1), line.delay * 1000 + 100));
    return () => timers.forEach(clearTimeout);
  }, [LINES]);

  return (
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
        {LINES.map((line, i) => {
          const isCommand = line.text.startsWith("$");
          const isLast = i === LINES.length - 1;
          return (
            <p
              key={line.text}
              className={cn(
                "transition-opacity duration-300",
                isCommand ? "text-google-green" : "text-background/80",
                i < visibleCount ? "opacity-100" : "opacity-0"
              )}
            >
              {line.text}
              {isLast && (
                <span className="animate-pulse ml-1 text-google-green" aria-hidden="true">
                  _
                </span>
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
