// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeChunk } from "@/lib/bot/knowledge/types";

/**
 * Stage 4.1 multilingual regressions. Every case here reproduces a failure found by the multilingual evaluation
 * (English, Hindi, Hinglish, paraphrases, typos, mixed script) before its fix. Fictional example data; the model is
 * mocked (no Gemini call), and the CMS read is replaced by fixture chunks.
 */
const cms = vi.hoisted(() => ({ chunks: [] as KnowledgeChunk[] }));
vi.mock("@/lib/bot/knowledge/cms-source", () => ({ loadCmsKnowledge: async () => ({ ok: true, chunks: cms.chunks, failed: [] }) }));

import { analyze } from "@/lib/bot/knowledge/text";
import { KeywordRetriever, withinOneEdit } from "@/lib/bot/knowledge/retrieve";
import { detectLanguage, FALLBACK_TEXT, LANGUAGE_INSTRUCTION } from "@/lib/bot/language";
import { SYSTEM_INSTRUCTION } from "@/lib/bot/prompt";
import { POST } from "@/app/api/bot/chat/route";
import { resetBotRateLimiter } from "@/lib/bot/ratelimit";
import { resetKnowledgeCache } from "@/lib/bot/sources";

const chunk = (id: string, over: Partial<KnowledgeChunk>): KnowledgeChunk => ({
  id, docId: id.split("#")[0], source: "cms", title: "", heading: "", text: "", category: "campus", scope: "aids", language: "en",
  sourceUrl: "/", verifiedOn: null, reviewBy: null, keywords: [], links: [], ...over,
});

// shaped like the CMS adapter's output (team wording, event/faculty keywords)
const CHUNKS: KnowledgeChunk[] = [
  chunk("cms/content/home-about#0", { title: "About Sophia Forum", text: "The student forum of the AI & DS Department at PCE Nagpur. Technical Events · Student Community" }),
  chunk("cms/content/milestones#0", { title: "Journey and milestones", sourceUrl: "/about", text: "2020: B.Tech AI & DS begins. The Department of Artificial Intelligence & Data Science starts its B.Tech programme." }),
  chunk("cms/team/asha-example#0", { title: "Asha Example, President", sourceUrl: "/team/asha-example", text: "Asha Example: President (President), Sophia Forum student council." }),
  chunk("cms/team/vikram-example#0", { title: "Vikram Example, Vice President", sourceUrl: "/team/vikram-example", text: "Vikram Example: Vice President (Vice President), Sophia Forum student council." }),
  chunk("cms/team/neha-example#0", { title: "Neha Example, Secretary", sourceUrl: "/team/neha-example", text: "Neha Example: Secretary (Secretary), Sophia Forum student council." }),
  chunk("cms/team/arjun-example#0", { title: "Arjun Example, Treasurer", sourceUrl: "/team/arjun-example", text: "Arjun Example: Treasurer (Finance & Treasury), Sophia Forum student council." }),
  // like the real committee records: the role is e.g. "Ambience - Coordinator", the category "Event Management Team"
  chunk("cms/team/meera-example#0", { title: "Meera Example, Ambience - Coordinator", sourceUrl: "/team/meera-example", text: "Meera Example: Ambience - Coordinator (Event Management Team), Sophia Forum student council." }),
  chunk("cms/faculty/f-one#0", { category: "departments", title: "Dr. Example One, Assistant Professor", sourceUrl: "/about", keywords: ["faculty"], text: "Dr. Example One: Assistant Professor, Artificial Intelligence & Data Science. Listed under Our Mentors (Faculty) on the Sophia Forum About page." }),
  chunk("cms/faculty/f-hod#0", { category: "departments", title: "Dr. Example Head, Professor & HOD", sourceUrl: "/about", keywords: ["faculty"], text: "Dr. Example Head: Professor & HOD, Artificial Intelligence & Data Science. Listed under Our Mentors (Faculty) on the Sophia Forum About page." }),
  chunk("cms/events/fest-example#0", { category: "events", title: "Example Fest 1.0", sourceUrl: "/events/fest-example", keywords: ["event"], text: "Example Fest 1.0: a Sophia Forum, the student forum of the AI & DS Department at PCE Nagpur event (already held). Date: 2026-03-01. Venue: Example Hall." }),
];
const retriever = new KeywordRetriever(CHUNKS);
const top = (q: string, n = 1) => retriever.search(q, { limit: n }).map((r) => r.chunk.docId);

