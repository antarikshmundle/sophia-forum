"use client";

import React from "react";
import type { FacultyMember } from "@/data/staticFaculty";
import { CrudManager, type Draft, type Errors, type FieldSpec } from "@/components/admin/CrudManager";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";
import { setDemoCollection, useDemoCollection } from "@/lib/demoStore";
import { useCmsFaculty, type CmsFacultyRecord } from "@/hooks/useCmsFaculty";
import { draftRecordId, uploadMedia } from "@/hooks/uploadMedia";
import { HodMessages } from "@/components/admin/HodMessages";

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "id", label: "ID", type: "text", createOnly: true, help: "Leave blank to generate from the name." },
  { name: "designation", label: "Designation", type: "text", required: true, placeholder: "Assistant Professor" },
  { name: "department", label: "Department", type: "text" },
  { name: "image", label: "Photo URL", type: "url", required: true, wide: true },
  { name: "quote", label: "Quote", type: "textarea", wide: true },
  { name: "sortOrder", label: "Sort order", type: "number", required: true, min: 0 },
];

// Backend mode (D9): LinkedIn, Published, Active HOD; photo upload (site-media, migration 7c) with the permission it needs
const BACKEND_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "id", label: "ID", type: "text", createOnly: true, help: "Leave blank to generate from the name." },
  { name: "designation", label: "Designation", type: "text", required: true, placeholder: "Assistant Professor" },
  { name: "department", label: "Department", type: "text" },
  { name: "linkedin", label: "LinkedIn", type: "url", wide: true },
  { name: "image", label: "Photo", type: "image", wide: true },
  { name: "imageConsent", label: "Photo permission", type: "text", wide: true, help: "Who gave permission to publish this photo (required with a photo)." },
  { name: "quote", label: "Quote", type: "textarea", wide: true },
  { name: "sortOrder", label: "Sort order", type: "number", required: true, min: 0 },
  { name: "isPublished", label: "Published", type: "checkbox" },
  { name: "isActiveHod", label: "Active HOD", type: "checkbox" },
];

const status = "py-20 text-center font-pixel text-xs text-muted-foreground";

// Institutional leadership (About page): three fixed faculty records with reserved ids, edited in their own table
// (never in the faculty list, never a HOD choice). Same API, photo upload and publish state as faculty.
const LEADERSHIP_PREFIX = "leadership-";
const isLeadership = (f: { id: string }) => f.id.startsWith(LEADERSHIP_PREFIX);
const LEADERSHIP_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "designation", label: "Designation", type: "text", required: true, placeholder: "Principal" },
  { name: "image", label: "Photo", type: "image", wide: true },
  { name: "imageConsent", label: "Photo permission", type: "text", wide: true, help: "Who gave permission to publish this photo (required with a photo)." },
  { name: "sortOrder", label: "Order", type: "number", required: true, min: 0 },
  { name: "isPublished", label: "Published", type: "checkbox" },
];

// The API's rules, checked before any request so the fields show why a save can't work
function validateBackend(draft: Draft): Errors {
  const errors: Errors = {};
  if (!String(draft.department ?? "").trim()) errors.department = "Department is required.";
  const linkedin = String(draft.linkedin ?? "").trim();
  if (linkedin && !/^https:\/\/\S+$/.test(linkedin)) errors.linkedin = "Enter a full https:// link.";
  const sortOrder = String(draft.sortOrder ?? "").trim();
  if (sortOrder && !/^\d+$/.test(sortOrder)) errors.sortOrder = "Enter a whole number from 0.";
  if (draft.isActiveHod && !draft.isPublished) errors.isActiveHod = "Only a published faculty record can be the active HOD. Tick Published first.";
  if (String(draft.image ?? "").trim() && !String(draft.imageConsent ?? "").trim()) errors.imageConsent = "Say where permission for this photo came from.";
  if (String(draft.id ?? "").startsWith(LEADERSHIP_PREFIX)) errors.id = "This ID is reserved for the institutional leadership profiles.";
  return errors;
}

function validateLeadership(draft: Draft): Errors {
  const errors: Errors = {};
  const sortOrder = String(draft.sortOrder ?? "").trim();
  if (sortOrder && !/^\d+$/.test(sortOrder)) errors.sortOrder = "Enter a whole number from 0.";
  if (String(draft.image ?? "").trim() && !String(draft.imageConsent ?? "").trim()) errors.imageConsent = "Say where permission for this photo came from.";
  return errors;
}

