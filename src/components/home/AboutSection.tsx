import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { sectionValues } from "@/data/siteContent";

/** content: the Content section "Home · About section" (built-in text by default). */
export function AboutSection({ content = sectionValues("home.about") }: { content?: Record<string, string | number> }) {
  return (
    <section className="relative py-20 md:py-28 lg:py-32 overflow-hidden border-b-[3px] border-foreground bg-gradient-to-b from-google-yellow/10 via-background to-card/50">
      {/* Background radial glows */}
      <div className="ambient-glow absolute top-1/2 left-1/3 w-80 h-80 bg-google-yellow/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="ambient-glow absolute bottom-0 right-10 w-72 h-72 bg-google-blue/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 xl:gap-16 items-center">
          {/* Left Column: Text & Features */}
          <div className="lg:col-span-6 space-y-6">
            <div className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-glass text-xs font-heading font-black tracking-wider">
              <span className="w-2 h-2 rounded-full bg-google-red animate-pulse" />
              <span>{content.eyebrow}</span>
            </div>

            <h2 className="font-display text-heading-fluid uppercase text-foreground">
              {content.heading1}
              <br />
              <span className="text-google-blue">{content.heading2}</span>
            </h2>

            <p className="font-body text-base sm:text-lg text-muted-foreground leading-relaxed">
              {content.paragraph}
            </p>

            {/* 4 Feature Pills in 2x2 Grid */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="glass px-3.5 py-2.5 rounded-2xl border-2 border-google-blue bg-google-blue/10 font-heading font-bold text-xs sm:text-sm flex items-center gap-2 text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                <span>{content.feature1}</span>
              </div>
              <div className="glass px-3.5 py-2.5 rounded-2xl border-2 border-google-red bg-google-red/10 font-heading font-bold text-xs sm:text-sm flex items-center gap-2 text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                <span>{content.feature2}</span>
              </div>
              <div className="glass px-3.5 py-2.5 rounded-2xl border-2 border-google-green bg-google-green/10 font-heading font-bold text-xs sm:text-sm flex items-center gap-2 text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                <span>{content.feature3}</span>
              </div>
              <div className="glass px-3.5 py-2.5 rounded-2xl border-2 border-google-yellow bg-google-yellow/15 font-heading font-bold text-xs sm:text-sm flex items-center gap-2 text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
                <span>{content.feature4}</span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/about"
                className="btn-brutal px-6 py-3 bg-google-blue text-white text-sm sm:text-base hover:bg-google-blue/90 shadow-[4px_4px_0px_hsl(var(--foreground))]"
              >
                <span>{content.button}</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>

          {/* Right Column: Group Photo Card */}
          <div className="lg:col-span-6">
            <div className="relative rounded-[28px] border-[3px] border-foreground bg-card shadow-[8px_8px_0px_hsl(var(--foreground))] overflow-hidden p-3 sm:p-4">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border-2 border-foreground bg-muted">
                {/* No forum photo yet: the existing initials placeholder (the former college photo was removed) */}
                <FallbackImage
                  src={String(content.photo) || undefined}
                  alt={String(content.photoCaption || content.eyebrow)}
                  fallbackName="Sophia Forum"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />

                {/* Overlaid Badges */}
                {content.photoCaption && (
                <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full border-2 border-foreground bg-[#121212] text-white font-heading font-bold text-[10px] sm:text-xs shadow-[2px_2px_0px_hsl(var(--foreground))]">
                  {content.photoCaption}
                </div>
                )}
                {content.photoBadge && (
                <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full border-2 border-foreground bg-google-green text-white font-heading font-black text-[10px] sm:text-xs shadow-[2px_2px_0px_hsl(var(--foreground))]">
                  {content.photoBadge}
                </div>
                )}
              </div>

              {/* Sub-bar below photo */}
              <div className="flex items-center justify-between pt-3 px-1 text-xs font-mono text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-google-green" />
                  <span>{content.footerLeft}</span>
                </div>
                <div>{content.footerRight}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
