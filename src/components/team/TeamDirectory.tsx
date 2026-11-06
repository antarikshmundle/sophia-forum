"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { STATIC_TEAM, type TeamMember } from "@/data/staticTeam";
import { inputClass } from "@/components/auth/LoginForm";
import { cn } from "@/lib/utils";
import { MemberCard } from "./MemberCard";
import { PresidentSpotlight } from "./PresidentSpotlight";

type Category = TeamMember["category"];

// Tab order as observed on the live Team page (RECONNAISSANCE.md §4.6), with the committee 2026-27 sections added
const CATEGORY_ORDER: Category[] = [
  "President",
  "Vice President",
  "Secretary",
  "Joint Secretary",
  "Finance & Treasury",
  "Technical Team",
  "Event Management Team",
  "Discipline Committee",
  "Social Media Team",
  "Cultural Team",
  "Promotional Team",
  "Documentation Team",
  "Girls Representative",
  "Women Cell",
  "NSS",
  "Sponsorship",
  "Sports Team",
];

// Committees shown side by side under one parent heading; each keeps its own heading and cards
const GROUPS: { title: string; categories: Category[] }[] = [
  { title: "Core Committee", categories: ["Vice President", "Secretary", "Joint Secretary"] },
  { title: "Campus Engagement & Outreach", categories: ["Women Cell", "NSS", "Sponsorship"] },
];

type Column = { category: Category; members: TeamMember[] };
type Block = ({ kind: "category" } & Column) | { kind: "group"; title: string; columns: Column[] };

/**
 * members: the built-in team (demo mode) or the published records (CMS backend mode). leaders: the top leadership
 * (President, Chief Head Secretary), shown first when browsing ALL without a search and left out of the committee
 * below; a search or a committee filter lists everyone matching under their own committee.
 */
export function TeamDirectory({ members = STATIC_TEAM, leaders = [] }: { members?: TeamMember[]; leaders?: TeamMember[] }) {
  const MEMBERS = useMemo(() => [...members].sort((a, b) => a.sortOrder - b.sortOrder), [members]);
  const CATEGORIES = useMemo(() => CATEGORY_ORDER.filter((category) => MEMBERS.some((m) => m.category === category)), [MEMBERS]);
  const [active, setActive] = useState<Category | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const browsing = active === "ALL" && !q;

  // Blocks in the sort order (the committee's own order): one per run of consecutive members of the same committee,
  // or of the same committee group (under ALL). Under ALL without a search, the President category and the leaders
  // appear in the leadership row instead, as on the original.
  const blocks = useMemo(() => {
    const leaderIds = new Set(leaders.map((m) => m.id));
    const shown = MEMBERS.filter(
      (m) =>
        (active === "ALL" || m.category === active) &&
        (!q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)) &&
        !(browsing && (m.category === "President" || leaderIds.has(m.id)))
    );
    const out: Block[] = [];
    for (const m of shown) {
      const group = active === "ALL" ? GROUPS.find((g) => g.categories.includes(m.category)) : undefined;
      const last = out.at(-1);
      if (group) {
        if (last?.kind === "group" && last.title === group.title) {
          const column = last.columns.find((c) => c.category === m.category);
          if (column) column.members.push(m);
          else last.columns.push({ category: m.category, members: [m] });
        } else out.push({ kind: "group", title: group.title, columns: [{ category: m.category, members: [m] }] });
      } else if (last?.kind === "category" && last.category === m.category) last.members.push(m);
      else out.push({ kind: "category", category: m.category, members: [m] });
    }
    for (const b of out) {
      if (b.kind !== "group") continue;
      const order = GROUPS.find((g) => g.title === b.title)!.categories;
      b.columns.sort((x, y) => order.indexOf(x.category) - order.indexOf(y.category));
    }
    return out;
  }, [MEMBERS, active, q, browsing, leaders]);

  let n = 0; // heading ids team-0, team-1, … for every committee section
  const committee = ({ category, members }: Column, inColumn = false) => {
    const id = `team-${n++}`;
    return (
      <section key={id} aria-labelledby={id}>
        <h3 id={id} className={cn("font-display mb-6 border-b-[3px] border-foreground pb-2 inline-block uppercase", inColumn ? "text-2xl" : "text-3xl")}>
          {category}
        </h3>
        <ul className={cn("grid sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6", inColumn ? "lg:grid-cols-1" : "lg:grid-cols-3 xl:grid-cols-4")}>
          {members.map((member) => (
            <li key={member.id}>
              <MemberCard member={member} />
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-8 pt-10 md:pt-12 pb-12 sm:pb-16">
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search team members by name or role"
            placeholder="Search by name or role…"
            className={`${inputClass} pl-10`}
          />
        </div>
        <div role="group" aria-label="Filter by committee" className="flex flex-wrap justify-center gap-2">
          {(["ALL", ...CATEGORIES] as const).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActive(category)}
              aria-pressed={active === category}
              className={cn(
                "px-3.5 py-1.5 rounded-full border-2 font-heading font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-all",
                active === category
                  ? "bg-foreground text-background border-foreground shadow-[2px_2px_0px_hsl(var(--foreground))]"
                  : "border-foreground/20 bg-card text-foreground/80 hover:border-foreground"
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {browsing && leaders.length > 0 && <PresidentSpotlight member={leaders[0]} others={leaders.slice(1)} />}

      <div className="space-y-12">
        {blocks.map((block, i) =>
          block.kind === "category" ? (
            committee(block)
          ) : (
            <section key={`group-${i}`} aria-labelledby={`group-${i}`}>
              <h2 id={`group-${i}`} className="font-display text-3xl sm:text-4xl md:text-5xl mb-6 md:mb-8 uppercase">
                {block.title}
              </h2>
              {/* columns as wide as one card of the other sections (3 of the 4 xl columns, 3 of 3 on lg); stacked below lg */}
              <div className="grid gap-8 lg:grid-cols-3 lg:gap-6 xl:max-w-[calc(75%-6px)]">{block.columns.map((column) => committee(column, true))}</div>
            </section>
          )
        )}
        {blocks.length === 0 && (
          <p role="status" className="font-body text-sm text-muted-foreground text-center py-10">
            No team members match your search.
          </p>
        )}
      </div>
    </div>
  );
}
