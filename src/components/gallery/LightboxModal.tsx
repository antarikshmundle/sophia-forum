"use client";

import React, { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { GalleryMediaItem } from "@/data/staticGallery";

export interface LightboxModalProps {
  items: GalleryMediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const controlClass =
  "w-11 h-11 rounded-full border-2 border-foreground bg-card text-foreground flex items-center justify-center shadow-[3px_3px_0px_hsl(var(--foreground))] hover:-translate-x-px hover:-translate-y-px active:translate-x-px active:translate-y-px active:shadow-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-google-yellow";

export function LightboxModal({ items, index, onIndexChange, onClose }: LightboxModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const total = items.length;

  const go = useCallback((delta: number) => onIndexChange((index + delta + total) % total), [index, total, onIndexChange]);

  // Initial focus, scroll lock, and focus restore on close
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Tab" && dialogRef.current) {
      // Keep focus inside the dialog
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button, a[href]");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!item) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo viewer: ${item.title}`}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 p-3 sm:p-6"
    >
      {/* Backdrop click closes */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative flex items-center justify-between gap-3 mb-3 text-white">
        <p className="font-mono text-xs sm:text-sm" aria-live="polite">
          {index + 1} / {total}
          <span className="hidden sm:inline"> — {item.title} ({item.year})</span>
        </p>
        <div className="flex items-center gap-2.5">
          <a
            href={item.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className={controlClass}
            aria-label={`Download ${item.title}`}
          >
            <Download className="w-5 h-5" />
          </a>
          <button ref={closeRef} type="button" onClick={onClose} className={controlClass} aria-label="Close photo viewer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center gap-2 sm:gap-4">
        <button type="button" onClick={() => go(-1)} className={`${controlClass} relative shrink-0`} aria-label="Previous photo">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="relative flex-1 h-full rounded-2xl border-[3px] border-foreground bg-black overflow-hidden">
          <Image key={item.id} src={item.url} alt={item.title} fill className="object-contain" sizes="100vw" />
        </div>
        <button type="button" onClick={() => go(1)} className={`${controlClass} relative shrink-0`} aria-label="Next photo">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      <p className="relative sm:hidden mt-3 text-center font-heading font-bold text-sm text-white">
        {item.title} ({item.year})
      </p>
    </div>
  );
}
