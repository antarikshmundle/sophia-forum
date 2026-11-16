# SOPHIA BOT: chat backend and widget (Stages 2–3)

Sophia Bot is the AI & DS Department's assistant on the Sophia Forum website. It answers in English, Hindi and Hinglish,
**only** from published Sophia Forum CMS content and verified knowledge documents
([KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md)), and says so honestly when it has no verified answer.

**Status:** implemented and tested locally; **off by default**. The code ships with the site, but the bot is
**disabled in production** (`SOPHIA_BOT_ENABLED` is not `true`, and no AI provider credentials are configured on
Vercel). The AI provider is not decided: Gemini's API terms exclude services likely to be used by under-18s, so a
replacement provider (free tier, no billing) is being evaluated before the bot is enabled anywhere public.

## 1. How a question is answered

```
browser widget ──POST /api/bot/chat {message, history ≤ 6 turns}──▶ route (Node.js, server only)
  1  bot available? (flag, key, model, rate limiter)        else 404
  2  same-origin browser request?                           else 403
  3  JSON ≤ 32 KB, message 1–500 chars, history ≤ 6 turns   else 400/413/415
  4  rate limit (per visitor, plus a server-wide cap)        else 429 + Retry-After;
     shared store (Upstash) unreachable                      → 503 + Retry-After (fail closed)
  5  language: Devanagari → Hindi; Hindi words in Latin letters → Hinglish; else English
  6  injection screening of the question                     → fixed reply, no model call
  7  retrieval: published CMS records (cached 5 min) + verified documents,
     keyword search (Stage 1) re-ranked by the three-tier priority
     nothing relevant                                        → honest fallback, no model call
  8  Gemini generateContent: rules in the system instruction; numbered <source> passages and the
     question as data; JSON reply {answered, answer, citations}
  9  grounding check: citations must be ids that were sent; links, emails and numbers must come
     from the cited passages                                 else fixed fallback, the reply is never shown
◀── {answer, sources:[{title, url, tier, kind, verifiedOn}], fallback, language}
```

Fallback replies are fixed texts in the user's language: `no-sources`, `not-in-sources`, `rejected`, `injection` and
`unavailable`. They never contain model output.

## 2. Configuration (server-only environment variables)

| Variable | Meaning |
|---|---|
| `SOPHIA_BOT_ENABLED` | `true` turns the bot on. Anything else, including unset, means off: no launcher, and `/api/bot/chat` returns 404. |
| `GEMINI_API_KEY` | Gemini API key (local development only; see Status). Missing = bot off. |
| `GEMINI_MODEL` | Gemini model ID. Required, no default: confirm the current ID and its price on Google's official model and pricing pages first. A Flash-Lite model is the intended tier. |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL, `https://<database>.upstash.io` (Upstash console → Connect → REST). Only `*.upstash.io` over https is accepted. |
| `UPSTASH_REDIS_REST_TOKEN` | The database's **Standard** REST token (the Read Only token can't increment counters). |

Set both Upstash variables or neither. Only one, or a malformed one, keeps the bot off everywhere
(`rate-limit-misconfigured`). Upstash credentials never enable the bot by themselves: `SOPHIA_BOT_ENABLED` still does.

- None of these may be `NEXT_PUBLIC_`. The production build refuses `NEXT_PUBLIC_GEMINI*` variables, Google API keys
  in any `NEXT_PUBLIC_` variable, and any `NEXT_PUBLIC_` variable naming Upstash, Redis or `KV_REST`
  (`src/lib/build-env.ts`). Error messages name variables, never values.
- The key is used only in the `x-goog-api-key` header of the server's request to Google. It is never logged, never
  put in a URL and never sent to the browser.
- Whether the launcher shows is decided on the server (`src/components/bot/SophiaBot.tsx`). Pages prerendered at build
  time (`/admin`, `/login`, 404) fix that decision at build time; the bot is hidden on `/admin` and `/login` anyway.

## 3. Rate limiting

Limits: per visitor **6 questions a minute and 40 an hour**, and a server-wide safety limit of **60 a minute**.
`src/lib/bot/ratelimit.ts` has one `RateLimiter` interface and two implementations:

| | `UpstashRateLimiter` (distributed) | `MemoryRateLimiter` (per instance) |
|---|---|---|
| Used when | both Upstash variables are set and valid | neither Upstash variable is set |
| Counters | in Upstash Redis, shared by every server instance | in the process; reset on cold start; **not distributed** |
| Production (Vercel) | required | **never**: the bot stays off (`shared-rate-limit-required`) |
| Store unavailable | request refused with **503** + `Retry-After: 30` (fail closed) | n/a |

**How the Upstash limiter works** (REST API, no client library): one transaction (`POST <url>/multi-exec`,
`Authorization: Bearer <token>`) per check runs `INCR` and `PEXPIRE` on one key per rule and window, for example
`sophia-bot:rl:v1:c:<visitor id>:60000:<minute number>`. Keys expire after two windows. A key per window means a counter
can never outlive its window. Visitor limits are checked first; the server-wide counter only counts requests that pass
them, so one visitor hammering the endpoint can't use up everyone's budget.

**Fail closed, never silently in memory:** if Upstash times out (1.5 s), can't be reached, rejects the token, discards
the transaction or answers anything unexpected, the request is refused (503) and Gemini is never called. There is no
fallback to the in-memory limiter once Upstash is configured, and a production deployment without valid Upstash
credentials doesn't run the bot at all. When `SOPHIA_BOT_ENABLED=true` but the bot is off, the server logs the reason
once (the reason name only).

