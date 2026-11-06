import React from "react";
import type { Metadata } from "next";
import { Target } from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { PillarsGrid } from "@/components/about/PillarsGrid";
import { StatsBand } from "@/components/about/StatsBand";
import { JourneyTimeline } from "@/components/about/JourneyTimeline";
import { FacultyGrid } from "@/components/about/FacultyGrid";
import { PrincipalCard } from "@/components/about/PrincipalCard";
import { LeadershipSection } from "@/components/about/LeadershipSection";
import { loadContent, loadCounts } from "@/lib/siteData";
import { milestoneValues, sectionValues } from "@/data/siteContent";

export const metadata: Metadata = {
  title: "About | SOPHIA FORUM",
  description: "Mission, vision, milestones and faculty mentors of Sophia Forum, the AI & DS student forum at PCE Nagpur.",
};

// Section order matches the live About page (captured 2026-10-29)
export default async function AboutPage() {
  const [content, counts] = await Promise.all([loadContent(), loadCounts()]);
  const hero = sectionValues("about.hero", content);
  return (
    <>
      <PageHero
        accent="blue"
        icon={Target}
        badge={String(hero.badge)}
        title={String(hero.title)}
        subtitle={String(hero.subtitle)}
      />
      <PillarsGrid content={sectionValues("about.pillars", content)} />
      <StatsBand counts={counts} />
      <JourneyTimeline milestones={milestoneValues(content)} />
      <FacultyGrid />
      <LeadershipSection />
      <PrincipalCard />
    </>
  );
}
