import { defineConfig, devices } from "@playwright/test";

// Read-only browser smoke tests against an already running server (no sign-in, no writes):
//   $env:E2E_BASE_URL = "http://localhost:3001"; npm run test:e2e
// With $env:E2E_BACKEND = "1" the CMS-backed checks (About authorities layout, Gallery empty state) run too.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    navigationTimeout: 60_000,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
