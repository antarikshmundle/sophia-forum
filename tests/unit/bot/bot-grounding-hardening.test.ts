// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeChunk } from "@/lib/bot/knowledge/types";

/**
 * Stage 4.6 grounding hardening. Evidence is the cited passages only (never the visitor's question); designations and
 * capitalised name words must come from the cited passages. Unit tests on checkGrounding plus the real route with a
 * mocked model that tries each kind of fabrication. Fictional data only.
 */
const cms = vi.hoisted(() => ({ chunks: [] as KnowledgeChunk[] }));
vi.mock("@/lib/bot/knowledge/cms-source", () => ({ loadCmsKnowledge: async () => ({ ok: true, chunks: cms.chunks, failed: [] }) }));

import { checkGrounding, designationsIn, type ModelReply } from "@/lib/bot/grounding";
import type { PromptSource } from "@/lib/bot/prompt";
import { POST } from "@/app/api/bot/chat/route";
import { resetBotRateLimiter } from "@/lib/bot/ratelimit";
import { resetKnowledgeCache } from "@/lib/bot/sources";

const chunk = (id: string, over: Partial<KnowledgeChunk>): KnowledgeChunk => ({
  id, docId: id.split("#")[0], source: "cms", title: "", heading: "", text: "", category: "campus", scope: "aids", language: "en",
  sourceUrl: "/", verifiedOn: null, reviewBy: null, keywords: [], links: [], ...over,
});
const ABOUT = chunk("cms/content/home-about#0", { title: "About Sophia Forum", text: "The student forum of the AI & DS Department at PCE Nagpur. A platform for AI & DS students to connect, collaborate, learn and build together." });
const MILESTONES = chunk("cms/content/milestones#0", { title: "Journey and milestones", sourceUrl: "/about", text: "2020: B.Tech AI & DS begins. The Department of Artificial Intelligence & Data Science starts its B.Tech programme." });
const PRESIDENT = chunk("cms/team/asha-example#0", { title: "Asha Example, President", sourceUrl: "/team/asha-example", text: "Asha Example: President (President), Sophia Forum student council." });
const VICE = chunk("cms/team/vikram-example#0", { title: "Vikram Example, Vice President", sourceUrl: "/team/vikram-example", text: "Vikram Example: Vice President (Vice President), Sophia Forum student council." });
const HOD = chunk("cms/faculty/f-hod#0", { category: "departments", title: "Dr.(Mrs.) A. B. Example, Assistant Professor & HOD", sourceUrl: "/about", keywords: ["faculty"], text: "Dr.(Mrs.) A. B. Example: Assistant Professor & HOD, Artificial Intelligence & Data Science. Listed under Our Mentors (Faculty) on the Sophia Forum About page." });
const FEST = chunk("cms/events/fest-example#0", { category: "events", title: "Example Fest 1.0", sourceUrl: "/events/fest-example", keywords: ["event"], text: "Example Fest 1.0: a Sophia Forum event (already held). Date: 2026-03-01. Venue: Example Hall. Contact: fest@example.org." });

const src = (sid: string, c: KnowledgeChunk): PromptSource => ({ sid, result: { chunk: c, score: 1, baseScore: 1, matched: [], tier: "primary", authority: 1 } });
const reply = (answer: string, citations = ["S1"]): ModelReply => ({ answered: true, answer, citations });
const check = (answer: string, ...cited: KnowledgeChunk[]) => checkGrounding(reply(answer, cited.map((_, i) => `S${i + 1}`)), cited.map((c, i) => src(`S${i + 1}`, c)));

describe("1. the visitor's question is not evidence", () => {
  it("a fee the visitor typed, repeated with an unrelated citation, is rejected", () => {
    // question was "Is the B.Tech fee 95000?"; the cited milestone says nothing about fees
    expect(check("Yes, the B.Tech fee is 95000.", MILESTONES)).toEqual({ ok: false, reason: "unsupported-detail" });
    expect(check("Yes, the B.Tech fee is 95,000.", MILESTONES)).toEqual({ ok: false, reason: "unsupported-detail" });
    expect(check("हाँ, B.Tech की फीस ९५००० है।", MILESTONES)).toEqual({ ok: false, reason: "unsupported-detail" });
  });

  it("an email the visitor typed, repeated as fact, is rejected", () => {
    expect(check("You can write to admissions@example.org.", ABOUT)).toEqual({ ok: false, reason: "unsupported-detail" });
  });

  it("numbers and emails genuinely in the cited passage are accepted", () => {
    expect(check("Example Fest 1.0 was held on 2026-03-01 at Example Hall. Contact fest@example.org.", FEST).ok).toBe(true);
    expect(check("The B.Tech AI & DS programme began in 2020.", MILESTONES).ok).toBe(true);
  });
});

