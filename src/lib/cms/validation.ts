/**
 * Input validation for the CMS API. Mirrors the database rules (migrations 3 and 4) and the existing admin
 * form's FieldSpec rules, so callers get field-level messages before the database is reached. Error keys use the
 * Faculty Manager's field names (id, name, designation, department, image, quote, linkedin, sortOrder, …), which
 * is the shape CrudManager already displays. The database stays the authority; this only adds earlier messages.
 */

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const MAX_BODY_BYTES = 32 * 1024;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITS = { id: 100, name: 200, designation: 200, department: 200, linkedin: 500, quote: 2000, message: 5000, approvedBy: 200, imageConsent: 300 };

/** A real calendar date in YYYY-MM-DD form (years 1900–9999). Date.parse is not used: it rolls 2026-02-30 over. */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

export const isSlug = (value: string) => SLUG.test(value) && value.length <= LIMITS.id;
export const isUuid = (value: string) => UUID.test(value);

type JsonBody = Record<string, unknown>;

const TOO_LARGE = { ok: false, status: 413, error: "Request body too large." } as const;

/**
 * Reads the body stream with a hard byte cap: reading stops (and the stream is cancelled) as soon as more than
 * maxBytes have arrived, so a request without, or with a false, Content-Length is never buffered in full.
 */
export async function readCappedBytes(request: Request, maxBytes: number): Promise<{ ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false }> {
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

async function readCappedText(request: Request): Promise<{ ok: true; text: string } | typeof TOO_LARGE | { ok: false; status: 400; error: string }> {
  const read = await readCappedBytes(request, MAX_BODY_BYTES);
  if (!read.ok) return TOO_LARGE;
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(read.bytes) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON." };
  }
}

/** Reads a JSON object body with a content-type check and a streamed size limit. */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: JsonBody } | { ok: false; status: number; error: string }> {
  if (!/^application\/json(\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return { ok: false, status: 415, error: "Send JSON (Content-Type: application/json)." };
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return TOO_LARGE;
  const read = await readCappedText(request);
  if (!read.ok) return read;
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON." };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "Expected a JSON object." };
  return { ok: true, body: body as JsonBody };
}

function unknownKeys(body: JsonBody, allowed: readonly string[], errors: FieldErrors, special: Record<string, string> = {}) {
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors[key] = special[key] ?? "This field can't be set here.";
}

/** A required or optional trimmed string; returns undefined when absent and records an error when invalid. */
function text(body: JsonBody, key: keyof typeof LIMITS, errors: FieldErrors, required: boolean): string | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) errors[key] = "This field is required.";
    return undefined;
  }
  if (typeof value !== "string") {
    errors[key] = "Must be text.";
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    errors[key] = "This field is required.";
    return undefined;
  }
  if (trimmed.length > LIMITS[key]) errors[key] = `Keep this under ${LIMITS[key]} characters.`;
  return trimmed;
}

/** Optional text that may be cleared with "" or null. */
function optionalText(body: JsonBody, key: keyof typeof LIMITS, errors: FieldErrors): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    errors[key] = "Must be text.";
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > LIMITS[key]) errors[key] = `Keep this under ${LIMITS[key]} characters.`;
  return trimmed;
}

// ---------------------------------------------------------------- faculty

export interface FacultyInput {
  id?: string;
  name?: string;
  designation?: string;
  department?: string;
  linkedin?: string | null;
  quote?: string | null;
  sortOrder?: number;
  isPublished?: boolean;
  imagePath?: string | null;      // site-media object path (faculty/<id>/<uuid>.<ext>); null removes the photo
  imageConsent?: string | null;   // where permission for the photo came from (required with a photo)
}

const FACULTY_KEYS = ["id", "name", "designation", "department", "image", "imageConsent", "linkedin", "quote", "sortOrder", "isPublished"] as const;
const FACULTY_SPECIAL = {
  isActiveHod: "Use the HOD action to change the active HOD.",
  updatedBy: "This field is set automatically.",
  updatedAt: "This field is set automatically.",
};

