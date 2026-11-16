import { CHAT_LIMITS } from "./config";
import { detectLanguage, FALLBACK_TEXT, type ChatLanguage } from "./language";
import { looksLikeInjection } from "./injection";
import { buildPrompt, type PromptSource } from "./prompt";
import { checkGrounding, parseModelReply } from "./grounding";
import type { GeminiRequest, GeminiResult } from "./gemini";
import type { PrioritizedResult } from "./knowledge/priority";
import { CLARIFY_ROLES, classifyLeadershipQuestion, clarificationText, ROLE_PROBES, type LeadershipRole } from "./ambiguity";
import type { ChatResponse, ChatSource, ChatTurn, FallbackReason } from "./types";

/**
 * One chat turn: validate → screen for injection → ambiguous leadership question? (clarification, no model call) →
 * retrieve → (no sources: honest fallback, no model call) → Gemini →
 * grounding check → answer with its cited sources, or a fixed fallback. Dependencies are injected so tests run without
 * network. Nothing here stores or logs the conversation.
 */

export interface ChatRequest {
  message: string;
  history: ChatTurn[];
}

export interface ChatDeps {
  retrieve(question: string, history: ChatTurn[]): Promise<PrioritizedResult[]>;
  generate(req: GeminiRequest): Promise<GeminiResult>;
}

type FieldErrors = Record<string, string>;
const chars = (s: string) => [...s].length;

/** Validates the request body: { message: string, history?: { role, text }[] }, nothing else. */
export function parseChatRequest(body: Record<string, unknown>): { ok: true; value: ChatRequest } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  for (const key of Object.keys(body)) if (key !== "message" && key !== "history") errors[key] = "This field can't be sent.";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (typeof body.message !== "string" || !message) errors.message = "Type a question.";
  else if (chars(message) > CHAT_LIMITS.maxMessageChars) errors.message = `Questions can be at most ${CHAT_LIMITS.maxMessageChars} characters.`;

  const history: ChatTurn[] = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) errors.history = "Invalid conversation history.";
    else if (body.history.length > CHAT_LIMITS.maxHistoryTurns) errors.history = `At most ${CHAT_LIMITS.maxHistoryTurns} previous messages can be sent.`;
    else {
      for (const t of body.history as unknown[]) {
        const turn = t as Partial<ChatTurn> | null;
        const ok = turn && typeof turn === "object" && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string"
          && turn.text.trim() && chars(turn.text) <= CHAT_LIMITS.maxHistoryChars && Object.keys(turn).every((k) => k === "role" || k === "text");
        if (!ok) { errors.history = "Invalid conversation history."; break; }
        history.push({ role: turn.role!, text: turn.text!.trim() });
      }
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { message, history } };
}

// fixed-text fallbacks; a clarification ("clarify") is built by clarificationText instead
const fallback = (reason: Exclude<FallbackReason, "clarify">, language: ChatLanguage): ChatResponse => ({ answer: FALLBACK_TEXT[reason][language], sources: [], fallback: reason, language });

function toChatSources(cited: PromptSource[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const { result } of cited) {
    const c = result.chunk;
    const key = `${c.sourceUrl}\u0000${c.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: c.title, url: c.sourceUrl, tier: result.tier, kind: c.source, verifiedOn: c.verifiedOn });
  }
  return out;
}

/** The roles of a clarification that exist in the published records (checked with the same retrieval, no model). */
async function availableRoles(candidates: LeadershipRole[], deps: ChatDeps): Promise<LeadershipRole[]> {
  // the faculty coordinator and the faculty mentors are alternatives: offer the coordinator when one is published
  const found: LeadershipRole[] = [];
  for (const role of candidates) {
    if (role === "facultyMentors" && found.includes("facultyCoordinator")) continue;
    const probe = ROLE_PROBES[role];
    const results = await deps.retrieve(probe.query, []);
    if (results.some((r) => probe.matches({ title: r.chunk.title, text: r.chunk.text, docId: r.chunk.docId }))) found.push(role);
  }
  return found;
}

export async function answerChat(request: ChatRequest, model: { apiKey: string; model: string }, deps: ChatDeps): Promise<ChatResponse> {
  const language = detectLanguage(request.message);
  if (looksLikeInjection(request.message)) return fallback("injection", language);
  // earlier messages come from the browser: drop any that try to inject instructions
  const history = request.history.filter((t) => !looksLikeInjection(t.text)).slice(-CHAT_LIMITS.maxHistoryTurns);

  // ambiguous leadership questions: clarify instead of guessing a role or person (no model call)
  const previousQuestion = [...history].reverse().find((t) => t.role === "user")?.text;
  const leadership = classifyLeadershipQuestion(request.message, previousQuestion);
  if (leadership.kind === "ambiguous") {
    const roles = await availableRoles(CLARIFY_ROLES[leadership.scope], deps);
    if (!roles.length) return fallback("no-sources", language);
    return { answer: clarificationText(roles, language), sources: [], fallback: "clarify", language };
  }

  const query = leadership.kind === "resolved" ? leadership.retrievalQuery : request.message;
  const results = await deps.retrieve(query, history);
  if (!results.length) return fallback("no-sources", language);
  const sources: PromptSource[] = results.slice(0, CHAT_LIMITS.maxSources).map((result, i) => ({ sid: `S${i + 1}`, result }));

  const prompt = buildPrompt({ question: request.message, language, history, sources });
  const generated = await deps.generate({ apiKey: model.apiKey, model: model.model, system: prompt.system, contents: prompt.contents, timeoutMs: CHAT_LIMITS.timeoutMs });
  if (!generated.ok) return fallback("unavailable", language);

  const reply = parseModelReply(generated.text);
  if (!reply) return fallback("rejected", language);
  const grounded = checkGrounding(reply, sources);
  if (!grounded.ok) return fallback(grounded.reason === "not-answered" ? "not-in-sources" : "rejected", language);
  return { answer: grounded.answer, sources: toChatSources(grounded.cited), fallback: null, language };
}
