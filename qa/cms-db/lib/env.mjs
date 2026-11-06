// Loads QA credentials from .env.test.local (Git-ignored) and refuses to run against anything but the confirmed
// staging project. Values are never printed; failures name the variable, not its content.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const STAGING_REF = "mqvhuvtakzrnvuvkkgyt";   // sophia-cms-staging, confirmed by the owner (not a secret)
const REQUIRED = ["QA_SUPABASE_URL", "QA_SUPABASE_ANON_KEY", "QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD"];

export function loadQaEnv(projectRoot) {
  const file = join(projectRoot, ".env.test.local");
  if (!existsSync(file)) throw new Error("REFUSED: .env.test.local not found in the project root.");
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`REFUSED: missing in .env.test.local: ${missing.join(", ")}`);
  if (Object.keys(env).some((k) => /PROD/i.test(k))) throw new Error("REFUSED: .env.test.local contains a production variable.");

  const ref = env.QA_SUPABASE_URL.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1];
  if (ref !== STAGING_REF) throw new Error("REFUSED: QA_SUPABASE_URL is not the sophia-cms-staging project.");

  const key = env.QA_SUPABASE_ANON_KEY;
  let publicKey = key.startsWith("sb_publishable_");
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) {
    try {
      const p = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
      publicKey = p.role === "anon" && p.ref === STAGING_REF;
    } catch { publicKey = false; }
  }
  if (!publicKey) throw new Error("REFUSED: QA_SUPABASE_ANON_KEY must be the staging publishable/anon key, never a secret key.");

  return { url: env.QA_SUPABASE_URL.replace(/\/$/, ""), key, adminEmail: env.QA_ADMIN_EMAIL, adminPassword: env.QA_ADMIN_PASSWORD, ref };
}

/** Masks anything that could be a credential before a message is printed or saved. */
export function redact(text, env) {
  let out = String(text);
  for (const v of [env?.key, env?.adminPassword, env?.adminEmail].filter(Boolean)) out = out.split(v).join("[redacted]");
  return out.replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, "[redacted-jwt]").replace(/sb_(secret|publishable)_[\w-]+/g, "[redacted-key]");
}
