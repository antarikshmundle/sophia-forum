import type { ChatLanguage } from "./language";

/** Shapes shared by /api/bot/chat and the chat panel (no server-only imports here). */

/** "clarify": an ambiguous question; the answer is a short clarification question (no sources, no model call). */
export type FallbackReason = "no-sources" | "not-in-sources" | "rejected" | "injection" | "unavailable" | "clarify";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatSource {
  title: string;
  /** a page on this site ("/events/x") or an https:// official source */
  url: string;
  tier: "primary" | "secondary" | "supporting";
  kind: "cms" | "document";
  /** verified documents only */
  verifiedOn: string | null;
}

export interface ChatResponse {
  answer: string;
  /** the sources the answer is based on; empty for a fallback */
  sources: ChatSource[];
  /** null when the answer is grounded; otherwise why a fixed reply was given */
  fallback: FallbackReason | null;
  language: ChatLanguage;
}
