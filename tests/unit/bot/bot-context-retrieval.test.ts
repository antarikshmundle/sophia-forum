// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeChunk } from "@/lib/bot/knowledge/types";

/**
 * Stage 4.7: HOD ranking for explicit HOD questions, and the CMS cache (complete reads, genuine empty results,
 * temporary failures, recovery, one shared load). retrieveForQuestion runs for real; only the CMS read is scripted
 * (with a call counter) and the clock is passed in. Fictional data only.
 */
type CmsResult = { ok: true; chunks: KnowledgeChunk[]; failed: string[] } | { ok: false; reason: "cms-backend-off" };
const cms = vi.hoisted(() => ({ next: [] as (() => Promise<CmsResult>)[], calls: 0, fallback: null as null | (() => Promise<CmsResult>) }));
vi.mock("@/lib/bot/knowledge/cms-source", () => ({
  loadCmsKnowledge: () => {
    cms.calls++;
    const step = cms.next.shift() ?? cms.fallback;
    if (!step) throw new Error("no scripted CMS result");
    return step();
  },
}));

import { CMS_RETRY_MS, CMS_TTL_MS, resetKnowledgeCache, retrieveForQuestion } from "@/lib/bot/sources";
import { KeywordRetriever } from "@/lib/bot/knowledge/retrieve";
import { PrioritizedRetriever } from "@/lib/bot/knowledge/priority";

const chunk = (id: string, over: Partial<KnowledgeChunk>): KnowledgeChunk => ({
  id, docId: id.split("#")[0], source: "cms", title: "", heading: "", text: "", category: "campus", scope: "aids", language: "en",
  sourceUrl: "/", verifiedOn: null, reviewBy: null, keywords: [], links: [], ...over,
});
// shaped like the published records: the About passages repeat "AI & DS"; the HOD card spells the department out
const ABOUT = chunk("cms/content/home-about#0", { title: "About Sophia Forum", text: "The student forum of the AI & DS Department at PCE Nagpur. A platform for AI & DS students to connect and build. AI & DS events." });
const MILESTONES = chunk("cms/content/milestones#0", { title: "Journey and milestones", sourceUrl: "/about", text: "2020: B.Tech AI & DS begins. The Department of Artificial Intelligence & Data Science starts its B.Tech programme." });
const HOD = chunk("cms/faculty/f-hod#0", { category: "departments", title: "Dr. Example Head, Assistant Professor & HOD", sourceUrl: "/about", keywords: ["faculty"], text: "Dr. Example Head: Assistant Professor & HOD, Artificial Intelligence & Data Science. Listed under Our Mentors (Faculty) on the Sophia Forum About page." });
const FACULTY = chunk("cms/faculty/f-one#0", { category: "departments", title: "Dr. Example One, Assistant Professor", sourceUrl: "/about", keywords: ["faculty"], text: "Dr. Example One: Assistant Professor, Artificial Intelligence & Data Science. Listed under Our Mentors (Faculty) on the Sophia Forum About page." });
const PRESIDENT = chunk("cms/team/asha-example#0", { title: "Asha Example, President", sourceUrl: "/team/asha-example", text: "Asha Example: President (President), Sophia Forum student council." });
const EVENT = chunk("cms/events/fest-example#0", { category: "events", title: "Example Fest 1.0", sourceUrl: "/events/fest-example", keywords: ["event"], text: "Example Fest 1.0: a Sophia Forum event (already held)." });
const ALL = [ABOUT, MILESTONES, HOD, FACULTY, PRESIDENT, EVENT];

const ok = (chunks: KnowledgeChunk[], failed: string[] = []) => async (): Promise<CmsResult> => ({ ok: true, chunks, failed });
const T0 = 1_800_000_000_000;
const ids = async (q: string, history: { role: "user" | "assistant"; text: string }[] = [], now = T0) => (await retrieveForQuestion(q, history, now)).map((r) => r.chunk.docId);

beforeEach(() => {
  resetKnowledgeCache();
  cms.next = [];
  cms.calls = 0;
  cms.fallback = ok(ALL);
});

