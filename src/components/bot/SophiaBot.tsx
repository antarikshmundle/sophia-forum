import { botAvailability } from "@/lib/bot/config";
import { SophiaBotLoader } from "./SophiaBotLoader";

/**
 * Server gate for the chat widget: renders nothing unless the bot is fully available (SOPHIA_BOT_ENABLED=true, a
 * Gemini key and model on the server, valid rate-limit settings, and the shared Upstash limiter on production).
 * Only the on/off decision reaches the page; no configuration value does.
 */
export function SophiaBot() {
  return botAvailability().enabled ? <SophiaBotLoader /> : null;
}
