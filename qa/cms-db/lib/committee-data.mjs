// Loads the committee 2026-27 operational input for the qa/cms-db/*-committee-2026.mjs scripts.
//
// The roster contains personal data, so it is not part of the repository. It is read from the Git-ignored file
//   local-private/committee-data.json   (project root; see .gitignore)
// which the owner keeps locally. The scripts refuse to run without it. Never commit, copy into fixtures or paste
// its contents into reports.
//
// Expected shape (column layout only):
//   {
//     "importRoster":   [[slide, printedName, printedRole, displayName, displayRole, category, section], ...],
//     "slideOrder":     [[idSuffix, displayName], ...],          // slides 2–32 in deck order
//     "categoryChange": { "idSuffix": string, "from": string, "to": string },
//     "recategorise":   [[idSuffix, role, currentCategory, newCategory], ...]
//   }
// idSuffix is the record id without its "committee-2026-" prefix.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const COMMITTEE_DATA_PATH = join("local-private", "committee-data.json");

const isStr = (v) => typeof v === "string" && v.length > 0;
const tuples = (v, n, types) => Array.isArray(v) && v.length > 0 && v.every((t) => Array.isArray(t) && t.length === n && t.every((x, k) => (types[k] === "n" ? Number.isInteger(x) : isStr(x))));

/** Reads and validates the private committee input; exits with a clear message when it is missing or malformed. */
export function loadCommitteeData(root) {
  const file = join(root, COMMITTEE_DATA_PATH);
  if (!existsSync(file)) {
    console.error(`REFUSED: committee input not found: ${COMMITTEE_DATA_PATH}\n` +
      "This local-only, Git-ignored file holds the committee roster (personal data) and is not in the repository.\n" +
      "Restore it from the owner's private copy; see qa/cms-db/lib/committee-data.mjs for its expected shape.");
    process.exit(2);
  }
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) {
    console.error(`REFUSED: ${COMMITTEE_DATA_PATH} is not valid JSON (${e.message}).`); process.exit(2);
  }
  const problems = [];
  if (!tuples(data.importRoster, 7, ["n", "s", "s", "s", "s", "s", "s"])) problems.push("importRoster must be [[slide, printedName, printedRole, displayName, displayRole, category, section], ...]");
  if (!tuples(data.slideOrder, 2, ["s", "s"])) problems.push("slideOrder must be [[idSuffix, displayName], ...]");
  const cc = data.categoryChange;
  if (!cc || !isStr(cc.idSuffix) || !isStr(cc.from) || !isStr(cc.to)) problems.push("categoryChange must be { idSuffix, from, to }");
  if (!tuples(data.recategorise, 4, ["s", "s", "s", "s"])) problems.push("recategorise must be [[idSuffix, role, currentCategory, newCategory], ...]");
  if (problems.length) { console.error(`REFUSED: ${COMMITTEE_DATA_PATH} has an unexpected shape:\n  ${problems.join("\n  ")}`); process.exit(2); }
  return data;
}
