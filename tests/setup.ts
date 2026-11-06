import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

afterEach(() => cleanup());

// Tests never reach a real backend: every test starts with no Supabase project and demo modes (a test that needs a
// value stubs it itself; unstubEnvs restores after each test).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("CMS_FACULTY_MODE", "");
  vi.stubEnv("CMS_AUTH_MODE", "");
});

// next/image → a plain <img> (no loader or remote-host checks in jsdom)
vi.mock("next/image", () => ({
  default: ({ src, alt, fill: _fill, priority: _priority, sizes: _sizes, ...rest }: Record<string, unknown>) =>
    React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }),
}));
