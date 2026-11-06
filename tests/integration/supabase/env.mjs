// Loads and validates .env.integration.local for Tier 2 (the disposable Supabase test project only).
// Every check runs before any network request. Errors name variables, never their values.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { DENIED_REFS, assertAllowedRef } from "./allowlist.mjs";

export const ENV_FILE = ".env.integration.local";
const IDENTITIES = ["ADMIN", "MANAGER", "NOPROFILE"];
export const REQUIRED = [
  "INTEGRATION_SUPABASE_URL",
  "INTEGRATION_SUPABASE_PUBLISHABLE_KEY",
  ...IDENTITIES.flatMap((who) => [`INTEGRATION_${who}_EMAIL`, `INTEGRATION_${who}_PASSWORD`]),
];
const URL_PATTERN = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// shell variables that must not be present while Tier 2 runs (they would point tools at a real database)
const FORBIDDEN_PROCESS_ENV = [/^SUPABASE_(DB_URL|TEST_DB_URL|DB_PASSWORD|SERVICE_ROLE_KEY|SECRET_KEY)$/i, /^DATABASE_URL$/i, /^PG(HOST|PASSWORD|SERVICE)$/i];

function parse(text) {
  const out = {};
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith("#")) return;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) { problems.push(`line ${i + 1} is not NAME=value`); return; }
    // a repeated name would silently override the first value, which then escapes every check
    if (Object.hasOwn(out, m[1])) { problems.push(`${m[1]} is set more than once`); return; }
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  });
  return { values: out, problems };
}

function jwtPayload(token) {
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { return undefined; }
}

/** True when the file is ignored by git (so it can never be committed by accident). */
function gitIgnored(root, file) {
  const r = spawnSync("git", ["check-ignore", "-q", file], { cwd: root, windowsHide: true });
  return r.status === 0;
}

/**
 * Returns the validated settings, or throws with a message that names what is wrong (never a value).
 * @returns {{ url: string, ref: string, key: string, users: Record<"admin"|"manager"|"noProfile", { email: string, password: string }> }}
 */
export function loadIntegrationEnv(root, { allowedRefs } = {}) {
  const file = join(root, ENV_FILE);
  if (!existsSync(file)) throw new Error(`REFUSED: ${ENV_FILE} not found in the project root (copy tests/integration/supabase/env.template).`);
  if (!gitIgnored(root, ENV_FILE)) throw new Error(`REFUSED: ${ENV_FILE} is not ignored by git.`);

  const { values, problems } = parse(readFileSync(file, "utf8"));
  if (problems.length) throw new Error(`REFUSED: ${ENV_FILE}: ${problems.join("; ")}.`);

  const names = Object.keys(values);
  const unknown = names.filter((n) => !REQUIRED.includes(n));
  if (unknown.length) throw new Error(`REFUSED: ${ENV_FILE} has unexpected variables: ${unknown.join(", ")} (only the INTEGRATION_* names from env.template are allowed).`);
  const missing = REQUIRED.filter((n) => !values[n]);
  if (missing.length) throw new Error(`REFUSED: ${ENV_FILE} is missing values for: ${missing.join(", ")}.`);

  // no secret, service-role or production material anywhere in the file
  for (const [name, value] of Object.entries(values)) {
    if (/sb_secret_/i.test(value) || /service_role/i.test(value)) throw new Error(`REFUSED: ${name} looks like a secret or service-role key. Use only the publishable key.`);
    const payload = jwtPayload(value);
    if (payload && payload.role !== "anon") throw new Error(`REFUSED: ${name} is a JWT with a non-anon role.`);
    if (/postgres(ql)?:\/\//i.test(value)) throw new Error(`REFUSED: ${name} contains a database connection string; it never belongs in ${ENV_FILE}.`);
    for (const [ref, label] of Object.entries(DENIED_REFS)) if (value.includes(ref)) throw new Error(`REFUSED: ${name} refers to ${label}.`);
  }

  const url = values.INTEGRATION_SUPABASE_URL.replace(/\/$/, "");
  const ref = url.match(URL_PATTERN)?.[1];
  if (!ref) throw new Error("REFUSED: INTEGRATION_SUPABASE_URL must be exactly https://<project-ref>.supabase.co.");
  assertAllowedRef(ref, "INTEGRATION_SUPABASE_URL", allowedRefs);

  const key = values.INTEGRATION_SUPABASE_PUBLISHABLE_KEY;
  const payload = jwtPayload(key);
  const publishable = key.startsWith("sb_publishable_") || (payload && payload.role === "anon" && payload.ref === ref);
  if (!publishable) throw new Error("REFUSED: INTEGRATION_SUPABASE_PUBLISHABLE_KEY must be the test project's publishable (or legacy anon) key.");

  const users = {};
  for (const who of IDENTITIES) {
    const email = values[`INTEGRATION_${who}_EMAIL`];
    const password = values[`INTEGRATION_${who}_PASSWORD`];
    if (!EMAIL_PATTERN.test(email)) throw new Error(`REFUSED: INTEGRATION_${who}_EMAIL is not an email address.`);
    if (password.length < 12) throw new Error(`REFUSED: INTEGRATION_${who}_PASSWORD must be at least 12 characters.`);
    users[who === "NOPROFILE" ? "noProfile" : who.toLowerCase()] = { email, password };
  }
  const emails = Object.values(users).map((u) => u.email.toLowerCase());
  if (new Set(emails).size !== emails.length) throw new Error("REFUSED: the three test users must have different emails.");
  const passwords = Object.values(users).map((u) => u.password);
  if (new Set(passwords).size !== passwords.length) throw new Error("REFUSED: the three test users must have different passwords.");

  return Object.freeze({ url, ref, key, users: Object.freeze(users) });
}

/** Refuses shell variables that would point tools at a real database. */
export function assertCleanProcessEnv(env = process.env) {
  const hits = Object.keys(env).filter((k) => env[k] && FORBIDDEN_PROCESS_ENV.some((re) => re.test(k)));
  if (hits.length) throw new Error(`REFUSED: remove these variables from your shell first: ${hits.join(", ")}.`);
}

/** Masks every configured credential plus anything shaped like a key, token or connection string. */
export function redact(text, env) {
  let out = String(text);
  const secrets = env ? [env.key, ...Object.values(env.users).flatMap((u) => [u.password, u.email])] : [];
  for (const s of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) out = out.split(s).join("[redacted]");
  return out
    .replace(/\b(PGPASSWORD|password|passwd|pwd)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s;&,]+)/gi, "$1$2[redacted]")
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, "[redacted-jwt]")
    .replace(/sb_(secret|publishable)_[\w-]+/g, "[redacted-key]")
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "[redacted-connection-string]")
    .replace(/(sb-[\w-]+-auth-token(?:\.\d+)?=)[^;\s]+/g, "$1[redacted]");
}
