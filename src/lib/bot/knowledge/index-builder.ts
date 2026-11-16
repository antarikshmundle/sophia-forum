import { createHash } from "node:crypto";
import { evaluateDocument, type DocumentEvaluation, type KnowledgeDocument } from "./schema.ts";
import { chunkMarkdown, DEFAULT_MAX_CHUNK_CHARS } from "./chunk.ts";
import { normalizeText } from "./text.ts";
import { INDEX_SCHEMA, INDEX_SCHEMA_VERSION, type IndexedChunk, type IndexedDocument, type KnowledgeIndex } from "./types.ts";

/**
 * Offline index builder (run by scripts/build-knowledge-index.ts; never at request time, never calls an AI service).
 * Input: the knowledge files as { path, raw } with knowledge-root-relative POSIX paths. Output: the index of the
 * documents that pass every check on `asOf`, and a report of every file with the reasons it was left out.
 *
 * Deterministic: files are processed in path order whatever order they are given in, objects are written with a fixed
 * key order, and the version is a hash of the content (no timestamps), so the same knowledge always gives the same bytes.
 */

export interface KnowledgeFile {
  path: string;
  raw: string;
}

export interface BuildResult {
  index: KnowledgeIndex;
  evaluations: DocumentEvaluation[];
}

const sha16 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function indexDocument(doc: KnowledgeDocument, maxChars: number): { entry: IndexedDocument; chunks: IndexedChunk[] } {
  const content = normalizeText(doc.content);
  const chunks = chunkMarkdown(content, maxChars).map((c, ordinal): IndexedChunk => ({
    id: `${doc.id}#${ordinal}`, docId: doc.id, ordinal, heading: c.heading, text: c.text, links: c.links,
  }));
  const entry: IndexedDocument = {
    id: doc.id, path: doc.path, title: doc.title, category: doc.category, scope: doc.scope, language: doc.language,
    sourceUrl: doc.sourceUrl, verifiedBy: doc.verifiedBy, verifiedOn: doc.verifiedOn, reviewBy: doc.reviewBy,
    keywords: doc.keywords, contentHash: sha16(content), chunkCount: chunks.length,
  };
  return { entry, chunks };
}

export function buildKnowledgeIndex(files: KnowledgeFile[], asOf: string, maxChars: number = DEFAULT_MAX_CHUNK_CHARS): BuildResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be YYYY-MM-DD (got ${asOf})`);
  const sorted = [...files].sort((a, b) => byString(a.path, b.path));
  const seen = new Set<string>();
  const evaluations: DocumentEvaluation[] = [];
  const documents: IndexedDocument[] = [];
  const chunks: IndexedChunk[] = [];
  for (const file of sorted) {
    if (seen.has(file.path)) throw new Error(`Duplicate knowledge file ${file.path}`);
    seen.add(file.path);
    const evaluation = evaluateDocument(file.path, file.raw, asOf);
    evaluations.push(evaluation);
    if (!evaluation.included || !evaluation.document) continue;
    const { entry, chunks: docChunks } = indexDocument(evaluation.document, maxChars);
    documents.push(entry);
    chunks.push(...docChunks);
  }
  const body = { documents, chunks };
  const version = sha16(JSON.stringify({ schema: INDEX_SCHEMA, schemaVersion: INDEX_SCHEMA_VERSION, ...body }));
  return { index: { schema: INDEX_SCHEMA, schemaVersion: INDEX_SCHEMA_VERSION, version, ...body }, evaluations };
}

/** The index file's exact text: 2-space JSON with a final newline. */
export function serializeIndex(index: KnowledgeIndex): string {
  return JSON.stringify(index, null, 2) + "\n";
}
