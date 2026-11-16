import type { DocumentLanguage, KnowledgeCategory, KnowledgeScope } from "./schema.ts";

/** Where a chunk came from: a verified knowledge document, or a record currently published on the site (CMS). */
export type ChunkSource = "document" | "cms";

/** One retrievable passage with everything a citation needs. */
export interface KnowledgeChunk {
  /** "<docId>#<ordinal>" */
  id: string;
  docId: string;
  source: ChunkSource;
  title: string;
  /** heading path inside the document ("" at the top level) */
  heading: string;
  text: string;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  language: DocumentLanguage;
  /** the citation link: the document's source_url, or the site page that shows the CMS record ("/events/<id>") */
  sourceUrl: string;
  /** verified documents only (CMS records are live: null) */
  verifiedOn: string | null;
  reviewBy: string | null;
  keywords: string[];
  /** links that appear in this chunk's text */
  links: string[];
}

export const INDEX_SCHEMA = "sophia-knowledge-index";
export const INDEX_SCHEMA_VERSION = 1;

export interface IndexedDocument {
  id: string;
  path: string;
  title: string;
  category: KnowledgeCategory;
  scope: KnowledgeScope;
  language: DocumentLanguage;
  sourceUrl: string;
  verifiedBy: string;
  verifiedOn: string;
  reviewBy: string;
  keywords: string[];
  /** sha256 of the document's normalized content, first 16 hex characters */
  contentHash: string;
  chunkCount: number;
}

export interface IndexedChunk {
  id: string;
  docId: string;
  ordinal: number;
  heading: string;
  text: string;
  links: string[];
}

/**
 * The generated index (src/data/knowledge-index.json). It holds verified, current documents only. `version` is a hash
 * of everything else, so it changes exactly when the indexed knowledge changes; there is no build timestamp.
 */
export interface KnowledgeIndex {
  schema: typeof INDEX_SCHEMA;
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  version: string;
  documents: IndexedDocument[];
  chunks: IndexedChunk[];
}