/** photoPath: the object path when url is an uploaded photo in this faculty record's own folder, else null. */
export function validateFacultyInput(body: JsonBody, mode: "create" | "update", photoPath: (url: string, id: string) => string | null = () => null, recordId = ""): Validated<FacultyInput> {
  const errors: FieldErrors = {};
  unknownKeys(body, FACULTY_KEYS, errors, FACULTY_SPECIAL);
  const value: FacultyInput = {};

  if (mode === "create") {
    const id = text(body, "id", errors, true);
    if (id !== undefined && !isSlug(id)) errors.id = "Use lowercase letters, numbers and single hyphens.";
    else if (id !== undefined) value.id = id;
  } else if (body.id !== undefined) {
    errors.id = "The ID can't be changed.";
  }

  for (const key of ["name", "designation"] as const) {
    const v = text(body, key, errors, mode === "create");
    if (v !== undefined) value[key] = v;
  }
  const department = text(body, "department", errors, false);
  if (department !== undefined) value.department = department;

  // Photos: an upload in this record's own folder (site-media, migration 7c), or "" / null to remove the photo
  if (body.image !== undefined) {
    if (body.image === null || body.image === "") value.imagePath = null;
    else {
      const id = mode === "create" ? (typeof body.id === "string" ? body.id.trim() : "") : recordId;
      const path = typeof body.image === "string" ? photoPath(body.image.trim(), id) : null;
      if (!path) errors.image = "Upload the photo here (photos from other sites or records can't be used).";
      else value.imagePath = path;
    }
  }
  const consent = optionalText(body, "imageConsent", errors);
  if (consent !== undefined) value.imageConsent = consent;

  const linkedin = optionalText(body, "linkedin", errors);
  if (linkedin !== undefined) {
    if (linkedin !== null && !HTTPS_URL.test(linkedin)) errors.linkedin = "Enter a full https:// link.";
    else value.linkedin = linkedin;
  }
  const quote = optionalText(body, "quote", errors);
  if (quote !== undefined) value.quote = quote;

  if (body.sortOrder === undefined) {
    if (mode === "create") errors.sortOrder = "This field is required.";
  } else if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 1_000_000) {
    errors.sortOrder = "Enter a whole number from 0.";
  } else {
    value.sortOrder = body.sortOrder;
  }

  if (body.isPublished !== undefined) {
    if (typeof body.isPublished !== "boolean") errors.isPublished = "Must be true or false.";
    else value.isPublished = body.isPublished;
  }

  if (mode === "update" && Object.keys(errors).length === 0 && Object.keys(value).length === 0) errors.form = "Nothing to update.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ---------------------------------------------------------------- HOD

export function validateHodInput(body: JsonBody): Validated<{ facultyId: string }> {
  const errors: FieldErrors = {};
  unknownKeys(body, ["facultyId"], errors);
  const id = body.facultyId;
  if (typeof id !== "string" || !isSlug(id)) errors.facultyId = "Choose a faculty record.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { facultyId: id as string } };
}

// ---------------------------------------------------------------- HOD messages

export type MessageStatus = "draft" | "approved" | "published" | "archived";
const STATUSES: readonly MessageStatus[] = ["draft", "approved", "published", "archived"];

export interface MessageInput {
  facultyId?: string;
  message?: string;
  status?: MessageStatus;
  approvedBy?: string | null;
  approvedOn?: string | null;
}

