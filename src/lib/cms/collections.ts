import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ApiResult } from "./faculty";
import { isCalendarDate, isSlug, type FieldErrors } from "./validation";
import { isOwnMedia, type MediaModule } from "./media";
import { RESERVED_ID_ERROR, RESERVED_RECORD_IDS } from "./media-path";

/**
 * Team, Events and Gallery for the CMS API (migration 7b). Each collection lists the existing Admin form fields
 * with their database column; validation mirrors the form and the database checks, every query names its columns
 * and runs as the signed-in user (RLS applies), and errors come back in the form's field names.
 */

type Kind = "slug" | "text" | "url" | "image" | "int" | "bool" | "date" | "enum" | "tags";

interface Field {
  key: string;        // the Admin form / public type field name
  column: string;
  kind: Kind;
  required?: boolean;
  min?: number;
  max?: number;
  values?: readonly string[];
}

export interface Collection {
  name: "team" | "events" | "gallery";
  table: string;
  fields: Field[];
  order: { column: string; ascending: boolean }[];
  /** Cross-field rules of the existing forms; imageOk accepts site/YouTube images and this record's own uploads. */
  rules?: (merged: Record<string, unknown>, imageOk: (url: string) => boolean) => FieldErrors;
  /** Fields that may hold an uploaded photo (bucket site-media, folder <name>/<id>/). */
  mediaKeys: string[];
  /** Named constraints that are not <table>_<column>_check. */
  constraints?: Record<string, [string, string]>;
  /** Record ids no record may use (their media folder belongs to something else): refused on create, update and delete. */
  reservedIds?: readonly string[];
}

export { RESERVED_ID_ERROR };

export const TEAM_CATEGORIES = [
  "President", "Vice President", "Secretary", "Joint Secretary", "Technical Team", "Event Management Team",
  "Social Media Team", "Cultural Team", "Promotional Team", "Documentation Team", "Girls Representative", "Sports Team",
  // committee 2026-27 sections (migration 20261104000001_team_committee_categories)
  "Finance & Treasury", "Discipline Committee", "Women Cell", "NSS", "Sponsorship",
] as const;

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export const COLLECTIONS: Record<Collection["name"], Collection> = {
  team: {
    name: "team",
    table: "team_members",
    fields: [
      { key: "id", column: "id", kind: "slug" },
      { key: "name", column: "name", kind: "text", required: true, max: 200 },
      { key: "role", column: "role", kind: "text", required: true, max: 200 },
      { key: "category", column: "category", kind: "enum", required: true, values: TEAM_CATEGORIES },
      { key: "photo", column: "photo", kind: "image" },
      { key: "quote", column: "quote", kind: "text", max: 2000 },
      { key: "bio", column: "bio", kind: "text", max: 5000 },
      { key: "skills", column: "skills", kind: "tags" },
      { key: "linkedin", column: "linkedin", kind: "url" },
      { key: "github", column: "github", kind: "url" },
      { key: "instagram", column: "instagram", kind: "url" },
      { key: "twitter", column: "twitter", kind: "url" },
      { key: "website", column: "website", kind: "url" },
      { key: "sortOrder", column: "sort_order", kind: "int", required: true, min: 0, max: 1_000_000 },
      { key: "isCreatorBadge", column: "is_creator_badge", kind: "bool" },
      { key: "isPublished", column: "is_published", kind: "bool" },
    ],
    order: [{ column: "sort_order", ascending: true }, { column: "id", ascending: true }],
    mediaKeys: ["photo"],
  },
  events: {
    name: "events",
    table: "events",
    fields: [
      { key: "id", column: "id", kind: "slug" },
      { key: "name", column: "name", kind: "text", required: true, max: 200 },
      { key: "date", column: "event_date", kind: "date", required: true },
      { key: "time", column: "event_time", kind: "text", max: 60 },
      { key: "venue", column: "venue", kind: "text", required: true, max: 300 },
      { key: "status", column: "status", kind: "enum", required: true, values: ["upcoming", "completed", "past"] },
      { key: "description", column: "description", kind: "text", required: true, max: 5000 },
      { key: "poster", column: "poster", kind: "image", required: true },
      { key: "registrationLink", column: "registration_link", kind: "url" },
      { key: "isFeatured", column: "is_featured", kind: "bool" },
      { key: "isPublished", column: "is_published", kind: "bool" },
    ],
    order: [{ column: "event_date", ascending: false }, { column: "id", ascending: true }],
    rules: (v): FieldErrors => (v.isFeatured === true && v.status !== "upcoming" ? { isFeatured: "Only upcoming events can be featured." } : {}),
    constraints: { events_featured_upcoming: ["isFeatured", "Only upcoming events can be featured."] },
    mediaKeys: ["poster"],
  },
  gallery: {
    name: "gallery",
    table: "gallery_items",
    fields: [
      { key: "id", column: "id", kind: "slug" },
      { key: "title", column: "title", kind: "text", required: true, max: 200 },
      { key: "category", column: "category", kind: "enum", required: true, values: ["photo", "video"] },
      { key: "event", column: "event", kind: "text", required: true, max: 200 },
      { key: "year", column: "year", kind: "int", required: true, min: 2000, max: 2100 },
      { key: "url", column: "url", kind: "url", required: true },
      { key: "thumbnailUrl", column: "thumbnail_url", kind: "image" },
      { key: "isFeatured", column: "is_featured", kind: "bool" },
      { key: "isPublished", column: "is_published", kind: "bool" },
    ],
    order: [{ column: "year", ascending: false }, { column: "id", ascending: true }],
    // the existing form rule for videos, plus: a photo's URL is shown as an image, so it must be a servable image source
    rules: (v, imageOk): FieldErrors => {
      const url = typeof v.url === "string" ? v.url : "";
      if (v.category === "video" && url && !YOUTUBE_ID.test(url)) return { url: "Videos need a YouTube URL containing the video ID." };
      if (v.category === "photo" && url && !imageOk(url)) return { url: IMAGE_HELP };
      return {};
    },
    mediaKeys: ["url", "thumbnailUrl"],
    // gallery/content-home-about/ holds the Admin → Content photo (media-path.ts)
    reservedIds: RESERVED_RECORD_IDS.gallery,
  },
};

