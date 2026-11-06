"use client";

import React from "react";
import type { TeamMember } from "@/data/staticTeam";
import { CrudManager, type CrudManagerProps, type FieldSpec } from "@/components/admin/CrudManager";
import { setDemoCollection, useDemoCollection } from "@/lib/demoStore";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";
import { BackendCollection, PUBLISHED_FIELD, statusLine, withImageFields, type BackendProps } from "@/components/admin/BackendCollection";

const CATEGORIES: TeamMember["category"][] = [
  "President",
  "Vice President",
  "Secretary",
  "Joint Secretary",
  "Technical Team",
  "Event Management Team",
  "Social Media Team",
  "Cultural Team",
  "Promotional Team",
  "Documentation Team",
  "Girls Representative",
  "Sports Team",
  "Finance & Treasury",
  "Discipline Committee",
  "Women Cell",
  "NSS",
  "Sponsorship",
];

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "id", label: "Profile slug", type: "text", createOnly: true, help: "Leave blank to generate from the name." },
  { name: "role", label: "Role", type: "text", required: true, placeholder: "Technical Head" },
  { name: "category", label: "Committee", type: "select", required: true, options: CATEGORIES.map((c) => ({ value: c, label: c })) },
  { name: "photo", label: "Photo URL", type: "url", wide: true, help: "Leave blank if no photo is published (initials are shown)." },
  { name: "quote", label: "Quote", type: "textarea", wide: true },
  { name: "bio", label: "Bio", type: "textarea", wide: true },
  { name: "skills", label: "Skills", type: "tags", wide: true, help: "Comma-separated, e.g. React, TypeScript" },
  { name: "linkedin", label: "LinkedIn URL", type: "url" },
  { name: "github", label: "GitHub URL", type: "url" },
  { name: "instagram", label: "Instagram URL", type: "url" },
  { name: "twitter", label: "Twitter / X URL", type: "url" },
  { name: "website", label: "Website URL", type: "url" },
  { name: "sortOrder", label: "Sort order", type: "number", required: true, min: 0 },
  { name: "isCreatorBadge", label: "Website architect badge", type: "checkbox" },
];

type ManagerProps = Pick<CrudManagerProps<TeamMember>, "items" | "fields" | "onChange" | "onCreate" | "onUpdate" | "onDelete" | "editDescription" | "deleteDescription" | "uploadImage"> & { backend?: boolean };

function Manager({ items, backend = false, ...persistence }: ManagerProps) {
  const team = items;
  return (
    <CrudManager<TeamMember>
      {...persistence}
      singular="Member"
      items={team}
      titleField="name"
      createItem={() => ({
        id: "",
        name: "",
        role: "",
        category: "Technical Team",
        sortOrder: team.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1,
      })}
      columns={[
        ...(backend ? [{ header: "Published", render: (m: TeamMember) => ((m as { isPublished?: boolean }).isPublished ? "Yes" : "—") }] : []),
        { header: "#", render: (m) => <span className="font-mono text-xs">{m.sortOrder}</span>, className: "w-12" },
        {
          header: "Member",
          render: (m) => (
            <>
              <span className="font-heading font-bold">{m.name}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">/team/{m.id}</span>
            </>
          ),
        },
        { header: "Role", render: (m) => m.role },
        { header: "Committee", render: (m) => m.category },
        { header: "Skills", render: (m) => <span className="font-mono text-xs">{m.skills?.length ?? 0}</span> },
      ]}
    />
  );
}

export default function AdminTeamPage() {
  const mode = useFacultyMode();
  if (mode === "backend") {
    return (
      <BackendCollection<TeamMember> resource="team" titleField="name" label="team members">
        {(props: BackendProps<TeamMember>) => <Manager {...props} backend fields={[...withImageFields(FIELDS, ["photo"]), PUBLISHED_FIELD]} />}
      </BackendCollection>
    );
  }
  // backend API with demo sign-in: no demo fallback
  if (mode === "unavailable") return <p role="alert" className={statusLine}>This section requires admin sign-in.</p>;
  return <DemoManager />;
}

function DemoManager() {
  const team = useDemoCollection("team");
  const sorted = [...team].sort((a, b) => a.sortOrder - b.sortOrder);
  return <Manager items={sorted} fields={FIELDS} onChange={(next) => setDemoCollection("team", next)} />;
}
