"use client";

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

const SophiaBotPanel = lazy(() => import("./SophiaBotPanel"));

/** Pages where the bot is never offered. */
export function botHiddenOn(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/login" || pathname.startsWith("/login/") || pathname === "/admin" || pathname.startsWith("/admin/");
}

const GAP = 16;

/**
 * The floating launcher. It appears once the page is idle (so it never competes with the page's own loading), and the
 * chat panel's code is only downloaded when the launcher is first opened or hovered. While the footer's bottom ribbon
 * (with the POWER SAVER button) is on screen, the launcher moves up so it never covers it.
 * preview: the AI isn't available yet; the panel is shown read-only (see SophiaBotPanel).
 */
export function SophiaBotLoader({ idleDelayMs = 1200, preview = false }: { idleDelayMs?: number; preview?: boolean }) {
  const pathname = usePathname();
  const hidden = botHiddenOn(pathname);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false); // the panel code has been requested
  const [bottom, setBottom] = useState(GAP);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (hidden || ready) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else setReady(true);
    }, idleDelayMs);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
    };
  }, [hidden, ready, idleDelayMs]);

  // keep clear of the footer's POWER SAVER button
  useEffect(() => {
    if (hidden || !ready) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const ribbon = document.querySelector("footer button[aria-pressed]")?.parentElement;
      const top = ribbon?.getBoundingClientRect().top;
      setBottom(top !== undefined && top < window.innerHeight ? Math.max(GAP, window.innerHeight - top + GAP) : GAP);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hidden, ready]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  if (hidden || !ready) return null;

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => { setWanted(true); setOpen(true); }}
          onPointerEnter={() => setWanted(true)}
          onFocus={() => setWanted(true)}
          aria-label="Open Sophia Bot, the AI & DS assistant"
          aria-expanded={false}
          aria-controls="sophia-bot-panel"
          data-testid="sophia-bot-launcher"
          style={{ bottom }}
          className="group fixed right-4 z-[55] inline-flex items-center gap-2.5 rounded-full border-[3px] border-foreground bg-foreground text-background p-1 sm:pr-4 shadow-[4px_4px_0_hsl(var(--foreground)/0.3)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_hsl(var(--foreground)/0.3)] transition-[transform,box-shadow,bottom] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-google-blue"
        >
          <span className="relative inline-flex w-11 h-11 items-center justify-center rounded-full bg-white border-2 border-background/20">
            <Image src="/images/sophia-forum-logo.png" alt="" width={1022} height={1177} sizes="44px" className="w-full h-full rounded-full object-contain p-0.5" />
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex w-3.5 h-3.5">
              {/* green "online" pulse only when the bot can answer; a still yellow dot in preview */}
              {!preview && <span className="absolute inline-flex h-full w-full rounded-full bg-google-green opacity-60 motion-safe:animate-ping" />}
              <span className={`relative inline-flex w-3.5 h-3.5 rounded-full ${preview ? "bg-google-yellow" : "bg-google-green"} border-2 border-foreground`} />
            </span>
          </span>
          <span className="hidden sm:flex flex-col items-start leading-none">
            <span className="font-display text-base tracking-wide">ASK SOPHIA</span>
            <span className="font-mono text-[9px] text-background/70 mt-1">AI &amp; DS ASSISTANT</span>
          </span>
        </button>
      )}
      {wanted && (
        <Suspense fallback={null}>
          <SophiaBotPanel open={open} onClose={close} preview={preview} />
        </Suspense>
      )}
    </>
  );
}