// a site path may not start with // or /\ : browsers treat both as a link to another host (protocol-relative)
const URL_RULE = /^(https?:\/\/[^\s]+|\/(?![/\\])[^\s\\]*)$/;
// Image fields are rendered with next/image, which only serves configured hosts (next.config.ts): site files, YouTube
// thumbnails, and photos uploaded to this project's site-media bucket (in the record's own folder; see media.ts).
// Third-party image hosts are not accepted.
const IMAGE_SOURCE = /^(\/[A-Za-z0-9][A-Za-z0-9/_.\-%]*|https:\/\/img\.youtube\.com\/[^\s]+)$/;
const IMAGE_HELP = "Upload a photo, or use a site image path (/images/…) or a YouTube thumbnail URL.";
export const isImageSource = (value: string) => IMAGE_SOURCE.test(value) && !value.includes("..");

const fail = (status: number, error: string, errors?: FieldErrors): ApiResult => ({ status, body: errors ? { error, errors } : { error } });

type Body = Record<string, unknown>;

/** Validates a create or update body; returns column → value for the database. */
export function validateRecord(c: Collection, body: Body, mode: "create" | "update", existing?: Body, recordId?: string): { ok: true; row: Body } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const rid = mode === "create" ? (typeof body.id === "string" ? body.id.trim() : "") : recordId ?? "";
  const imageOk = (url: string) => isImageSource(url) || isOwnMedia(url, c.name as MediaModule, rid);
  const keys = new Set(c.fields.map((f) => f.key));
  for (const key of Object.keys(body)) if (!keys.has(key)) errors[key] = key === "updatedAt" ? "This field is set automatically." : "This field can't be set here.";
  const row: Body = {};
  const merged: Body = { ...existing };

  for (const f of c.fields) {
    const v = body[f.key];
    if (f.kind === "slug") {
      if (mode === "update") { if (v !== undefined) errors.id = "The ID can't be changed."; continue; }
      if (typeof v !== "string" || !isSlug(v.trim())) errors.id = "Use lowercase letters, numbers and single hyphens.";
      else if (c.reservedIds?.includes(v.trim())) errors.id = RESERVED_ID_ERROR;
      else row.id = v.trim();
      continue;
    }
    if (v === undefined) {
      if (mode === "create" && f.required && f.kind !== "bool") errors[f.key] = "This field is required.";
      continue;
    }
    const cleared = v === null || v === "";
    if (cleared && f.kind !== "bool") {
      if (f.required) errors[f.key] = "This field is required.";
      else { row[f.column] = f.kind === "tags" ? [] : null; merged[f.key] = undefined; }
      continue;
    }
    switch (f.kind) {
      case "text":
      case "url":
      case "image": {
        if (typeof v !== "string" || !v.trim()) { errors[f.key] = "Must be text."; break; }
        const t = v.trim();
        if (f.kind === "text" && f.max && t.length > f.max) errors[f.key] = `Keep this under ${f.max} characters.`;
        else if (f.kind === "url" && (!URL_RULE.test(t) || t.length > 2000)) errors[f.key] = "Enter a full URL (https://…) or a site path starting with /.";
        else if (f.kind === "image" && !imageOk(t)) errors[f.key] = IMAGE_HELP;
        else { row[f.column] = t; merged[f.key] = t; }
        break;
      }
      case "int":
        if (typeof v !== "number" || !Number.isInteger(v) || v < (f.min ?? 0) || v > (f.max ?? 1_000_000)) errors[f.key] = `Enter a whole number from ${f.min ?? 0} to ${f.max ?? 1_000_000}.`;
        else { row[f.column] = v; merged[f.key] = v; }
        break;
      case "bool":
        if (typeof v !== "boolean") errors[f.key] = "Must be true or false.";
        else { row[f.column] = v; merged[f.key] = v; }
        break;
      case "date":
        if (typeof v !== "string" || !isCalendarDate(v)) errors[f.key] = "Enter a valid date (YYYY-MM-DD).";
        else { row[f.column] = v; merged[f.key] = v; }
        break;
      case "enum":
        if (typeof v !== "string" || !f.values!.includes(v)) errors[f.key] = `Choose one of: ${f.values!.join(", ")}.`;
        else { row[f.column] = v; merged[f.key] = v; }
        break;
      case "tags":
        if (!Array.isArray(v) || v.length > 30 || v.some((s) => typeof s !== "string" || !s.trim() || s.trim().length > 60)) errors[f.key] = "Up to 30 short items.";
        else { row[f.column] = v.map((s: string) => s.trim()); merged[f.key] = row[f.column]; }
        break;
    }
  }
  if (Object.keys(errors).length === 0) Object.assign(errors, c.rules?.(merged, imageOk) ?? {});
  if (mode === "update" && Object.keys(errors).length === 0 && Object.keys(row).length === 0) errors.form = "Nothing to update.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, row };
}

