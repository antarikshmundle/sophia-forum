// HOD safety for Tier 2 (M2). Setting an HOD through the API un-flags any previous HOD and archives its published
// message (migration 5), which can't be undone; clearing the HOD clears whoever holds it. So HOD tests may only run
// when nothing HOD-related outside the current run exists, and may only ever clear an HOD that the run created.
import { RUN_ID_PREFIX } from "./allowlist.mjs";

/** A run ID: it-<yyyymmddhhmm>-<4 hex>, the prefix of every record the run creates. */
export function newRunId(now = new Date(), random = Math.random) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
  return `it-${stamp}-${Math.floor(random() * 0x10000).toString(16).padStart(4, "0")}`;
}

export const isRunRecord = (id, runId) => typeof id === "string" && RUN_ID_PREFIX.test(id) && id.startsWith(`${runId}-`);

/**
 * Read-only precondition for HOD tests. `api(method, path)` performs an admin request and returns { status, json }.
 * Throws (and the HOD tests must not run) if any non-run faculty record is the active HOD or any message is published.
 */
export async function assertHodPreconditions(api, runId) {
  const faculty = await api("GET", "/api/admin/faculty");
  const messages = await api("GET", "/api/admin/hod-messages");
  if (faculty.status !== 200 || messages.status !== 200) throw new Error("ABORTED: could not read the HOD state; HOD tests not run.");
  const foreignHod = (faculty.json?.data ?? []).filter((f) => f.isActiveHod && !isRunRecord(f.id, runId));
  if (foreignHod.length) throw new Error("ABORTED: an HOD that this run did not create is active; HOD tests not run and nothing was changed.");
  const published = (messages.json?.data ?? []).filter((m) => m.status === "published" && !isRunRecord(m.facultyId, runId));
  if (published.length) throw new Error("ABORTED: a published HOD message that this run did not create exists; HOD tests not run and nothing was changed.");
}

/** Clears the HOD only if the run's own record holds it; returns whether it did. Never touches anyone else's HOD. */
export async function clearHodIfOwned(api, runId) {
  const faculty = await api("GET", "/api/admin/faculty");
  if (faculty.status !== 200) throw new Error("could not read the HOD state; the HOD was left as it is");
  const active = (faculty.json?.data ?? []).find((f) => f.isActiveHod);
  if (!active || !isRunRecord(active.id, runId)) return false;
  const r = await api("DELETE", "/api/admin/hod");
  if (r.status !== 200) throw new Error(`clearing this run's HOD failed (${r.status})`);
  return true;
}
