// @vitest-environment node
import { describe, expect, it } from "vitest";
import { KeywordRetriever, type Retriever, type ScoredChunk } from "@/lib/bot/knowledge/retrieve";
import { authorityOf, KEEP_SHARE, PrioritizedRetriever, queryFocus, tierOf } from "@/lib/bot/knowledge/priority";
import { evaluateDocument } from "@/lib/bot/knowledge/schema";
import type { KnowledgeChunk } from "@/lib/bot/knowledge/types";
import { AS_OF, docText } from "./fixtures";

// Fictional chunks only.
const chunk = (id: string, over: Partial<KnowledgeChunk>): KnowledgeChunk => ({
  id, docId: id.split("#")[0], source: "document", title: "", heading: "", text: "", category: "facilities", scope: "pce", language: "en",
  sourceUrl: "https://example.org/" + id.split("#")[0], verifiedOn: "2026-11-01", reviewBy: "2027-06-30", keywords: [], links: [], ...over,
});

/** A retriever that returns fixed scores, to test re-ranking exactly. */
const fixed = (rows: [KnowledgeChunk, number][]): Retriever => ({
  search: (_q, o) => rows.map(([c, score]): ScoredChunk => ({ chunk: c, score, matched: [] })).sort((a, b) => b.score - a.score).slice(0, o?.limit ?? 5),
});

const cms = chunk("cms/events/x#0", { source: "cms", scope: "aids", sourceUrl: "/events/x", verifiedOn: null, reviewBy: null });
const aids = chunk("pce/facilities/aids-lab#0", { scope: "aids" });
const pce = chunk("pce/facilities/central-lab#0", { scope: "pce" });
const other = chunk("pce/departments/mech-lab#0", { scope: "other-dept", category: "departments" });

describe("tiers and authority", () => {
  it("CMS and AI & DS are primary, PCE secondary, other departments supporting", () => {
    expect([cms, aids, pce, other].map(tierOf)).toEqual(["primary", "primary", "secondary", "supporting"]);
    expect([cms, aids, pce, other].map(authorityOf)).toEqual([1, 2, 3, 4]);
  });

  it("documents accept the three scopes and nothing else", () => {
    for (const scope of ["aids", "pce", "other-dept"]) expect(evaluateDocument("pce/facilities/x.md", docText({ scope, category: "facilities" }), AS_OF).included).toBe(true);
    expect(evaluateDocument("pce/facilities/x.md", docText({ scope: "dept", category: "facilities" }), AS_OF).reasons).toEqual(["invalid-metadata"]);
  });

  it("queryFocus", () => {
    expect(queryFocus("lab timings")).toBe("department");
    expect(queryFocus("college ki library")).toBe("institution");
    expect(queryFocus("PCE admission")).toBe("institution");
    expect(queryFocus("mechanical department lab")).toBe("other-department");
  });
});

describe("PrioritizedRetriever", () => {
  it("primary content wins when relevance is comparable", () => {
    const r = new PrioritizedRetriever(fixed([[pce, 10], [aids, 9], [other, 10]])).search("lab");
    expect(r.map((x) => x.chunk.id)).toEqual([aids.id, pce.id, other.id]);
    expect(r[0]).toMatchObject({ tier: "primary", authority: 2, baseScore: 9 });
    expect(r[0].score).toBeCloseTo(10.8);
  });

  it("a clearly more relevant PCE-wide passage still ranks above a weak primary match", () => {
    const r = new PrioritizedRetriever(fixed([[pce, 10], [aids, 5]])).search("lab");
    expect(r.map((x) => x.chunk.id)).toEqual([pce.id, aids.id]);
  });

  it("CMS is authoritative over an AI & DS document for the same relevance", () => {
    const r = new PrioritizedRetriever(fixed([[aids, 8], [cms, 8]])).search("event");
    expect(r[0].chunk.id).toBe(cms.id);
  });

  it("never hides relevant PCE-wide information: it takes the last place when primary passages fill the results", () => {
    const primaries = [1, 2, 3].map((i) => chunk(`cms/team/p${i}#0`, { source: "cms", scope: "aids" }));
    const r = new PrioritizedRetriever(fixed([[primaries[0], 10], [primaries[1], 10], [primaries[2], 10], [pce, 9]])).search("lab", { limit: 3 });
    expect(r.map((x) => x.chunk.id)).toContain(pce.id);
    expect(r).toHaveLength(3);
    expect(r.filter((x) => x.tier === "primary")).toHaveLength(2);
  });

  it("an irrelevant lower-tier passage is not forced in", () => {
    const primaries = [1, 2, 3].map((i) => chunk(`cms/team/p${i}#0`, { source: "cms", scope: "aids" }));
    const weak = 10 * KEEP_SHARE - 1;
    const r = new PrioritizedRetriever(fixed([[primaries[0], 10], [primaries[1], 10], [primaries[2], 10], [pce, weak]])).search("lab", { limit: 3 });
    expect(r.map((x) => x.chunk.id)).not.toContain(pce.id);
  });

  it("with a single result, the best weighted passage is returned (nothing is swapped in)", () => {
    expect(new PrioritizedRetriever(fixed([[aids, 10], [pce, 9]])).search("lab", { limit: 1 }).map((x) => x.chunk.id)).toEqual([aids.id]);
  });

  it("institution-wide and other-department questions are ranked on relevance alone", () => {
    const base = fixed([[pce, 10], [aids, 9], [other, 9.5]]);
    expect(new PrioritizedRetriever(base).search("college lab").map((x) => x.chunk.id)).toEqual([pce.id, other.id, aids.id]);
    expect(new PrioritizedRetriever(base).search("mechanical lab").map((x) => x.score)).toEqual([10, 9.5, 9]);
  });

  it("works on the keyword retriever end to end, and returns nothing when nothing matches", () => {
    const kw = new KeywordRetriever([
      chunk("pce/facilities/aids-lab#0", { scope: "aids", title: "AI & DS lab", text: "The example lab is open for project work." }),
      chunk("pce/facilities/central-lab#0", { scope: "pce", title: "Central computing lab", text: "The example lab is open for project work." }),
    ]);
    const p = new PrioritizedRetriever(kw);
    expect(p.search("lab kab khulti hai")[0].chunk.id).toBe("pce/facilities/aids-lab#0");
    expect(p.search("college lab").map((x) => x.tier)).toContain("secondary");
    expect(p.search("quantum chromodynamics")).toEqual([]);
  });
});
