import { analyze } from "./text.ts";
import type { Retriever, ScoredChunk, SearchOptions } from "./retrieve.ts";
import type { KnowledgeChunk } from "./types.ts";

/**
 * Knowledge priority (docs/sophia-bot/KNOWLEDGE_BASE.md §2). Sophia Bot is the AI & DS Department's assistant:
 *
 *   PRIMARY     Sophia Forum CMS (published records) and verified AI & DS documents   scope aids, CMS
 *   SECONDARY   official PCE institutional information                                  scope pce
 *   SUPPORTING  other PCE departments                                                   scope other-dept
 *
 * PrioritizedRetriever wraps any Retriever (keyword now, semantic in Stage 2) and re-ranks its results:
 *  - relevance first, tier second: a tier weight multiplies the relevance score by at most ±30 %, so primary content wins
 *    when relevance is comparable, and a clearly more relevant PCE-wide passage still ranks above a weak primary match;
 *  - never hiding PCE-wide information: when the best secondary or supporting passage is relevant (at least
 *    KEEP_SHARE of the best relevance) but was pushed out of the top results, it takes the last place;
 *  - neutral for questions explicitly about the institution ("college", "PCE") or about another department: then no tier
 *    weights apply, so the bot doesn't push AI & DS content onto a PCE-wide or other-department question;
 *  - authority on equal scores: CMS (authoritative for Sophia Forum) > AI & DS documents > PCE > other departments.
 *    Stage 2 passes tier and authority with each source, so the model can resolve conflicts the same way.
 */

export type SourceTier = "primary" | "secondary" | "supporting";

/** 1 = most authoritative. */
export type Authority = 1 | 2 | 3 | 4;

export function tierOf(chunk: Pick<KnowledgeChunk, "source" | "scope">): SourceTier {
  if (chunk.source === "cms" || chunk.scope === "aids") return "primary";
  return chunk.scope === "pce" ? "secondary" : "supporting";
}

export function authorityOf(chunk: Pick<KnowledgeChunk, "source" | "scope">): Authority {
  if (chunk.source === "cms") return 1;
  return chunk.scope === "aids" ? 2 : chunk.scope === "pce" ? 3 : 4;
}

/** Multiplier on relevance, by authority (CMS, AI & DS document, PCE, other department). */
export const PRIORITY_WEIGHTS: Record<Authority, number> = { 1: 1.3, 2: 1.2, 3: 1.0, 4: 0.85 };

/** A relevant lower-tier passage is kept in the results when its relevance is at least this share of the best. */
export const KEEP_SHARE = 0.6;

// Words that make a question institution-wide or about another department (general vocabulary, not facts).
const INSTITUTION_TERMS = new Set(["college", "pce", "priyadarshini", "institute", "institution", "university", "campus", "principal", "director"]);
const OTHER_DEPARTMENT_TERMS = new Set([
  "mechanical", "mech", "civil", "electrical", "electronics", "entc", "extc", "cse", "chemical",
  "biotechnology", "mba", "mca", "telecommunication", "instrumentation",
]);

export type QueryFocus = "department" | "institution" | "other-department";

/** What the question is about, from its words. */
export function queryFocus(query: string): QueryFocus {
  const terms = new Set(analyze(query).exact);
  if ([...terms].some((t) => OTHER_DEPARTMENT_TERMS.has(t))) return "other-department";
  if ([...terms].some((t) => INSTITUTION_TERMS.has(t))) return "institution";
  return "department";
}

export interface PrioritizedResult extends ScoredChunk {
  /** relevance from the underlying retriever, before tier weighting */
  baseScore: number;
  tier: SourceTier;
  authority: Authority;
}

const byRank = (a: PrioritizedResult, b: PrioritizedResult) =>
  b.score - a.score || a.authority - b.authority || (a.chunk.id < b.chunk.id ? -1 : a.chunk.id > b.chunk.id ? 1 : 0);

export class PrioritizedRetriever implements Retriever {
  private readonly base: Retriever;

  constructor(base: Retriever) {
    this.base = base;
  }

  search(query: string, options: SearchOptions = {}): PrioritizedResult[] {
    const limit = options.limit ?? 5;
    // a wider pool than requested, so re-ranking can bring up passages the base order placed lower
    const pool = this.base.search(query, { ...options, limit: Math.max(limit * 4, 20) });
    if (!pool.length || limit <= 0) return [];
    const neutral = queryFocus(query) !== "department";
    const ranked = pool
      .map((r): PrioritizedResult => {
        const authority = authorityOf(r.chunk);
        return { ...r, baseScore: r.score, score: neutral ? r.score : r.score * PRIORITY_WEIGHTS[authority], tier: tierOf(r.chunk), authority };
      })
      .sort(byRank);
    const top = ranked.slice(0, limit);
    if (limit < 2) return top;

    // never hide relevant PCE-wide (or other-department) information behind primary passages
    const bestBase = Math.max(...ranked.map((r) => r.baseScore));
    for (const tier of ["secondary", "supporting"] as const) {
      if (top.some((r) => r.tier === tier)) continue;
      const candidate = ranked.find((r) => r.tier === tier && r.baseScore >= KEEP_SHARE * bestBase);
      if (!candidate) continue;
      // replace the lowest-ranked primary passage (there is always one: no secondary/supporting one is in top)
      let at = -1;
      for (let i = top.length - 1; i >= 0; i--) if (top[i].tier === "primary") { at = i; break; }
      if (at < 0 || top.filter((r) => r.tier === "primary").length < 2) continue; // keep at least one primary passage
      top[at] = candidate;
      top.sort(byRank);
    }
    return top;
  }
}
