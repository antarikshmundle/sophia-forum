// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { buildKnowledgeIndex, serializeIndex, type KnowledgeFile } from "@/lib/bot/knowledge/index-builder";
import { chunksFromIndex } from "@/lib/bot/knowledge/retrieve";
import { chunkMarkdown } from "@/lib/bot/knowledge/chunk";
import { todayInIndia } from "@/lib/bot/knowledge/schema";
import { AS_OF, docText } from "./fixtures";

const LONG_BODY = [
  "# Admissions",
  "Intro paragraph with the [prospectus](https://example.org/prospectus.pdf).",
  "## Documents required",
  "Bring the example certificate. Details at /admissions/documents and https://example.org/docs.",
  "## Important dates",
  "Example registration opens in June. ".repeat(60).trim(),
].join("\n\n");

const FILES: KnowledgeFile[] = [
  { path: "pce/admissions/process.md", raw: docText({}, LONG_BODY) },
  { path: "pce/contacts/office.md", raw: docText({ category: "contacts", title: "Example office", source_url: "https://example.org/contact" }, "Call the example office.") },
  { path: "pce/policies/draft-rule.md", raw: docText({ category: "policies", status: "draft" }, "Not yet verified.") },
  { path: "pce/campus/old.md", raw: docText({ category: "campus", verified_on: "2025-09-01", review_by: "2026-06-30" }, "Out of date.") },
  { path: "pce/college/nosource.md", raw: docText({ category: "college", source_url: undefined }, "No source.") },
];

describe("buildKnowledgeIndex", () => {
  const { index, evaluations } = buildKnowledgeIndex(FILES, AS_OF);

  it("indexes verified, current, sourced documents only", () => {
    expect(index.documents.map((d) => d.id)).toEqual(["pce/admissions/process", "pce/contacts/office"]);
    expect(new Set(index.chunks.map((c) => c.docId))).toEqual(new Set(["pce/admissions/process", "pce/contacts/office"]));
    const excluded = Object.fromEntries(evaluations.filter((e) => !e.included).map((e) => [e.id, e.reasons]));
    expect(excluded).toEqual({
      "pce/campus/old": ["expired"],
      "pce/college/nosource": ["missing-source"],
      "pce/policies/draft-rule": ["draft"],
    });
    const text = serializeIndex(index);
    for (const leaked of ["Not yet verified", "Out of date", "No source"]) expect(text).not.toContain(leaked);
  });

  it("preserves the source URL and verification metadata on documents and on every retrievable chunk", () => {
    expect(index.documents[0]).toMatchObject({
      sourceUrl: "https://example.org/admissions", verifiedBy: "Example office", verifiedOn: "2026-11-01", reviewBy: "2027-06-30",
      category: "admissions", scope: "pce", path: "pce/admissions/process.md",
    });
    const chunks = chunksFromIndex(JSON.parse(serializeIndex(index)));
    expect(chunks.length).toBe(index.chunks.length);
    for (const c of chunks.filter((x) => x.docId === "pce/admissions/process")) {
      expect(c).toMatchObject({ source: "document", sourceUrl: "https://example.org/admissions", verifiedOn: "2026-11-01", reviewBy: "2027-06-30" });
    }
    expect(chunks.find((c) => c.docId === "pce/contacts/office")?.sourceUrl).toBe("https://example.org/contact");
  });

  it("keeps the links each chunk contains, internal and external", () => {
    const links = index.chunks.flatMap((c) => c.links);
    expect(links).toEqual(expect.arrayContaining(["https://example.org/prospectus.pdf", "https://example.org/docs"]));
    const docs = index.chunks.find((c) => c.heading === "Admissions › Documents required");
    expect(docs?.text).toContain("/admissions/documents");
    expect(docs?.links).toEqual(["https://example.org/docs"]);
  });

  it("chunks by heading path and size", () => {
    const chunks = index.chunks.filter((c) => c.docId === "pce/admissions/process");
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
    expect(chunks[0]).toMatchObject({ id: "pce/admissions/process#0", heading: "Admissions" });
    const dates = chunks.filter((c) => c.heading === "Admissions › Important dates");
    expect(dates.length).toBeGreaterThan(1); // the long section is split
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1200);
  });
});

