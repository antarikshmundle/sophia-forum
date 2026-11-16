import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...rest }, children),
}));

import { botHiddenOn, SophiaBotLoader } from "@/components/bot/SophiaBotLoader";
import SophiaBotPanel, { SUGGESTED_QUESTIONS } from "@/components/bot/SophiaBotPanel";

type Sent = { message: string; history: { role: string; text: string }[] };
let sent: Sent[] = [];
let respond: (body: Sent) => Response = () => json({ answer: "Example Hackathon is on 5 December.", sources: [{ title: "Example Hackathon", url: "/events/hack", tier: "primary", kind: "cms", verifiedOn: null }], fallback: null, language: "en" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  nav.pathname = "/";
  sent = [];
  respond = () => json({ answer: "Example Hackathon is on 5 December.", sources: [{ title: "Example Hackathon", url: "/events/hack", tier: "primary", kind: "cms", verifiedOn: null }], fallback: null, language: "en" });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Sent;
    sent.push(body);
    return respond(body);
  }));
});

describe("launcher", () => {
  it.each([["/admin"], ["/admin/events"], ["/login"]])("is never shown on %s", async (path) => {
    nav.pathname = path;
    render(<SophiaBotLoader idleDelayMs={0} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByTestId("sophia-bot-launcher")).toBeNull();
  });

  it("botHiddenOn", () => {
    expect([null, "/", "/about", "/events/x", "/administration", "/login-help"].map(botHiddenOn)).toEqual([false, false, false, false, false, false]);
    expect(["/admin", "/admin/x", "/login", "/login/"].map(botHiddenOn)).toEqual([true, true, true, true]);
  });

  it("appears after the page is idle, loads the panel only on demand, and returns focus on close", async () => {
    render(<SophiaBotLoader idleDelayMs={0} />);
    const launcher = await screen.findByTestId("sophia-bot-launcher");
    expect(launcher).toHaveAccessibleName(/Open Sophia Bot/);
    expect(screen.queryByTestId("sophia-bot-panel")).toBeNull(); // not downloaded/rendered yet
    await userEvent.click(launcher);
    const panel = await screen.findByTestId("sophia-bot-panel");
    expect(panel).toBeVisible();
    expect(screen.getByRole("dialog", { name: "SOPHIA BOT" })).toBe(panel);
    expect(screen.getByLabelText("Your question")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("sophia-bot-launcher")).toHaveFocus());
    expect(panel).not.toBeVisible();
  });
});

