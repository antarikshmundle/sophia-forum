/**
 * SOPHIA BOT knowledge index builder (offline; no network, no AI service, no database).
 *
 *   npm run kb:build                      check knowledge/pce/** and write src/data/knowledge-index.json
 *   npm run kb:check                      check only; fails if the committed index is out of date
 *   node scripts/build-knowledge-index.ts --as-of 2026-11-12    build as of a given date (default: today, IST)
 *
 * Exit code 1 when a document marked `status: verified` has problems (drafts and expired documents are reported but
 * are not errors), or with --check when the index file differs from what would be written.
 * Documentation: docs/sophia-bot/KNOWLEDGE_BASE.md
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildKnowledgeIndex, serializeIndex, type KnowledgeFile } from "../src/lib/bot/knowledge/index-builder.ts";
import { todayInIndia } from "../src/lib/bot/knowledge/schema.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE_ROOT = join(ROOT, "knowledge");
const PCE = join(KNOWLEDGE_ROOT, "pce");
const OUT = join(ROOT, "src", "data", "knowledge-index.json");
// files that are not knowledge documents
const IGNORED = new Set([".gitkeep", "README.md"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const asOf = arg("--as-of") ?? todayInIndia();
const check = process.argv.includes("--check");
if (!existsSync(PCE)) {
  console.error(`Missing ${relative(ROOT, PCE)}`);
  process.exit(1);
}

const files: KnowledgeFile[] = [];
const skipped: string[] = [];
for (const full of walk(PCE)) {
  const path = relative(KNOWLEDGE_ROOT, full).split(sep).join("/");
  const name = path.split("/").pop() ?? "";
  if (IGNORED.has(name) || name.startsWith("_")) continue;
  if (!name.endsWith(".md")) { skipped.push(path); continue; }
  files.push({ path, raw: readFileSync(full, "utf8") });
}

const { index, evaluations } = buildKnowledgeIndex(files, asOf);
const included = evaluations.filter((e) => e.included);
const excluded = evaluations.filter((e) => !e.included);
// a document someone marked verified but that cannot be indexed is a mistake to fix (draft/expired are expected states)
const errors = excluded.filter((e) => !e.reasons.includes("draft") && !(e.reasons.length === 1 && e.reasons[0] === "expired"));

console.log(`Knowledge index as of ${asOf} (IST): ${included.length} document(s) included, ${excluded.length} excluded, ${index.chunks.length} chunk(s), version ${index.version}`);
for (const e of included) console.log(`  + ${e.path}`);
for (const e of excluded) {
  console.log(`  - ${e.path}  [${e.reasons.join(", ")}]`);
  for (const m of e.messages) console.log(`      ${m}`);
}
for (const s of skipped) console.log(`  ? ${s}  (not a .md file; ignored)`);

const text = serializeIndex(index);
if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error(`${relative(ROOT, OUT)} is out of date: run npm run kb:build`);
    process.exit(1);
  }
  console.log(`${relative(ROOT, OUT)} is up to date.`);
} else {
  writeFileSync(OUT, text, "utf8");
  console.log(`Wrote ${relative(ROOT, OUT)}`);
}
if (errors.length) {
  console.error(`${errors.length} document(s) marked verified have problems (listed above).`);
  process.exit(1);
}