export function validateMessageInput(body: JsonBody, mode: "create" | "update"): Validated<MessageInput> {
  const errors: FieldErrors = {};
  const allowed = mode === "create" ? ["facultyId", "message", "status", "approvedBy", "approvedOn"] : ["message", "status", "approvedBy", "approvedOn"];
  unknownKeys(body, allowed, errors, { facultyId: "A message can't be moved to another faculty record." });
  const value: MessageInput = {};

  if (mode === "create") {
    const id = body.facultyId;
    if (typeof id !== "string" || !isSlug(id)) errors.facultyId = "Choose a faculty record.";
    else value.facultyId = id;
  }
  const message = text(body, "message", errors, mode === "create");
  if (message !== undefined) value.message = message;

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSES.includes(body.status as MessageStatus)) errors.status = "Choose draft, approved, published or archived.";
    else value.status = body.status as MessageStatus;
  }
  const approvedBy = optionalText(body, "approvedBy", errors);
  if (approvedBy !== undefined) value.approvedBy = approvedBy;

  if (body.approvedOn !== undefined) {
    const v = body.approvedOn;
    if (v === null || v === "") value.approvedOn = null;
    else if (typeof v !== "string" || !isCalendarDate(v)) errors.approvedOn = "Enter a valid date (YYYY-MM-DD).";
    else value.approvedOn = v;
  }
  if ((value.status === "approved" || value.status === "published") && mode === "create" && (!value.approvedBy || !value.approvedOn)) {
    errors.approvedBy = "Record who approved the wording, and when, before approving or publishing.";
  }

  if (mode === "update" && Object.keys(errors).length === 0 && Object.keys(value).length === 0) errors.form = "Nothing to update.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ---------------------------------------------------------------- HOD message workflow (API-enforced)
// draft → approved (approver + date) → published → archived; approved may return to draft (approval cleared);
// archived is final. Wording changes only while a draft. The database still enforces its own rules underneath
// (approval fields for approved/published, one published message, only the current published HOD's message).

export interface StoredMessage {
  status: MessageStatus;
  message: string;
  approvedBy: string | null;
  approvedOn: string | null;
}

const NEXT_STATUS: Record<MessageStatus, readonly MessageStatus[]> = {
  draft: ["draft", "approved", "archived"],
  approved: ["approved", "published", "draft", "archived"],
  published: ["published", "archived"],
  archived: [],
};

export type WorkflowResult = { ok: true; value: MessageInput } | { ok: false; status: number; error: string; errors?: FieldErrors };

/** New messages start as drafts; the approval is recorded when a draft is approved. */
export function checkNewMessage(input: MessageInput): WorkflowResult {
  if (input.status !== undefined && input.status !== "draft") {
    return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors: { status: "New messages start as drafts. Approve, then publish them." } };
  }
  if ((input.approvedBy ?? null) !== null || (input.approvedOn ?? null) !== null) {
    return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors: { approvedBy: "The approval is recorded when the draft is approved." } };
  }
  return { ok: true, value: input };
}

export function checkMessageTransition(current: StoredMessage, input: MessageInput): WorkflowResult {
  const fail = (status: number, errors: FieldErrors, error = "Please correct the highlighted fields."): WorkflowResult => ({ ok: false, status, error, errors });
  if (current.status === "archived") return { ok: false, status: 409, error: "Archived messages are final. Start a new draft instead." };
  const target = input.status ?? current.status;
  if (!NEXT_STATUS[current.status].includes(target)) {
    return fail(400, { status: target === "published" ? "Approve the message before publishing it." : `A ${current.status} message can't become ${target}.` });
  }
  if (input.message !== undefined && input.message !== current.message && current.status !== "draft") {
    return fail(400, { message: "Approved wording can't be edited. Return the message to draft first." });
  }
  const approving = current.status === "draft" && target === "approved";
  const sendsApproval = input.approvedBy !== undefined || input.approvedOn !== undefined;
  if (sendsApproval && !approving) return fail(400, { approvedBy: "The approval is recorded only when a draft is approved." });
  if (approving && (!input.approvedBy || !input.approvedOn)) return fail(400, { approvedBy: "Record who approved the final wording, and the date." });
  const value: MessageInput = { ...input };
  if (target === "draft" && current.status === "approved") {
    value.approvedBy = null; // back to draft: the approval no longer applies
    value.approvedOn = null;
  }
  return { ok: true, value };
}
