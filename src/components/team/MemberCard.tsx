import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { TeamMember } from "@/data/staticTeam";
import { FallbackImage } from "@/components/ui/FallbackImage";

export function MemberCard({ member }: { member: TeamMember }) {
  return (
    <Link
      href={`/team/${member.id}`}
      className="group brutal-card overflow-hidden flex flex-col hover:-translate-y-1 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-google-blue"
    >
      <div className="relative aspect-square border-b-[3px] border-foreground bg-muted">
        <FallbackImage
          src={member.photo}
          alt={member.name}
          fallbackName={member.name}
          fill
          className="object-cover object-top"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        {member.isCreatorBadge && (
          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full border-2 border-foreground bg-google-yellow text-foreground font-heading font-black text-[9px] tracking-wider shadow-[2px_2px_0px_hsl(var(--foreground))]">
            WEBSITE ARCHITECT
          </span>
        )}
      </div>
      <div className="p-3.5 sm:p-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-bold text-sm sm:text-base leading-tight">{member.name}</h3>
          <p className="font-heading text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-1">
            {member.role}
          </p>
        </div>
        <span
          className="shrink-0 w-8 h-8 rounded-full border-2 border-foreground bg-card flex items-center justify-center group-hover:bg-google-red group-hover:text-white transition-colors"
          aria-hidden="true"
        >
          <ArrowUpRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  );
}
