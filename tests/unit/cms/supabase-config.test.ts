// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { supabaseConfig } from "@/lib/cms/supabase-server";

// A JWT-shaped key whose payload carries the given role (signature irrelevant: only the role is inspected)
const jwtKey = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

describe("supabaseConfig — only ever a public key", () => {
  it.each([
    ["a publishable key", "https://testproj.supabase.co", "sb_publishable_abc", true],
    ["a legacy anon JWT", "https://testproj.supabase.co", jwtKey("anon"), true],
    ["a secret key", "https://testproj.supabase.co", "sb_secret_abc", false],
    ["a service_role JWT", "https://testproj.supabase.co", jwtKey("service_role"), false],
    ["an unreadable JWT", "https://testproj.supabase.co", "eyJ.not-base64!.x", false],
    ["a non-Supabase URL", "https://evil.example", "sb_publishable_abc", false],
    ["a missing key", "https://testproj.supabase.co", "", false],
  ])("%s → %s", (_l, url, key, ok) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", key);
    expect(supabaseConfig() !== null).toBe(ok);
  });
});
