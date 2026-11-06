"use client";

import React from "react";
import type { EventItem } from "@/data/staticEvents";
import { CrudManager, type CrudManagerProps, type Errors, type FieldSpec } from "@/components/admin/CrudManager";
import { setDemoCollection, useDemoCollection } from "@/lib/demoStore";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";
import { BackendCollection, PUBLISHED_FIELD, statusLine, withImageFields, type BackendProps } from "@/components/admin/BackendCollection";
import { cn } from "@/lib/utils";

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Event name", type: "text", required: true },
  { name: "id", label: "URL slug", type: "text", createOnly: true, help: "Leave blank to generate from the name." },
  { name: "date", label: "Date", type: "date", required: true },
  { name: "time", label: "Time", type: "text", placeholder: "8:30 AM" },
  { name: "venue", label: "Venue", type: "text", required: true },
  {
    name: "status",
    label: "Status",
    type: "select",
    required: true,
    options: [
      { value: "upcoming", label: "Upcoming" },
      { value: "completed", label: "Completed" },
      { value: "past", label: "Past" },
    ],
  },
  { name: "description", label: "Description", type: "textarea", required: true, wide: true },
  { name: "poster", label: "Poster URL", type: "url", required: true, wide: true, placeholder: "/images/events/poster.jpg" },
  { name: "registrationLink", label: "Registration link", type: "url", wide: true, placeholder: "https://…" },
  { name: "isFeatured", label: "Featured event", type: "checkbox", help: "Shown in the Events page hero. Only upcoming events can be featured.", wide: true },
];

type ManagerProps = Pick<CrudManagerProps<EventItem>, "items" | "fields" | "onChange" | "onCreate" | "onUpdate" | "onDelete" | "editDescription" | "deleteDescription" | "uploadImage"> & { backend?: boolean };

function Manager({ items, backend = false, ...persistence }: ManagerProps) {
  const events = items;
  return (
    <CrudManager<EventItem>
      {...persistence}
      singular="Event"
      items={events}
      titleField="name"
      createItem={() => ({ id: "", name: "", date: "", time: "", venue: "", description: "", poster: "", status: "upcoming" })}
      validate={(draft): Errors => (draft.isFeatured && draft.status !== "upcoming" ? { isFeatured: "Only upcoming events can be featured." } : {})}
      columns={[
        ...(backend ? [{ header: "Published", render: (e: EventItem) => ((e as { isPublished?: boolean }).isPublished ? "Yes" : "—") }] : []),
        {
          header: "Event",
          render: (e) => (
            <>
              <span className="font-heading font-bold">{e.name}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">/events/{e.id}</span>
            </>
          ),
        },
        { header: "Date", render: (e) => <span className="font-mono text-xs">{e.date}</span> },
        { header: "Venue", render: (e) => e.venue },
        {
          header: "Status",
          render: (e, update) => {
            const upcoming = e.status === "upcoming";
            return (
              <button
                type="button"
                onClick={() => update({ status: upcoming ? "completed" : "upcoming", isFeatured: upcoming ? false : e.isFeatured })}
                className={cn(
                  "px-2.5 py-1 rounded-full border-2 border-foreground font-heading font-black text-[10px] tracking-wider text-white",
                  upcoming ? "bg-google-green" : "bg-google-red"
                )}
                aria-label={`Status: ${upcoming ? "upcoming" : "completed"}. Toggle status of ${e.name}`}
              >
                {upcoming ? "UPCOMING" : "COMPLETED"}
              </button>
            );
          },
        },
        { header: "Featured", render: (e) => (e.isFeatured ? "★ Yes" : "—") },
      ]}
    />
  );
}

export default function AdminEventsPage() {
  const mode = useFacultyMode();
  if (mode === "backend") {
    return (
      <BackendCollection<EventItem> resource="events" titleField="name" label="events">
        {(props: BackendProps<EventItem>) => <Manager {...props} backend fields={[...withImageFields(FIELDS, ["poster"]), PUBLISHED_FIELD]} />}
      </BackendCollection>
    );
  }
  // backend API with demo sign-in: no demo fallback
  if (mode === "unavailable") return <p role="alert" className={statusLine}>This section requires admin sign-in.</p>;
  return <DemoManager />;
}

function DemoManager() {
  const events = useDemoCollection("events");
  return <Manager items={events} fields={FIELDS} onChange={(next) => setDemoCollection("events", next)} />;
}