const COLUMNS = [
  { header: "#", render: (f: FacultyMember | CmsFacultyRecord) => <span className="font-mono text-xs">{f.sortOrder}</span>, className: "w-12" },
  { header: "Name", render: (f: FacultyMember | CmsFacultyRecord) => <span className="font-heading font-bold">{f.name}</span> },
  { header: "Designation", render: (f: FacultyMember | CmsFacultyRecord) => f.designation },
  { header: "Quote", render: (f: FacultyMember | CmsFacultyRecord) => (f.quote ? "Yes" : "—") },
];

function DemoFacultyManager() {
  const faculty = useDemoCollection("faculty");
  const sorted = [...faculty].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <CrudManager<FacultyMember>
      singular="Faculty member"
      items={sorted}
      onChange={(next) => setDemoCollection("faculty", next)}
      titleField="name"
      fields={FIELDS}
      createItem={() => ({
        id: "",
        name: "",
        designation: "",
        department: "Artificial Intelligence & Data Science",
        image: "",
        sortOrder: faculty.reduce((max, f) => Math.max(max, f.sortOrder), 0) + 1,
      })}
      columns={COLUMNS}
    />
  );
}

function BackendFacultyManager() {
  const { load, create, update, remove } = useCmsFaculty();

  if (load.status === "loading") return <p role="status" className={status}>Loading faculty…</p>;
  if (load.status === "error") return <p role="alert" className={status}>{`Couldn't load faculty records. ${load.error}`}</p>;

  const faculty = load.items.filter((f) => !isLeadership(f));
  const leadership = load.items.filter(isLeadership);
  return (
    <div className="space-y-10">
    <CrudManager<CmsFacultyRecord>
      singular="Faculty member"
      items={faculty}
      onCreate={create}
      onUpdate={update}
      onDelete={remove}
      editDescription="Saved to the Sophia Forum CMS."
      deleteDescription={(f) => `"${f.name}" will be permanently deleted from the CMS.`}
      deleteBlockedReason={(f) => (f.isActiveHod ? "The active HOD can't be deleted. Assign another HOD or clear the HOD first." : null)}
      validate={validateBackend}
      uploadImage={(file, draft) => uploadMedia("faculty", draftRecordId(draft, "name"), file)}
      titleField="name"
      fields={BACKEND_FIELDS}
      createItem={() => ({
        id: "",
        name: "",
        designation: "",
        department: "Artificial Intelligence & Data Science",
        image: "",
        sortOrder: faculty.reduce((max, f) => Math.max(max, f.sortOrder), 0) + 1,
        isPublished: false,
        isActiveHod: false,
        updatedAt: "",
      })}
      columns={COLUMNS}
    />
    <section aria-labelledby="leadership-admin-heading" className="space-y-4">
      <h2 id="leadership-admin-heading" className="font-heading font-bold text-base">Institutional leadership</h2>
      <CrudManager<CmsFacultyRecord>
        singular="Leadership profile"
        items={leadership}
        onUpdate={update}
        canCreate={false}
        canDelete={false}
        editDescription="Saved to the Sophia Forum CMS. Shown on the About page when published."
        validate={validateLeadership}
        uploadImage={(file, draft) => uploadMedia("faculty", draftRecordId(draft, "name"), file)}
        titleField="name"
        fields={LEADERSHIP_FIELDS}
        createItem={() => leadership[0]}
        columns={[
          { header: "#", render: (f) => <span className="font-mono text-xs">{f.sortOrder}</span>, className: "w-12" },
          { header: "Name", render: (f) => <span className="font-heading font-bold">{f.name}</span> },
          { header: "Designation", render: (f) => f.designation },
          { header: "Photo", render: (f) => (f.image ? "Yes" : "—") },
          { header: "Published", render: (f) => (f.isPublished ? "Yes" : "—") },
        ]}
      />
    </section>
    <HodMessages faculty={faculty} />
    </div>
  );
}

export default function AdminFacultyPage() {
  const mode = useFacultyMode();
  if (mode === "backend") return <BackendFacultyManager />;
  // backend API with demo sign-in: no demo fallback
  if (mode === "unavailable") return <p role="alert" className={status}>Faculty requires admin sign-in.</p>;
  return <DemoFacultyManager />;
}
