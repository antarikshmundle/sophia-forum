"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Send, X } from "lucide-react";
import type { ChatResponse, ChatSource, ChatTurn } from "@/lib/bot/types";

/**
 * SOPHIA BOT chat panel. Desktop: a floating panel at the bottom right. Mobile: a full-height sheet.
 * The conversation lives only in this component's memory: nothing is stored in the browser or on the server, and it is
 * gone when the page is closed. Answers render as plain text; source links are checked again before they're shown.
 */

const MAX_CHARS = 500;
const HISTORY_TURNS = 6;

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; sources: ChatSource[]; fallback: boolean; welcome?: boolean };

const WELCOME =
  "Hi! I'm Sophia Bot, the AI & DS Department's assistant. Ask me about Sophia Forum, the department, its events and PCE. " +
  "You can ask in English, हिंदी or Hinglish.";

// Only questions that published CMS content can answer (About, mission/vision/objectives, the HOD's faculty card);
// English, Hinglish and Hindi. Re-check against the knowledge audit before adding new ones.
export const SUGGESTED_QUESTIONS = ["What is Sophia Forum?", "Sophia Forum ka mission kya hai?", "Who is the HOD of AI & DS?", "सोफिया फोरम क्या है?"];

const TIER_LABEL = (s: ChatSource) =>
  s.kind === "cms" ? "SOPHIA FORUM" : s.tier === "primary" ? "AI & DS" : s.tier === "secondary" ? "PCE" : "PCE DEPT";

// the site's own navigation colours, in the order the navbar uses them
const TYPING_DOTS = ["bg-google-blue", "bg-google-red", "bg-google-yellow"];

const safeUrl = (url: string) => (/^\/(?![/\\])[^\s\\]*$/.test(url) && !url.includes("..")) || /^https:\/\/[^\s]+$/.test(url);

