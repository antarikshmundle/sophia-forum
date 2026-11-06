import React from "react";
import { cn } from "@/lib/utils";

export interface BrutalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "glass" | "glass-strong" | "accent";
}

export function BrutalCard({
  children,
  variant = "default",
  className,
  ...props
}: BrutalCardProps) {
  const variantClasses = {
    default: "brutal-card p-6 md:p-8",
    glass: "glass rounded-[28px] p-6 md:p-8 border border-foreground/15 shadow-glass",
    "glass-strong": "glass-strong rounded-[28px] p-6 md:p-8 border-2 border-foreground shadow-glass-lg",
    accent: "brutal-card p-6 md:p-8 bg-google-yellow text-foreground",
  }[variant];

  return (
    <div className={cn(variantClasses, className)} {...props}>
      {children}
    </div>
  );
}