describe("A. committee roles in Hindi and Hinglish", () => {
  it("role words map to the English role the records use; विभागाध्यक्ष stays HOD", () => {
    expect(analyze("अध्यक्ष").exact).toEqual(["president"]);
    expect(analyze("adhyaksh adhyaksha").exact).toEqual(["president", "president"]);
    expect(analyze("उपाध्यक्ष").exact).toEqual(["vice", "president"]);
    expect(analyze("upadhyaksh").exact).toEqual(["vice", "president"]);
    expect(analyze("सचिव sachiv").exact).toEqual(["secretary", "secretary"]);
    expect(analyze("कोषाध्यक्ष koshadhyaksh").exact).toEqual(["treasurer", "treasurer"]);
    expect(analyze("विभागाध्यक्ष").exact).toEqual(["hod"]);
  });

  it.each([
    ["सोफिया फोरम के अध्यक्ष कौन हैं?", "cms/team/asha-example"],
    ["forum ka adhyaksh kaun hai", "cms/team/asha-example"],
    ["उपाध्यक्ष कौन है?", "cms/team/vikram-example"],
    ["सचिव कौन है?", "cms/team/neha-example"],
    ["sachiv kaun hai", "cms/team/neha-example"],
    ["कोषाध्यक्ष कौन है?", "cms/team/arjun-example"],
  ])("%s → %s", (q, expected) => {
    expect(top(q)).toEqual([expected]);
  });
});

describe("B. typo tolerance", () => {
  it("withinOneEdit: one insertion, deletion, substitution or adjacent swap; not two", () => {
    for (const [a, b] of [["presidnt", "president"], ["tresurer", "treasurer"], ["facalty", "faculty"], ["rohti", "rohit"], ["forum", "forum"]]) expect(withinOneEdit(a, b)).toBe(true);
    for (const [a, b] of [["forms", "forum"], ["fees", "free"], ["presdnt", "president"], ["ab", "abcd"]]) expect(withinOneEdit(a, b)).toBe(false);
  });

  it.each([
    ["presidnt of forum?", "cms/team/asha-example"],
    ["who is tresurer", "cms/team/arjun-example"],
    ["secretry kaun hai", "cms/team/neha-example"],
  ])("%s → %s", (q, expected) => {
    expect(top(q)).toEqual([expected]);
  });

  it("facalty list → faculty cards", () => {
    expect(top("facalty list", 2).every((d) => d.startsWith("cms/faculty/"))).toBe(true);
  });

  it("is conservative: known words, short words and far-off words are never 'corrected'", () => {
    expect(retriever.search("quantum chromodynamics")).toEqual([]); // nothing one edit away
    expect(retriever.search("presdnt")).toEqual([]); // two edits away from president
    expect(retriever.search("secy")).toEqual([]); // too short to correct
    // a correctly spelled word that exists is matched exactly, not fuzzily widened
    expect(retriever.search("treasurer").map((r) => r.chunk.docId)).toEqual(["cms/team/arjun-example"]);
  });
});

describe("C. event and faculty records outrank passages that merely mention them", () => {
  it.each([
    ["kaun kaun se events hue hain?", "cms/events/fest-example"],
    ["फोरम ने कौन से कार्यक्रम किए हैं?", "cms/events/fest-example"],
  ])("%s → the event record first", (q, expected) => {
    expect(top(q)).toEqual([expected]);
  });

  it("विभाग के शिक्षक कौन हैं? → faculty cards in the top results", () => {
    expect(top("विभाग के शिक्षक कौन हैं?", 3).filter((d) => d.startsWith("cms/faculty/")).length).toBeGreaterThanOrEqual(1);
  });

  it("verb forms like hue/किए carry no topic", () => {
    expect(analyze("events hue hain kiye").exact).toEqual(["event"]);
    expect(analyze("कार्यक्रम किए हुए").exact).toEqual(["event"]);
  });
});

describe("D. paraphrases", () => {
  it("'who heads the … department' and 'department head' mean HOD; 'teaches' means faculty", () => {
    expect(analyze("Who heads the AI and DS department?").exact).toEqual(["hod"]);
    expect(analyze("department head").exact).toEqual(["hod"]);
    expect(analyze("who teaches here").exact).toEqual(["faculty"]); // "who" and "here" are stopwords
    expect(top("Who heads the AI and DS department?")).toEqual(["cms/faculty/f-hod"]);
    expect(top("Who teaches in the department?", 3).some((d) => d.startsWith("cms/faculty/"))).toBe(true);
  });

  it("'head of the department' still works, and other uses of 'head' are untouched", () => {
    expect(analyze("head of the department").exact).toEqual(["hod"]);
    expect(analyze("head coach").exact).toEqual(["head", "coach"]);
  });
});

