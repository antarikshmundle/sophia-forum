"use client";

import React from "react";
import type { GalleryMediaItem } from "@/data/staticGallery";
import { CrudManager, type CrudManagerProps, type Errors, type FieldSpec } from "@/components/admin/CrudManager";
import { setDemoCollection, useDemoCollection } from "@/lib/demoStore";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";
import { BackendCollection, PUBLISHED_FIELD, statusLine, withImageFields, type BackendProps } from "@/components/admin/BackendCollection";
import { getYouTubeId } from "@/lib/format";

const FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "id", label: "ID", type: "text", createOnly: true, help: "Leave blank to generate from the title." },
  {
    name: "category",
    label: "Media type",
    type: "select",
    required: true,
    options: [
      { value: "photo", label: "Photo" },
      { value: "video", label: "Video" },
    ],
  },
  { name: "event", label: "Event", type: "text", required: true, help: "Must match an event name to appear in that event's gallery filter, or use General." },
  { name: "year", label: "Year", type: "number", required: true, min: 2000, max: 2100 },
  { name: "url", label: "Media URL", type: "url", required: true, wide: true, help: "Image URL, or a YouTube watch URL for videos." },
  { name: "thumbnailUrl", label: "Thumbnail URL", type: "url", wide: true },
  { name: "isFeatured", label: "Featured", type: "checkbox", wide: true },
];

type ManagerProps = Pick<CrudManagerProps<GalleryMediaItem>, "items" | "fields" | "onChange" | "onCreate" | "onUpdate" | "onDelete" | "editDescription" | "deleteDescription" | "uploadImage"> & { backend?: boolean };

function Manager({ items, backend = false, ...persistence }: ManagerProps) {
  const gallery = items;
  return (
    <CrudManager<GalleryMediaItem>
      {...persistence}
      singular="Media item"
      items={gallery}
      titleField="title"
      createItem={() => ({ id: "", title: "", category: "photo", event: "General", year: new Date().getFullYear(), url: "" })}
      validate={(draft): Errors =>
        draft.category === "video" && String(draft.url).trim() && !getYouTubeId(String(draft.url))
          ? { url: "Videos need a YouTube URL containing the video ID." }
          : {}
      }
      columns={[
        ...(backend ? [{ header: "Published", render: (g: GalleryMediaItem) => ((g as { isPublished?: boolean }).isPublished ? "Yes" : "—") }] : []),
        {
          header: "Title",
          render: (g) => (
            <>
              <span className="font-heading font-bold">{g.title}</span>
              <span className="block font-mono text-[11px] text-muted-foreground break-all">{g.url || "no URL (unavailable)"}</span>
            </>
          ),
          className: "max-w-[320px]",
        },
        { header: "Type", render: (g) => <span className="uppercase font-mono text-xs">{g.category}</span> },
        { header: "Event", render: (g) => g.event },
        { header: "Year", render: (g) => <span className="font-mono text-xs">{g.year}</span> },
        {
          header: "Featured",
          render: (g, update) => (
            <label className="inline-flex items-center gap-2 font-mono text-xs">
              <input
                type="checkbox"
                checked={!!g.isFeatured}
                onChange={(e) => update({ isFeatured: e.target.checked })}
                className="w-4 h-4 accent-google-blue"
                aria-label={`Featured: ${g.title}`}
              />
              {g.isFeatured ? "Yes" : "No"}
            </label>
          ),
        },
      ]}
    />
  );
}

export default function AdminGalleryPage() {
  const mode = useFacultyMode();
  if (mode === "backend") {
    return (
      <BackendCollection<GalleryMediaItem> resource="gallery" titleField="title" label="gallery items">
        {(props: BackendProps<GalleryMediaItem>) => <Manager {...props} backend fields={[...withImageFields(FIELDS, ["url", "thumbnailUrl"]), PUBLISHED_FIELD]} />}
      </BackendCollection>
    );
  }
  // backend API with demo sign-in: no demo fallback
  if (mode === "unavailable") return <p role="alert" className={statusLine}>This section requires admin sign-in.</p>;
  return <DemoManager />;
}

function DemoManager() {
  const gallery = useDemoCollection("gallery");
  return <Manager items={gallery} fields={FIELDS} onChange={(next) => setDemoCollection("gallery", next)} />;
}
