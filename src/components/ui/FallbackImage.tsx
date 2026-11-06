"use client";

import React, { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/format";

export interface FallbackImageProps extends Omit<ImageProps, "onError" | "src"> {
  /** Missing when no photo is published; the initials placeholder is shown instead. */
  src?: ImageProps["src"];
  /** Name used for the initials placeholder when the image is missing or fails to load. */
  fallbackName: string;
  fallbackClassName?: string;
}

/** next/image that shows an initials placeholder if there is no source or it fails to load. */
export function FallbackImage({ src, fallbackName, fallbackClassName, alt, className, ...props }: FallbackImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={`${fallbackName} (${src ? "photo unavailable" : "no photo published"})`}
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-muted font-display text-4xl text-foreground/60",
          fallbackClassName
        )}
      >
        {getInitials(fallbackName)}
      </div>
    );
  }

  return <Image src={src} alt={alt} className={className} onError={() => setFailed(true)} {...props} />;
}
