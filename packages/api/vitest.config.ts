import { defineConfig } from "vitest/config";

// Integration tests use the Neon `test` branch (database and bucket) from the repo's .env.local.
// Without it they are skipped.
try {
  process.loadEnvFile("../../.env.local");
} catch {
  // No .env.local (for example in CI): integration tests are skipped.
}

export default defineConfig({
  // Integration tests share one Neon branch; a few at a time keeps connections stable.
  test: { testTimeout: 60_000, hookTimeout: 120_000, maxWorkers: 1 },
});
