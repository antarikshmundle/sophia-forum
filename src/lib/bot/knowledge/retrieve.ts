import { isCurrent } from "./schema.ts";
import { analyze } from "./text.ts";
import { INDEX_SCHEMA, INDEX_SCHEMA_VERSION, type KnowledgeChunk, type KnowledgeIndex } from "./types.ts";

/**
 * Retrieval over knowledge chunks. Stage 1 ships keyword retrieval (BM25); Stage 2 can add a semantic retriever that
 * implements the same `Retriever` interface and combine the two, without changing callers.
 *
 * Keyword scoring: BM25 over weighted fields (title and keywords count double, the heading 1.5×, the text once), on the
 * exact terms from text.ts (concept-mapped, so Hindi/Hinglish/English spellings of a campus word meet), plus half
 * weight on the spelling-tolerant folded terms (names and Hinglish spelling variants), plus a typo tier for words the
 * knowledge doesn't contain at all (one edit away from a known word, 0.6 weight). Ties break on the chunk id, so
 * results are deterministic. A chunk whose review date has passed is never returned, even from an older index.
 */

export interface ScoredChunk {
  chunk: KnowledgeChunk;
  score: number;
  /** the query terms this chunk matched (exact tier), for debugging and tests */
  matched: string[];
}

export interface SearchOptions {
  /** at most this many results (default 5) */
  limit?: number;
  /** drop results scoring below this (default: anything above 0) */
  minScore?: number;
  /** YYYY-MM-DD: chunks with an earlier review date are excluded (default: no date filter) */
  today?: string;
}

export interface Retriever {
  search(query: string, options?: SearchOptions): ScoredChunk[];
}

const K1 = 1.2;
const B = 0.75;
const FOLDED_WEIGHT = 0.5;
/** Typo tier: a query word found nowhere in the knowledge counts as a known word one edit away, at this weight. */
const FUZZY_WEIGHT = 0.6;
const FUZZY_MIN_LENGTH = 5;

/**
 * True when a and b differ by at most one edit: one insertion, deletion or substitution, or one swap of two adjacent
 * letters ("presidnt"/"president", "facalty"/"faculty", "rohti"/"rohit").
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // adjacent swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // deletion / insertion
}
const FIELD_WEIGHTS = { title: 2, keywords: 2, heading: 1.5, text: 1 } as const;

interface Posting {
  /** weighted term frequency per tier */
  exact: Map<string, number>;
  folded: Map<string, number>;
  length: number;
}

function postingOf(chunk: KnowledgeChunk): Posting {
  const exact = new Map<string, number>();
  const folded = new Map<string, number>();
  let length = 0;
  const add = (text: string, weight: number) => {
    const t = analyze(text);
    for (const term of t.exact) exact.set(term, (exact.get(term) ?? 0) + weight);
    for (const term of t.folded) folded.set(term, (folded.get(term) ?? 0) + weight);
    length += t.exact.length * weight;
  };
  add(chunk.title, FIELD_WEIGHTS.title);
  add(chunk.keywords.join(" "), FIELD_WEIGHTS.keywords);
  add(chunk.heading, FIELD_WEIGHTS.heading);
  add(chunk.text, FIELD_WEIGHTS.text);
  return { exact, folded, length };
}

export class KeywordRetriever implements Retriever {
  private readonly chunks: KnowledgeChunk[];
  private readonly postings: Posting[];
  private readonly avgLength: number;
  private readonly df: { exact: Map<string, number>; folded: Map<string, number> };

  constructor(chunks: readonly KnowledgeChunk[]) {
    const ids = new Set<string>();
    for (const c of chunks) {
      if (ids.has(c.id)) throw new Error(`Duplicate knowledge chunk id ${c.id}`);
      ids.add(c.id);
    }
    this.chunks = [...chunks];
    this.postings = this.chunks.map(postingOf);
    this.avgLength = this.postings.reduce((s, p) => s + p.length, 0) / Math.max(1, this.postings.length) || 1;
    const exact = new Map<string, number>();
    const folded = new Map<string, number>();
    for (const p of this.postings) {
      for (const t of p.exact.keys()) exact.set(t, (exact.get(t) ?? 0) + 1);
      for (const t of p.folded.keys()) folded.set(t, (folded.get(t) ?? 0) + 1);
    }
    this.df = { exact, folded };
    this.vocabulary = [...exact.keys()].filter((t) => /^[a-z]+$/.test(t) && t.length >= FUZZY_MIN_LENGTH - 1).sort();
  }

