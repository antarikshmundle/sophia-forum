import { isCalendarDate } from "../../cms/validation.ts";

/**
 * SOPHIA BOT knowledge documents (Stage 1). A document is one Markdown file under knowledge/pce/<category>/ with a strict
 * front-matter block (the metadata) followed by the content. Only documents that pass every check below, are marked
 * `status: verified` and are within their review date ever reach the retrieval index; everything else is reported and
 * left out. This module has no dependencies outside src/lib so the offline index builder can run it with plain Node.
 *
 *   ---
 *   title: B.Tech admission process
 *   category: admissions
 *   scope: pce                      (aids | pce | other-dept)
 *   source_url: https://…            (the official page, or the published location of the supplied document)
 *   verified_by: AI & DS Department office
 *   verified_on: 2026-11-12
 *   review_by: 2027-06-30
 *   status: verified                (draft | verified)
 *   language: en                    (optional: en | hi; default en)
 *   keywords: pravesh, दाखिला         (optional: extra search terms, comma-separated)
 *   ---
 *   <content in Markdown>
 */

export const KNOWLEDGE_CATEGORIES = [
  "college", "departments", "academics", "admissions", "facilities", "contacts", "campus", "policies", "events",
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/**
 * Scope = which knowledge tier a document belongs to (docs/sophia-bot/KNOWLEDGE_BASE.md §2; ranking in priority.ts):
 *   aids        PRIMARY     AI & DS Department and Sophia Forum (verified department sources)
 *   pce         SECONDARY   PCE-wide institutional information (official PCE sources)
 *   other-dept  SUPPORTING  other PCE departments (basic information, cross-campus activities)
 */
export const KNOWLEDGE_SCOPES = ["aids", "pce", "other-dept"] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const DOCUMENT_STATUSES = ["draft", "verified"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_LANGUAGES = ["en", "hi"] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

export const REQUIRED_FIELDS = ["title", "category", "scope", "source_url", "verified_by", "verified_on", "review_by", "status"] as const;
export const OPTIONAL_FIELDS = ["language", "keywords"] as const;
const KNOWN_FIELDS = new Set<string>([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

/** A verification is valid for at most this many days (one academic year): review_by - verified_on. */
export const MAX_REVIEW_DAYS = 366;
export const MAX_TITLE_CHARS = 200;
export const MAX_CONTENT_CHARS = 20_000;
export const MAX_KEYWORDS = 30;
const MAX_FIELD_CHARS = 500;

export interface KnowledgeDocument {
  /** knowledge-root-relative path without ".md", e.g. "pce/admissions/btech-admission-process" */
  id: string;
  path: string;
  title: string;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  sourceUrl: string;
  verifiedBy: string;
  verifiedOn: string;
  reviewBy: string;
  status: "verified";
  language: DocumentLanguage;
  keywords: string[];
  content: string;
}

/**
 * Why a document is left out of the index:
 *   invalid-metadata  the front matter is malformed, or a field is missing or invalid
 *   missing-source    no source_url
 *   invalid-content   empty, too long, raw HTML, an unsafe link, or placeholder text
 *   draft             status is draft (never indexed, whatever else it contains)
 *   expired           review_by has passed: re-verify the document and update the dates
 */
export type ExclusionReason = "invalid-metadata" | "missing-source" | "invalid-content" | "draft" | "expired";

export interface DocumentEvaluation {
  id: string;
  path: string;
  included: boolean;
  /** empty when included */
  reasons: ExclusionReason[];
  /** human-readable detail for the owner/team, one per problem */
  messages: string[];
  document?: KnowledgeDocument;
}

// ---------------------------------------------------------------- front matter

export type FrontMatter = { ok: true; fields: Record<string, string>; body: string } | { ok: false; error: string };

/**
 * Strict front matter: the file starts with a line "---", then one `key: value` per line (a value may be wrapped in
 * double quotes), then a closing "---". Blank lines are allowed; nested values, lists and comments are not.
 */
export function parseFrontMatter(raw: string): FrontMatter {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { ok: false, error: "The file must start with a front-matter block (a line containing only ---)." };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return { ok: false, error: "The front-matter block is not closed (a second line containing only --- is missing)." };
  const fields: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = /^([a-z_]+):(?:\s(.*))?$/.exec(line);
    if (!m) return { ok: false, error: `Front-matter line ${i + 1} is not "key: value": ${JSON.stringify(line.slice(0, 80))}` };
    const key = m[1];
    if (key in fields) return { ok: false, error: `Field "${key}" appears more than once.` };
    let value = (m[2] ?? "").trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    fields[key] = value;
  }
  return { ok: true, fields, body: lines.slice(end + 1).join("\n") };
}

// ---------------------------------------------------------------- field rules

const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;
// a site path may not start with // or /\ (browsers treat both as another host); same rule as the CMS (collections.ts)
const SITE_PATH = /^\/(?![/\\])[^\s\\]*$/;

/** An https:// URL (no credentials, no whitespace) or a path on this site ("/about"). */
export function isSafeLink(value: string): boolean {
  if (SITE_PATH.test(value)) return !value.includes("..");
  if (!/^https:\/\/\S+$/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
  } catch {
    return false;
  }
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;

/** A document reviewed by `reviewBy` stays current through that day and is excluded from the next day on. */
export function isCurrent(reviewBy: string | null | undefined, today: string): boolean {
  return reviewBy == null || reviewBy >= today;
}

/** Today's date (YYYY-MM-DD) in India Standard Time, the campus time zone. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const MARKDOWN_LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const BARE_URL = /(?<![(<\w])(https?:\/\/[^\s)<>\]]+)/g;
// placeholder wording that must never be published as a verified fact
const PLACEHOLDER = /\b(?:TODO|TBD|TBC|FIXME|XXX|lorem ipsum)\b|\[(?:insert|add|fill)[^\]]*\]/i;
const HTML_TAG = /<\/?[a-z!][^>]*>/i;
// official contact links inside the content (never accepted as source_url)
const CONTACT_LINK = /^(?:mailto:[^\s@/]+@[^\s@/]+\.[a-z]{2,}|tel:\+?[0-9][0-9-]{5,19})$/i;

/** Every link the content contains: Markdown links and bare URLs, in order of appearance, without duplicates. */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MARKDOWN_LINK)) out.push(m[1]);
  const withoutMarkdownLinks = text.replace(MARKDOWN_LINK, " ");
  for (const m of withoutMarkdownLinks.matchAll(BARE_URL)) out.push(m[1].replace(/[.,;:!?]+$/, ""));
  return [...new Set(out)];
}

/** "pce/admissions/btech-admission-process.md" → its id and category folder, or an error. */
export function documentPath(path: string): { ok: true; id: string; folder: string } | { ok: false; error: string } {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== "pce") return { ok: false, error: `Documents live in knowledge/pce/<category>/<name>.md (got ${path}).` };
  if (!FILE_NAME.test(parts[2])) return { ok: false, error: `File name "${parts[2]}" must be lowercase words joined by hyphens, ending in .md.` };
  return { ok: true, id: path.replace(/\.md$/, ""), folder: parts[1] };
}

