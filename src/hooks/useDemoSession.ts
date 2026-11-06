"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseSession, readSessionCookie, SESSION_EVENT, type DemoSession } from "@/lib/demoAuth";

function subscribe(callback: () => void) {
  window.addEventListener(SESSION_EVENT, callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener(SESSION_EVENT, callback);
    window.removeEventListener("focus", callback);
  };
}

/** Current demo session (null on the server and when signed out). */
export function useDemoSession(): DemoSession | null {
  const raw = useSyncExternalStore(subscribe, readSessionCookie, () => "");
  return useMemo(() => parseSession(raw), [raw]);
}