  private readonly vocabulary: string[];

  /**
   * Known words one edit away from a query word that the knowledge doesn't contain at all (in either tier). Only Latin
   * words of five or more letters, only candidates with the same first letter: correctly spelled words, names and
   * short words are never changed.
   */
  private typoCorrections(exactTerms: string[], foldedTerms: string[]): string[] {
    const out = new Set<string>();
    exactTerms.forEach((term, i) => {
      if (this.df.exact.has(term) || this.df.folded.has(foldedTerms[i] ?? "") || !/^[a-z]+$/.test(term) || term.length < FUZZY_MIN_LENGTH) return;
      for (const known of this.vocabulary) if (known[0] === term[0] && withinOneEdit(term, known)) out.add(known);
    });
    for (const t of exactTerms) out.delete(t);
    return [...out];
  }

  get size(): number {
    return this.chunks.length;
  }

  private idf(df: number): number {
    const n = this.chunks.length;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  private bm25(tf: number, length: number): number {
    return (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * length) / this.avgLength));
  }

  search(query: string, options: SearchOptions = {}): ScoredChunk[] {
    const { limit = 5, minScore = 0, today } = options;
    const q = analyze(query);
    const exactTerms = [...new Set(q.exact)];
    const foldedTerms = [...new Set(q.folded)];
    if (!exactTerms.length) return [];
    const fuzzyTerms = this.typoCorrections(q.exact, q.folded);
    const results: ScoredChunk[] = [];
    this.chunks.forEach((chunk, i) => {
      if (today && !isCurrent(chunk.reviewBy, today)) return;
      const p = this.postings[i];
      let score = 0;
      const matched: string[] = [];
      for (const term of exactTerms) {
        const tf = p.exact.get(term);
        if (!tf) continue;
        matched.push(term);
        score += this.idf(this.df.exact.get(term) ?? 0) * this.bm25(tf, p.length);
      }
      for (const term of foldedTerms) {
        const tf = p.folded.get(term);
        if (tf) score += FOLDED_WEIGHT * this.idf(this.df.folded.get(term) ?? 0) * this.bm25(tf, p.length);
      }
      for (const term of fuzzyTerms) {
        const tf = p.exact.get(term);
        if (tf) score += FUZZY_WEIGHT * this.idf(this.df.exact.get(term) ?? 0) * this.bm25(tf, p.length);
      }
      if (score > minScore) results.push({ chunk, score, matched });
    });
    results.sort((a, b) => b.score - a.score || (a.chunk.id < b.chunk.id ? -1 : a.chunk.id > b.chunk.id ? 1 : 0));
    return results.slice(0, limit);
  }
}

/** The generated index as retrievable chunks (each chunk carries its document's metadata). */
export function chunksFromIndex(index: KnowledgeIndex): KnowledgeChunk[] {
  if (index.schema !== INDEX_SCHEMA || index.schemaVersion !== INDEX_SCHEMA_VERSION) throw new Error("Unsupported knowledge index format");
  const docs = new Map(index.documents.map((d) => [d.id, d]));
  return index.chunks.map((c) => {
    const d = docs.get(c.docId);
    if (!d) throw new Error(`Knowledge index chunk ${c.id} has no document`);
    return {
      id: c.id, docId: d.id, source: "document", title: d.title, heading: c.heading, text: c.text,
      category: d.category, scope: d.scope, language: d.language, sourceUrl: d.sourceUrl,
      verifiedOn: d.verifiedOn, reviewBy: d.reviewBy, keywords: d.keywords, links: c.links,
    };
  });
}
