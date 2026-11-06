import React from "react";
import Link from "next/link";
import { Ghost, ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { BrutalButton } from "@/components/ui/BrutalButton";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4">
      <PageContainer size="sm">
        <div className="glass rounded-[28px] border-2 border-foreground shadow-glass-lg p-8 sm:p-12 text-center max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl border-2 border-foreground bg-google-red text-white flex items-center justify-center shadow-[3px_3px_0px_hsl(var(--foreground))]">
            <Ghost className="w-8 h-8" />
          </div>

          <span className="font-pixel text-xs text-google-red tracking-widest uppercase mb-2 inline-block">
            ERROR 404
          </span>

          <h1 className="font-display text-3xl sm:text-4xl text-foreground uppercase mb-3">
            PAGE NOT FOUND
          </h1>

          <p className="font-body text-sm sm:text-base text-muted-foreground leading-relaxed mb-6">
            The page you are looking for doesn&apos;t exist or has moved into another quadrant.
          </p>

          <BrutalButton href="/" variant="secondary" size="md">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            <span>BACK TO SITE</span>
          </BrutalButton>
        </div>
      </PageContainer>
    </div>
  );
}
