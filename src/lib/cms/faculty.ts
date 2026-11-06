import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { FacultyInput, FieldErrors, MessageInput, MessageStatus } from "./validation";
import { publicMediaUrl } from "./media-path";

/**
 * Faculty and HOD-message data access for the CMS API. Every query names its columns (the public key may not
 * use select *), runs as the signed-in user (RLS applies), and maps database errors to the field names the
 * Faculty Manager uses. Records are returned in the existing FacultyMember shape plus isPublished/isActiveHod.
 */

export interface ApiResult {
  status: number;
  body: unknown;
}

export interface CmsFaculty {
  id: string;
  name: string;
  designation: string;
  department: string;
  image: string;            // public URL of the uploaded photo (site-media), or "" → initials on the site
  imageConsent?: string;    // where permission for the photo came from (admin only; never public)
  linkedin?: string;
  quote?: string;
  sortOrder: number;
  isPublished: boolean;
  isActiveHod: boolean;
  updatedAt: string;
}

export interface CmsHodMessage {
  id: string;
  facultyId: string;
  message: string;
  status: MessageStatus;
  approvedBy: string | null;
  approvedOn: string | null;
  createdAt: string;
  updatedAt: string;
}

const FACULTY_COLUMNS = "id, name, designation, department, image_path, image_consent, linkedin, quote, sort_order, is_published, is_active_hod, updated_at";
const MESSAGE_COLUMNS = "id, faculty_id, message, status, approved_by, approved_on, created_at, updated_at";

interface FacultyRow {
  id: string;
  name: string;
  designation: string;
  department: string;
  image_path: string | null;
  image_consent: string | null;
  linkedin: string | null;
  quote: string | null;
  sort_order: number;
  is_published: boolean;
  is_active_hod: boolean;
  updated_at: string;
}

interface MessageRow {
  id: string;
  faculty_id: string;
  message: string;
  status: MessageStatus;
  approved_by: string | null;
  approved_on: string | null;
  created_at: string;
  updated_at: string;
}

const toFaculty = (r: FacultyRow): CmsFaculty => ({
  id: r.id,
  name: r.name,
  designation: r.designation,
  department: r.department,
  image: publicMediaUrl(r.image_path),
  ...(r.image_consent ? { imageConsent: r.image_consent } : {}),
  ...(r.linkedin ? { linkedin: r.linkedin } : {}),
  ...(r.quote ? { quote: r.quote } : {}),
  sortOrder: r.sort_order,
  isPublished: r.is_published,
  isActiveHod: r.is_active_hod,
  updatedAt: r.updated_at,
});

const toMessage = (r: MessageRow): CmsHodMessage => ({
  id: r.id,
  facultyId: r.faculty_id,
  message: r.message,
  status: r.status,
  approvedBy: r.approved_by,
  approvedOn: r.approved_on,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function facultyRow(input: FacultyInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.id !== undefined) row.id = input.id;
  if (input.name !== undefined) row.name = input.name;
  if (input.designation !== undefined) row.designation = input.designation;
  if (input.department !== undefined) row.department = input.department;
  if (input.linkedin !== undefined) row.linkedin = input.linkedin;
  if (input.quote !== undefined) row.quote = input.quote;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) row.is_published = input.isPublished;
  if (input.imagePath !== undefined) row.image_path = input.imagePath;
  if (input.imageConsent !== undefined) row.image_consent = input.imageConsent;
  return row;
}

function messageRow(input: MessageInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.facultyId !== undefined) row.faculty_id = input.facultyId;
  if (input.message !== undefined) row.message = input.message;
  if (input.status !== undefined) row.status = input.status;
  if (input.approvedBy !== undefined) row.approved_by = input.approvedBy;
  if (input.approvedOn !== undefined) row.approved_on = input.approvedOn;
  return row;
}

// check-constraint name → form field (names as PostgreSQL generates them in migrations 3 and 4)
const CHECK_FIELDS: Record<string, string> = {
  faculty_id_check: "id",
  faculty_name_check: "name",
  faculty_designation_check: "designation",
  faculty_department_check: "department",
  faculty_linkedin_check: "linkedin",
  faculty_quote_check: "quote",
  faculty_sort_order_check: "sortOrder",
  faculty_image_path_format: "image",
  faculty_image_needs_consent: "imageConsent",
  hod_messages_message_check: "message",
  hod_messages_approval_required: "approvedBy",
};

const fail = (status: number, error: string, errors?: FieldErrors): ApiResult => ({ status, body: errors ? { error, errors } : { error } });

