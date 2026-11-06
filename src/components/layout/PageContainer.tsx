import React from "react";
import { cn } from "@/lib/utils";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function PageContainer({
  children,
  size = "lg",
  className,
  ...props
}: PageContainerProps) {
  const maxWidth = {
    sm: "max-w-3xl",
    md: "max-w-5xl",
    lg: "max-w-[1400px]",
    xl: "max-w-[1600px]",
    full: "max-w-full",
  }[size];

  return (
    <div
      className={cn("w-full mx-auto px-4 sm:px-6 md:px-8", maxWidth, className)}
      {...props}
    >
      {children}
    </div>
  );
}
