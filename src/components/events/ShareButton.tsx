"use client";

import React, { useState } from "react";
import { Share2 } from "lucide-react";

/** Uses the Web Share API where available, otherwise copies the page URL to the clipboard. */
export function ShareButton({ title }: { title: string }) {
  const [status, setStatus] = useState("");

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // AbortError means the user closed the share sheet; other errors fall back to copying
        if ((error as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied to clipboard");
    } catch {
      setStatus("Could not share this link");
    }
    window.setTimeout(() => setStatus(""), 2500);
  };

  return (
    <div className="inline-flex items-center gap-3">
      <button type="button" onClick={handleShare} className="btn-brutal px-6 py-3 text-base sm:text-lg bg-google-yellow text-foreground">
        <Share2 className="w-4 h-4" aria-hidden="true" />
        SHARE EVENT
      </button>
      <span role="status" aria-live="polite" className="font-mono text-xs text-google-green">
        {status}
      </span>
    </div>
  );
}