describe("E. mixed-script language detection", () => {
  it.each([
    ["forum ke faculty mentors कौन हैं?", "hi"],
    ["president कौन है forum का?", "hi"],
    ["Sophia Forum का mission क्या है?", "hi"],
    ["AI & DS के HOD कौन हैं?", "hi"],
    ["Who is the president of Sophia Forum?", "en"],
    ["faculty mein kaun kaun hai", "hinglish"],
  ])("%s → %s", (q, lang) => {
    expect(detectLanguage(q)).toBe(lang);
  });
});

describe("natural, gender-neutral fixed replies", () => {
  it("Hindi and Hinglish fallbacks use no gendered first-person forms", () => {
    for (const texts of Object.values(FALLBACK_TEXT)) {
      // whole words only (सका also occurs inside इसका, "its")
      expect(texts.hi).not.toMatch(/(?<![\p{L}\p{M}])(?:हूँ|मैं|सका|सकी|सकता|सकती|लगाऊँगा|लगाऊँगी)(?![\p{L}\p{M}])|(?:दे|कर) (?:पा )?रहा हूँ/u);
      expect(texts.hinglish).not.toMatch(/\bmain\b|\bhoon\b|karunga|sakta\b|\bde pa raha\b|de paaya/i);
      expect(texts.hi).toMatch(/[ऀ-ॿ]/);
    }
  });

  it("the language instructions ask for natural wording and untranslated names and designations", () => {
    expect(LANGUAGE_INSTRUCTION.hi).toMatch(/^Answer in Hindi, written in Devanagari script/);
    expect(LANGUAGE_INSTRUCTION.hi).toMatch(/not a word-for-word translation/);
    expect(LANGUAGE_INSTRUCTION.hi).toMatch(/official designations.*exactly as written in the sources; do not translate or transliterate/);
    expect(LANGUAGE_INSTRUCTION.hinglish).toMatch(/^Answer in Hinglish/);
    expect(LANGUAGE_INSTRUCTION.hinglish).toMatch(/natural and conversational/);
    expect(LANGUAGE_INSTRUCTION.hinglish).toMatch(/official designations.*do not translate/);
  });
});

