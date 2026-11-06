// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { mapDbError } from "@/lib/cms/faculty";

const dbError = (code: string, message = ""): PostgrestError => ({ code, message, details: "", hint: "", name: "PostgrestError" }) as PostgrestError;
const HISTORY = { status: 409, body: { error: "This faculty member has HOD message history and can't be deleted." } };

describe("mapDbError — faculty deletion blocked by HOD message history", () => {
  it.each([
    ["23503 (PostgreSQL 17 and earlier, staging today)", "23503"],
    ["23001 restrict_violation (PostgreSQL 18+)", "23001"],
  ])("%s → 409 with the history message", (_label, code) => {
    const message = 'update or delete on table "faculty" violates RESTRICT setting of foreign key constraint "hod_messages_faculty_id_fkey" on table "hod_messages"';
    expect(mapDbError(dbError(code, message), "faculty")).toEqual(HISTORY);
  });

  it("an unknown faculty ID on a message stays a field error (23503)", () => {
    expect(mapDbError(dbError("23503"), "message")).toEqual({ status: 400, body: { error: "Please correct the highlighted fields.", errors: { facultyId: "Unknown faculty record." } } });
  });

  it("other database errors keep their existing mapping", () => {
    expect(mapDbError(dbError("42501"), "faculty").status).toBe(403);
    expect(mapDbError(dbError("23505", 'duplicate key value violates unique constraint "faculty_pkey"'), "faculty").status).toBe(409);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mapDbError(dbError("XX000"), "faculty")).toEqual({ status: 500, body: { error: "Unexpected database error." } });
  });
});
