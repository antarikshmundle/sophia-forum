"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Play, VideoOff } from "lucide-react";
import type { GalleryMediaItem } from "@/data/staticGallery";
import { getYouTubeId } from "@/lib/format";

/** Click-to-play YouTube card; entries without a recovered video ID show an unavailable state. */
export function VideoCard({ video }: { video: GalleryMediaItem }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoId = getYouTubeId(video.url);
  const thumbnail = video.thumbnailUrl ?? (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);

  return (
    <article className="rounded-[24px] border-[3px] border-foreground bg-card shadow-[6px_6px_0px_hsl(var(--foreground))] p-3 space-y-3">
      <div className="relative aspect-video rounded-xl border-2 border-foreground bg-black overflow-hidden">
        {!videoId ? (
          <div role="status" className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/80 px-6 text-center">
            <VideoOff className="w-9 h-9" aria-hidden="true" />
            <span className="font-pixel text-[10px] uppercase tracking-wider">Video unavailable</span>
          </div>
        ) : isPlaying ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            className="group relative block w-full h-full"
            aria-label={`Play video: ${video.title}`}
          >
            {thumbnail && (
              <Image src={thumbnail} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
            )}
            <span className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full border-[3px] border-foreground bg-google-red text-white flex items-center justify-center shadow-[4px_4px_0px_hsl(var(--foreground))] group-hover:scale-110 transition-transform pl-1">
                <Play className="w-7 h-7 fill-current" />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="font-heading font-bold text-sm sm:text-base">{video.title}</h3>
        <span className="shrink-0 px-2 py-0.5 rounded-full border-2 border-foreground bg-google-red text-white font-mono text-[10px] font-bold">
          {video.year}
        </span>
      </div>
    </article>
  );
}
