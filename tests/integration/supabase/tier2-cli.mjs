// Helper for the Tier 2 PowerShell scripts: prints JSON on stdout, errors on stderr (exit 1). Never prints a key or
// password.
//   node tests/integration/supabase/tier2-cli.mjs allowlist     → { allowed: [...], denied: [...] } (the real arrays, L6)
//   node tests/integration/supabase/tier2-cli.mjs env-summary   → { ref, adminEmail, managerEmail, noProfileEmail }
//                                                                  after the full .env.integration.local validation
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_TEST_REFS, DENIED_REFS } from "./allowlist.mjs";
import { assertCleanProcessEnv, loadIntegrationEnv, redact } from "./env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

try {
  const command = process.argv[2];
  if (command === "allowlist") {
    console.log(JSON.stringify({ allowed: [...ALLOWED_TEST_REFS], denied: Object.keys(DENIED_REFS) }));
  } else if (command === "env-summary") {
    assertCleanProcessEnv();
    const env = loadIntegrationEnv(ROOT);
    console.log(JSON.stringify({ ref: env.ref, adminEmail: env.users.admin.email, managerEmail: env.users.manager.email, noProfileEmail: env.users.noProfile.email }));
  } else {
    throw new Error("usage: tier2-cli.mjs allowlist | env-summary");
  }
} catch (e) {
  console.error(redact(e?.message ?? String(e)));
  process.exit(1);
}
