import { defineConfig } from "vitest/config";

// Database integration tests: a disposable local PostgreSQL per run (tests/integration/db/global-setup.ts).
// Never part of `npm test`; never connects to Supabase.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
