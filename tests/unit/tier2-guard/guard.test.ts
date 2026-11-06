// @vitest-environment node
// The Tier 2 safety guard itself (no network, no Supabase): every refusal path, plus redaction.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const git = vi.hoisted(() => ({ ignored: true }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawnSync: () => ({ status: git.ignored ? 0 : 1 }),
}));

import { ALLOWED_TEST_REFS, DENIED_REFS, assertAllowedRef } from "../../integration/supabase/allowlist.mjs";
import { assertCleanProcessEnv, loadIntegrationEnv, redact } from "../../integration/supabase/env.mjs";

const TEST_REF = "abcdefghijklmnopqrst";
const STAGING = "mqvhuvtakzrnvuvkkgyt";
const PRODUCTION = "mcbsxthyjmptrgfppbsa";
const VALID: Record<string, string> = {
  INTEGRATION_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
  INTEGRATION_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testkeyvalue123",
  INTEGRATION_ADMIN_EMAIL: "it-admin@example.test",
  INTEGRATION_ADMIN_PASSWORD: "admin-password-123",
  INTEGRATION_MANAGER_EMAIL: "it-manager@example.test",
  INTEGRATION_MANAGER_PASSWORD: "manager-password-123",
  INTEGRATION_NOPROFILE_EMAIL: "it-noprofile@example.test",
  INTEGRATION_NOPROFILE_PASSWORD: "noprofile-password-123",
};
const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2lnbmF0dXJlLXZhbHVl`;

let root: string;
const writeEnv = (values: Record<string, string>, extra = "") =>
  writeFileSync(join(root, ".env.integration.local"), Object.entries(values).map(([k, v]) => `${k}=${v}`).join("\n") + "\n" + extra);
const load = () => loadIntegrationEnv(root, { allowedRefs: [TEST_REF] });

beforeEach(() => { root = mkdtempSync(join(tmpdir(), "tier2-guard-")); git.ignored = true; });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("allowlist", () => {
  it("ships with no allowed project, so every real run is refused until the owner adds the test ref", () => {
    expect(ALLOWED_TEST_REFS).toEqual([]);
    expect(() => assertAllowedRef(TEST_REF, "X")).toThrow(/no test project is allowlisted yet/);
  });

  it("always refuses staging and production, even if they were allowlisted", () => {
    expect(Object.keys(DENIED_REFS).sort()).toEqual([PRODUCTION, STAGING].sort());
    expect(() => assertAllowedRef(STAGING, "X", [STAGING])).toThrow(/sophia-cms-staging/);
    expect(() => assertAllowedRef(PRODUCTION, "X", [PRODUCTION])).toThrow(/production/);
  });

  it("refuses refs that are not allowlisted or malformed", () => {
    expect(() => assertAllowedRef("zzzzzzzzzzzzzzzzzzzz", "X", [TEST_REF])).toThrow(/not an allowlisted test project/);
    expect(() => assertAllowedRef("short", "X", [TEST_REF])).toThrow(/valid Supabase project ref/);
    expect(() => assertAllowedRef(TEST_REF, "X", [TEST_REF])).not.toThrow();
  });
});

describe("loadIntegrationEnv", () => {
  it("accepts a valid file and returns the settings", () => {
    writeEnv(VALID);
    const env = load();
    expect(env).toMatchObject({ url: VALID.INTEGRATION_SUPABASE_URL, ref: TEST_REF, users: { admin: { email: VALID.INTEGRATION_ADMIN_EMAIL } } });
    expect(Object.keys(env.users)).toEqual(["admin", "manager", "noProfile"]);
  });

  it("refuses when the file is missing or not git-ignored", () => {
    expect(() => load()).toThrow(/not found/);
    writeEnv(VALID);
    git.ignored = false;
    expect(() => load()).toThrow(/not ignored by git/);
  });

  it.each([
    ["the staging URL", { INTEGRATION_SUPABASE_URL: `https://${STAGING}.supabase.co` }, /sophia-cms-staging/],
    ["the production URL", { INTEGRATION_SUPABASE_URL: `https://${PRODUCTION}.supabase.co` }, /production/],
    ["a non-allowlisted project", { INTEGRATION_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" }, /not an allowlisted/],
    ["a custom domain", { INTEGRATION_SUPABASE_URL: "https://api.example.com" }, /exactly https/],
    ["an http URL", { INTEGRATION_SUPABASE_URL: `http://${TEST_REF}.supabase.co` }, /exactly https/],
    ["a secret key", { INTEGRATION_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" }, /secret or service-role/],
    ["a service-role JWT", { INTEGRATION_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "service_role", ref: TEST_REF }) }, /secret or service-role|non-anon role/],
    ["an anon JWT for another project", { INTEGRATION_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon", ref: "zzzzzzzzzzzzzzzzzzzz" }) }, /publishable/],
    ["a connection string", { INTEGRATION_ADMIN_PASSWORD: "postgresql://postgres:pw@db.x.supabase.co:5432/postgres" }, /connection string/],
    ["a value mentioning staging", { INTEGRATION_ADMIN_EMAIL: `ops+${STAGING}@example.test` }, /sophia-cms-staging/],
    ["a short password", { INTEGRATION_MANAGER_PASSWORD: "short" }, /at least 12/],
    ["a bad email", { INTEGRATION_NOPROFILE_EMAIL: "nope" }, /not an email/],
    ["duplicate emails", { INTEGRATION_MANAGER_EMAIL: VALID.INTEGRATION_ADMIN_EMAIL }, /different emails/],
    ["duplicate passwords", { INTEGRATION_MANAGER_PASSWORD: VALID.INTEGRATION_ADMIN_PASSWORD }, /different passwords/],
  ])("refuses %s", (_label, change, message) => {
    writeEnv({ ...VALID, ...change });
    expect(() => load()).toThrow(message);
  });

  it("accepts a legacy anon JWT for the same project", () => {
    writeEnv({ ...VALID, INTEGRATION_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon", ref: TEST_REF }) });
    expect(load().ref).toBe(TEST_REF);
  });

  it("refuses unknown, extra or missing variables, and malformed lines", () => {
    writeEnv(VALID, "SUPABASE_SERVICE_ROLE_KEY=x\n");
    expect(() => load()).toThrow(/unexpected variables: SUPABASE_SERVICE_ROLE_KEY/);
    const { INTEGRATION_MANAGER_PASSWORD: _omit, ...partial } = VALID;
    writeEnv(partial);
    expect(() => load()).toThrow(/missing values for: INTEGRATION_MANAGER_PASSWORD/);
    writeEnv(VALID, "this is not an assignment\n");
    expect(() => load()).toThrow(/is not NAME=value/);
  });

  it("never puts a value into an error message", () => {
    writeEnv({ ...VALID, INTEGRATION_SUPABASE_PUBLISHABLE_KEY: "sb_secret_TOPSECRETVALUE" });
    let message = "";
    try { load(); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/^REFUSED/);
    expect(message).not.toContain("TOPSECRETVALUE");
  });
});

describe("assertCleanProcessEnv", () => {
  it("refuses shell variables that point at a real database", () => {
    expect(() => assertCleanProcessEnv({ SUPABASE_DB_URL: "x" } as unknown as NodeJS.ProcessEnv)).toThrow(/SUPABASE_DB_URL/);
    expect(() => assertCleanProcessEnv({ PGPASSWORD: "x", DATABASE_URL: "y" } as unknown as NodeJS.ProcessEnv)).toThrow(/PGPASSWORD, DATABASE_URL/);
    expect(() => assertCleanProcessEnv({ PATH: "x" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe("redact", () => {
  it("masks configured credentials and anything shaped like a key, token, cookie or connection string", () => {
    writeEnv(VALID);
    const env = load();
    const text = [
      VALID.INTEGRATION_ADMIN_EMAIL, VALID.INTEGRATION_ADMIN_PASSWORD, VALID.INTEGRATION_SUPABASE_PUBLISHABLE_KEY,
      jwt({ sub: "user" }), "sb_secret_anything", "postgresql://postgres.abc:pw@aws-0-x.pooler.supabase.com:5432/postgres",
      "sb-abc-auth-token.0=base64-value; Path=/",
    ].join(" | ");
    const out = redact(text, env);
    for (const leaked of [VALID.INTEGRATION_ADMIN_EMAIL, VALID.INTEGRATION_ADMIN_PASSWORD, "sb_publishable_", "sb_secret_", "eyJ", "postgresql://", "base64-value"]) {
      expect(out).not.toContain(leaked);
    }
  });
});
