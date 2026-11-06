import React from "react";
import Link from "next/link";
import { ArrowRight, Github, Instagram, Linkedin, Twitter } from "lucide-react";
import type { TeamMember } from "@/data/staticTeam";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { isRealLink } from "@/lib/content";

// Card styling follows the original Team page spotlight card (captured 2026-10-29). Top leadership (the President,
// then the Chief Head Secretary) as equal cards side by side, stacked only on narrow screens; a full-width divider
// separates them from the committee.
function LeaderCard({ member, headingId }: { member: TeamMember; headingId?: string }) {
  const socials = [
    { label: "LinkedIn", href: member.linkedin, icon: Linkedin, className: "bg-google-blue text-primary-foreground" },
    { label: "GitHub", href: member.github, icon: Github, className: "bg-foreground text-background" },
    { label: "Instagram", href: member.instagram, icon: Instagram, className: "bg-google-red text-primary-foreground" },
    { label: "Twitter", href: member.twitter, icon: Twitter, className: "bg-foreground text-background" },
  ].filter((s) => isRealLink(s.href));

  return (
    <div className="glass rounded-[28px] shadow-glass-lg p-5 md:p-6 h-full flex flex-col items-center text-center">
      <div className="relative w-36 h-36 md:w-44 md:h-44 bg-muted rounded-2xl border-2 border-foreground shrink-0 overflow-hidden">
        <FallbackImage
          src={member.photo}
          alt={member.name}
          fallbackName={member.name}
          fill
          priority
          className="object-cover object-top"
          sizes="176px"
        />
      </div>
      <div className="flex-1 flex flex-col items-center pt-4">
        <span className="font-pixel text-[8px] bg-google-red text-primary-foreground px-3 py-1.5 rounded-full border-2 border-foreground inline-block mb-2">
          {member.role.toUpperCase()}
        </span>
        <h2 id={headingId} className="font-display text-2xl md:text-3xl lg:text-4xl">
          {member.name}
        </h2>
        {member.quote && <p className="font-body italic text-muted-foreground mt-3">&ldquo;{member.quote}&rdquo;</p>}
        {socials.length > 0 && (
          <div className="flex justify-center gap-2 mt-4">
            {socials.map(({ label, href, icon: Icon, className }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${member.name} on ${label}`}
                className={`btn-brutal !min-h-0 !rounded-full p-2.5 ${className}`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
        <div className="mt-auto pt-4">
          <Link href={`/team/${member.id}`} className="btn-brutal px-4 py-2 bg-card text-sm">
            VIEW PROFILE
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PresidentSpotlight({ member, others = [] }: { member: TeamMember; others?: TeamMember[] }) {
  const leaders = [member, ...others];
  return (
    <section className="border-b-[3px] border-foreground pb-10 md:pb-12 mb-10 md:mb-12" aria-labelledby="spotlight-heading">
      <ul className={`grid gap-5 md:gap-6 mx-auto ${leaders.length > 1 ? "sm:grid-cols-2 max-w-5xl" : "max-w-md"}`}>
        {leaders.map((member, i) => (
          <li key={member.id}>
            <LeaderCard member={member} headingId={i === 0 ? "spotlight-heading" : undefined} />
          </li>
        ))}
      </ul>
    </section>
  );
}
