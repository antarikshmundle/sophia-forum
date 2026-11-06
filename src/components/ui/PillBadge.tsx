import React from "react";
import { cn } from "@/lib/utils";

export interface PillBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "blue" | "red" | "yellow" | "green" | "dark" | "outline" | "ghost";
  dot?: boolean;
}

export function PillBadge({
  children,
  variant = "blue",
  dot = false,
  className,
  ...props
}: PillBadgeProps) {
  const variantStyles = {
    blue: "bg-google-blue/15 text-google-blue border-google-blue/40",
    red: "bg-google-red/15 text-google-red border-google-red/40",
    yellow: "bg-google-yellow/20 text-[#8C6B00] border-google-yellow/50",
    green: "bg-google-green/15 text-google-green border-google-green/40",
    dark: "bg-foreground text-background border-foreground",
    outline: "bg-white/80 text-foreground border-foreground",
    ghost: "bg-black/5 text-foreground/80 border-transparent",
  }[variant];

  const dotColors = {
    blue: "bg-google-blue",
    red: "bg-google-red",
    yellow: "bg-google-yellow",
    green: "bg-google-green",
    dark: "bg-background",
    outline: "bg-foreground",
    ghost: "bg-foreground",
  }[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-heading font-bold uppercase tracking-wider border",
        variantStyles,
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn("w-2 h-2 rounded-full inline-block animate-pulse", dotColors)} />
      )}
      {children}
    </span>
  );
}
