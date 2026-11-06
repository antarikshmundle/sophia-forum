// Tier 2 runner (real Supabase, disposable test project only).
//   npm run test:supabase -- --check   guards + marker verification only; no database writes
// The full suites are not implemented yet; without --check the runner refuses.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCleanProcessEnv, loadIntegrationEnv, redact } from "./env.mjs";
import { checkAppMarker, checkPublicMarker } from "./marker.mjs";
import { startIsolatedServer } from "./server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CHECK = process.argv.includes("--check");
let env = null;
const say = (msg) => console.log(redact(msg, env));

async function main() {
  if (!CHECK) {
    console.error("REFUSED: only --check is implemented so far (npm run test:supabase -- --check).");
    return 2;
  }
  say("Tier 2 --check (no database writes)");
  assertCleanProcessEnv();
  say("  ok   shell has no database / Supabase secret variables");
  env = loadIntegrationEnv(ROOT);
  say(`  ok   ${".env.integration.local"} valid; target ${env.ref} is allowlisted and is not staging or production`);
  await checkPublicMarker(env);
  say("  ok   marker row found in the test project (public key, read-only)");

  const server = await startIsolatedServer(ROOT, env, { log: (m) => say(`  ..   ${m}`) });
  try {
    for (const name of await checkAppMarker(server.baseUrl, env)) say(`  ok   ${name}`);
  } finally {
    server.stop();
  }
  say("CHECK PASSED: the test project and the app server are verified. No data was written.");
  return 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(redact(e?.message ?? String(e), env));
  process.exit(1);
});