describe("deterministic, versioned index", () => {
  it("the same files give the same bytes, in any input order and on any build day before an expiry", () => {
    const a = serializeIndex(buildKnowledgeIndex(FILES, AS_OF).index);
    const b = serializeIndex(buildKnowledgeIndex([...FILES].reverse(), AS_OF).index);
    const c = serializeIndex(buildKnowledgeIndex(FILES, "2027-01-15").index);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(a.endsWith("}\n")).toBe(true);
    expect(a).not.toMatch(/T\d{2}:\d{2}/); // no timestamps
  });

  it("the version is a content hash: it changes exactly when indexed knowledge changes", () => {
    const base = buildKnowledgeIndex(FILES, AS_OF).index;
    expect(base).toMatchObject({ schema: "sophia-knowledge-index", schemaVersion: 1 });
    expect(base.version).toMatch(/^[0-9a-f]{16}$/);
    const edited = FILES.map((f) => (f.path === "pce/contacts/office.md" ? { ...f, raw: f.raw.replace("Call the", "Phone the") } : f));
    expect(buildKnowledgeIndex(edited, AS_OF).index.version).not.toBe(base.version);
    // editing an excluded draft changes nothing in the index
    const draftEdited = FILES.map((f) => (f.path === "pce/policies/draft-rule.md" ? { ...f, raw: f.raw + "more" } : f));
    expect(buildKnowledgeIndex(draftEdited, AS_OF).index.version).toBe(base.version);
  });

  it("an expiry date passing removes the document and changes the version", () => {
    const later = buildKnowledgeIndex(FILES, "2027-07-01").index;
    expect(later.documents).toEqual([]);
    expect(later.version).not.toBe(buildKnowledgeIndex(FILES, AS_OF).index.version);
  });

  it("rejects duplicate paths and bad dates", () => {
    expect(() => buildKnowledgeIndex([FILES[0], FILES[0]], AS_OF)).toThrow(/Duplicate/);
    expect(() => buildKnowledgeIndex(FILES, "12/11/2026")).toThrow(/YYYY-MM-DD/);
  });

  it("chunksFromIndex refuses an unknown index format", () => {
    expect(() => chunksFromIndex({ schema: "other", schemaVersion: 1, version: "x", documents: [], chunks: [] } as never)).toThrow(/Unsupported/);
  });
});

describe("chunkMarkdown", () => {
  it("splits on sentence ends, including the Devanagari danda", () => {
    const text = "पहला वाक्य है। ".repeat(80).trim();
    const chunks = chunkMarkdown(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(200);
      expect(c.text.endsWith("।")).toBe(true);
    }
  });

  it("a heading with no text under it produces no chunk", () => {
    expect(chunkMarkdown("# A\n\n## B\n\nText").map((c) => c.heading)).toEqual(["A › B"]);
  });
});

describe("the repository's knowledge", () => {
  const root = join(__dirname, "..", "..", "..");
  const knowledgeRoot = join(root, "knowledge");
  const walk = (dir: string): string[] => readdirSync(dir).sort().flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

  it("has the nine category folders", () => {
    expect(readdirSync(join(knowledgeRoot, "pce")).sort()).toEqual(["academics", "admissions", "campus", "college", "contacts", "departments", "events", "facilities", "policies"]);
  });

  it("every document marked verified is valid, and the committed index is up to date (npm run kb:build)", () => {
    const files = walk(join(knowledgeRoot, "pce"))
      .map((full) => relative(knowledgeRoot, full).split(sep).join("/"))
      .filter((p) => p.endsWith(".md") && !p.endsWith("/README.md") && !p.split("/").pop()!.startsWith("_"))
      .map((path) => ({ path, raw: readFileSync(join(knowledgeRoot, path), "utf8") }));
    const { index, evaluations } = buildKnowledgeIndex(files, todayInIndia());
    const broken = evaluations.filter((e) => !e.included && !e.reasons.includes("draft") && e.reasons.join() !== "expired");
    expect(broken).toEqual([]);
    expect(readFileSync(join(root, "src", "data", "knowledge-index.json"), "utf8")).toBe(serializeIndex(index));
  });
});
