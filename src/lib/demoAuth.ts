/**
 * DEMO-ONLY sign-in for the local admin mock.
 *
 * This is NOT authentication. The credentials below are public, the session is a
 * plain readable cookie that anyone can forge, and nothing here talks to the
 * Supabase backend. It only exists so the admin screens can be explored locally in demo mode.
 */

export type DemoRole = "admin" | "manager";

export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: DemoRole;
}

export interface DemoSession {
  email: string;
  name: string;
  role: DemoRole;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "admin@demo.local", password: "demo-admin", name: "Demo Admin", role: "admin" },
  { email: "manager@demo.local", password: "demo-manager", name: "Demo Manager", role: "manager" },
];

export const SESSION_COOKIE = "sophia_demo_session";
export const SESSION_EVENT = "demo-session-change";
const SESSION_MAX_AGE = 60 * 60 * 8;

export function encodeSession(account: DemoAccount): string {
  return encodeURIComponent(`${account.role}|${account.email}`);
}

/** Accepts only values that match a known demo account. */
export function parseSession(value?: string | null): DemoSession | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const [role, email] = decoded.split("|");
  const account = DEMO_ACCOUNTS.find((a) => a.email === email && a.role === role);
  return account ? { email: account.email, name: account.name, role: account.role } : null;
}

export function findDemoAccount(email: string, password: string): DemoAccount | undefined {
  const normalized = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email === normalized && a.password === password);
}

/** Only allow redirects back into the admin area (prevents open redirects via ?next=). */
export function safeAdminPath(next?: string | null): string {
  if (next && /^\/admin(\/[\w-]*)*$/.test(next)) return next;
  return "/admin";
}

// ---- Browser-only helpers ----

export function readSessionCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match ? match.slice(SESSION_COOKIE.length + 1) : "";
}

export function signInDemo(account: DemoAccount) {
  document.cookie = `${SESSION_COOKIE}=${encodeSession(account)}; path=/; max-age=${SESSION_MAX_AGE}; samesite=lax`;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function signOutDemo() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.dispatchEvent(new Event(SESSION_EVENT));
}