describe("chat panel", () => {
  const renderPanel = () => render(<SophiaBotPanel open onClose={() => {}} />);

  it("is a full-height sheet on mobile and a floating bottom-right panel from the sm breakpoint", () => {
    renderPanel();
    const cls = screen.getByTestId("sophia-bot-panel").className;
    for (const c of ["fixed", "inset-0", "h-[100dvh]", "w-full", "sm:inset-auto", "sm:right-4", "sm:bottom-4", "sm:w-[400px]", "sm:rounded-[20px]"]) expect(cls).toContain(c);
  });

  it("suggests only questions that published content supports (Stage 3A)", () => {
    expect(SUGGESTED_QUESTIONS).toEqual(["What is Sophia Forum?", "Sophia Forum ka mission kya hai?", "Who is the HOD of AI & DS?", "सोफिया फोरम क्या है?"]);
    for (const unsupported of ["Upcoming events kab hain?", "HOD ka message kya hai?"]) expect(SUGGESTED_QUESTIONS).not.toContain(unsupported);
    renderPanel();
    expect(screen.queryByRole("button", { name: "Upcoming events kab hain?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "HOD ka message kya hai?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sophia Forum ka mission kya hai?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who is the HOD of AI & DS?" })).toBeInTheDocument();
  });

  it("shows the welcome message and suggested questions in English, Hinglish and Hindi", () => {
    renderPanel();
    expect(screen.getByText(/I'm Sophia Bot, the AI & DS Department's assistant/)).toBeInTheDocument();
    for (const q of SUGGESTED_QUESTIONS) expect(screen.getByRole("button", { name: q })).toBeInTheDocument();
    expect(SUGGESTED_QUESTIONS.some((q) => /[ऀ-ॿ]/.test(q))).toBe(true);
  });

  it("asks a question, shows the answer with its source link, and hides the suggestions", async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText("Your question"), "When is the hackathon?{Enter}");
    expect(await screen.findByText("Example Hackathon is on 5 December.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Example Hackathon/ });
    expect(link).toHaveAttribute("href", "/events/hack");
    expect(link.textContent).toMatch(/SOPHIA FORUM/);
    expect(sent[0]).toEqual({ message: "When is the hackathon?", history: [] });
    expect(screen.queryByRole("button", { name: SUGGESTED_QUESTIONS[0] })).toBeNull();
  });

  it("a suggested question is sent as is (Hindi too)", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "सोफिया फोरम क्या है?" }));
    await waitFor(() => expect(sent[0]?.message).toBe("सोफिया फोरम क्या है?"));
  });

  it("external sources open in a new tab with noopener; unsafe source URLs are not rendered", async () => {
    respond = () => json({
      answer: "Library is open on working days.",
      sources: [
        { title: "Library", url: "https://example.org/lib", tier: "secondary", kind: "document", verifiedOn: "2026-11-01" },
        { title: "Bad", url: "javascript:alert(1)", tier: "primary", kind: "cms", verifiedOn: null },
      ],
      fallback: null, language: "en",
    });
    renderPanel();
    await userEvent.type(screen.getByLabelText("Your question"), "library?{Enter}");
    const link = await screen.findByRole("link", { name: /Library/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toMatch(/PCE/);
    expect(screen.getByText("verified 2026-11-01")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bad/ })).toBeNull();
  });

  it("a fallback is shown without sources; answers are plain text, never HTML", async () => {
    respond = () => json({ answer: "<img src=x onerror=alert(1)> I don't have verified information about that yet.", sources: [], fallback: "no-sources", language: "en" });
    const { container } = renderPanel();
    await userEvent.type(screen.getByLabelText("Your question"), "quantum?{Enter}");
    expect(await screen.findByText(/I don't have verified information/)).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(screen.queryByText("SOURCES")).toBeNull();
  });

  it("rate limiting and network errors get a friendly message", async () => {
    respond = () => json({ error: "Too many" }, 429);
    renderPanel();
    await userEvent.type(screen.getByLabelText("Your question"), "hi{Enter}");
    expect(await screen.findByText(/asking a bit fast/)).toBeInTheDocument();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await userEvent.type(screen.getByLabelText("Your question"), "hi again{Enter}");
    expect(await screen.findByText(/Couldn't reach Sophia Bot/)).toBeInTheDocument();
  });

  it("sends only the visitor's own questions as history: up to the last six, never answers, welcome text or fallbacks (Stage 4.7)", async () => {
    // replies alternate: a grounded answer, then a clarification, then a fallback …
    let n = 0;
    respond = () => {
      n++;
      if (n % 3 === 2) return json({ answer: "That could mean more than one person. Do you mean …?", sources: [], fallback: "clarify", language: "en" });
      if (n % 3 === 0) return json({ answer: "The verified sources I have don't answer that.", sources: [], fallback: "not-in-sources", language: "en" });
      return json({ answer: "Example Hackathon is on 5 December.", sources: [], fallback: null, language: "en" });
    };
    renderPanel();
    for (let i = 1; i <= 8; i++) {
      await userEvent.type(screen.getByLabelText("Your question"), `question ${i}{Enter}`);
      await waitFor(() => expect(sent).toHaveLength(i));
      await waitFor(() => expect(screen.getByLabelText("Your question")).not.toBeDisabled());
      await waitFor(() => expect(screen.queryByText("Sophia Bot is answering…")).toBeNull());
    }
    expect(sent[0].history).toEqual([]);
    expect(sent[1].history).toEqual([{ role: "user", text: "question 1" }]);
    // the eighth request carries the six previous questions, all of them the visitor's
    expect(sent[7].history).toEqual([2, 3, 4, 5, 6, 7].map((i) => ({ role: "user", text: `question ${i}` })));
    for (const s of sent) expect(s.history.every((t) => t.role === "user")).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/I'm Sophia Bot|Example Hackathon|Do you mean|verified sources/);
  });

  it("limits questions to 500 characters and doesn't send empty ones", async () => {
    renderPanel();
    const input = screen.getByLabelText("Your question") as HTMLTextAreaElement;
    expect(input.maxLength).toBe(500);
    fireEvent.change(input, { target: { value: "a".repeat(600) } });
    expect(input.value).toHaveLength(500);
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  });

  it("stores nothing in the browser", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderPanel();
    await userEvent.type(screen.getByLabelText("Your question"), "hi{Enter}");
    await screen.findByText("Example Hackathon is on 5 December.");
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("design palette", () => {
  it("uses only the site's own colour tokens (no cyan or other Tailwind palette colours)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of ["SophiaBotLoader.tsx", "SophiaBotPanel.tsx"]) {
      const source = readFileSync(join(__dirname, "..", "..", "..", "src", "components", "bot", file), "utf8");
      expect(source).not.toMatch(/cyan/i);
      // Tailwind's built-in palette utilities (colour + shade, e.g. bg-sky-400); the site's tokens have no shade
      expect(source).not.toMatch(/-(?:cyan|teal|sky|indigo|violet|purple|emerald|lime|amber|rose|fuchsia|slate|zinc|neutral|stone|gray|red|orange|yellow|green|blue|pink)-\d{2,3}\b/);
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});
