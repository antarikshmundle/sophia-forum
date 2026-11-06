"use client";

import { useSyncExternalStore } from "react";
import { useAuthMode, type AuthMode } from "@/components/auth/AuthModeProvider";
import { useDemoSession } from "@/hooks/useDemoSession";
import { findDemoAccount, signInDemo, signOutDemo, type DemoSession } from "@/lib/demoAuth";

/**
 * The admin session for whichever sign-in mode this build uses.
 * - demo: exactly the existing demo cookie session (useDemoSession); no network requests.
 * - supabase: asked from /api/auth/session (the httpOnly cookies are never readable here), on first use, on window
 *   focus and after sign-in/out. { data: null } (or any non-2xx answer) means signed out. Tokens never reach this code.
 */

export type AdminSession = DemoSession;

const SESSION_EVENT = "admin-session-change";
type RemoteState = { ready: boolean; session: AdminSession | null };

let remote: RemoteState = { ready: false, session: null };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const SERVER_STATE: RemoteState = { ready: false, session: null };

function setRemote(next: RemoteState) {
  remote = next;
  listeners.forEach((listener) => listener());
}

function refreshRemote(): Promise<void> {
  inflight ??= (async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      const body = response.ok ? ((await response.json()) as { data?: AdminSession }) : null;
      setRemote({ ready: true, session: body?.data ?? null });
    } catch {
      setRemote({ ready: true, session: null });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribeRemote(listener: () => void) {
  listeners.add(listener);
  if (!remote.ready) void refreshRemote();
  const refresh = () => void refreshRemote();
  window.addEventListener("focus", refresh);
  window.addEventListener(SESSION_EVENT, refresh);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("focus", refresh);
    window.removeEventListener(SESSION_EVENT, refresh);
  };
}

const noopSubscribe = () => () => {};

/** `ready` is false until the session is known (demo: until hydrated; supabase: until the first answer). */
export function useAdminSessionState(): { session: AdminSession | null; ready: boolean } {
  const mode = useAuthMode();
  const demoSession = useDemoSession();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const state = useSyncExternalStore(mode === "supabase" ? subscribeRemote : noopSubscribe, () => remote, () => SERVER_STATE);
  return mode === "supabase" ? state : { session: demoSession, ready: hydrated };
}

export function useAdminSession(): AdminSession | null {
  return useAdminSessionState().session;
}

export type SignInOutcome = { ok: true } | { ok: false; error: string; demoMismatch?: boolean };

export async function signInAdmin(mode: AuthMode, email: string, password: string): Promise<SignInOutcome> {
  if (mode === "demo") {
    const account = findDemoAccount(email, password);
    if (!account) return { ok: false, error: "", demoMismatch: true };
    signInDemo(account);
    return { ok: true };
  }
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await response.json().catch(() => null)) as { data?: AdminSession; error?: string } | null;
    if (!response.ok || !body?.data) return { ok: false, error: body?.error ?? "Email or password is incorrect." };
    setRemote({ ready: true, session: body.data });
    window.dispatchEvent(new Event(SESSION_EVENT));
    return { ok: true };
  } catch {
    return { ok: false, error: "Sign-in failed. Check your connection and try again." };
  }
}

export async function signOutAdmin(mode: AuthMode): Promise<void> {
  if (mode === "demo") {
    signOutDemo();
    return;
  }
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    setRemote({ ready: true, session: null });
    window.dispatchEvent(new Event(SESSION_EVENT));
  }
}
