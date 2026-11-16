import { CHAT_LIMITS } from "./config";
import type { PromptSource } from "./prompt";

/**
 * Checks a model reply before anyone sees it. The reply is rejected (and a fixed fallback shown instead) when:
 *  - it isn't the expected JSON;
 *  - it claims an answer but cites nothing, or cites an id that wasn't among this question's sources (fabricated
 *    citation), or uses an inline [S#] marker that it doesn't cite;
 *  - it contains a link that is not the link of a cited source or a link inside a cited passage (fabricated link);
 *  - it contains an email address, or a number of three or more digits (fees, phone numbers, years …), that is not in
 *    the cited passages (fabricated detail). The visitor's question is NOT evidence: a figure the visitor typed
 *    ("Is the fee 50000?") can't be repeated as fact on the strength of an unrelated citation;
 *  - it names a designation (President, Vice President, Assistant Professor, HOD, Principal …, also in Hindi and
 *    Hinglish) that the cited passages don't state (unsupported designation);
 *  - it contains a capitalised name word (a person, a title such as Dr., a place) that the cited passages don't contain
 *    (unsupported name).
 * Evidence is only the cited passages' title, heading and text. A reply with answered=false is reported as such: the
 * caller shows the honest "not in my sources" reply. Any other failure shows the fixed "rejected" fallback.
 */

export interface ModelReply {
  answered: boolean;
  answer: string;
  citations: string[];
}

export type GroundingResult =
  | { ok: true; answer: string; cited: PromptSource[] }
  | {
      ok: false;
      reason: "malformed" | "not-answered" | "no-citations" | "invalid-citation" | "fabricated-link" | "unsupported-detail" | "unsupported-designation" | "unsupported-name" | "too-long";
    };

export function parseModelReply(text: string): ModelReply | null {
  let value: unknown;
  try {
    value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  const v = value as Partial<ModelReply> | null;
  if (!v || typeof v !== "object" || typeof v.answered !== "boolean" || typeof v.answer !== "string" || !Array.isArray(v.citations)) return null;
  if (!v.citations.every((c) => typeof c === "string")) return null;
  return { answered: v.answered, answer: v.answer, citations: v.citations };
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()"'\]]+|\bwww\.[^\s<>()"'\]]+/gi;
const MARKDOWN_LINK_TARGET = /\]\(\s*([^)\s]+)\s*\)/g;
// a site path such as /events/x (not "AI/DS", "24/7" or "and/or": the slash must not follow a letter or digit)
const SITE_PATH_IN_TEXT = /(?<![\w/.:])(\/[a-z0-9][a-z0-9\-_/]*)/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MARKER = /\[\s*(S\d+)\s*\]/gi;
const DEVANAGARI_DIGITS = /[०-९]/g;

const asciiDigits = (s: string) => s.replace(DEVANAGARI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966));
const digitsOnly = (s: string) => asciiDigits(s).replace(/(?<=\d)[,\s.](?=\d)/g, "");
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "");

// ---------------------------------------------------------------- designations

/** Designations, longest first: "Assistant Professor" is checked as a whole, never as a bare "Professor". */
const DESIGNATIONS = [
  "chief head secretary", "joint secretary", "vice president", "vice principal", "co-treasurer", "sub-coordinator",
  "assistant professor", "associate professor", "president", "secretary", "treasurer", "coordinator", "principal",
  "professor", "hod", "dean", "director", "registrar", "chairman", "chairperson", "lecturer", "convener", "founder",
];
const DESIGNATION_RE = DESIGNATIONS.map((d) => [d, new RegExp(`(?<![\\p{L}\\p{N}])${d.replace(/[- ]/g, "[- ]?")}(?![\\p{L}\\p{N}])`, "gu")] as const);

