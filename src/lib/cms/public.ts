import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { cmsFacultyMode } from "./mode";
import { supabaseConfig } from "./supabase-server";
import { COLLECTIONS, fromRow, type Collection } from "./collections";
import { publicMediaUrl } from "./media-path";

/**
 * Public (signed-out) reads for the site's pages. They use the public key without any session, so Row Level
 * Security returns only published records; no secret key is ever used. Used only when CMS_FACULTY_MODE=backend;
 * callers then render the result or an error state, never the static demo data.
 */

export type PublicResult<T> = { ok: true; data: T } | { ok: false };

export interface PublicFaculty {
  id: string;
  name: string;
  designation: string;
  department: string;
  image: string; // the uploaded photo's public URL, or "" → initials
  quote?: string;
  linkedin?: string;
  sortOrder: number;
}

export interface PublicHod {
  name: string;
  designation: string;
  image: string;
  message: string; // the published, approved HOD message
}

/**
 * Institutional leadership (About page): three fixed faculty records with reserved ids (no separate table needed — the
 * faculty table already has name, designation, photo, permission and publish state). They never appear in the
 * Faculty grid and can't become the HOD in the Admin screens.
 */
export const LEADERSHIP_PREFIX = "leadership-";
const sameName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Public pages read the CMS backend (rendered per request) instead of the built-in data. */
export const publicFromBackend = () => cmsFacultyMode() === "backend";

async function publicClient(): Promise<SupabaseClient | null> {
  await connection(); // render per request, so Admin edits show without a rebuild
  const config = supabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

const failed = (what: string, code?: string): { ok: false } => {
  console.error(`[cms] public ${what} read failed: ${code || "backend unreachable or not configured"}`);
  return { ok: false };
};

export async function publishedFaculty(): Promise<PublicResult<PublicFaculty[]>> {
  const client = await publicClient();
  if (!client) return failed("faculty");
  const r = await client
    .from("faculty")
    .select("id, name, designation, department, image_path, linkedin, quote, sort_order")
    .eq("is_published", true)
    .not("id", "like", `${LEADERSHIP_PREFIX}%`)
    .order("sort_order")
    .order("id");
  if (r.error) return failed("faculty", r.error.code);
  // A person with a published institutional-authority profile is shown in that section only, never also as a faculty card
  const leaders = await client.from("faculty").select("name").eq("is_published", true).like("id", `${LEADERSHIP_PREFIX}%`);
  if (leaders.error) return failed("faculty", leaders.error.code);
  const leaderNames = new Set((leaders.data as { name: string }[]).map((l) => sameName(l.name)));
  const rows = (r.data as { id: string; name: string; designation: string; department: string; image_path: string | null; linkedin: string | null; quote: string | null; sort_order: number }[])
    .filter((f) => !leaderNames.has(sameName(f.name)));
  return {
    ok: true,
    data: rows.map((f) => ({
      id: f.id,
      name: f.name,
      designation: f.designation,
      department: f.department,
      image: publicMediaUrl(f.image_path),
      ...(f.quote ? { quote: f.quote } : {}),
      ...(f.linkedin ? { linkedin: f.linkedin } : {}),
      sortOrder: f.sort_order,
    })),
  };
}

/** The active HOD with their published message, or null when either is missing (the card is then not shown). */
export async function publishedHod(): Promise<PublicResult<PublicHod | null>> {
  const client = await publicClient();
  if (!client) return failed("HOD");
  const hod = await client.from("faculty").select("id, name, designation, image_path").eq("is_published", true).eq("is_active_hod", true).maybeSingle();
  if (hod.error) return failed("HOD", hod.error.code);
  if (!hod.data) return { ok: true, data: null };
  const message = await client.from("hod_messages").select("message").eq("status", "published").eq("faculty_id", hod.data.id).maybeSingle();
  if (message.error) return failed("HOD message", message.error.code);
  if (!message.data) return { ok: true, data: null };
  return { ok: true, data: { name: hod.data.name, designation: hod.data.designation, image: publicMediaUrl(hod.data.image_path), message: message.data.message } };
}

// ---------------------------------------------------------------- Team, Events, Gallery (migration 7b)

/** Published records of one collection, in the shape of the site's existing types (no isPublished/updatedAt). */
export async function publishedRecords(name: Collection["name"], id?: string): Promise<PublicResult<Record<string, unknown>[]>> {
  const c = COLLECTIONS[name];
  const client = await publicClient();
  if (!client) return failed(name);
  // only the columns the public key may read (never updated_by / updated_at)
  let q = client.from(c.table).select(c.fields.map((f) => f.column).join(", ")).eq("is_published", true);
  if (id !== undefined) q = q.eq("id", id);
  for (const o of c.order) q = q.order(o.column, { ascending: o.ascending });
  const r = await q;
  if (r.error) return failed(name, r.error.code);
  return {
    ok: true,
    data: (r.data as unknown as Record<string, unknown>[]).map((row) => {
      const { isPublished: _p, updatedAt: _u, ...record } = fromRow(c, row);
      return record;
    }),
  };
}

// ---------------------------------------------------------------- site content (Admin → Content)

/** All stored content sections (id → data); sections never edited are simply absent (their built-in text applies). */
export async function publishedContent(): Promise<PublicResult<Record<string, Record<string, unknown>>>> {
  const client = await publicClient();
  if (!client) return failed("content");
  const r = await client.from("site_content").select("id, data");
  if (r.error) return failed("content", r.error.code);
  return { ok: true, data: Object.fromEntries((r.data as { id: string; data: Record<string, unknown> }[]).map((row) => [row.id, row.data])) };
}

// ---------------------------------------------------------------- institutional leadership (About)

export interface PublicLeader {
  id: string;
  name: string;
  designation: string;
  image: string; // the uploaded photo's public URL, or "" → initials
}

/** The published leadership profiles, in their sort order. */
export async function publishedLeadership(): Promise<PublicResult<PublicLeader[]>> {
  const client = await publicClient();
  if (!client) return failed("leadership");
  const r = await client
    .from("faculty")
    .select("id, name, designation, image_path, sort_order")
    .eq("is_published", true)
    .like("id", `${LEADERSHIP_PREFIX}%`)
    .order("sort_order")
    .order("id");
  if (r.error) return failed("leadership", r.error.code);
  const rows = r.data as { id: string; name: string; designation: string; image_path: string | null }[];
  return { ok: true, data: rows.map((f) => ({ id: f.id, name: f.name, designation: f.designation, image: publicMediaUrl(f.image_path) })) };
}
