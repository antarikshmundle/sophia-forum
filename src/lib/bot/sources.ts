import indexJson from "@/data/knowledge-index.json";
import { loadCmsKnowledge } from "./knowledge/cms-source";
import { KeywordRetriever, chunksFromIndex } from "./knowledge/retrieve";
import { analyze } from "./knowledge/text";
import { PrioritizedRetriever, type PrioritizedResult } from "./knowledge/priority";
import { todayInIndia } from "./knowledge/schema";
import type { KnowledgeChunk, KnowledgeIndex } from "./knowledge/types";
import { looksLikeInjection } from "./injection";
import { isFollowUp } from "./followup";
import { CHAT_LIMITS } from "./config";
import type { ChatTurn } from "./types";

/**
 * The bot's knowledge at request time: the verified documents of the generated index (src/data/knowledge-index.json)
 * plus the CMS records published right now (Stage 1 adapter: public reads, RLS, published only), searched with the
 * Stage 1 keyword retriever and re-ranked by the three-tier priority.
 *
 * CMS knowledge is cached per server instance:
 *  - a complete read (every section answered, even with no records: a genuine empty result) for CMS_TTL_MS;
 *  - the CMS switched off by configuration (demo mode): no CMS knowledge, also for CMS_TTL_MS;
 *  - a read where some or all sections failed (a temporary error): the fresh sections plus the last good passages of
 *    the failed sections, retried after CMS_RETRY_MS, so one failed read never leaves the bot empty for five minutes.
 * Concurrent requests share one load (no burst of parallel CMS reads). Passages that look like prompt injection are left
 * out entirely. Semantic (embedding) search is not used yet.
 */

export const CMS_TTL_MS = 5 * 60_000;
export const CMS_RETRY_MS = 30_000;

let documentChunks: KnowledgeChunk[] | null = null;
let cache: { at: number; ttl: number; retriever: PrioritizedRetriever; cmsChunks: KnowledgeChunk[] } | null = null;
let loading: Promise<PrioritizedRetriever> | null = null;

const safe = (chunks: KnowledgeChunk[]) => chunks.filter((c) => !looksLikeInjection(`${c.title}\n${c.heading}\n${c.text}`));

async function load(now: number): Promise<PrioritizedRetriever> {
  documentChunks ??= safe(chunksFromIndex(indexJson as unknown as KnowledgeIndex));
  const previous = cache?.cmsChunks ?? [];
  let cmsChunks: KnowledgeChunk[];
  let ttl = CMS_TTL_MS;
  try {
    const cms = await loadCmsKnowledge();
    if (!cms.ok) cmsChunks = []; // switched off by configuration: genuinely no CMS knowledge
    else if (!cms.failed.length) cmsChunks = safe(cms.chunks); // complete read (an empty result is genuine)
    else {
      // temporary failure of some sections: keep their last good passages and retry soon
      const failed = cms.failed.map((s) => `cms/${s}/`);
      cmsChunks = [...safe(cms.chunks), ...previous.filter((c) => failed.some((p) => c.docId.startsWith(p)))];
      ttl = CMS_RETRY_MS;
    }
  } catch {
    cmsChunks = previous; // unexpected error: keep the last good copy, retry soon
    ttl = CMS_RETRY_MS;
  }
  const next = new PrioritizedRetriever(new KeywordRetriever([...cmsChunks, ...documentChunks]));
  cache = { at: now, ttl, retriever: next, cmsChunks };
  return next;
}

async function retriever(now: number): Promise<PrioritizedRetriever> {
  if (cache && now - cache.at < cache.ttl) return cache.retriever;
  loading ??= load(now).finally(() => { loading = null; });
  return loading;
}

/** Clears the per-instance cache (tests). */
export function resetKnowledgeCache() {
  cache = null;
  documentChunks = null;
  loading = null;
}

// ---------------------------------------------------------------- explicit HOD questions

const HOD_RECORD = /\bHOD\b|\bHead of (?:the )?Department\b/i;
const isHodRecord = (r: PrioritizedResult) => HOD_RECORD.test(r.chunk.title);
/** The question itself asks for the HOD ("HOD", "Head of Department", "विभागाध्यक्ष", "who heads the department" …). */
const asksForHod = (question: string) => analyze(question).exact.includes("hod");

/**
 * The passages for a question.
 *  - A follow-up ("What is their role?", "aur uska venue?", "उनका पद क्या है?"; see followup.ts) is searched together with
 *    the visitor's previous question, so the pronoun finds its subject; those passages come first, then the question's
 *    own matches.
 *  - Any other question is a new topic: only its own matches. When nothing matches, the caller gives the honest
 *    fallback without a model call; the previous topic's passages are never substituted.
 * Only the visitor's own earlier questions are used, never earlier answers.
 *  - A question that itself asks for the HOD gets the matching HOD record(s) first: otherwise generic passages that
 *    repeat "AI & DS" could outrank the actual HOD record. Only the order changes, and only for such questions.
 */
export async function retrieveForQuestion(question: string, history: ChatTurn[], now: number = Date.now()): Promise<PrioritizedResult[]> {
  const r = await retriever(now);
  const hod = asksForHod(question);
  const options = { limit: CHAT_LIMITS.maxSources, today: todayInIndia(new Date(now)) };
  // an HOD question looks a little deeper, so the HOD record is found even when generic passages fill the top places
  const own = r.search(question, hod ? { ...options, limit: CHAT_LIMITS.maxSources * 3 } : options);
  const previous = [...history].reverse().find((t) => t.role === "user")?.text;
  let results = own;
  if (previous && isFollowUp(question)) {
    const withContext = r.search(`${previous} ${question}`, options);
    const seen = new Set(withContext.map((x) => x.chunk.id));
    results = [...withContext, ...own.filter((x) => !seen.has(x.chunk.id))];
  }
  if (hod) results = [...results.filter(isHodRecord), ...results.filter((x) => !isHodRecord(x))];
  return results.slice(0, CHAT_LIMITS.maxSources);
}
