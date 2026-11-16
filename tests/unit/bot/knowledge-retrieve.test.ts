// @vitest-environment node
import { describe, expect, it } from "vitest";
import { KeywordRetriever } from "@/lib/bot/knowledge/retrieve";
import { analyze, fold, normalizeText, tokenize } from "@/lib/bot/knowledge/text";
import type { KnowledgeChunk } from "@/lib/bot/knowledge/types";

// Fictional chunks (invented names, example.org sources)
const chunk = (id: string, over: Partial<KnowledgeChunk>): KnowledgeChunk => ({
  id, docId: id.split("#")[0], source: "document", title: "", heading: "", text: "", category: "college", scope: "pce", language: "en",
  sourceUrl: "https://example.org/" + id.split("#")[0], verifiedOn: "2026-11-01", reviewBy: "2027-06-30", keywords: [], links: [], ...over,
});

const CHUNKS: KnowledgeChunk[] = [
  chunk("pce/admissions/process#0", { category: "admissions", title: "Example admission process", text: "Admissions to the example B.Tech programme open in June. Submit the application form online." }),
  chunk("pce/admissions/fees#0", { category: "admissions", title: "Example fee structure", text: "The tuition fees for the example programme are listed on the official notice." }),
  chunk("pce/facilities/library#0", { category: "facilities", title: "Example library", text: "The central library is open on working days. Students can borrow books with their ID card." }),
  chunk("pce/facilities/hostel#0", { category: "facilities", title: "Example hostel", text: "Hostel rooms are allotted to students on request." }),
  chunk("pce/contacts/office#0", { category: "contacts", title: "Example office contact", text: "Contact the example office by email." }),
  chunk("cms/team/shubham-example#0", { source: "cms", scope: "aids", title: "Shubham Examplekar, President", text: "Shubham Examplekar: President (President), student council of Sophia Forum.", sourceUrl: "/team/shubham-example", verifiedOn: null, reviewBy: null }),
  chunk("cms/team/preeti-example#0", { source: "cms", scope: "aids", title: "Preeti Sampleton, Secretary", text: "Preeti Sampleton: Secretary (Secretary), student council of Sophia Forum.", sourceUrl: "/team/preeti-example", verifiedOn: null, reviewBy: null }),
  chunk("cms/hod/message#0", { source: "cms", scope: "aids", category: "departments", title: "A word from the Head of Department, Dr. Example", text: "A word from the Head of Department: Dr. Example, HOD. Welcome to the department.", sourceUrl: "/about", verifiedOn: null, reviewBy: null }),
  chunk("cms/events/hack-example#0", { source: "cms", scope: "aids", category: "events", title: "Example Hackathon", text: "Example Hackathon: a Sophia Forum event (upcoming). Date: 2026-12-05. Venue: Example Hall.", sourceUrl: "/events/hack-example", verifiedOn: null, reviewBy: null }),
];
const retriever = new KeywordRetriever(CHUNKS);
const top = (q: string, opts = {}) => retriever.search(q, opts)[0]?.chunk.id;
const ids = (q: string, opts = {}) => retriever.search(q, opts).map((r) => r.chunk.id);

describe("keyword retrieval", () => {
  it("ranks the document that matches the question first", () => {
    expect(top("What is the admission process?")).toBe("pce/admissions/process#0");
    expect(top("library opening hours")).toBe("pce/facilities/library#0");
    expect(top("hostel rooms")).toBe("pce/facilities/hostel#0");
    expect(top("upcoming hackathon")).toBe("cms/events/hack-example#0");
  });

  it("finds people by name, including other spellings of the name", () => {
    expect(top("Who is Shubham?")).toBe("cms/team/shubham-example#0");
    expect(top("shubam examplekar")).toBe("cms/team/shubham-example#0");
    expect(top("priti sampleton")).toBe("cms/team/preeti-example#0");
    expect(top("who is the president")).toBe("cms/team/shubham-example#0");
  });

  it("returns citations: each result keeps its source URL", () => {
    const [r] = retriever.search("hackathon");
    expect(r.chunk.sourceUrl).toBe("/events/hack-example");
    expect(r.matched).toContain("hackathon");
  });

  it("returns nothing for a question with no topic words, or no matching words", () => {
    expect(retriever.search("what is it?")).toEqual([]);
    expect(retriever.search("kya hai?")).toEqual([]);
    expect(retriever.search("quantum chromodynamics")).toEqual([]);
    expect(retriever.search("")).toEqual([]);
  });

  it("limit and minScore", () => {
    expect(retriever.search("example", { limit: 2 })).toHaveLength(2);
    expect(retriever.search("admission", { minScore: 1000 })).toEqual([]);
  });

  it("excludes chunks whose review date has passed at query time (live CMS chunks never expire)", () => {
    expect(ids("library", { today: "2027-06-30" })).toContain("pce/facilities/library#0");
    expect(ids("library", { today: "2027-07-01" })).not.toContain("pce/facilities/library#0");
    expect(ids("hackathon", { today: "2099-01-01" })).toEqual(["cms/events/hack-example#0"]);
  });

  it("is deterministic: equal scores are ordered by chunk id", () => {
    const twins = new KeywordRetriever([chunk("b#0", { text: "orientation day" }), chunk("a#0", { text: "orientation day" })]);
    expect(twins.search("orientation").map((r) => r.chunk.id)).toEqual(["a#0", "b#0"]);
    expect(ids("example fees office")).toEqual(ids("example fees office"));
  });

  it("refuses duplicate chunk ids", () => {
    expect(() => new KeywordRetriever([CHUNKS[0], CHUNKS[0]])).toThrow(/Duplicate/);
  });
});