describe("2a. designations must be stated by the cited passages", () => {
  it("designationsIn normalises English, Hindi and Hinglish, longest phrase first", () => {
    expect([...designationsIn("Assistant Professor & HOD")].sort()).toEqual(["assistant professor", "hod"]);
    expect([...designationsIn("Vice President and President")].sort()).toEqual(["president", "vice president"]);
    expect([...designationsIn("the Head of the Department")]).toEqual(["hod"]);
    expect([...designationsIn("उपाध्यक्ष और अध्यक्ष")].sort()).toEqual(["president", "vice president"]);
    expect([...designationsIn("विभागाध्यक्ष")]).toEqual(["hod"]);
    expect([...designationsIn("forum ki adhyaksh aur sachiv")].sort()).toEqual(["president", "secretary"]);
    expect([...designationsIn("the presidents and secretaries")].sort()).toEqual(["president", "secretary"]);
    expect([...designationsIn("Sophia Forum is a student forum")]).toEqual([]);
  });

  it.each<[string, string, KnowledgeChunk]>([
    ["an invented higher post", "Dr.(Mrs.) A. B. Example is the Principal.", HOD],
    ["a changed rank (Assistant → Associate)", "Dr.(Mrs.) A. B. Example is an Associate Professor.", HOD],
    ["a dropped rank qualifier (Assistant Professor → Professor)", "Dr.(Mrs.) A. B. Example is a Professor.", HOD],
    ["a role the record doesn't hold", "Asha Example is the Secretary.", PRESIDENT],
    ["a vice president called president", "Vikram Example is the President.", VICE],
    ["a role on a source that states none", "The forum's president leads it.", ABOUT],
    ["an invented Hindi post", "Dr.(Mrs.) A. B. Example प्राचार्य हैं।", HOD],
    ["an invented Hinglish post", "Asha Example forum ki sachiv hain.", PRESIDENT],
  ])("rejects %s", (_, answer, source) => {
    expect(check(answer, source)).toEqual({ ok: false, reason: "unsupported-designation" });
  });

  it.each<[string, string, KnowledgeChunk]>([
    ["the full published designation", "Dr.(Mrs.) A. B. Example is the Assistant Professor & HOD of Artificial Intelligence & Data Science.", HOD],
    ["HOD spelt out", "Dr.(Mrs.) A. B. Example is the Head of Department.", HOD],
    ["Hindi HOD", "Dr.(Mrs.) A. B. Example विभागाध्यक्ष हैं।", HOD],
    ["Hindi president", "मैं बता सकती हूँ कि Asha Example, Sophia Forum की अध्यक्ष हैं।", PRESIDENT],
    ["Hinglish president", "Main bata sakti hoon ki Asha Example forum ki adhyaksh hain.", PRESIDENT],
    ["vice president", "Vikram Example is the Vice President of the Sophia Forum student council.", VICE],
  ])("accepts %s", (_, answer, source) => {
    expect(check(answer, source).ok).toBe(true);
  });
});

describe("2b. names must come from the cited passages", () => {
  it.each<[string, string, KnowledgeChunk]>([
    ["an invented full name", "Priya Sharma is the President.", PRESIDENT],
    ["an invented single name mid-sentence", "The President is Priya.", PRESIDENT],
    ["an invented title", "Dr. Asha Example is the President.", PRESIDENT],
    ["a real person swapped for an invented one", "Rahul Verma is the Assistant Professor & HOD.", HOD],
    ["an invented place", "Sophia Forum is part of the AI & DS Department at Mumbai University.", ABOUT],
    ["a name inside a Hindi answer", "Sophia Forum के President Priya Sharma हैं।", PRESIDENT],
  ])("rejects %s", (_, answer, source) => {
    expect(check(answer, source)).toEqual({ ok: false, reason: "unsupported-name" });
  });

  it.each<[string, string, KnowledgeChunk[]]>([
    ["a name and title from the record", "Dr.(Mrs.) A. B. Example is the Assistant Professor & HOD.", [HOD]],
    ["the president's answer", "Asha Example is the President of the Sophia Forum student council.", [PRESIDENT]],
    ["an About answer (English)", "Sophia Forum is the student forum of the AI & DS Department at PCE Nagpur. It is a platform for AI & DS students to connect, collaborate, learn and build together.", [ABOUT]],
    ["an About answer (Hindi)", "सोफिया फोरम PCE Nagpur के AI & DS Department का स्टूडेंट फोरम है।", [ABOUT]],
    ["an About answer (Hinglish)", "Main bata sakti hoon ki Sophia Forum PCE Nagpur ke AI & DS Department ka student forum hai. Yeh students ke liye ek platform hai.", [ABOUT]],
    ["ordinary sentence starts", "Please see the event page. Register using the official link. Example Fest 1.0 was held on 2026-03-01.", [FEST]],
    ["two cited sources", "Asha Example is the President and Vikram Example is the Vice President.", [PRESIDENT, VICE]],
  ])("accepts %s", (_, answer, sources) => {
    expect(check(answer, ...sources).ok).toBe(true);
  });
});