const columns = (c: Collection) => [...c.fields.map((f) => f.column), "updated_at"].join(", ");

/** Database row → the existing record shape (optional fields omitted when empty) plus isPublished/updatedAt. */
export function fromRow(c: Collection, r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of c.fields) {
    const v = r[f.column];
    if (f.kind === "tags") { if (Array.isArray(v) && v.length) out[f.key] = v; continue; }
    if (f.kind === "bool") { out[f.key] = v === true; continue; }
    if (v === null || v === undefined) continue;
    out[f.key] = v;
  }
  out.updatedAt = r.updated_at;
  return out;
}

function mapError(c: Collection, error: PostgrestError): ApiResult {
  const message = error.message ?? "";
  switch (error.code) {
    case "23505":
      return /_pkey/.test(message) ? fail(409, "Please correct the highlighted fields.", { id: "An entry with this ID already exists." }) : fail(409, "This change conflicts with an existing record.");
    case "23514": {
      const constraint = message.match(/constraint "([^"]+)"/)?.[1] ?? "";
      const named = c.constraints?.[constraint];
      if (named) return fail(400, "Please correct the highlighted fields.", { [named[0]]: named[1] });
      const field = c.fields.find((f) => constraint === `${c.table}_${f.column}_check`);
      return field ? fail(400, "Please correct the highlighted fields.", { [field.key]: "This value isn't allowed." }) : fail(400, "This value isn't allowed.");
    }
    case "23502":
      return fail(400, "A required field is missing.");
    case "42501":
      return fail(403, "Admin access required.");
    case "22P02":
    case "22007":
    case "22008":
      return fail(400, "Invalid value.");
    default:
      console.error(`[cms] database error in ${c.name}: ${error.code ?? "unknown"}`);
      return fail(500, "Unexpected database error.");
  }
}

export async function listRecords(client: SupabaseClient, c: Collection): Promise<ApiResult> {
  let q = client.from(c.table).select(columns(c));
  for (const o of c.order) q = q.order(o.column, { ascending: o.ascending });
  const r = await q;
  if (r.error) return mapError(c, r.error);
  return { status: 200, body: { data: (r.data as unknown as Record<string, unknown>[]).map((row) => fromRow(c, row)) } };
}

export async function createRecord(client: SupabaseClient, c: Collection, row: Body): Promise<ApiResult> {
  const r = await client.from(c.table).insert(row).select(columns(c)).single();
  if (r.error) return mapError(c, r.error);
  return { status: 201, body: { data: fromRow(c, r.data as unknown as Record<string, unknown>) } };
}

/** The stored record (for cross-field rules on partial updates); record is null when it doesn't exist. */
export async function getRecord(client: SupabaseClient, c: Collection, id: string): Promise<{ ok: true; record: Record<string, unknown> | null } | { ok: false; result: ApiResult }> {
  const r = await client.from(c.table).select(columns(c)).eq("id", id).maybeSingle();
  if (r.error) return { ok: false, result: mapError(c, r.error) };
  return { ok: true, record: r.data ? fromRow(c, r.data as unknown as Record<string, unknown>) : null };
}

export async function updateRecord(client: SupabaseClient, c: Collection, id: string, row: Body): Promise<ApiResult> {
  const r = await client.from(c.table).update(row).eq("id", id).select(columns(c));
  if (r.error) return mapError(c, r.error);
  const rows = r.data as unknown as Record<string, unknown>[];
  return rows.length ? { status: 200, body: { data: fromRow(c, rows[0]) } } : fail(404, "Record not found.");
}

export async function deleteRecord(client: SupabaseClient, c: Collection, id: string): Promise<ApiResult> {
  const r = await client.from(c.table).delete().eq("id", id).select("id");
  if (r.error) return mapError(c, r.error);
  return (r.data as { id: string }[]).length ? { status: 204, body: null } : fail(404, "Record not found.");
}
