"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CrudManager, type Errors, type FieldSpec, type SaveOutcome } from "@/components/admin/CrudManager";
import { RequireRole } from "@/components/admin/AdminShell";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";
import { statusLine } from "@/components/admin/BackendCollection";
import { CONTENT_SECTIONS, MILESTONES_ID, milestoneValues, sectionValues, type MilestoneEntry, type StoredContent } from "@/data/siteContent";
import { uploadMedia } from "@/hooks/uploadMedia";
import { CONTENT_MEDIA } from "@/lib/cms/media-path";

/**
 * Admin → Content (CMS backend only): the text of the existing home and About sections, and the About milestones.
 * Saved through /api/admin/content; the public pages show the saved text on the next request.
 */

type SectionRow = { id: string; label: string } & Record<string, string | number>;

// Photo fields with an upload control (preview, upload, replace, remove); files go to the reserved Content folder
const PHOTO_SECTION = "home.about";
const isPhotoField = (sectionId: string, key: string) => sectionId === PHOTO_SECTION && key === "photo";
const uploadPhoto = (file: File, draft: Record<string, unknown>) =>
  draft.id === PHOTO_SECTION
    ? uploadMedia(CONTENT_MEDIA.module, CONTENT_MEDIA.recordId, file)
    : Promise.resolve({ ok: false as const, error: "This section has no photo." });

const sectionFields = (id: string): FieldSpec[] =>
  CONTENT_SECTIONS.find((s) => s.id === id)!.fields.map((f) => ({
    name: f.key,
    label: f.label,
    type: isPhotoField(id, f.key) ? ("image" as const) : f.type,
    wide: f.type === "textarea" || isPhotoField(id, f.key),
    required: !f.optional,
    ...(f.type === "number" ? { min: 0, max: f.max } : {}),
  }));

const MILESTONE_FIELDS: FieldSpec[] = [
  { name: "year", label: "Year", type: "text", required: true, placeholder: "2026" },
  { name: "title", label: "Title", type: "text", required: true },
  { name: "description", label: "Description", type: "textarea", required: true, wide: true },
];

type Saved = { ok: true } | { ok: false; error: string; errors?: Errors };

async function request(method: "GET" | "PUT", path: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string; errors?: Errors }> {
  try {
    const r = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await r.json().catch(() => null);
    if (r.ok) return { ok: true, data: json?.data };
    return { ok: false, error: typeof json?.error === "string" ? json.error : `Request failed (${r.status}).`, errors: json?.errors };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

const preview = (row: SectionRow) => {
  const text = sectionFields(row.id).map((f) => row[f.name]).filter((v) => typeof v === "string" && v).join(" · ");
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
};

function ContentEditor() {
  const [stored, setStored] = useState<StoredContent | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const r = await request("GET", "/api/admin/content");
    if (!r.ok) setError(r.error);
    else setStored((r.data ?? {}) as StoredContent);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) return <p role="alert" className={statusLine}>{`Couldn't load the site content. ${error}`}</p>;
  if (!stored) return <p role="status" className={statusLine}>Loading site content…</p>;

  const sections: SectionRow[] = CONTENT_SECTIONS.map((s) => ({ id: s.id, label: s.label, ...sectionValues(s.id, stored) }));
  const milestones = milestoneValues(stored);

  const save = async (id: string, data: Record<string, unknown>): Promise<Saved> => {
    const r = await request("PUT", `/api/admin/content/${encodeURIComponent(id)}`, { data });
    await refresh();
    return r.ok ? { ok: true } : r;
  };

  const saveSection = async (row: SectionRow): Promise<SaveOutcome<SectionRow>> => {
    const section = CONTENT_SECTIONS.find((s) => s.id === row.id)!;
    const data = Object.fromEntries(section.fields.map((f) => [f.key, f.type === "number" ? Number(row[f.key]) : String(row[f.key] ?? "")]));
    const r = await save(row.id, data);
    return r.ok ? { ok: true, item: row } : { ok: false, error: r.error, errors: r.errors };
  };

  const saveMilestones = async (next: MilestoneEntry[], item?: MilestoneEntry): Promise<SaveOutcome<MilestoneEntry>> => {
    const r = await save(MILESTONES_ID, { items: next.map(({ id, year, title, description }) => ({ id, year, title, description })) });
    return r.ok ? { ok: true, item } : { ok: false, error: r.error, errors: r.errors };
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="content-sections-heading" className="space-y-4">
        <h2 id="content-sections-heading" className="font-heading font-bold text-base">Page text</h2>
        <CrudManager<SectionRow>
          singular="Section"
          items={sections}
          titleField="label"
          fields={[]}
          fieldsFor={(row) => sectionFields(row.id)}
          canCreate={false}
          canDelete={false}
          createItem={() => sections[0]}
          onUpdate={saveSection}
          uploadImage={uploadPhoto}
          editDescription="Saved to the Sophia Forum CMS."
          columns={[
            { header: "Section", render: (r) => <span className="font-heading font-bold">{r.label}</span> },
            { header: "Text", render: (r) => <span className="text-muted-foreground">{preview(r)}</span> },
          ]}
        />
      </section>

      <section aria-labelledby="content-milestones-heading" className="space-y-4">
        <h2 id="content-milestones-heading" className="font-heading font-bold text-base">About · Milestones</h2>
        <CrudManager<MilestoneEntry>
          singular="Milestone"
          items={milestones}
          titleField="title"
          fields={MILESTONE_FIELDS}
          createItem={() => ({ id: `m-${Date.now().toString(36)}`, year: "", title: "", description: "" })}
          onCreate={(item) => saveMilestones([...milestones, item], item)}
          onUpdate={(item) => saveMilestones(milestones.map((m) => (m.id === item.id ? item : m)), item)}
          onDelete={(item) => saveMilestones(milestones.filter((m) => m.id !== item.id))}
          editDescription="Saved to the Sophia Forum CMS."
          deleteDescription={(m) => `"${m.year} — ${m.title}" will be permanently deleted from the CMS.`}
          columns={[
            { header: "Year", render: (m) => <span className="font-mono text-xs">{m.year}</span>, className: "w-20" },
            { header: "Title", render: (m) => <span className="font-heading font-bold">{m.title}</span> },
          ]}
        />
      </section>
    </div>
  );
}

export default function AdminContentPage() {
  const mode = useFacultyMode();
  if (mode !== "backend") return <p role="status" className={statusLine}>Content editing is available when the dashboard runs on the CMS backend.</p>;
  return (
    <RequireRole role="admin">
      <ContentEditor />
    </RequireRole>
  );
}