/** Maps a database error to an API response without exposing internals. */
export function mapDbError(error: PostgrestError, context: "faculty" | "message" | "hod"): ApiResult {
  const message = error.message ?? "";
  switch (error.code) {
    case "23505":
      if (/hod_messages_one_published/.test(message)) return fail(409, "Please correct the highlighted fields.", { status: "Another message is already published. Archive it first." });
      if (/faculty_pkey/.test(message)) return fail(409, "Please correct the highlighted fields.", { id: "An entry with this ID already exists." });
      return fail(409, "This change conflicts with an existing record.");
    case "23514": {
      const constraint = message.match(/constraint "([^"]+)"/)?.[1] ?? "";
      const field = CHECK_FIELDS[constraint];
      const text = constraint === "faculty_image_needs_consent" ? "Say where permission for this photo came from." : "This value isn't allowed.";
      return field ? fail(400, "Please correct the highlighted fields.", { [field]: text }) : fail(400, "This value isn't allowed.");
    }
    case "23001": // restrict_violation: PostgreSQL 18+ reports the hod_messages ON DELETE RESTRICT with this code
    case "23503":
      return context === "faculty"
        ? fail(409, "This faculty member has HOD message history and can't be deleted.")
        : fail(400, "Please correct the highlighted fields.", { facultyId: "Unknown faculty record." });
    case "P0001":
      return fail(409, message || "This change isn't allowed.");
    case "P0002":
      return fail(404, "Faculty record not found.");
    case "42501":
      return fail(403, "Admin access required.");
    case "22P02":
      return fail(400, "Invalid value.");
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow (e.g. 2026-02-30); approved_on is the only date column the API writes
      return context === "message"
        ? fail(400, "Please correct the highlighted fields.", { approvedOn: "Enter a valid date (YYYY-MM-DD)." })
        : fail(400, "Invalid date.");
    default:
      console.error(`[cms] database error in ${context}: ${error.code ?? "unknown"}`);
      return fail(500, "Unexpected database error.");
  }
}

// ---------------------------------------------------------------- faculty

export async function listFaculty(client: SupabaseClient): Promise<ApiResult> {
  const r = await client.from("faculty").select(FACULTY_COLUMNS).order("sort_order").order("id");
  if (r.error) return mapDbError(r.error, "faculty");
  return { status: 200, body: { data: (r.data as FacultyRow[]).map(toFaculty) } };
}

export async function createFaculty(client: SupabaseClient, input: FacultyInput): Promise<ApiResult> {
  const r = await client.from("faculty").insert(facultyRow(input)).select(FACULTY_COLUMNS).single();
  if (r.error) return mapDbError(r.error, "faculty");
  return { status: 201, body: { data: toFaculty(r.data as FacultyRow) } };
}

export async function updateFaculty(client: SupabaseClient, id: string, input: FacultyInput): Promise<ApiResult> {
  const r = await client.from("faculty").update(facultyRow(input)).eq("id", id).select(FACULTY_COLUMNS);
  if (r.error) return mapDbError(r.error, "faculty");
  const rows = r.data as FacultyRow[];
  return rows.length ? { status: 200, body: { data: toFaculty(rows[0]) } } : fail(404, "Faculty record not found.");
}

export async function deleteFaculty(client: SupabaseClient, id: string): Promise<ApiResult> {
  const r = await client.from("faculty").delete().eq("id", id).select("id");
  if (r.error) return mapDbError(r.error, "faculty");
  return (r.data as { id: string }[]).length ? { status: 204, body: null } : fail(404, "Faculty record not found.");
}

export async function setActiveHod(client: SupabaseClient, facultyId: string): Promise<ApiResult> {
  const r = await client.rpc("set_active_hod", { p_faculty_id: facultyId });
  if (r.error) return mapDbError(r.error, "hod");
  return { status: 200, body: { data: { activeHod: facultyId } } };
}

export async function clearActiveHod(client: SupabaseClient): Promise<ApiResult> {
  const r = await client.rpc("clear_active_hod");
  if (r.error) return mapDbError(r.error, "hod");
  return { status: 200, body: { data: { activeHod: null } } };
}

// ---------------------------------------------------------------- HOD messages

export async function listMessages(client: SupabaseClient): Promise<ApiResult> {
  const r = await client.from("hod_messages").select(MESSAGE_COLUMNS).order("created_at", { ascending: false });
  if (r.error) return mapDbError(r.error, "message");
  return { status: 200, body: { data: (r.data as MessageRow[]).map(toMessage) } };
}

export async function createMessage(client: SupabaseClient, input: MessageInput): Promise<ApiResult> {
  const r = await client.from("hod_messages").insert(messageRow(input)).select(MESSAGE_COLUMNS).single();
  if (r.error) return mapDbError(r.error, "message");
  return { status: 201, body: { data: toMessage(r.data as MessageRow) } };
}

/** The stored message (for the workflow check), or null when it doesn't exist. */
export async function getMessage(client: SupabaseClient, id: string): Promise<{ ok: true; data: CmsHodMessage | null } | { ok: false; result: ApiResult }> {
  const r = await client.from("hod_messages").select(MESSAGE_COLUMNS).eq("id", id).maybeSingle();
  if (r.error) return { ok: false, result: mapDbError(r.error, "message") };
  return { ok: true, data: r.data ? toMessage(r.data as MessageRow) : null };
}

export async function updateMessage(client: SupabaseClient, id: string, input: MessageInput): Promise<ApiResult> {
  const r = await client.from("hod_messages").update(messageRow(input)).eq("id", id).select(MESSAGE_COLUMNS);
  if (r.error) return mapDbError(r.error, "message");
  const rows = r.data as MessageRow[];
  return rows.length ? { status: 200, body: { data: toMessage(rows[0]) } } : fail(404, "Message not found.");
}
