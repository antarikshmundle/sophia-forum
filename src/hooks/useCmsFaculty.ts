"use client";

import { useCallback, useEffect, useState } from "react";
import type { Errors, SaveOutcome } from "@/components/admin/CrudManager";

/**
 * Faculty Manager on the CMS backend (P2.4). Talks only to the existing /api/admin routes with the browser's
 * httpOnly session cookie; there is no demo-store fallback: a failed load is shown as an error, never as demo data.
 * After every write the list is read again from the server, so the table always shows what is stored.
 */

export interface CmsFacultyRecord {
  id: string;
  name: string;
  designation: string;
  department: string;
  image: string; // the uploaded photo's public URL (site-media), or "" → initials
  imageConsent?: string; // who gave permission for the photo (admin only)
  linkedin?: string;
  quote?: string;
  sortOrder: number;
  isPublished: boolean;
  isActiveHod: boolean;
  updatedAt: string;
}

export type FacultyLoad =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; items: CmsFacultyRecord[] };

type CallResult = { ok: true; data: unknown } | { ok: false; status: number; error: string; errors?: Errors };

async function call(method: string, path: string, body?: unknown): Promise<CallResult> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: json?.data };
    const errors = json?.errors && typeof json.errors === "object" ? (json.errors as Errors) : undefined;
    return { ok: false, status: response.status, error: typeof json?.error === "string" ? json.error : `Request failed (${response.status}).`, errors };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server." };
  }
}

// Fields the API accepts; linkedin and quote are cleared with null, the others are omitted when empty
const SENT_FIELDS = ["name", "designation", "department", "linkedin", "quote", "sortOrder", "isPublished", "image", "imageConsent"] as const;
const CLEARABLE = new Set(["linkedin", "quote", "image", "imageConsent"]);

function payload(item: CmsFacultyRecord, previous?: CmsFacultyRecord): Record<string, unknown> {
  const body: Record<string, unknown> = previous ? {} : { id: item.id };
  // "" and a missing value are the same (the form drops empty optional fields; stored records use "" for no photo)
  const norm = (v: unknown) => (v === "" || v === undefined ? null : v);
  for (const key of SENT_FIELDS) {
    const next = norm(item[key]);
    if (previous && next === norm(previous[key])) continue;
    if (next === null && !CLEARABLE.has(key)) continue;
    body[key] = next;
  }
  return body;
}

export function useCmsFaculty() {
  const [load, setLoad] = useState<FacultyLoad>({ status: "loading" });

  const refresh = useCallback(async (): Promise<CmsFacultyRecord[] | null> => {
    const result = await call("GET", "/api/admin/faculty");
    if (!result.ok) {
      setLoad({ status: "error", error: result.error });
      return null;
    }
    const items = Array.isArray(result.data) ? (result.data as CmsFacultyRecord[]) : [];
    setLoad({ status: "ready", items });
    return items;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // the record as stored after a write (falls back to what was sent if the reload failed)
  const stored = (items: CmsFacultyRecord[] | null, fallback: CmsFacultyRecord) => items?.find((f) => f.id === fallback.id) ?? fallback;

  const create = useCallback(
    async (item: CmsFacultyRecord): Promise<SaveOutcome<CmsFacultyRecord>> => {
      const saved = await call("POST", "/api/admin/faculty", payload(item));
      if (!saved.ok) return { ok: false, error: saved.error, errors: saved.errors };
      const record = saved.data as CmsFacultyRecord;
      if (!item.isActiveHod) return { ok: true, item: stored(await refresh(), record) };

      const hod = await call("POST", "/api/admin/hod", { facultyId: record.id });
      const items = await refresh();
      if (!hod.ok) {
        return {
          ok: "partial",
          item: stored(items, record),
          error: `The faculty record was added, but it was not made the active HOD: ${hod.error}`,
          errors: { isActiveHod: hod.error },
        };
      }
      return { ok: true, item: stored(items, record) };
    },
    [refresh]
  );

  const update = useCallback(
    async (item: CmsFacultyRecord, previous: CmsFacultyRecord): Promise<SaveOutcome<CmsFacultyRecord>> => {
      const body = payload(item, previous);
      const hasChanges = Object.keys(body).length > 0;
      const hodOn = item.isActiveHod && !previous.isActiveHod;
      const hodOff = !item.isActiveHod && previous.isActiveHod;

      // Unpublishing the active HOD: the HOD must be cleared first (the active HOD has to stay published)
      if (hodOff && body.isPublished === false) {
        const cleared = await call("DELETE", "/api/admin/hod");
        if (!cleared.ok) {
          await refresh();
          return { ok: false, error: `Nothing was saved: the HOD could not be cleared: ${cleared.error}`, errors: { isActiveHod: cleared.error } };
        }
        const saved = await call("PATCH", `/api/admin/faculty/${encodeURIComponent(item.id)}`, body);
        const items = await refresh();
        if (!saved.ok) {
          return { ok: "partial", item: stored(items, previous), error: `The HOD was cleared, but the other changes were not saved: ${saved.error}`, errors: saved.errors };
        }
        return { ok: true, item: stored(items, item) };
      }

      if (hasChanges) {
        const saved = await call("PATCH", `/api/admin/faculty/${encodeURIComponent(item.id)}`, body);
        if (!saved.ok) return { ok: false, error: saved.error, errors: saved.errors };
      }
      if (hodOn || hodOff) {
        const hod = hodOn ? await call("POST", "/api/admin/hod", { facultyId: item.id }) : await call("DELETE", "/api/admin/hod");
        const items = await refresh();
        if (!hod.ok) {
          const what = hodOn ? "it was not made the active HOD" : "the HOD was not cleared";
          return hasChanges
            ? { ok: "partial", item: stored(items, item), error: `The changes were saved, but ${what}: ${hod.error}`, errors: { isActiveHod: hod.error } }
            : { ok: false, error: `Nothing was saved: ${what}: ${hod.error}`, errors: { isActiveHod: hod.error } };
        }
        return { ok: true, item: stored(items, item) };
      }
      return { ok: true, item: stored(await refresh(), item) };
    },
    [refresh]
  );

  const remove = useCallback(
    async (item: CmsFacultyRecord): Promise<SaveOutcome<CmsFacultyRecord>> => {
      const deleted = await call("DELETE", `/api/admin/faculty/${encodeURIComponent(item.id)}`);
      await refresh();
      return deleted.ok ? { ok: true } : { ok: false, error: deleted.error };
    },
    [refresh]
  );

  return { load, create, update, remove };
}
