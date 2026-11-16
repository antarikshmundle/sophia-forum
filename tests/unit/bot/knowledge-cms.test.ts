// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The CMS adapter runs the site's real public reads (src/lib/cms/public.ts) against an in-memory Supabase stand-in that
 * applies the query filters those reads send, with unpublished rows planted in every table. Only what the public site
 * shows may come out. All names and texts are fictional.
 */
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, fail: new Set<string>(), clients: [] as unknown[][] }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@supabase/supabase-js", () => {
  const likeRe = (p: string) => new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$");
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private single = false;
    constructor(private table: string) {}
    select() { return this; }
    eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
    like(c: string, p: string) { this.filters.push((r) => likeRe(p).test(String(r[c]))); return this; }
    not(c: string, op: string, p: string) { if (op !== "like") throw new Error(op); this.filters.push((r) => !likeRe(p).test(String(r[c]))); return this; }
    order() { return this; }
    maybeSingle() { this.single = true; return this; }
    then<A>(ok: (v: { data: unknown; error: { code: string } | null }) => A) {
      if (db.fail.has(this.table)) return Promise.resolve({ data: null, error: { code: "PGRST000" } }).then(ok);
      const rows = (db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r))).map((r) => ({ ...r }));
      return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(ok);
    }
  }
  return {
    createClient: (...args: unknown[]) => {
      db.clients.push(args);
      return { from: (t: string) => new Query(t) };
    },
  };
});

import { loadCmsKnowledge } from "@/lib/bot/knowledge/cms-source";
import { KeywordRetriever } from "@/lib/bot/knowledge/retrieve";

const PUBLIC_KEY = "sb_publishable_test_key";

function seed() {
  db.tables = {
    faculty: [
      { id: "f-one", name: "Dr. Alpha Example", designation: "Assistant Professor", department: "AI & DS", image_path: null, linkedin: "https://linkedin.example/alpha", quote: "Keep learning.", sort_order: 1, is_published: true, is_active_hod: false },
      { id: "f-hidden", name: "Dr. Hidden Draftperson", designation: "Professor", department: "AI & DS", image_path: null, linkedin: null, quote: null, sort_order: 2, is_published: false, is_active_hod: false },
      { id: "f-hod", name: "Dr. Gamma Head", designation: "Professor & HOD", department: "AI & DS", image_path: null, linkedin: null, quote: null, sort_order: 3, is_published: true, is_active_hod: true },
      { id: "leadership-principal", name: "Dr. Beta Leader", designation: "Principal", department: "", image_path: null, linkedin: null, quote: null, sort_order: 1, is_published: true, is_active_hod: false },
      { id: "leadership-hidden", name: "Dr. Unpublished Leader", designation: "Director", department: "", image_path: null, linkedin: null, quote: null, sort_order: 2, is_published: false, is_active_hod: false },
    ],
    hod_messages: [
      { faculty_id: "f-hod", status: "draft", message: "DRAFT message that must not appear." },
      { faculty_id: "f-hod", status: "published", message: "Welcome to the example department." },
    ],
    team_members: [
      { id: "riya-example", name: "Riya Example", role: "President", category: "President", photo: null, quote: null, bio: "Leads the example council.", skills: ["Python"], linkedin: "https://linkedin.example/riya", github: "https://github.example/riya", instagram: null, twitter: null, website: null, sort_order: 1, is_creator_badge: false, is_published: true },
      { id: "secret-member", name: "Secret Unpublished", role: "Secretary", category: "Secretary", photo: null, quote: null, bio: null, skills: [], linkedin: null, github: null, instagram: null, twitter: null, website: null, sort_order: 2, is_creator_badge: false, is_published: false },
    ],
    events: [
      { id: "hack-example", name: "Example Hackathon", event_date: "2026-12-05", event_time: "10:00 AM", venue: "Example Hall", status: "upcoming", description: "A day of building.", poster: "/images/x.png", registration_link: "https://forms.example.org/hack", is_featured: true, is_published: true },
      { id: "draft-event", name: "Unannounced Draft Event", event_date: "2027-01-01", event_time: null, venue: "TBA", status: "upcoming", description: "Not public.", poster: "/images/y.png", registration_link: null, is_featured: false, is_published: false },
    ],
    gallery_items: [
      { id: "g-one", title: "Example workshop photo", category: "photo", event: "Example Workshop", year: 2026, url: "/images/g.png", thumbnail_url: null, is_featured: false, is_published: true },
      { id: "g-hidden", title: "Hidden gallery item", category: "photo", event: "Hidden", year: 2026, url: "/images/h.png", thumbnail_url: null, is_featured: false, is_published: false },
    ],
    site_content: [{ id: "about.pillars", data: { body1: "Example mission text from the CMS." } }],
  };
}

