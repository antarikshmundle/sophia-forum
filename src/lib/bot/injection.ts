/**
 * Prompt-injection screening. Defence in depth, not the only layer: the prompt also marks all sources and the question
 * as data, the model has no tools and no access to anything but the passages it is given, and every answer is checked
 * against those passages afterwards (grounding.ts).
 *
 * - looksLikeInjection(question): attempts to override the assistant's instructions, reveal its prompt, change its
 *   role, or fake prompt markup, in English, Hinglish and Hindi. A match is answered with a fixed reply without calling
 *   the model. The patterns aim at the assistant itself, so ordinary questions about college rules ("what if I ignore
 *   the attendance rules?", "who will act as coordinator?") still go through.
 * - Retrieved passages that contain such text are dropped before they reach the model (sources.ts).
 * - neutralize(): angle brackets become look-alike characters, so text can never close or open the prompt's own
 *   <source>/<question> markup.
 */

const PATTERNS: RegExp[] = [
  // override / ignore the assistant's instructions
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|your|these|those|system|initial|original)\s+(?:the\s+)?(?:instructions?|rules?|prompts?|directions?|guidelines?|guardrails?)\b/i,
  /\b(?:new|updated|real|actual)\s+(?:instructions?|system\s+prompt)\b/i,
  // reveal the prompt
  /\b(?:system|developer|hidden|initial|original)\s+(?:prompt|message|instructions?)\b/i,
  /\b(?:reveal|show|print|repeat|output|leak|tell\s+me)\b[^.\n]{0,40}\b(?:your|the)\s+(?:prompt|instructions?|configuration)\b/i,
  // change the assistant's role
  /\b(?:you\s+are\s+now|from\s+now\s+on\s+you|(?:you|u)\s+(?:must\s+|should\s+|will\s+|can\s+)?act\s+as|pretend\s+(?:to\s+be|you)|role-?play\s+as|jail-?break|dan\s+mode|developer\s+mode|do\s+anything\s+now)\b/i,
  // fake prompt / chat markup
  /<\/?\s*(?:system|assistant|user|model|source|sources|question|instructions?)\b[^>]*>/i,
  /^\s*(?:system|assistant|model)\s*:/im,
  /\[\/?(?:INST|SYS)\]|<<\/?SYS>>|<\|im_(?:start|end)\|>/i,
  // Hinglish: "pichle saare instructions bhool jao", "ab tum hacker bano"
  /\b(?:pichle|pichhle|upar\s+ke|saare|sare|sab|apne|apni|tumhare|tumhari|system)\s+(?:sab\s+|saare\s+)?(?:instructions?|rules?|niyam|prompt)\b[^.\n]{0,30}\b(?:ignore|bhool|bhul|bhulo|chhod|chod|mat\s+maano|mat\s+mano)\b/i,
  /\b(?:ab\s+(?:se\s+)?tum|tum\s+ab)\b[^.\n]{0,30}\b(?:bano|banjao|ban\s+jao)\b/i,
  // Hindi: "पिछले सभी निर्देश भूल जाओ"
  /(?:पिछले|सभी|सारे|अपने|ऊपर\s*के)\s*(?:सभी\s*)?(?:निर्देश|निर्देशों|नियम|नियमों)[^।\n]{0,30}(?:अनदेखा|भूल|नजरअंदाज|नज़रअंदाज़|मत\s*मानो)/,
  /(?:सिस्टम\s*प्रॉम्प्ट|गुप्त\s*निर्देश)/,
];

export function looksLikeInjection(text: string): boolean {
  const t = text.normalize("NFKC");
  return PATTERNS.some((p) => p.test(t));
}

/** Text safe to place inside the prompt's markup: no angle brackets, no control characters. */
export function neutralize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›");
}