describe("through /api/bot/chat (mocked model)", () => {
  const ORIGIN = "https://sophia.example";
  let model: (latest: string) => unknown;
  let calls = 0;

  beforeEach(() => {
    resetBotRateLimiter();
    resetKnowledgeCache();
    cms.chunks = [ABOUT, MILESTONES, PRESIDENT, VICE, HOD, FEST];
    calls = 0;
    for (const [k, v] of Object.entries({ SOPHIA_BOT_ENABLED: "true", GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "test-model-1.0", VERCEL_ENV: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" })) vi.stubEnv(k, v);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init.body));
      const out = model(body.contents.at(-1).parts[0].text);
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(out) }] } }] }));
    }));
  });

  const ask = async (message: string) => {
    const res = await POST(new Request(`${ORIGIN}/api/bot/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ message }),
    }));
    return (await res.json()) as { answer: string; sources: { url: string; title: string }[]; fallback: string | null; language: string };
  };
  const firstId = (latest: string) => /<source id="(S\d+)"/.exec(latest)?.[1] ?? "S1";
  const idOf = (latest: string, title: string) => new RegExp(`<source id="(S\\d+)"[^>]*title="${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).exec(latest)?.[1];

  it("a visitor's wrong fee, repeated by the model with an unrelated citation → rejected, the figure never shown", async () => {
    model = (latest) => ({ answered: true, answer: "Yes, the B.Tech fee is 95000.", citations: [firstId(latest)] });
    const data = await ask("Is the B.Tech fee 95000?");
    expect(calls).toBe(1);
    expect(data).toMatchObject({ fallback: "rejected", sources: [] });
    expect(data.answer).not.toContain("95000");
  });

  it("an invented name → rejected", async () => {
    model = (latest) => ({ answered: true, answer: "Priya Sharma is the President of Sophia Forum.", citations: [idOf(latest, "Asha Example, President") ?? firstId(latest)] });
    const data = await ask("Who is the president of Sophia Forum?");
    expect(data).toMatchObject({ fallback: "rejected", sources: [] });
    expect(data.answer).not.toContain("Priya");
  });

  it("an invented designation → rejected", async () => {
    model = (latest) => ({ answered: true, answer: "Dr.(Mrs.) A. B. Example is the Principal of PCE.", citations: [idOf(latest, "Dr.(Mrs.) A. B. Example, Assistant Professor & HOD") ?? firstId(latest)] });
    const data = await ask("Who is the HOD of AI & DS?");
    expect(data).toMatchObject({ fallback: "rejected", sources: [] });
  });

  it("the HOD answer, as the model really phrased it in the smoke test, still passes with its citation", async () => {
    model = (latest) => ({ answered: true, answer: "Dr.(Mrs.) A. B. Example is the Assistant Professor & HOD of Artificial Intelligence & Data Science.", citations: [idOf(latest, "Dr.(Mrs.) A. B. Example, Assistant Professor & HOD")!] });
    const data = await ask("Who is the HOD of AI & DS?");
    expect(data.fallback).toBeNull();
    expect(data.answer).toBe("Dr.(Mrs.) A. B. Example is the Assistant Professor & HOD of Artificial Intelligence & Data Science.");
    expect(data.sources).toEqual([expect.objectContaining({ url: "/about", title: "Dr.(Mrs.) A. B. Example, Assistant Professor & HOD" })]);
  });

  it("the President answer still passes (English, Hindi with the feminine voice, Hinglish)", async () => {
    for (const [q, answer, lang] of [
      ["Who is the president of Sophia Forum?", "Asha Example is the President of the Sophia Forum student council.", "en"],
      ["सोफिया फोरम के अध्यक्ष कौन हैं?", "मैं बता सकती हूँ कि Asha Example, Sophia Forum की President हैं।", "hi"],
      ["forum ka adhyaksh kaun hai", "Main bata sakti hoon ki Asha Example forum ki President hain.", "hinglish"],
    ] as const) {
      model = (latest) => ({ answered: true, answer, citations: [idOf(latest, "Asha Example, President")!] });
      const data = await ask(q);
      expect(data).toMatchObject({ fallback: null, language: lang, answer, sources: [{ url: "/team/asha-example" }] });
    }
  });

  it("unsupported claims still return the safe fallbacks", async () => {
    model = () => ({ answered: false, answer: "The hostel fee is 90000.", citations: [] });
    const notIn = await ask("What is the hostel fee for B.Tech students?");
    expect(["not-in-sources", "no-sources"]).toContain(notIn.fallback);
    expect(notIn.answer).not.toContain("90000");
    const none = await ask("What is the canteen menu?");
    expect(none).toMatchObject({ fallback: "no-sources", sources: [] });
  });

  it("clarification handling is unchanged (no model call)", async () => {
    const data = await ask("Who leads the student council?");
    expect(data.fallback).toBe("clarify");
    expect(calls).toBe(0);
  });
});
