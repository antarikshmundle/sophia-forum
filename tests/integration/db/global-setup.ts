import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";

/**
 * One disposable PostgreSQL cluster per test run: a fresh data folder in the OS temp directory, a random port bound to
 * 127.0.0.1 only, trust auth for that loopback address only. The Supabase stand-in and every repository migration are
 * applied to a template database; each test file then gets its own copy (helpers.ts). The cluster and its folder are
 * removed in teardown, on process exit, and (for a run that was killed) at the start of the next run.
 */

const ROOT = resolve(__dirname, "../../..");
const PG_BIN = process.env.SOPHIA_PG_BIN ?? "D:\\PostgreSQL\\bin";
const PREFIX = "sophia-pg-test-";
export const TEMPLATE_DB = "sophia_template";

// ---------------------------------------------------------------- isolation guard
const FORBIDDEN_ENV = [
  /^SUPABASE_/i, /^NEXT_PUBLIC_SUPABASE_/i, /^DATABASE_URL$/i, /^POSTGRES_(URL|PRISMA_URL|URL_NON_POOLING|HOST|PASSWORD|USER)$/i,
  /^PG(HOST|HOSTADDR|PORT|USER|PASSWORD|DATABASE|SERVICE|SERVICEFILE|PASSFILE)$/i, /^QA_/i, /^CMS_/i,
];

function assertIsolated() {
  const hits = Object.entries(process.env)
    .filter(([k, v]) => v && FORBIDDEN_ENV.some((re) => re.test(k)))
    .map(([k]) => k);
  if (hits.length) {
    throw new Error(`Refusing to run integration tests: database or Supabase settings are present in the environment (${hits.join(", ")}). Unset them; these tests only use a disposable local PostgreSQL.`);
  }
  for (const bin of ["initdb.exe", "pg_ctl.exe", "postgres.exe"].map((b) => join(PG_BIN, process.platform === "win32" ? b : b.replace(".exe", "")))) {
    if (!existsSync(bin)) throw new Error(`PostgreSQL binary not found: ${bin} (set SOPHIA_PG_BIN to the PostgreSQL bin folder).`);
  }
}

// ---------------------------------------------------------------- cluster lifecycle
const tool = (name: string) => join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);

function run(name: string, args: string[]) {
  const r = spawnSync(tool(name), args, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`${name} failed (${r.status}): ${(r.stderr || r.stdout || "").trim().slice(0, 800)}`);
  return r.stdout;
}

/** pg_ctl start: the server it launches inherits stdio, so piped output would keep spawnSync waiting forever. */
function startServer(args: string[], log: string) {
  const r = spawnSync(tool("pg_ctl"), args, { stdio: "ignore", windowsHide: true, timeout: 90_000 });
  if (r.status !== 0) throw new Error(`pg_ctl start failed (${r.status ?? r.error?.message}); see ${log}`);
}

function stopAndRemove(dir: string) {
  if (existsSync(join(dir, "data", "postmaster.pid"))) {
    spawnSync(tool("pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "-w", "-t", "30", "stop"], { stdio: "ignore", windowsHide: true, timeout: 60_000 });
  }
  for (let i = 0; i < 10 && existsSync(dir); i++) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { spawnSync(process.execPath, ["-e", "setTimeout(()=>{},300)"]); }
  }
}

/** Clusters left behind by a killed run (only this suite's own prefix, older than a minute). */
function removeLeftovers() {
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(PREFIX)) continue;
    const dir = join(tmpdir(), name);
    try { if (Date.now() - statSync(dir).mtimeMs > 60_000) stopAndRemove(dir); } catch { /* already gone */ }
  }
}

const freePort = () => new Promise<number>((ok, fail) => {
  const s = createServer();
  s.once("error", fail);
  s.listen(0, "127.0.0.1", () => { const port = (s.address() as { port: number }).port; s.close(() => ok(port)); });
});

export default async function setup(project: TestProject) {
  assertIsolated();
  removeLeftovers();

  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  const data = join(dir, "data");
  let stopped = false;
  const teardown = () => {
    if (stopped) return;
    stopped = true;
    stopAndRemove(dir);
    if (existsSync(dir)) console.error(`[integration] could not remove ${dir}`);
    else console.log(`[integration] disposable cluster stopped and ${dir} removed`);
  };
  process.once("exit", teardown);
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => { teardown(); process.exit(130); });

  try {
    run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
    // loopback only; nothing else can connect
    writeFileSync(join(data, "pg_hba.conf"), "host all all 127.0.0.1/32 trust\n");
    const port = await freePort();
    startServer(["-D", data, "-l", join(dir, "server.log"), "-w", "-t", "60", "-o",
      `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=60`, "start"], join(dir, "server.log"));

    const conn = { host: "127.0.0.1", port, user: "postgres" };
    const admin = new pg.Client({ ...conn, database: "postgres" });
    await admin.connect();
    await admin.query(`create database ${TEMPLATE_DB}`);
    await admin.end();

    const db = new pg.Client({ ...conn, database: TEMPLATE_DB });
    await db.connect();
    const migrationsDir = join(ROOT, "supabase", "migrations");
    const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    await db.query(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
    for (const file of migrations) {
      try {
        await db.query(readFileSync(join(migrationsDir, file), "utf8"));
      } catch (e) {
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    await db.query(readFileSync(join(__dirname, "seed.sql"), "utf8"));
    await db.end();

    project.provide("pg", { ...conn, template: TEMPLATE_DB, migrations, dir });
  } catch (e) {
    teardown();
    throw e;
  }
  return teardown;
}

declare module "vitest" {
  export interface ProvidedContext {
    pg: { host: string; port: number; user: string; template: string; migrations: string[]; dir: string };
  }
}
