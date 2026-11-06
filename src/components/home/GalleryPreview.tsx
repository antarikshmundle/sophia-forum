import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Images, ArrowRight } from "lucide-react";
import { GALLERY_HIGHLIGHTS, type GalleryMediaItem } from "@/data/staticGallery";

/** highlights: the built-in three (demo mode) or the featured published photos (CMS backend mode); hidden when none. */
export function GalleryPreview({ highlights = GALLERY_HIGHLIGHTS }: { highlights?: GalleryMediaItem[] }) {
  if (highlights.length === 0) return null;
  return (
    <section className="py-16 md:py-24 lg:py-28 border-t-[3px] border-foreground bg-card/40">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10 md:mb-12">
          <div>
            <div className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-glass text-xs font-heading font-black tracking-wider mb-4">
              <Images className="w-3.5 h-3.5 text-google-blue" />
              <span>CAPTURED MOMENTS</span>
            </div>
            <h2 className="font-display text-heading-fluid uppercase text-foreground">
              GALLERY HIGHLIGHTS
            </h2>
          </div>

          <Link
            href="/gallery"
            className="btn-glass px-5 py-2.5 text-sm shrink-0 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <span>VIEW FULL GALLERY</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Grid as on the original (captured 2026-10-29) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {highlights.map((item) => (
            <Link
              key={item.id}
              href="/gallery"
              aria-label={`${item.title} (${item.year}), open gallery`}
              className="group relative aspect-[4/3] rounded-[20px] overflow-hidden border border-white/40 shadow-glass hover:shadow-glass-lg hover:scale-[1.02] transition-all duration-300 bg-muted"
            >
              <Image
                src={item.url}
                alt={item.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
