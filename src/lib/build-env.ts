/**
 * Build-time environment validation (used by next.config.ts during `next build`; dependency-free so tests can use it).
 *
 * A production build must be a CMS backend build: CMS_AUTH_MODE / CMS_FACULTY_MODE are read at build time, so a
 * missing value would otherwise silently produce the demo site. The build therefore fails unless:
 *   CMS_AUTH_MODE=supabase, CMS_FACULTY_MODE=backend,
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co,
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY = a publishable (sb_publishable_…) or legacy anon key — never a secret key,
 * and no NEXT_PUBLIC_* variable holds a secret (it would be shipped to every browser).
 * A local demo build (QA suites, Playwright) can opt out with SOPHIA_ALLOW_DEMO_BUILD=1 — never on a Vercel
 * production deployment, where the opt-out is ignored and the staging project is refused.
 */

export const STAGING_PROJECT_REF = "mqvhuvtakzrnvuvkkgyt";
const URL_PATTERN = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/;

type Env = Record<string, string | undefined>;

function jwtRole(token: string): string | null | undefined {
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;   // not a JWT
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;   // JWT-shaped but unreadable
  }
}

const looksSecret = (value: string) => /sb_secret_/i.test(value) || /service_role/i.test(value) || (jwtRole(value) ?? "anon") !== "anon";

/** Whether this build must be a validated backend build. */
export function mustValidate(env: Env): boolean {
  if (env.VERCEL_ENV === "production") return true;          // no opt-out on a production deployment
  return env.SOPHIA_ALLOW_DEMO_BUILD !== "1";
}

/** Problems with the build environment (names and reasons only, never values); empty when it is valid. */
export function buildEnvProblems(env: Env): string[] {
  const problems: string[] = [];
  if (env.CMS_AUTH_MODE !== "supabase") problems.push("CMS_AUTH_MODE must be \"supabase\"");
  if (env.CMS_FACULTY_MODE !== "backend") problems.push("CMS_FACULTY_MODE must be \"backend\"");

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = url.match(URL_PATTERN)?.[1];
  if (!ref) problems.push("NEXT_PUBLIC_SUPABASE_URL must be https://<project-ref>.supabase.co");
  else if (env.VERCEL_ENV === "production" && ref === STAGING_PROJECT_REF) problems.push("NEXT_PUBLIC_SUPABASE_URL points at the staging project in a production deployment");

  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const role = jwtRole(key);
  if (!key) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
  else if (key.startsWith("sb_secret_") || (role !== null && role !== "anon")) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is a secret/service-role key; use the publishable (anon) key");
  else if (!key.startsWith("sb_publishable_") && role !== "anon") problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable (sb_publishable_…) or legacy anon key");

  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && name !== "NEXT_PUBLIC_SUPABASE_ANON_KEY" && value && looksSecret(value)) {
      problems.push(`${name} looks like a secret key; NEXT_PUBLIC_* values are shipped to every browser`);
    }
  }
  return problems;
}

/** Throws (failing the build) when a validated build has an invalid environment. */
export function assertBuildEnv(env: Env): void {
  if (!mustValidate(env)) return;
  const problems = buildEnvProblems(env);
  if (problems.length) {
    throw new Error(
      `Production build refused — invalid CMS environment:\n  - ${problems.join("\n  - ")}\n` +
        "Set these on the host (Vercel → Project → Settings → Environment Variables). For a local demo build only: SOPHIA_ALLOW_DEMO_BUILD=1."
    );
  }
}