/** Hindi and Hinglish designation words → the English designation (whole words only; longest first). */
const DESIGNATION_SYNONYMS: [RegExp, string][] = [
  [/(?<![\p{L}\p{M}])संयुक्त\s*सचिव(?![\p{L}\p{M}])/gu, "joint secretary"],
  [/(?<![\p{L}\p{M}])(?:उपाध्यक्ष|वाइस\s*प्रेसिडेंट)(?![\p{L}\p{M}])/gu, "vice president"],
  [/(?<![\p{L}\p{M}])(?:उप-?प्राचार्य|वाइस\s*प्रिंसिपल)(?![\p{L}\p{M}])/gu, "vice principal"],
  [/(?<![\p{L}\p{M}])(?:विभागाध्यक्ष|विभाग\s*प्रमुख|एचओडी)(?![\p{L}\p{M}])/gu, "hod"],
  [/(?<![\p{L}\p{M}])(?:सहायक\s*प्राध्यापक|असिस्टेंट\s*प्रोफेसर)(?![\p{L}\p{M}])/gu, "assistant professor"],
  [/(?<![\p{L}\p{M}])(?:सह\s*प्राध्यापक|एसोसिएट\s*प्रोफेसर)(?![\p{L}\p{M}])/gu, "associate professor"],
  [/(?<![\p{L}\p{M}])कोषाध्यक्ष(?![\p{L}\p{M}])/gu, "treasurer"],
  [/(?<![\p{L}\p{M}])(?:अध्यक्ष|प्रेसिडेंट)(?![\p{L}\p{M}])/gu, "president"],
  [/(?<![\p{L}\p{M}])(?:सचिव|सेक्रेटरी)(?![\p{L}\p{M}])/gu, "secretary"],
  [/(?<![\p{L}\p{M}])(?:प्राचार्य|प्रिंसिपल)(?![\p{L}\p{M}])/gu, "principal"],
  [/(?<![\p{L}\p{M}])(?:प्राध्यापक|प्रोफेसर)(?![\p{L}\p{M}])/gu, "professor"],
  [/(?<![\p{L}\p{M}])(?:समन्वयक|कोऑर्डिनेटर)(?![\p{L}\p{M}])/gu, "coordinator"],
  [/(?<![\p{L}\p{M}])(?:निदेशक|डायरेक्टर)(?![\p{L}\p{M}])/gu, "director"],
  [/(?<![\p{L}\p{M}])(?:अधिष्ठाता|डीन)(?![\p{L}\p{M}])/gu, "dean"],
  [/\bupadhyaksha?\b/gi, "vice president"],
  [/\bkoshadhyaksha?\b/gi, "treasurer"],
  [/\bvibhagadhyaksha?\b/gi, "hod"],
  [/\badhyaksha?\b/gi, "president"],
  [/\bsachiv\b/gi, "secretary"],
  [/\b(?:pradhanacharya|pracharya)\b/gi, "principal"],
  [/\bheads? of (?:the )?(?:department|dept)\b/gi, "hod"],
  [/\b(president|secretar(?:y|ie)|treasurer|coordinator|principal|professor|director|dean|registrar|lecturer|convener|founder|hod)s\b/gi, "$1"],
];

/** The designations a text states, normalised to their English form. */
export function designationsIn(text: string): Set<string> {
  let t = text.normalize("NFKC").toLowerCase();
  for (const [re, to] of DESIGNATION_SYNONYMS) t = t.replace(re, ` ${to} `);
  t = t.replace(/secretarie\b/g, "secretary");
  const found = new Set<string>();
  for (const [name, re] of DESIGNATION_RE) {
    t = t.replace(re, () => { found.add(name); return " "; });
  }
  return found;
}

// ---------------------------------------------------------------- names

/**
 * Capitalised words that are not claims about a specific person or place: function words, sentence starters
 * (English and Hinglish), months, weekdays, languages, designation words (checked separately above) and the bot's
 * own identity (the system instruction names the AI & DS Department of PCE Nagpur and Sophia Forum).
 */
const GENERIC = new Set(
  (
    "a an the and or of for to in on at by with from as is are was were be it its this that these those there here they them their " +
    "he she his her we our you your i yes no not also both each every all some many any according however currently please sorry " +
    "main mein yeh ye woh wo aap haan ji iska iski iske uska uski uske unka unki unke inka inki inke " +
    "january february march april may june july august september october november december " +
    "monday tuesday wednesday thursday friday saturday sunday english hindi hinglish " +
    "president vice secretary joint chief head treasurer co sub coordinator principal professor assistant associate hod dean " +
    "director registrar chairman chairperson lecturer convener founder department " +
    "sophia forum bot ai ds aids pce nagpur artificial intelligence data science"
  ).split(" "),
);

/** Lowercase Latin words of a text, with hyphen parts and without a possessive 's. */
function latinWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
    const w = m[0].toLowerCase().replace(/['’]s$/, "").replace(/-+$/, "");
    out.add(w);
    for (const part of w.split("-")) if (part) out.add(part);
  }
  return out;
}

