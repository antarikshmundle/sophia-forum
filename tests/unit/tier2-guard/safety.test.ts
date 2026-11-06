// @vitest-environment node
// Tier 2 safety fixes (review L1, L2, L4, L5, L6, M2, M4). No network, no Supabase, no database.
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  // only `git check-ignore` is faked (the env file in a temp dir is "ignored"); everything else is real
  return { ...real, spawnSync: (cmd: string, args: string[], opts: object) => (cmd === "git" ? { status: 0 } : real.spawnSync(cmd, args, opts as never)) };
});

import { RUN_ID_PREFIX, assertAllowedRef } from "../../integration/supabase/allowlist.mjs";
import { loadIntegrationEnv, redact } from "../../integration/supabase/env.mjs";
import { assertHodPreconditions, clearHodIfOwned, isRunRecord, newRunId } from "../../integration/supabase/hod-guard.mjs";
import { CLEANUP_SIGNALS, installSignalCleanup, leftoverKillCommand } from "../../integration/supabase/server.mjs";

const ROOT = resolve(__dirname, "../../..");
const TEST_REF = "abcdefghijklmnopqrst";
const VALID = [
  `INTEGRATION_SUPABASE_URL=https://${TEST_REF}.supabase.co`, "INTEGRATION_SUPABASE_PUBLISHABLE_KEY=sb_publishable_x1",
  "INTEGRATION_ADMIN_EMAIL=a@example.test", "INTEGRATION_ADMIN_PASSWORD=admin-password-1",
  "INTEGRATION_MANAGER_EMAIL=m@example.test", "INTEGRATION_MANAGER_PASSWORD=manager-password-1",
  "INTEGRATION_NOPROFILE_EMAIL=n@example.test", "INTEGRATION_NOPROFILE_PASSWORD=noprofile-password-1",
];

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "tier2-safety-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("L2 — duplicate variables", () => {
  it("refuses a variable set twice (the first value would otherwise escape the checks)", () => {
    writeFileSync(join(root, ".env.integration.local"), [...VALID, "INTEGRATION_SUPABASE_URL=https://mqvhuvtakzrnvuvkkgyt.supabase.co"].join("\n"));
    expect(() => loadIntegrationEnv(root, { allowedRefs: [TEST_REF] })).toThrow(/INTEGRATION_SUPABASE_URL is set more than once/);
  });
});