/**
 * Checks one document. `asOf` (YYYY-MM-DD) is the date the index is built for; a document whose review_by is before it
 * is expired. The result lists every reason the document is excluded, so the owner/team can fix them all at once.
 */
export function evaluateDocument(path: string, raw: string, asOf: string): DocumentEvaluation {
  const reasons = new Set<ExclusionReason>();
  const messages: string[] = [];
  const fail = (reason: ExclusionReason, message: string) => { reasons.add(reason); messages.push(message); };
  const where = documentPath(path);
  const id = where.ok ? where.id : path.replace(/\.md$/, "");
  const result = (): DocumentEvaluation => ({ id, path, included: reasons.size === 0, reasons: [...reasons], messages });
  if (!where.ok) fail("invalid-metadata", where.error);

  const fm = parseFrontMatter(raw);
  if (!fm.ok) {
    fail("invalid-metadata", fm.error);
    return result();
  }
  const f = fm.fields;
  for (const key of Object.keys(f)) if (!KNOWN_FIELDS.has(key)) fail("invalid-metadata", `Unknown field "${key}". Allowed: ${[...KNOWN_FIELDS].join(", ")}.`);
  for (const [key, value] of Object.entries(f)) if (value.length > MAX_FIELD_CHARS && key !== "keywords") fail("invalid-metadata", `Field "${key}" is longer than ${MAX_FIELD_CHARS} characters.`);

  // status first: a draft is never indexed, and its other fields may still be incomplete
  const status = f.status ?? "";
  if (!(DOCUMENT_STATUSES as readonly string[]).includes(status)) fail("invalid-metadata", `status must be one of ${DOCUMENT_STATUSES.join(", ")}.`);
  const isDraft = status === "draft";
  if (isDraft) fail("draft", "status is draft: the document is not indexed until it is verified.");

  const title = f.title ?? "";
  if (!title) fail("invalid-metadata", "title is required.");
  else if (title.length > MAX_TITLE_CHARS) fail("invalid-metadata", `title is longer than ${MAX_TITLE_CHARS} characters.`);

  const category = f.category ?? "";
  if (!(KNOWLEDGE_CATEGORIES as readonly string[]).includes(category)) fail("invalid-metadata", `category must be one of ${KNOWLEDGE_CATEGORIES.join(", ")}.`);
  else if (where.ok && where.folder !== category) fail("invalid-metadata", `category "${category}" does not match the folder "${where.folder}".`);

  const scope = f.scope ?? "";
  if (!(KNOWLEDGE_SCOPES as readonly string[]).includes(scope)) fail("invalid-metadata", `scope must be one of ${KNOWLEDGE_SCOPES.join(", ")}.`);

  const sourceUrl = f.source_url ?? "";
  if (!sourceUrl) fail("missing-source", "source_url is required: the official page, or where the supplied document is published.");
  else if (!isSafeLink(sourceUrl)) fail("invalid-metadata", "source_url must be an https:// address or a path on this site (/…).");

  const verifiedBy = f.verified_by ?? "";
  const verifiedOn = f.verified_on ?? "";
  const reviewBy = f.review_by ?? "";
  if (!isDraft) {
    if (!verifiedBy) fail("invalid-metadata", "verified_by is required: the person or office that checked the content against the source.");
    if (!isCalendarDate(verifiedOn)) fail("invalid-metadata", "verified_on must be a real date (YYYY-MM-DD).");
    if (!isCalendarDate(reviewBy)) fail("invalid-metadata", "review_by must be a real date (YYYY-MM-DD).");
    if (isCalendarDate(verifiedOn) && isCalendarDate(reviewBy)) {
      if (verifiedOn > asOf) fail("invalid-metadata", `verified_on ${verifiedOn} is in the future.`);
      const span = dayNumber(reviewBy) - dayNumber(verifiedOn);
      if (span <= 0) fail("invalid-metadata", "review_by must be after verified_on.");
      else if (span > MAX_REVIEW_DAYS) fail("invalid-metadata", `review_by may be at most ${MAX_REVIEW_DAYS} days after verified_on.`);
      if (!isCurrent(reviewBy, asOf)) fail("expired", `review_by ${reviewBy} has passed: re-verify the content and update verified_on and review_by.`);
    }
  }

  const language = f.language ?? "en";
  if (!(DOCUMENT_LANGUAGES as readonly string[]).includes(language)) fail("invalid-metadata", `language must be one of ${DOCUMENT_LANGUAGES.join(", ")}.`);

  const keywords = (f.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keywords.length > MAX_KEYWORDS) fail("invalid-metadata", `keywords may list at most ${MAX_KEYWORDS} terms.`);
  if (keywords.some((k) => k.length > 60)) fail("invalid-metadata", "each keyword may be at most 60 characters.");

  const content = fm.body.trim();
  if (!content) fail("invalid-content", "The document has no content after the front matter.");
  else {
    if (content.length > MAX_CONTENT_CHARS) fail("invalid-content", `The content is longer than ${MAX_CONTENT_CHARS} characters: split it into several documents.`);
    if (HTML_TAG.test(content)) fail("invalid-content", "The content contains HTML: use plain Markdown only.");
    const unsafe = extractLinks(content).filter((l) => !isSafeLink(l) && !CONTACT_LINK.test(l));
    if (unsafe.length) fail("invalid-content", `Links must be https://, a site path (/…), mailto: or tel:: ${unsafe.slice(0, 3).join(", ")}`);
    if (!isDraft && PLACEHOLDER.test(`${title}\n${content}`)) fail("invalid-content", "The document contains placeholder text (TODO, TBD, [insert …] …): a verified document must be complete.");
  }

  const out = result();
  if (out.included) {
    out.document = {
      id, path, title,
      category: category as KnowledgeCategory,
      scope: scope as KnowledgeScope,
      sourceUrl, verifiedBy, verifiedOn, reviewBy,
      status: "verified",
      language: language as DocumentLanguage,
      keywords,
      content,
    };
  }
  return out;
}
