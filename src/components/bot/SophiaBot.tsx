import { botUiMode } from "@/lib/bot/config";
import { SophiaBotLoader } from "./SophiaBotLoader";

/**
 * Server gate for the chat widget (see botUiMode):
 *  - live: the bot is fully available (SOPHIA_BOT_ENABLED=true, a Gemini key and model on the server, valid rate-limit
 *    settings, and the shared Upstash limiter on production);
 *  - preview: the bot is not available, but the launcher and panel are shown with a "being prepared" notice and the
 *    input disabled (nothing is sent; /api/bot/chat stays off);
 *  - off: nothing is rendered.
 * Only this decision reaches the page; no configuration value does.
 */
export function SophiaBot() {
  const mode = botUiMode();
  if (mode === "off") return null;
  return <SophiaBotLoader preview={mode === "preview"} />;
}
