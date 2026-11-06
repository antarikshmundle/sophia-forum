import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Github, Globe, Instagram, Linkedin, Twitter, type LucideIcon } from "lucide-react";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { CmsUnavailable } from "@/components/ui/CmsUnavailable";
import { isRealLink, isRealWebsite } from "@/lib/content";
import { loadMember } from "@/lib/siteData";

type Params = Promise<{ id: string }>;

// Rendered per request: in CMS backend mode the profiles are the published records read on each request (a static,
// on-demand render can't read them), and Admin edits show at once. Demo mode serves the same HTML from the built-in data.
// Unknown IDs reach notFound() below, so the 404 is rendered for the real URL.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await loadMember((await params).id);
  const member = loaded.ok ? loaded.data : undefined;
  if (!member) return {};
  return {
    title: `${member.name} | SOPHIA FORUM`,
    description: member.bio ?? `${member.name}, ${member.role} at Sophia Forum.`,
  };
}

interface Social {
  label: string;
  href?: string;
  icon: LucideIcon;
  className: string;
  ok: boolean;
}

// Layout follows the original member profile (captured 2026-10-29)
export default async function TeamMemberPage({ params }: { params: Params }) {
  const loaded = await loadMember((await params).id);
  if (!loaded.ok) return <CmsUnavailable what="This profile is" />;
  const member = loaded.data;
  if (!member) notFound();

  // Placeholder links (bare platform homepages) are omitted rather than shown as profiles
  const socials = (
    [
      { label: "LINKEDIN", href: member.linkedin, icon: Linkedin, className: "bg-google-blue text-primary-foreground", ok: isRealLink(member.linkedin) },
      { label: "GITHUB", href: member.github, icon: Github, className: "bg-foreground text-background", ok: isRealLink(member.github) },
      { label: "INSTAGRAM", href: member.instagram, icon: Instagram, className: "bg-google-red text-primary-foreground", ok: isRealLink(member.instagram) },
      // Same styling and position as the original's TWITTER pill
      { label: "TWITTER", href: member.twitter, icon: Twitter, className: "bg-foreground text-background", ok: isRealLink(member.twitter) },
      { label: "WEBSITE", href: member.website, icon: Globe, className: "bg-google-yellow text-foreground", ok: isRealWebsite(member.website) },
    ] satisfies Social[]
  ).filter((s) => s.ok);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-12 sm:pb-16">
      <Link href="/team" className="btn-brutal px-4 py-2 bg-card text-sm">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        BACK TO TEAM
      </Link>

      <article className="glass rounded-[28px] shadow-glass-lg p-6 sm:p-8 md:p-10 mt-8">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="relative w-40 h-40 bg-muted rounded-2xl border-2 border-foreground flex-shrink-0 overflow-hidden rotate-1 mx-auto md:mx-0">
            <FallbackImage
              src={member.photo}
              alt={member.name}
              fallbackName={member.name}
              fill
              priority
              className="object-cover object-top"
              sizes="160px"
            />
          </div>

          <div className="flex-1 min-w-0">
            <span className="font-pixel text-[8px] bg-google-red text-primary-foreground px-3 py-1.5 rounded-full border-2 border-foreground inline-block mb-2 uppercase">
              {member.category}
            </span>
            {member.isCreatorBadge && (
              <div className="mb-3 w-fit rounded-2xl border-2 border-foreground bg-card px-3 py-1.5 shadow-[5px_5px_0px_hsl(var(--google-blue))]">
                <span className="font-heading text-[11px] font-bold uppercase tracking-[0.1em] text-foreground">Website Architect</span>
                <span className="ml-2 inline-block border-l-2 border-foreground pl-2 font-pixel text-[8px] uppercase text-google-red">
                  Created by Me
                </span>
              </div>
            )}
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-tight break-words">{member.name}</h1>
            <p className="font-heading text-lg text-muted-foreground mt-1">{member.role}</p>
            {member.quote && <p className="font-body italic text-muted-foreground mt-4">&ldquo;{member.quote}&rdquo;</p>}
            {member.bio && <p className="font-body text-muted-foreground mt-4 leading-relaxed">{member.bio}</p>}

            {member.skills && member.skills.length > 0 && (
              <ul className="flex flex-wrap gap-2 mt-6" aria-label="Skills">
                {member.skills.map((skill) => (
                  <li key={skill} className="glass px-3 py-1.5 rounded-full shadow-glass text-xs font-heading font-bold">
                    {skill}
                  </li>
                ))}
              </ul>
            )}

            {socials.length > 0 && (
              <ul className="flex flex-wrap gap-2 mt-6" aria-label="Links">
                {socials.map(({ label, href, icon: Icon, className }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`btn-brutal !rounded-full px-4 py-2 text-xs ${className}`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
