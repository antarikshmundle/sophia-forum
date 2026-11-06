import React from "react";
import { cn } from "@/lib/utils";
import { PillBadge } from "./PillBadge";

export interface SectionHeadingProps {
  tag?: string;
  tagVariant?: "blue" | "red" | "yellow" | "green" | "dark" | "outline";
  title: string;
  subtitle?: string;
  align?: "left" | "center" | "right";
  className?: string;
}

export function SectionHeading({
  tag,
  tagVariant = "green",
  title,
  subtitle,
  align = "center",
  className,
}: SectionHeadingProps) {
  const alignment = {
    left: "text-left items-start",
    center: "text-center items-center mx-auto",
    right: "text-right items-end ml-auto",
  }[align];

  return (
    <div className={cn("flex flex-col gap-3 max-w-3xl mb-8 md:mb-12", alignment, className)}>
      {tag && (
        <PillBadge variant={tagVariant} dot>
          {tag}
        </PillBadge>
      )}
      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-tight text-foreground uppercase leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="font-body text-muted-foreground text-sm sm:text-base md:text-lg leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}