beforeEach(() => {
  seed();
  db.fail.clear();
  db.clients.length = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://testproj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", PUBLIC_KEY);
  vi.stubEnv("CMS_FACULTY_MODE", "backend");
});

async function load() {
  const r = await loadCmsKnowledge();
  if (!r.ok) throw new Error("expected CMS knowledge");
  return r;
}

describe("CMS knowledge: published records only", () => {
  it("includes every published section and nothing unpublished or draft", async () => {
    const r = await load();
    expect(r.failed).toEqual([]);
    const all = JSON.stringify(r.chunks);
    for (const shown of ["Dr. Alpha Example", "Dr. Beta Leader", "Dr. Gamma Head", "Welcome to the example department.", "Riya Example", "Example Hackathon", "Example workshop photo", "Example mission text from the CMS."]) {
      expect(all).toContain(shown);
    }
    for (const hidden of ["Hidden Draftperson", "Unpublished Leader", "DRAFT message", "Secret Unpublished", "Unannounced Draft Event", "Hidden gallery item"]) {
      expect(all).not.toContain(hidden);
    }
  });

  it("reads with the public key and no session; never another key", async () => {
    await load();
    expect(db.clients.length).toBeGreaterThan(0);
    for (const [url, key, options] of db.clients) {
      expect(url).toBe("https://testproj.supabase.co");
      expect(key).toBe(PUBLIC_KEY);
      expect(options).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
    }
  });

  it("each chunk cites the site page that shows it, and is a live CMS chunk", async () => {
    const r = await load();
    const url = (docId: string) => r.chunks.find((c) => c.docId === docId)?.sourceUrl;
    expect(url("cms/team/riya-example")).toBe("/team/riya-example");
    expect(url("cms/events/hack-example")).toBe("/events/hack-example");
    expect(url("cms/gallery/g-one")).toBe("/gallery");
    expect(url("cms/faculty/f-one")).toBe("/about");
    expect(url("cms/leadership/leadership-principal")).toBe("/about");
    expect(url("cms/hod/message")).toBe("/about");
    expect(url("cms/content/about-mission")).toBe("/about");
    for (const c of r.chunks) expect(c).toMatchObject({ source: "cms", scope: "aids", verifiedOn: null, reviewBy: null });
    expect(r.chunks.find((c) => c.docId === "cms/events/hack-example")?.links).toEqual(["https://forms.example.org/hack"]);
  });

  it("leaves out personal profile links", async () => {
    const all = JSON.stringify((await load()).chunks);
    expect(all).not.toMatch(/linkedin\.example|github\.example/);
  });

  it("a failed read leaves that section out and reports it; the others are still returned", async () => {
    db.fail.add("events");
    const r = await load();
    expect(r.failed).toEqual(["events"]);
    expect(r.chunks.some((c) => c.docId.startsWith("cms/events/"))).toBe(false);
    expect(r.chunks.some((c) => c.docId.startsWith("cms/team/"))).toBe(true);
  });

  it("CMS backend off (demo mode): no CMS knowledge and no backend read at all", async () => {
    vi.stubEnv("CMS_FACULTY_MODE", "demo");
    expect(await loadCmsKnowledge()).toEqual({ ok: false, reason: "cms-backend-off" });
    expect(db.clients).toEqual([]);
  });

  it("CMS chunks are searchable with the same keyword retriever", async () => {
    const retriever = new KeywordRetriever((await load()).chunks);
    expect(retriever.search("hackathon kab hai")[0]?.chunk.sourceUrl).toBe("/events/hack-example");
    expect(retriever.search("hod ka message")[0]?.chunk.docId).toBe("cms/hod/message");
    expect(retriever.search("riya kaun hai")[0]?.chunk.docId).toBe("cms/team/riya-example");
    expect(retriever.search("Unannounced")).toEqual([]);
  });

  it("the adapter only uses the site's public read functions (no own client, no secret key, no writes)", () => {
    const source = readFileSync(join(__dirname, "..", "..", "..", "src", "lib", "bot", "knowledge", "cms-source.ts"), "utf8");
    expect(source).toMatch(/from "@\/lib\/cms\/public"/);
    expect(source).not.toMatch(/@supabase|createClient|service_role|SERVICE_ROLE|sb_secret|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});

describe("team passages: no repeated forum boilerplate (Stage 3A)", () => {
  const BOILERPLATE = "student forum of the AI & DS Department at PCE Nagpur";

  it("keeps name, role, category, published bio/skills and the citation; drops the long forum description", async () => {
    const team = (await load()).chunks.filter((c) => c.docId.startsWith("cms/team/"));
    expect(team).toHaveLength(1); // the unpublished member is still excluded
    const riya = team[0];
    expect(riya.text).not.toContain(BOILERPLATE);
    expect(riya.text).toContain("Riya Example: President (President), Sophia Forum student council.");
    expect(riya.text).toContain("Leads the example council.");
    expect(riya.text).toContain("Skills: Python.");
    expect(riya).toMatchObject({
      id: "cms/team/riya-example#0", docId: "cms/team/riya-example", source: "cms", scope: "aids", category: "campus",
      title: "Riya Example, President", sourceUrl: "/team/riya-example", verifiedOn: null, reviewBy: null,
    });
  });

  it("other CMS passages are unchanged (events still name the forum and department)", async () => {
    const chunks = (await load()).chunks;
    expect(chunks.find((c) => c.docId === "cms/events/hack-example")?.text).toContain(`a Sophia Forum, the ${BOILERPLATE} event (upcoming).`);
    expect(chunks.find((c) => c.docId === "cms/faculty/f-one")?.text).toBe("Dr. Alpha Example: Assistant Professor, AI & DS. Listed under Our Mentors (Faculty) on the Sophia Forum About page.\nQuote: \"Keep learning.\"");
    expect(chunks.filter((c) => c.docId === "cms/content/about-mission").map((c) => c.text).join("\n")).toContain("Example mission text from the CMS.");
  });

  it("generic department questions no longer match committee members", async () => {
    const retriever = new KeywordRetriever((await load()).chunks);
    for (const q of ["What labs does the AI & DS department have?", "What is the AI & DS syllabus?", "Where is the department in PCE Nagpur?"]) {
      expect(retriever.search(q, { limit: 10 }).filter((r) => r.chunk.docId.startsWith("cms/team/"))).toEqual([]);
    }
    // members are still found by name, role and forum
    expect(retriever.search("Who is the president of Sophia Forum?")[0]?.chunk.docId).toBe("cms/team/riya-example");
    expect(retriever.search("riya kaun hai")[0]?.chunk.sourceUrl).toBe("/team/riya-example");
  });

  it("the new suggested questions are supported by published CMS content", async () => {
    const retriever = new KeywordRetriever((await load()).chunks);
    expect(retriever.search("Sophia Forum ka mission kya hai?")[0]?.chunk.docId).toBe("cms/content/about-mission");
    const hod = retriever.search("Who is the HOD of AI & DS?").slice(0, 2).map((r) => r.chunk.docId);
    expect(hod).toEqual(expect.arrayContaining(["cms/faculty/f-hod"]));
  });
});

describe("section keywords (Stage 4.1)", () => {
  it("event and faculty passages are labelled as such; other sections carry no keywords", async () => {
    const chunks = (await load()).chunks;
    for (const c of chunks.filter((x) => x.docId.startsWith("cms/events/"))) expect(c.keywords).toEqual(["event"]);
    for (const c of chunks.filter((x) => x.docId.startsWith("cms/faculty/"))) expect(c.keywords).toEqual(["faculty"]);
    for (const c of chunks.filter((x) => /^cms\/(team|content|leadership|hod|gallery)\//.test(x.docId))) expect(c.keywords).toEqual([]);
  });

  it("Hinglish and Hindi event questions find the event record first", async () => {
    const retriever = new KeywordRetriever((await load()).chunks);
    expect(retriever.search("kaun kaun se events hue hain?")[0]?.chunk.docId).toBe("cms/events/hack-example");
    expect(retriever.search("फोरम ने कौन से कार्यक्रम किए हैं?")[0]?.chunk.docId).toBe("cms/events/hack-example");
  });
});
