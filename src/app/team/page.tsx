import React from "react";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { TeamDirectory } from "@/components/team/TeamDirectory";
import { CmsUnavailable } from "@/components/ui/CmsUnavailable";
import { loadTeam } from "@/lib/siteData";
import type { TeamMember } from "@/data/staticTeam";

export const metadata: Metadata = {
  title: "Team | SOPHIA FORUM",
  description: "Meet the student council of Sophia Forum, the AI & DS student forum at PCE Nagpur.",
};

export default async function TeamPage() {
  const team = await loadTeam();
  // top leadership, identified by role: the President (or, without that role, the President category, as in the
  // built-in team), then the Chief Head Secretary beside him; both keep their own category for the filters
  const members = team.ok ? [...team.data].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const hasRole = (role: string) => (member: TeamMember) => member.role.trim().toLowerCase() === role.toLowerCase();
  const president = members.find(hasRole("President")) ?? members.find((member) => member.category === "President");
  const chiefHeadSecretary = president ? members.find((member) => member !== president && hasRole("Chief Head Secretary")(member)) : undefined;
  const leaders = president ? [president, ...(chiefHeadSecretary ? [chiefHeadSecretary] : [])] : [];

  return (
    <>
      <PageHero
        accent="red"
        icon={Users}
        badge="LEADERS • BUILDERS • CREATORS"
        title="OUR TEAM"
        subtitle="The people behind the magic"
      />
      {team.ok ? <TeamDirectory members={team.data} leaders={leaders} /> : <CmsUnavailable what="Team profiles are" />}
    </>
  );
}
