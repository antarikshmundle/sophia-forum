import React from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Warning strip used wherever the mock sign-in or mock data appears. */
export function DemoNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-2xl border-2 border-foreground bg-google-yellow/25 px-4 py-3 font-body text-xs sm:text-sm text-foreground",
        className
      )}
    >
      <TriangleAlert className="w-5 h-5 shrink-0 text-[#8C6B00]" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