describe("end to end through /api/bot/chat (mocked model)", () => {
  const ORIGIN = "https://sophia.example";
  let sent: { contents: { parts: { text: string }[] }[] }[] = [];

  beforeEach(() => {
    resetBotRateLimiter();
    resetKnowledgeCache();
    cms.chunks = CHUNKS;
    sent = [];
    for (const [k, v] of Object.entries({ SOPHIA_BOT_ENABLED: "true", GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "test-model-1.0", VERCEL_ENV: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" })) vi.stubEnv(k, v);
    vi.spyOn(console, "error").mockImplementation(() => {});
    // mock model: answers in the requested language from the first source, keeping the name and designation as written
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push(body);
      const text: string = body.contents.at(-1).parts[0].text;
      const m = /<source id="(S\d+)"[^>]*title="([^"]+)"/.exec(text);
      const hindi = /Language: Answer in Hindi/.test(text);
      const reply = m
        ? { answered: true, answer: hindi ? `स्रोत के अनुसार: ${m[2]}।` : `${m[2]} is the president.`, citations: [m[1]] }
        : { answered: false, answer: "", citations: [] };
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
    }));
  });

  const ask = async (message: string) => {
    const res = await POST(new Request(`${ORIGIN}/api/bot/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ message }),
    }));
    return res.json();
  };

  it("a Hindi role question finds the president, is answered in Hindi, and keeps the citation and the English name", async () => {
    const data = await ask("सोफिया फोरम के अध्यक्ष कौन हैं?");
    expect(data).toMatchObject({ fallback: null, language: "hi", sources: [{ url: "/team/asha-example", title: "Asha Example, President" }] });
    expect(data.answer).toContain("Asha Example, President");
    expect(sent[0].contents.at(-1)!.parts[0].text).toMatch(/do not translate or transliterate them/);
  });

  it("a typo still reaches the right record", async () => {
    const data = await ask("who is the presidnt of sophia forum?");
    expect(data).toMatchObject({ fallback: null, sources: [{ url: "/team/asha-example" }] });
  });

  it("unsupported questions in all three languages still get the honest fallback, never an answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ answered: false, answer: "The fee is 90000", citations: [] }) }] } }] }))));
    for (const [q, lang] of [["What is the B.Tech fee?", "en"], ["B.Tech fees kitni hai?", "hinglish"], ["विभाग का संपर्क नंबर क्या है?", "hi"]] as const) {
      const data = await ask(q);
      expect(["no-sources", "not-in-sources"]).toContain(data.fallback);
      expect(data.language).toBe(lang);
      expect(data.sources).toEqual([]);
      expect(data.answer).not.toMatch(/90000/);
    }
  });
});

describe("feminine voice in Hindi and Hinglish (approved persona)", () => {
  it("the system instruction sets the feminine first person for Hindi/Hinglish only, and never for other people", () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/9\. Voice: in Hindi and Hinglish, Sophia Bot refers to herself in the feminine first person/);
    expect(SYSTEM_INSTRUCTION).toContain("मैं बता सकती हूँ");
    expect(SYSTEM_INSTRUCTION).toContain("main bata sakti hoon");
    expect(SYSTEM_INSTRUCTION).toMatch(/never with masculine forms/);
    expect(SYSTEM_INSTRUCTION).toMatch(/English answers are unchanged/);
    expect(SYSTEM_INSTRUCTION).toMatch(/never guess the gender of people in the sources; refer to them by name and designation exactly as written/);
  });

  it("Hindi instruction: feminine examples, masculine forms ruled out, names and designations untouched", () => {
    for (const form of ["मैं बता सकती हूँ", "मैं मदद कर सकती हूँ", "मैं समझा सकती हूँ"]) expect(LANGUAGE_INSTRUCTION.hi).toContain(form);
    expect(LANGUAGE_INSTRUCTION.hi).toMatch(/never masculine forms such as "सकता हूँ" or "बताता हूँ"/);
    expect(LANGUAGE_INSTRUCTION.hi).toMatch(/Do not guess anyone else's gender/);
    expect(LANGUAGE_INSTRUCTION.hi).toMatch(/official designations.*exactly as written in the sources; do not translate or transliterate/);
  });

  it("Hinglish instruction: feminine examples, masculine forms ruled out", () => {
    for (const form of ["main bata sakti hoon", "main help kar sakti hoon", "main samjha sakti hoon"]) expect(LANGUAGE_INSTRUCTION.hinglish).toContain(form);
    expect(LANGUAGE_INSTRUCTION.hinglish).toMatch(/never masculine forms such as "sakta hoon" or "batata hoon"/);
    expect(LANGUAGE_INSTRUCTION.hinglish).toMatch(/Do not guess anyone else's gender/);
  });

  it("English is unchanged", () => {
    expect(LANGUAGE_INSTRUCTION.en).toBe("Answer in English.");
  });

  it("fixed fallbacks stay factual and gender-neutral (no first-person verb forms in any language variant)", () => {
    for (const texts of Object.values(FALLBACK_TEXT)) {
      expect(texts.hi).not.toMatch(/(?<![\p{L}\p{M}])(?:हूँ|सकती|सकता|बताती|बताता|देती|देता)(?![\p{L}\p{M}])/u);
      expect(texts.hinglish).not.toMatch(/\b(?:hoon|sakti|sakta|batati|batata|deti|deta)\b/i);
    }
  });

  describe("the instructions reach the model (mocked)", () => {
    const ORIGIN = "https://sophia.example";
    let sent: { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] }[] = [];

    beforeEach(() => {
      resetBotRateLimiter();
      resetKnowledgeCache();
      cms.chunks = CHUNKS;
      sent = [];
      for (const [k, v] of Object.entries({ SOPHIA_BOT_ENABLED: "true", GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "test-model-1.0", VERCEL_ENV: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" })) vi.stubEnv(k, v);
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ answered: true, answer: "Asha Example, President.", citations: ["S1"] }) }] } }] }));
      }));
    });

    const ask = (message: string) => POST(new Request(`${ORIGIN}/api/bot/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ message }),
    }));
    const latest = () => sent[0].contents.at(-1)!.parts[0].text;

    it.each([
      ["सोफिया फोरम के अध्यक्ष कौन हैं?", "मैं बता सकती हूँ"],
      ["forum ka adhyaksh kaun hai", "main bata sakti hoon"],
    ])("%s → the feminine voice is requested", async (q, form) => {
      await ask(q);
      expect(sent[0].systemInstruction.parts[0].text).toBe(SYSTEM_INSTRUCTION);
      expect(latest()).toContain(form);
    });

    it("an English question gets only 'Answer in English.' in its language line", async () => {
      await ask("Who is the president of Sophia Forum?");
      expect(latest()).toMatch(/Language: Answer in English\.$/);
      expect(latest()).not.toMatch(/सकती|sakti/);
    });
  });
});