describe("HOD ranking for explicit HOD questions", () => {
  it("baseline (plain keyword ranking): a generic passage outranks the HOD record for 'HOD of AI & DS'", () => {
    const plain = new PrioritizedRetriever(new KeywordRetriever(ALL)).search("Who is the HOD of AI & DS?", { limit: 6 }).map((r) => r.chunk.docId);
    expect(plain[0]).not.toBe("cms/faculty/f-hod");
    expect(plain).toContain("cms/faculty/f-hod");
  });

  it.each([
    "Who is the HOD of AI & DS?",
    "Who is the Head of Department of AI & DS?",
    "Who heads the AI & DS department?",
    "AI & DS के विभागाध्यक्ष कौन हैं?",
    "AI DS ka HOD kaun hai?",
  ])("%s → the HOD record first", async (q) => {
    expect((await ids(q))[0]).toBe("cms/faculty/f-hod");
  });

  it("other matching passages keep their relative order after the HOD record", async () => {
    const plain = new PrioritizedRetriever(new KeywordRetriever(ALL)).search("Who is the HOD of AI & DS?", { limit: 6 }).map((r) => r.chunk.docId);
    expect((await ids("Who is the HOD of AI & DS?")).slice(1)).toEqual(plain.filter((d) => d !== "cms/faculty/f-hod").slice(0, 5));
  });

  it.each(["What is the AI & DS syllabus?", "Who is the president of Sophia Forum?", "Who are the faculty members?", "What is Sophia Forum?", "kaun kaun se events hue hain?"])(
    "unrelated question keeps its ranking unchanged: %s",
    async (q) => {
      const plain = new PrioritizedRetriever(new KeywordRetriever(ALL)).search(q, { limit: 6 }).map((r) => r.chunk.docId);
      expect(await ids(q)).toEqual(plain);
    },
  );

  it("a follow-up that isn't about the HOD isn't forced to the HOD record", async () => {
    const r = await ids("and the president?", [{ role: "user", text: "Who is the HOD of AI & DS?" }]);
    expect(r[0]).not.toBe("cms/faculty/f-hod");
    expect(r).toContain("cms/team/asha-example");
  });

  it("no HOD record published → nothing invented, other results unchanged", async () => {
    cms.fallback = ok([ABOUT, MILESTONES, FACULTY]);
    const r = await ids("Who is the HOD of AI & DS?");
    expect(r).not.toContain("cms/faculty/f-hod");
    expect(r.length).toBeGreaterThan(0);
  });

  it("still at most six sources", async () => {
    expect((await ids("Who is the HOD of AI & DS?")).length).toBeLessThanOrEqual(6);
  });
});

describe("CMS cache", () => {
  it("a complete read is cached for five minutes, then refreshed", async () => {
    await ids("Who is the president of Sophia Forum?", [], T0);
    await ids("What is Sophia Forum?", [], T0 + CMS_TTL_MS - 1);
    expect(cms.calls).toBe(1);
    await ids("What is Sophia Forum?", [], T0 + CMS_TTL_MS);
    expect(cms.calls).toBe(2);
  });

  it("a genuine empty result (every section answered, no records) is cached like any complete read", async () => {
    cms.next = [ok([])];
    expect(await ids("What is Sophia Forum?", [], T0)).toEqual([]);
    expect(await ids("What is Sophia Forum?", [], T0 + 60_000)).toEqual([]);
    expect(cms.calls).toBe(1);
  });

  it("CMS switched off by configuration is a genuine 'no CMS knowledge', cached for five minutes", async () => {
    cms.next = [async () => ({ ok: false, reason: "cms-backend-off" })];
    expect(await ids("What is Sophia Forum?", [], T0)).toEqual([]);
    await ids("What is Sophia Forum?", [], T0 + 60_000);
    expect(cms.calls).toBe(1);
  });

  it("a failed FIRST read is not cached for five minutes: retried after 30 s, then recovers", async () => {
    const allFailed = ["content", "leadership", "hod", "faculty", "team", "events", "gallery"];
    cms.next = [ok([], allFailed)];
    expect(await ids("Who is the president of Sophia Forum?", [], T0)).toEqual([]);
    // within the retry window: no new CMS request (no hammering)
    await ids("Who is the president of Sophia Forum?", [], T0 + CMS_RETRY_MS - 1);
    expect(cms.calls).toBe(1);
    // after the retry window: read again, and the knowledge is back
    expect((await ids("Who is the president of Sophia Forum?", [], T0 + CMS_RETRY_MS))[0]).toBe("cms/team/asha-example");
    expect(cms.calls).toBe(2);
  });

  it("a failed section keeps its last good passages until a later read succeeds", async () => {
    cms.next = [ok(ALL), ok(ALL.filter((c) => !c.docId.startsWith("cms/team/")), ["team"])];
    await ids("What is Sophia Forum?", [], T0); // good read
    // after five minutes the team section fails: the president is still found from the last good copy
    expect((await ids("Who is the president of Sophia Forum?", [], T0 + CMS_TTL_MS))[0]).toBe("cms/team/asha-example");
    expect(cms.calls).toBe(2);
    // a partial failure is retried after 30 s, not after five minutes
    await ids("What is Sophia Forum?", [], T0 + CMS_TTL_MS + CMS_RETRY_MS);
    expect(cms.calls).toBe(3);
  });

  it("an unexpected error keeps the last good copy and retries soon", async () => {
    cms.next = [ok(ALL), async () => { throw new Error("network down"); }];
    await ids("What is Sophia Forum?", [], T0);
    expect((await ids("Who is the president of Sophia Forum?", [], T0 + CMS_TTL_MS))[0]).toBe("cms/team/asha-example");
    await ids("What is Sophia Forum?", [], T0 + CMS_TTL_MS + CMS_RETRY_MS);
    expect(cms.calls).toBe(3);
  });

  it("concurrent requests share one CMS load", async () => {
    let release!: () => void;
    cms.next = [() => new Promise<CmsResult>((resolve) => { release = () => resolve({ ok: true, chunks: ALL, failed: [] }); })];
    const pending = Promise.all([ids("What is Sophia Forum?"), ids("Who is the president of Sophia Forum?"), ids("Who is the HOD?")]);
    await Promise.resolve();
    release();
    const [a, b, c] = await pending;
    expect(cms.calls).toBe(1);
    expect(a.length).toBeGreaterThan(0);
    expect(b[0]).toBe("cms/team/asha-example");
    expect(c[0]).toBe("cms/faculty/f-hod");
  });
});
