import type { GeminiContent } from "./prompt";

/**
 * Minimal server-side Gemini client: one generateContent call over HTTPS with fetch (no SDK dependency).
 * The key travels only in the x-goog-api-key request header, from the server to Google; it is never logged, never
 * returned and never placed in a URL. Structured output (JSON with a fixed schema) and a low temperature keep the reply
 * machine-checkable. Errors are reported by kind only.
 */

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiRequest {
  apiKey: string;
  model: string;
  system: string;
  contents: GeminiContent[];
  timeoutMs: number;
}

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; reason: "http" | "timeout" | "network" | "blocked" | "empty"; status?: number };

export const REPLY_SCHEMA = {
  type: "OBJECT",
  properties: {
    answered: { type: "BOOLEAN" },
    answer: { type: "STRING" },
    citations: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["answered", "answer", "citations"],
  propertyOrdering: ["answered", "answer", "citations"],
} as const;

export function geminiRequestBody(req: Pick<GeminiRequest, "system" | "contents">) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: REPLY_SCHEMA,
    },
  };
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
};

export async function generateWithGemini(req: GeminiRequest, fetchImpl: typeof fetch = fetch): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);
  try {
    const res = await fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(req.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": req.apiKey },
      body: JSON.stringify(geminiRequestBody(req)),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[bot] Gemini request failed: HTTP ${res.status}`);
      return { ok: false, reason: "http", status: res.status };
    }
    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) return { ok: false, reason: "blocked" };
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(candidate.finishReason)) {
      return { ok: false, reason: candidate.finishReason === "MAX_TOKENS" ? "empty" : "blocked" };
    }
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text.trim() ? { ok: true, text } : { ok: false, reason: "empty" };
  } catch (e) {
    const timeout = (e as { name?: string })?.name === "AbortError";
    console.error(`[bot] Gemini request failed: ${timeout ? "timeout" : "network error"}`);
    return { ok: false, reason: timeout ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
