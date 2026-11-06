"use client";

import { useCallback, useEffect, useState } from "react";
import type { Errors, SaveOutcome } from "@/components/admin/CrudManager";

/**
 * Team, Events and Gallery managers on the CMS backend. Same contract as useCmsFaculty: only the /api/admin routes,
 * with the browser's httpOnly session cookie; no demo-store fallback (a failed load is an error state); the list
 * is read again after every write, so the table always shows what is stored.
 */

export type CmsResource = "team" | "events" | "gallery";

export type RecordsLoad<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; items: T[] };

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

const SERVER_FIELDS = new Set(["updatedAt"]);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Create: every field the form produced. Update: only the changed fields; a cleared optional field is sent as null. */
function payload(item: Record<string, unknown>, previous?: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(item), ...Object.keys(previous ?? {})]);
  for (const key of keys) {
    if (SERVER_FIELDS.has(key) || (previous && key === "id")) continue;
    const next = item[key];
    if (previous && same(next, previous[key])) continue;
    if (next === undefined && !previous) continue;
    body[key] = next === undefined ? null : next;
  }
  return body;
}

// the record as stored after a write (what was sent, if the reload failed)
const stored = <T extends { id: string }>(items: T[] | null, fallback: T) => items?.find((r) => r.id === fallback.id) ?? fallback;

export function useCmsRecords<T extends { id: string }>(resource: CmsResource) {
  const [load, setLoad] = useState<RecordsLoad<T>>({ status: "loading" });
  const base = `/api/admin/${resource}`;

  const refresh = useCallback(async (): Promise<T[] | null> => {
    const result = await call("GET", base);
    if (!result.ok) {
      setLoad({ status: "error", error: result.error });
      return null;
    }
    const items = Array.isArray(result.data) ? (result.data as T[]) : [];
    setLoad({ status: "ready", items });
    return items;
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (item: T): Promise<SaveOutcome<T>> => {
      const saved = await call("POST", base, payload(item as unknown as Record<string, unknown>));
      if (!saved.ok) return { ok: false, error: saved.error, errors: saved.errors };
      return { ok: true, item: stored(await refresh(), saved.data as T) };
    },
    [base, refresh]
  );

  const update = useCallback(
    async (item: T, previous: T): Promise<SaveOutcome<T>> => {
      const body = payload(item as unknown as Record<string, unknown>, previous as unknown as Record<string, unknown>);
      if (Object.keys(body).length > 0) {
        const saved = await call("PATCH", `${base}/${encodeURIComponent(item.id)}`, body);
        if (!saved.ok) {
          await refresh();
          return { ok: false, error: saved.error, errors: saved.errors };
        }
      }
      return { ok: true, item: stored(await refresh(), item) };
    },
    [base, refresh]
  );

  const remove = useCallback(
    async (item: T): Promise<SaveOutcome<T>> => {
      const deleted = await call("DELETE", `${base}/${encodeURIComponent(item.id)}`);
      await refresh();
      return deleted.ok ? { ok: true } : { ok: false, error: deleted.error };
    },
    [base, refresh]
  );

  return { load, create, update, remove };
}