function Sources({ sources }: { sources: ChatSource[] }) {
  const shown = sources.filter((s) => safeUrl(s.url));
  if (!shown.length) return null;
  return (
    <div className="mt-2.5 pt-2.5 border-t-2 border-dashed border-foreground/20">
      <p className="font-pixel text-[8px] tracking-wider text-muted-foreground mb-1.5">SOURCES</p>
      <ul className="space-y-1.5">
        {shown.map((s) => {
          const inner = (
            <>
              <span className="shrink-0 rounded-full border border-foreground/40 px-1.5 py-px font-mono text-[9px] leading-tight">{TIER_LABEL(s)}</span>
              <span className="min-w-0 flex-1 underline decoration-google-blue decoration-2 underline-offset-2 break-words">{s.title}</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            </>
          );
          const cls = "flex items-start gap-1.5 font-body text-xs hover:text-google-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-google-blue rounded";
          return (
            <li key={s.url + s.title}>
              {s.url.startsWith("/") ? (
                <Link href={s.url} className={cls}>{inner}</Link>
              ) : (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className={cls}>
                  {inner}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              {s.verifiedOn && <p className="font-mono text-[9px] text-muted-foreground ml-1">verified {s.verifiedOn}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SophiaBotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: "assistant", text: WELCOME, sources: [], fallback: false, welcome: true }]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const asked = messages.some((m) => m.role === "user");

  // focus the input when opened; Escape closes; the mobile sheet locks page scrolling
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const mobile = window.matchMedia?.("(max-width: 639px)").matches;
    const previous = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (mobile) document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    const log = logRef.current;
    if (log && typeof log.scrollTo === "function") log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const ask = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    // context: the last few real exchanges (no welcome text, no fallback replies)
    // context: the visitor's own last questions only. The server never uses earlier answers (they are not sources),
    // so sending them would only use up history slots; clarifications and fallbacks are never sent either.
    const history: ChatTurn[] = messages
      .filter((m) => m.role === "user")
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
    setMessages((ms) => [...ms, { id: nextId.current++, role: "user", text }]);
    setInput("");
    setPending(true);
    let reply: Message;
    try {
      const res = await fetch("/api/bot/chat", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (res.status === 429) {
        reply = { id: nextId.current++, role: "assistant", text: "You're asking a bit fast. Please wait a minute and try again.", sources: [], fallback: true };
      } else if (!res.ok) {
        reply = { id: nextId.current++, role: "assistant", text: "Sophia Bot can't answer right now. Please try again later.", sources: [], fallback: true };
      } else {
        const data = (await res.json()) as ChatResponse;
        reply = { id: nextId.current++, role: "assistant", text: String(data.answer ?? ""), sources: Array.isArray(data.sources) ? data.sources : [], fallback: data.fallback !== null };
      }
    } catch {
      reply = { id: nextId.current++, role: "assistant", text: "Couldn't reach Sophia Bot. Check your connection and try again.", sources: [], fallback: true };
    }
    setMessages((ms) => [...ms, reply]);
    setPending(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [messages, pending]);

  return (
    <section
      id="sophia-bot-panel"
      role="dialog"
      aria-labelledby={titleId}
      hidden={!open}
      data-testid="sophia-bot-panel"
      className={`fixed z-[58] inset-0 h-[100dvh] w-full ${open ? "flex" : "hidden"} flex-col bg-background text-foreground overflow-hidden sm:inset-auto sm:right-4 sm:bottom-4 sm:w-[400px] sm:max-w-[calc(100vw-2rem)] sm:h-[min(640px,calc(100dvh-7rem))] sm:rounded-[20px] sm:border-[3px] sm:border-foreground sm:shadow-[6px_6px_0_hsl(var(--foreground))]`}
    >
      {/* header */}
      <header className="relative flex items-center gap-3 bg-foreground text-background px-4 py-3 border-b-[3px] border-foreground">
        <span className="relative inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-white border-2 border-background/30">
          <Image src="/images/sophia-forum-logo.png" alt="" width={1022} height={1177} sizes="40px" className="w-full h-full rounded-full object-contain p-0.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-xl leading-none tracking-wide">SOPHIA BOT</h2>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-background/70">
            <span className="inline-block w-2 h-2 rounded-full bg-google-green" aria-hidden="true" />
            AI &amp; DS ASSISTANT · BETA
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Sophia Bot"
          className="inline-flex w-10 h-10 items-center justify-center rounded-full border-2 border-background/40 hover:border-background hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-google-blue"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-[3px] h-[3px] bg-gradient-to-r from-transparent via-google-yellow to-transparent" />
      </header>

      {/* conversation */}
      <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 overflow-y-auto graph-paper px-3 sm:px-4 py-4 space-y-3">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-sm bg-foreground text-background px-3.5 py-2.5 font-body text-sm">
                <span className="sr-only">You: </span>{m.text}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div
                className={`max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 font-body text-sm bg-card border-2 ${m.fallback ? "border-dashed border-foreground/50 text-foreground/80" : "border-foreground shadow-[3px_3px_0_hsl(var(--foreground))]"}`}
              >
                <p className="whitespace-pre-line break-words"><span className="sr-only">Sophia Bot: </span>{m.text}</p>
                {!m.fallback && <Sources sources={m.sources} />}
              </div>
            </div>
          ),
        )}

        {!asked && (
          <div className="pt-1">
            <p className="font-pixel text-[8px] tracking-wider text-muted-foreground mb-2">TRY ASKING</p>
            <ul className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => void ask(q)}
                    className="rounded-full border-2 border-foreground bg-card px-3 py-1.5 font-body text-xs hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-google-blue"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pending && (
          <div className="flex justify-start" role="status">
            <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border-2 border-foreground bg-card px-3.5 py-3">
              <span className="sr-only">Sophia Bot is answering…</span>
              {[0, 1, 2].map((i) => (
                <span key={i} aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${TYPING_DOTS[i]} motion-safe:animate-bounce`} style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <form
        className="border-t-[3px] border-foreground bg-card px-3 sm:px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => { e.preventDefault(); void ask(input); }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="sophia-bot-input" className="sr-only">Your question</label>
          <textarea
            id="sophia-bot-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(input); }
            }}
            rows={1}
            maxLength={MAX_CHARS}
            placeholder="Ask in English, हिंदी or Hinglish…"
            className="flex-1 resize-none max-h-28 min-h-[44px] rounded-xl border-2 border-foreground bg-background px-3 py-2.5 font-body text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-google-blue caret-google-blue"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            aria-label="Send question"
            className="btn-brutal w-11 h-11 !min-h-0 shrink-0 !rounded-xl bg-foreground text-background disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-google-blue"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 font-mono text-[9.5px] leading-snug text-muted-foreground">
          {input.length > MAX_CHARS - 100 ? `${input.length}/${MAX_CHARS} · ` : ""}
          Answers come only from published Sophia Forum content and verified documents, and can still be wrong: check the linked source. Please don&apos;t share personal information. Chats aren&apos;t saved.
        </p>
      </form>
    </section>
  );
}
