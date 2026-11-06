// Isolated app server for Tier 2: a copy of the working tree WITHOUT any .env* file (so Next.js can't fall back to
// staging settings), node_modules linked as a junction, and `next dev` started with an environment built from scratch
// that contains only the test project's URL and publishable key. Stopped and deleted afterwards, including leftovers
// of a killed run.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const PREFIX = "sophia-it-app-";
const SKIP_TOP = new Set(["node_modules", ".next", ".git", "qa", "supabase", "test-results", "playwright-report", "docs"]);
// what Node/Next need from the Windows environment; nothing Supabase-, database- or QA-related is copied
const PASS_THROUGH = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "SystemDrive", "windir", "ComSpec", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"];

function removeCopy(dir) {
  const link = join(dir, "node_modules");
  try { if (lstatSync(link).isSymbolicLink()) unlinkSync(link); } catch { /* no junction */ }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

/**
 * PowerShell that stops node.exe processes whose command line contains this exact folder path. A literal
 * .Contains() match: no wildcard characters in a folder name can widen it (L4).
 */
export function leftoverKillCommand(dir) {
  const literal = dir.replace(/'/g, "''");
  return `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${literal}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
}

/** Stops servers and removes copies left behind by a killed run (only this runner's own temp folders). */
export function removeLeftovers() {
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(PREFIX)) continue;
    const dir = join(tmpdir(), name);
    try { if (Date.now() - statSync(dir).mtimeMs < 120_000) continue; } catch { continue; }
    if (process.platform === "win32") spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", leftoverKillCommand(dir)], { stdio: "ignore", windowsHide: true });
    try { removeCopy(dir); } catch { /* reported by the next run */ }
  }
}

export const CLEANUP_SIGNALS = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"];

/**
 * Ctrl+C, Ctrl+Break, closing the console window and SIGTERM run `cleanup` before exiting (M4). Node can't intercept a
 * forced kill (Task Manager, taskkill /F); the next run's removeLeftovers() handles those leftovers.
 */
export function installSignalCleanup(cleanup, proc = process) {
  for (const signal of CLEANUP_SIGNALS) {
    proc.once(signal, () => {
      try { cleanup(); } finally { proc.exit(130); }
    });
  }
}

const freePort = () => new Promise((ok, fail) => {
  const s = createServer();
  s.once("error", fail);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
});

function copyTree(root, dir) {
  cpSync(root, dir, {
    recursive: true,
    filter: (src) => {
      const rel = relative(root, src);
      if (!rel) return true;
      const top = rel.split(sep)[0];
      const base = rel.split(sep).pop();
      if (SKIP_TOP.has(top)) return false;
      if (/^\.env/.test(base) && base !== ".env.example") return false;   // never copy any env file
      return true;
    },
  });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction");
  const leaked = readdirSync(dir).filter((f) => /^\.env/.test(f) && f !== ".env.example");
  if (leaked.length) throw new Error(`REFUSED: env files reached the isolated copy: ${leaked.join(", ")}`);
}

/** Starts the isolated server and resolves once it answers; returns { baseUrl, stop }. */
export async function startIsolatedServer(root, env, { log = () => {} } = {}) {
  removeLeftovers();
  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  let child;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (child?.pid && child.exitCode === null) {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else child.kill("SIGKILL");
    }
    removeCopy(dir);
    log(existsSync(dir) ? `could not remove ${dir}` : "isolated server stopped and its copy removed");
  };
  process.once("exit", stop);
  installSignalCleanup(stop);

  try {
    copyTree(root, dir);
    const port = await freePort();
    const childEnv = Object.fromEntries(PASS_THROUGH.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
    Object.assign(childEnv, {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: env.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.key,
      CMS_AUTH_MODE: "supabase",
      CMS_FACULTY_MODE: "backend",
    });
    child = spawn(process.execPath, [join(dir, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: dir, env: childEnv, stdio: "ignore", windowsHide: true,
    });
    const baseUrl = `http://127.0.0.1:${port}`;   // the server listens on IPv4 loopback only
    const deadline = Date.now() + 240_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`the isolated server exited (${child.exitCode}) before it was ready`);
      try { if ((await fetch(`${baseUrl}/api/auth/session`)).status) break; } catch { /* not listening yet */ }
      if (Date.now() > deadline) throw new Error("the isolated server did not start within 4 minutes");
      await new Promise((r) => setTimeout(r, 1500));
    }
    log(`isolated server ready on ${baseUrl}`);
    return { baseUrl, stop, dir };
  } catch (e) {
    stop();
    throw e;
  }
}