// sentence ends: after a word of 3+ letters, a digit or a closing bracket/quote (so "Dr." and "S. S." don't split)
const SENTENCE_END = /(?<=(?:\p{L}{3,}|\d|[)\]"'”]))[.!?](?:\s+|$)|।\s*|\n+/u;

/**
 * Capitalised Latin words of the answer that the evidence doesn't contain. The first word of a sentence is checked
 * only when another capitalised word follows it directly (a multi-word name such as "Rohit Kadway"); otherwise an
 * ordinary sentence start ("Register at …") would be mistaken for a name.
 */
function unsupportedNames(answer: string, evidence: Set<string>): string[] {
  const missing: string[] = [];
  for (const sentence of answer.split(SENTENCE_END)) {
    const words = [...sentence.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => m[0]);
    words.forEach((word, i) => {
      if (!/^[A-Z]/.test(word) || word.length < 2) return;
      if (i === 0 && !/^[A-Z]/.test(words[1] ?? "")) return;
      const w = word.toLowerCase().replace(/['’]s$/, "").replace(/-+$/, "");
      const parts = w.split("-").filter(Boolean);
      const known = (x: string) => evidence.has(x) || GENERIC.has(x);
      if (!known(w) && !parts.every(known)) missing.push(word);
    });
  }
  return missing;
}

export function checkGrounding(reply: ModelReply, sources: PromptSource[]): GroundingResult {
  if (!reply.answered) return { ok: false, reason: "not-answered" };
  const answer = reply.answer.trim();
  if (!answer) return { ok: false, reason: "malformed" };
  if (answer.length > CHAT_LIMITS.maxAnswerChars) return { ok: false, reason: "too-long" };

  const byId = new Map(sources.map((s) => [s.sid.toUpperCase(), s]));
  const citedIds = [...new Set(reply.citations.map((c) => c.trim().toUpperCase()))];
  if (!citedIds.length) return { ok: false, reason: "no-citations" };
  if (citedIds.some((id) => !byId.has(id))) return { ok: false, reason: "invalid-citation" };
  for (const m of answer.matchAll(MARKER)) if (!citedIds.includes(m[1].toUpperCase())) return { ok: false, reason: "invalid-citation" };
  const cited = citedIds.map((id) => byId.get(id)!);

  // links: only the cited sources' own links, or links inside the cited passages
  const allowed = new Set<string>();
  for (const s of cited) {
    allowed.add(trimUrl(s.result.chunk.sourceUrl));
    for (const l of s.result.chunk.links) allowed.add(trimUrl(l));
  }
  const linkText = [...answer.matchAll(URL_IN_TEXT)].map((m) => trimUrl(m[0]));
  const linkTargets = [...answer.matchAll(MARKDOWN_LINK_TARGET)].map((m) => trimUrl(m[1]));
  const sitePaths = [...answer.replace(URL_IN_TEXT, " ").matchAll(SITE_PATH_IN_TEXT)].map((m) => trimUrl(m[1]));
  if ([...linkText, ...linkTargets, ...sitePaths].some((u) => !allowed.has(u))) return { ok: false, reason: "fabricated-link" };

  // evidence: the cited passages only (never the visitor's question or earlier messages)
  const evidence = cited.map((s) => `${s.result.chunk.title}\n${s.result.chunk.heading}\n${s.result.chunk.text}`).join("\n");

  // details: emails and numbers must come from the cited passages
  const evidenceLower = evidence.toLowerCase();
  if ((answer.match(EMAIL) ?? []).some((e) => !evidenceLower.includes(e.toLowerCase()))) return { ok: false, reason: "unsupported-detail" };
  const evidenceDigits = digitsOnly(evidence);
  const numbers = (digitsOnly(answer).match(/\d{3,}/g) ?? []);
  if (numbers.some((n) => !evidenceDigits.includes(n))) return { ok: false, reason: "unsupported-detail" };

  // the text the visitor will see (no [S#] markers, no tags); designations and names are checked on it
  const clean = answer
    .replace(MARKER, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/[ \t]+([.,;:!?।])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // designations: each one the answer states must be stated by the cited passages
  const evidenceDesignations = designationsIn(evidence);
  if ([...designationsIn(clean)].some((d) => !evidenceDesignations.has(d))) return { ok: false, reason: "unsupported-designation" };

  // names: capitalised name words must come from the cited passages
  if (unsupportedNames(clean, latinWords(evidence)).length) return { ok: false, reason: "unsupported-name" };

  return { ok: true, answer: clean, cited };
}
