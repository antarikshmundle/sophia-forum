"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Play, ArrowRight, VideoOff } from "lucide-react";
import { STATIC_VIDEOS, type GalleryMediaItem } from "@/data/staticGallery";
import { getYouTubeId } from "@/lib/format";

/** videos: the built-in list (demo mode) or the published videos (CMS backend mode); hidden when there are none. */
export function VideoSection({ videos = STATIC_VIDEOS }: { videos?: GalleryMediaItem[] }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const latestVideo = videos.find((video) => video.isFeatured) ?? videos[0];

  if (!latestVideo) return null;

  const videoId = getYouTubeId(latestVideo.url);
  const thumbnail =
    latestVideo.thumbnailUrl ?? (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);

  return (
    <section className="py-16 md:py-24 lg:py-28 border-t-[3px] border-foreground">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
        {/* Header with Title and "ALL VIDEOS" */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10 md:mb-12">
          <div>
            <div className="glass inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-glass text-xs font-heading font-black tracking-wider mb-4">
              <Play className="w-3.5 h-3.5 fill-google-red text-google-red" />
              <span>FRESH UPLOAD</span>
            </div>
            <h2 className="font-display text-heading-fluid uppercase text-foreground">
              LATEST EVENT VIDEO
            </h2>
          </div>

          <Link
            href="/gallery"
            className="btn-glass px-5 py-2.5 text-sm shrink-0 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <span>ALL VIDEOS</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Video Player Card */}
        <div className="max-w-5xl mx-auto rounded-2xl md:rounded-3xl border-[3px] border-foreground bg-card/90 shadow-[8px_8px_0px_hsl(var(--foreground))] p-3 sm:p-4 space-y-3">
          <div className="aspect-video bg-black rounded-xl border-2 border-foreground overflow-hidden relative">
            {!videoId ? (
              <div
                role="status"
                className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/80 px-6 text-center"
              >
                <VideoOff className="w-10 h-10" aria-hidden="true" />
                <span className="font-pixel text-[10px] uppercase tracking-wider">Video unavailable</span>
              </div>
            ) : isPlaying ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
                title={latestVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsPlaying(true)}
                className="group relative block w-full h-full cursor-pointer text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[6px] focus-visible:outline-google-yellow"
                aria-label={`Play video: ${latestVideo.title}`}
              >
                {thumbnail && (
                  <Image
                    src={thumbnail}
                    alt={`${latestVideo.title} thumbnail`}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 1024px) 100vw, 1024px"
                  />
                )}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />

                {/* Big Center Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-[3px] border-foreground bg-google-red text-white flex items-center justify-center shadow-[4px_4px_0px_hsl(var(--foreground))] group-hover:scale-110 group-hover:shadow-[6px_6px_0px_hsl(var(--foreground))] transition-all duration-200 pl-1">
                    <Play className="w-8 h-8 fill-current" />
                  </div>
                </div>

                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-black/80 font-mono text-[10px] text-white">
                  YOUTUBE
                </div>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-2 pt-1">
            <h3 className="font-heading font-bold text-sm sm:text-base text-foreground">
              {latestVideo.title}
            </h3>
          </div>
        </div>
      </div>
    </section>
  );
}