**Visitor identity:** on Vercel, the platform-set `x-real-ip`; elsewhere forwarded headers aren't trusted and all
requests share one bucket. In Upstash the visitor id is an HMAC-SHA256 of that key under the (secret) token, never the
IP itself, and it expires with the window. The in-memory limiter uses a salted SHA-256.

**Setup (you):** create an Upstash Redis database (directly, or through the Vercel Marketplace integration), and add
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as server-only environment variables. If the integration
provides other variable names (for example `KV_REST_API_URL` / `KV_REST_API_TOKEN`), set the two `UPSTASH_REDIS_REST_*`
names to the same values: only those names are read. Also set a **budget alert and a quota cap** on the Google Cloud
project, independently of the limiter.

## 4. Privacy

- **No chat logs.** The server stores nothing and logs only error kinds (e.g. `Gemini request failed: HTTP 429`),
  never questions, answers or IP addresses.
- The browser keeps the conversation only in memory (no localStorage or cookies). It is gone when the page closes.
- The panel asks visitors not to share personal information. Knowledge contains no personal profile links (CMS
  adapter) and no student personal data (knowledge rules).
- When enabled, questions and retrieved passages are sent to the configured AI provider (currently Google's Gemini
  API, local development only) to generate answers. Check the provider's data-use and age terms before enabling the
  bot for real visitors: on Gemini's free tier Google may use the data to improve its products.

## 5. Prompt-injection protection (layers)

1. Questions that try to override instructions, reveal the prompt, change role or fake prompt markup (English,
   Hinglish, Hindi) get a fixed reply, with no model call. The patterns target the assistant itself, so questions
   about college rules still work.
2. Earlier turns are sent by the browser, so they're untrusted; turns that look like injection are dropped.
3. Retrieved passages containing injection text never reach the model.
4. All passages, the question and earlier turns are neutralized (no `<`/`>`) inside clearly marked data blocks; the
   system instruction says they're data.
5. The model has no tools, no database and no browsing: only the passages it is given.
6. The grounding check rejects anything not supported by the cited passages, whatever the model was persuaded to say.

## 6. The widget

- `SophiaBot` (server gate) → `SophiaBotLoader` (launcher, shown after the page is idle; the panel code is loaded only
  on first hover, focus or open) → `SophiaBotPanel`.
- Desktop: launcher at the bottom right with "ASK SOPHIA" in Retron2000; a 400 px floating panel. Mobile: round logo
  launcher; full-height sheet. The launcher moves up while the footer's POWER SAVER button is on screen.
- Hidden on `/admin/*` and `/login`. Escape closes; focus returns to the launcher; screen-reader labels throughout.
- Visual identity: only the site's own palette and type: black and white brutalist cards, the logo tile and Retron2000;
  Google blue for focus rings and source links (as the site's `--ring`), green for the "online" dot, the logo's gold
  yellow for the header accent line, and the navbar's blue/red/yellow for the typing dots.
- Existing components are unchanged. The only layout change is one `<SophiaBot />` element, which renders nothing
  while the bot is off.

## 7. Tests

| Suite | Covers |
|---|---|
| `tests/unit/bot/bot-ratelimit-upstash.test.ts` | Upstash: configuration and build guard, request format, per-visitor/hour/server-wide limits shared across instances, fail closed on HTTP errors, 401, discarded transactions, command errors, malformed replies, timeouts and network errors; the route's 429/503/404 behaviour |
| `tests/unit/bot/bot-config.test.ts` | flag default off, missing key/model, production gate, build guard, rate limiter (windows, global cap, Retry-After, hashing, memory bound), client key |
| `tests/unit/bot/bot-safety.test.ts` | language detection, injection screening (attacks and ordinary questions), grounding (fabricated citations, links, numbers, emails; Devanagari digits) |
| `tests/unit/bot/bot-gemini-prompt.test.ts` | prompt markup and neutralization, history order, Gemini request (key only in header, schema), error kinds, timeout |
| `tests/unit/bot/bot-chat-route.test.ts` | the real route end to end with a fake Gemini: availability, validation, EN/HI/Hinglish answers with citations, follow-ups, fallbacks, injection, rate limit |
| `tests/unit/bot/bot-ui.test.tsx` | launcher visibility, lazy panel, welcome and suggestions, answers with sources, fallback, plain text only, history limit, no browser storage |
| `tests/e2e/sophia-bot.spec.ts` | opt-in (`E2E_BOT=1`): desktop and mobile layout in a real browser, Retron2000, footer clearance, `/login` |

To run the browser tests locally, start a server with the bot enabled for that process only, using placeholder values
(the spec answers `/api/bot/chat` in the browser, so Gemini is never called):

```
npm run build
SOPHIA_BOT_ENABLED=true GEMINI_API_KEY=placeholder GEMINI_MODEL=placeholder npx next start -p 3100
E2E_BASE_URL=http://localhost:3100 E2E_BOT=1 npx playwright test tests/e2e/sophia-bot.spec.ts
```

## 8. Not done yet

- **Semantic (embedding) retrieval:** not used. The model and implementation can't be verified without a key; keyword
  search with Hindi/Hinglish vocabulary is in place, and `Retriever` is ready for an embedding retriever.
- **A live Gemini test:** every test uses a fake model. Before any launch, run the evaluation questions against the
  real model on a preview deployment.
- **Verified PCE documents:** `knowledge/pce/` is empty, so today the bot can answer only from published Sophia Forum
  CMS content.