describe("Hinglish and Hindi queries", () => {
  it.each([
    ["admission ka process kya hai", "pce/admissions/process#0"],
    ["pravesh kaise milega", "pce/admissions/process#0"],
    ["college ki fees kitni hai", "pce/admissions/fees#0"],
    ["fees kitna hai bhai", "pce/admissions/fees#0"],
    ["library kab khulti hai", "pce/facilities/library#0"],
    ["pustakalaya ka samay", "pce/facilities/library#0"],
    ["hostel milega kya", "pce/facilities/hostel#0"],
    ["office ka contact batao", "pce/contacts/office#0"],
    ["hod ka message", "cms/hod/message#0"],
    ["shubham kaun hai", "cms/team/shubham-example#0"],
  ])("Hinglish: %s", (q, expected) => {
    expect(top(q)).toBe(expected);
  });

  it.each([
    ["प्रवेश प्रक्रिया क्या है", "pce/admissions/process#0"],
    ["फीस कितनी है", "pce/admissions/fees#0"],
    ["पुस्तकालय कब खुलता है", "pce/facilities/library#0"],
    ["छात्रावास", "pce/facilities/hostel#0"],
    ["संपर्क", "pce/contacts/office#0"],
  ])("Hindi: %s", (q, expected) => {
    expect(top(q)).toBe(expected);
  });

  it("a Hindi document is found by an English or Hinglish question", () => {
    const hi = new KeywordRetriever([chunk("pce/facilities/pustakalaya#0", { language: "hi", title: "पुस्तकालय", text: "पुस्तकालय सोमवार से शनिवार खुला रहता है।" }), CHUNKS[3]]);
    expect(hi.search("library")[0]?.chunk.id).toBe("pce/facilities/pustakalaya#0");
    expect(hi.search("library kab khulti hai")[0]?.chunk.id).toBe("pce/facilities/pustakalaya#0");
  });
});

describe("text analysis", () => {
  it("normalizeText cleans whitespace and control characters, keeps Devanagari", () => {
    expect(normalizeText("  a​ b\r\n\r\n\r\n\tc\u0007 ")).toBe("a b\n\nc");
    expect(normalizeText("कहाँ है")).toBe("कहाँ है");
  });

  it("tokenize keeps Devanagari vowel signs, removes Latin accents, unifies nukta and chandrabindu", () => {
    expect(tokenize("Café, परीक्षा!")).toEqual(["cafe", "परीक्षा"]);
    expect(tokenize("कहाँ")).toEqual(tokenize("कहां"));
    expect(tokenize("ज़रूरी")).toEqual(tokenize("जरूरी"));
  });

  it("analyze drops English, Hinglish and Hindi question words and maps campus words to one concept", () => {
    expect(analyze("What is the fee?").exact).toEqual(["fee"]);
    expect(analyze("fees kitni hai").exact).toEqual(["fee"]);
    expect(analyze("फीस क्या है").exact).toEqual(["fee"]);
    expect(analyze("pravesh प्रवेश admissions").exact).toEqual(["admission", "admission", "admission"]);
  });

  it("multi-word names of a concept become that concept", () => {
    expect(analyze("A word from the Head of the Department").exact).toEqual(["word", "hod"]);
    expect(analyze("vibhag pramukh kaun hai").exact).toEqual(["hod"]);
    expect(analyze("विभाग प्रमुख").exact).toEqual(["hod"]);
  });

  it("fold makes common spelling variants meet", () => {
    expect(fold("shubham")).toBe(fold("shubam"));
    expect(fold("preeti")).toBe(fold("priti"));
    expect(fold("seminars")).toBe(fold("seminar"));
    expect(fold("2026")).toBe("2026");
    expect(fold("परीक्षा")).toBe("परीक्षा");
  });
});
