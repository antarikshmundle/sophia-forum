import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "red" | "yellow" | "green";

export interface PageHeroProps {
  badge: string;
  title: string;
  subtitle?: string;
  accent: Accent;
  /** Badge icon; a pulsing dot is shown when omitted. */
  icon?: LucideIcon;
  titleClassName?: string;
  /** Extra gap above the title (the original Events hero has one). */
  spacedTitle?: boolean;
}

const BAND: Record<Accent, string> = {
  blue: "bg-google-blue",
  red: "bg-google-red",
  yellow: "bg-google-yellow",
  green: "bg-google-green",
};

const ICON_TEXT: Record<Accent, string> = {
  blue: "text-google-blue",
  red: "text-google-red",
  yellow: "text-google-red",
  green: "text-google-green",
};

/**
 * Full-width coloured banner used on the original's internal pages (captured 2026-10-29):
 * bordered pill badge, fluid pixel title and subtitle, centred, pulled up under the navbar.
 */
export function PageHero({ badge, title, subtitle, accent, icon: Icon, titleClassName, spacedTitle }: PageHeroProps) {
  const onYellow = accent === "yellow";
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b-[3px] border-foreground -mt-20 sm:-mt-24",
        // Padding per the original: the Events hero differs from About/Team/Gallery
        spacedTitle ? "pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20" : "pt-24 pb-16 md:pt-32 md:pb-24",
        BAND[accent]
      )}
    >
      <div className="ambient-glow absolute top-1/4 left-1/4 w-80 h-80 bg-google-yellow/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="ambient-glow absolute bottom-1/4 right-1/4 w-80 h-80 bg-google-blue/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 border-foreground backdrop-blur-xl bg-card/85 shadow-[2px_2px_0px_hsl(var(--foreground))] text-xs font-heading font-black tracking-wider mb-4 text-foreground">
          {Icon ? (
            <Icon className={cn("w-3.5 h-3.5", ICON_TEXT[accent])} aria-hidden="true" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-google-red animate-pulse" aria-hidden="true" />
          )}
          <span>{badge}</span>
        </div>

        {/* Joined without cn(): tailwind-merge would drop the custom text-display-fluid size as a text-* conflict */}
        <h1
          className={`font-display ${titleClassName ?? "text-display-fluid"} ${onYellow ? "text-foreground" : "text-primary-foreground"}${spacedTitle ? " mt-5 sm:mt-6" : ""}`}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            className={cn(
              "font-body text-base sm:text-lg md:text-xl mt-4 max-w-2xl mx-auto leading-relaxed",
              onYellow ? "text-foreground/75" : "text-primary-foreground/80"
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
