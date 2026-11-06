import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiResult } from "./faculty";
import type { FieldErrors } from "./validation";
import { CONTENT_SECTIONS, MAX_MILESTONES, MILESTONES_ID } from "@/data/siteContent";
import { isContentMedia } from "./media-path";

/**
 * Admin → Content: the editable text of the existing home/About sections (site_content, migration 7b). Only the
 * sections and fields defined in src/data/siteContent.ts are accepted; each is checked for type and length.
 */

const fail = (status: number, error: string, errors?: FieldErrors): ApiResult => ({ status, body: errors ? { error, errors } : { error } });
const MILESTONE_LIMITS = { year: 20, title: 120, description: 600 } as const;

export function isContentId(id: string): boolean {
  return id === MILESTONES_ID || CONTENT_SECTIONS.some((s) => s.id === id);
}

export function validateContent(id: string, body: Record<string, unknown>): { ok: true; data: Record<string, unknown> } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  for (const key of Object.keys(body)) if (key !== "data") errors[key] = "This field can't be set here.";
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: { ...errors, form: "Send the section's fields as an object." } };
  const input = data as Record<string, unknown>;

  if (id === MILESTONES_ID) {
    for (const key of Object.keys(input)) if (key !== "items") errors[key] = "This field can't be set here.";
    const items = input.items;
    if (!Array.isArray(items) || items.length > MAX_MILESTONES) return { ok: false, errors: { ...errors, form: `Send up to ${MAX_MILESTONES} milestones.` } };
    const clean = [];
    for (const [i, raw] of items.entries()) {
      const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const extra = Object.keys(m).filter((k) => !["id", "year", "title", "description"].includes(k));
      if (extra.length) errors[extra[0]] = "This field can't be set here.";
      if (typeof m.id !== "string" || !/^[a-z0-9-]{1,60}$/.test(m.id)) errors.id = `Milestone ${i + 1}: invalid id.`;
      for (const key of ["year", "title", "description"] as const) {
        const v = m[key];
        if (typeof v !== "string" || !v.trim()) errors[key] = "This field is required.";
        else if (v.trim().length > MILESTONE_LIMITS[key]) errors[key] = `Keep this under ${MILESTONE_LIMITS[key]} characters.`;
      }
      clean.push({ id: m.id, year: String(m.year ?? "").trim(), title: String(m.title ?? "").trim(), description: String(m.description ?? "").trim() });
    }
    if (new Set(clean.map((m) => m.id)).size !== clean.length) errors.id = "Milestone ids must be unique.";
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { items: clean } };
  }

  const section = CONTENT_SECTIONS.find((s) => s.id === id)!;
  const out: Record<string, unknown> = {};
  const known = new Set(section.fields.map((f) => f.key));
  for (const key of Object.keys(input)) if (!known.has(key)) errors[key] = "This field can't be set here.";
  for (const f of section.fields) {
    const v = input[f.key];
    if (v === undefined) continue; // not sent: the built-in text stays in effect
    if (f.type === "number") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > f.max) errors[f.key] = `Enter a whole number from 0 to ${f.max}.`;
      else out[f.key] = v;
      continue;
    }
    if (typeof v !== "string") { errors[f.key] = "Must be text."; continue; }
    const text = v.trim();
    if (!text && !f.optional) errors[f.key] = "This field is required.";
    else if (text.length > f.max) errors[f.key] = `Keep this under ${f.max} characters.`;
    else if (f.key === "photo" && text && !/^\/[A-Za-z0-9][A-Za-z0-9/_.\-%]*$/.test(text) && !isContentMedia(text)) errors[f.key] = "Upload a photo, or use a site image path (/images/…).";
    else out[f.key] = text;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: out };
}

export async function listContent(client: SupabaseClient): Promise<ApiResult> {
  const r = await client.from("site_content").select("id, data, updated_at");
  if (r.error) {
    console.error(`[cms] database error in content: ${r.error.code ?? "unknown"}`);
    return fail(r.error.code === "42501" ? 403 : 500, r.error.code === "42501" ? "Admin access required." : "Unexpected database error.");
  }
  return { status: 200, body: { data: Object.fromEntries((r.data as { id: string; data: unknown }[]).map((row) => [row.id, row.data])) } };
}

/** Saves one section (update, or insert the first time; the id column is insert-only). */
export async function saveContent(client: SupabaseClient, id: string, data: Record<string, unknown>): Promise<ApiResult> {
  const updated = await client.from("site_content").update({ data }).eq("id", id).select("id, data");
  let rows = updated.data as { id: string; data: unknown }[] | null;
  let error = updated.error;
  if (!error && rows && rows.length === 0) {
    const inserted = await client.from("site_content").insert({ id, data }).select("id, data");
    rows = inserted.data as { id: string; data: unknown }[] | null;
    error = inserted.error;
  }
  if (error) {
    if (error.code === "42501") return fail(403, "Admin access required.");
    if (error.code === "23514") return fail(400, "This content is too large or not allowed.");
    console.error(`[cms] database error in content: ${error.code ?? "unknown"}`);
    return fail(500, "Unexpected database error.");
  }
  return { status: 200, body: { data: rows?.[0]?.data ?? data } };
}
