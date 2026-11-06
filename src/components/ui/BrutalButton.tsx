"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BrutalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  variant?: "primary" | "secondary" | "accent" | "destructive" | "glass" | "outline";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export function BrutalButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: BrutalButtonProps) {
  const sizeClasses = {
    sm: "px-4 py-1.5 text-xs font-bold gap-1.5",
    md: "px-6 py-2.5 text-sm font-bold gap-2",
    lg: "px-8 py-3.5 text-base font-bold gap-2.5",
  }[size];

  const variantClasses = {
    primary: "bg-google-blue text-white hover:bg-google-blue/90",
    secondary: "bg-[#121212] text-white hover:bg-[#121212]/90",
    accent: "bg-google-yellow text-foreground hover:bg-google-yellow/90",
    destructive: "bg-google-red text-white hover:bg-google-red/90",
    glass: "btn-glass text-foreground bg-white/80",
    outline: "bg-white text-foreground hover:bg-white/90",
  }[variant];

  const baseClasses = variant === "glass" 
    ? cn("btn-glass inline-flex items-center justify-center font-heading uppercase tracking-wide", sizeClasses, className)
    : cn("btn-brutal inline-flex items-center justify-center", variantClasses, sizeClasses, className);

  if (href) {
    const isExternal = href.startsWith("http") || href.startsWith("mailto:");
    return (
      <Link
        href={href}
        className={baseClasses}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
      >
        {children}
      </Link>
    );
  }

  return (
    <button className={baseClasses} {...props}>
      {children}
    </button>
  );
}