describe("L5 — test-only allowlist override", () => {
  it("is refused outside Vitest", () => {
    vi.stubEnv("VITEST", "");
    expect(() => assertAllowedRef(TEST_REF, "X", [TEST_REF])).toThrow(/only be overridden by the guard's own unit tests/);
    writeFileSync(join(root, ".env.integration.local"), VALID.join("\n"));
    expect(() => loadIntegrationEnv(root, { allowedRefs: [TEST_REF] })).toThrow(/only be overridden/);
  });

  it("works inside Vitest, and the denylist still wins", () => {
    expect(() => assertAllowedRef(TEST_REF, "X", [TEST_REF])).not.toThrow();
    expect(() => assertAllowedRef("mqvhuvtakzrnvuvkkgyt", "X", ["mqvhuvtakzrnvuvkkgyt"])).toThrow(/staging/);
  });
});

describe("L1 — password redaction", () => {
  it.each([
    ["password=hunter2-secret host=x", "hunter2-secret"],
    ["PGPASSWORD=hunter2-secret", "hunter2-secret"],
    ['Password: "my pass phrase"', "my pass phrase"],
    ["pwd='abc123secret';", "abc123secret"],
    ["postgresql://postgres.abc:pw%40rd@aws-0-x.pooler.supabase.com:5432/postgres", "pw%40rd"],
  ])("%s", (text, secret) => {
    expect(redact(text)).not.toContain(secret);
  });
});

describe("L6 — the PowerShell scripts read the real allowlist through node", () => {
  it("tier2-cli allowlist prints the actual arrays (none allowed yet; staging and production denied)", () => {
    const r = spawnSync(process.execPath, [join(ROOT, "tests/integration/supabase/tier2-cli.mjs"), "allowlist"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ allowed: [], denied: ["mqvhuvtakzrnvuvkkgyt", "mcbsxthyjmptrgfppbsa"] });
  });

  it("tier2-cli refuses unknown commands", () => {
    const r = spawnSync(process.execPath, [join(ROOT, "tests/integration/supabase/tier2-cli.mjs"), "nope"], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("M1 — run IDs", () => {
  it("are it-<12 digits>-<4 hex> and match the reset pattern; other it-* IDs don't", () => {
    const id = newRunId(new Date(Date.UTC(2026, 10, 5, 9, 7)), () => 0.5);
    expect(id).toBe("it-202611050907-8000");
    expect(RUN_ID_PREFIX.test(`${id}-event`)).toBe(true);
    for (const other of ["it-fest", "it-2026-abcd-x", "it-202611050907-XYZW-x", "xit-202611050907-8000-x"]) expect(RUN_ID_PREFIX.test(other)).toBe(false);
    expect(isRunRecord(`${id}-event`, id)).toBe(true);
    expect(isRunRecord("it-202611050907-ffff-event", id)).toBe(false);
  });
});

describe("M2 — HOD guard", () => {
  const RUN = "it-202611050907-8000";
  const api = (faculty: object[], messages: object[] = [], calls: string[] = []) =>
    async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      if (path === "/api/admin/faculty") return { status: 200, json: { data: faculty } };
      if (path === "/api/admin/hod-messages") return { status: 200, json: { data: messages } };
      return { status: 200, json: null };
    };

  it("passes when there is no HOD and no published message, without writing", async () => {
    const calls: string[] = [];
    await expect(assertHodPreconditions(api([{ id: "dr-x", isActiveHod: false }], [{ facultyId: "dr-x", status: "archived" }], calls), RUN)).resolves.toBeUndefined();
    expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
  });

  it("aborts when someone else's HOD is active (including an earlier run's)", async () => {
    await expect(assertHodPreconditions(api([{ id: "dr-golait", isActiveHod: true }]), RUN)).rejects.toThrow(/did not create is active/);
    await expect(assertHodPreconditions(api([{ id: "it-202601010000-aaaa-hod", isActiveHod: true }]), RUN)).rejects.toThrow(/did not create/);
  });

  it("aborts when a published message exists that the run didn't create", async () => {
    await expect(assertHodPreconditions(api([], [{ facultyId: "dr-golait", status: "published" }]), RUN)).rejects.toThrow(/published HOD message/);
  });

  it("aborts when the state can't be read", async () => {
    await expect(assertHodPreconditions(async () => ({ status: 500, json: null }), RUN)).rejects.toThrow(/could not read/);
  });

  it("clears only the run's own HOD", async () => {
    const calls: string[] = [];
    expect(await clearHodIfOwned(api([{ id: "dr-golait", isActiveHod: true }], [], calls), RUN)).toBe(false);
    expect(await clearHodIfOwned(api([], [], calls), RUN)).toBe(false);
    expect(calls).not.toContain("DELETE /api/admin/hod");
    expect(await clearHodIfOwned(api([{ id: `${RUN}-hod`, isActiveHod: true }], [], calls), RUN)).toBe(true);
    expect(calls).toContain("DELETE /api/admin/hod");
  });
});

describe("M4 — signal cleanup", () => {
  it("runs the cleanup once and exits on each handled signal", () => {
    for (const signal of CLEANUP_SIGNALS) {
      const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const cleanup = vi.fn();
      installSignalCleanup(cleanup, proc as unknown as NodeJS.Process);
      proc.emit(signal);
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(proc.exit).toHaveBeenCalledWith(130);
    }
    expect(CLEANUP_SIGNALS).toEqual(["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]);
  });

  it("still exits if the cleanup throws", () => {
    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    installSignalCleanup(() => { throw new Error("busy"); }, proc as unknown as NodeJS.Process);
    expect(() => proc.emit("SIGINT")).toThrow("busy");
    expect(proc.exit).toHaveBeenCalledWith(130);
  });
});

describe("L4 — leftover process matching", () => {
  it("is a literal .Contains() match with quotes escaped, never a wildcard pattern", () => {
    const cmd = leftoverKillCommand("C:\\Temp\\sophia-it-app-[ab]*'x");
    expect(cmd).toContain(".Contains('C:\\Temp\\sophia-it-app-[ab]*''x')");
    expect(cmd).not.toMatch(/-like/);
    expect(cmd).toContain("Name='node.exe'");
  });
});
