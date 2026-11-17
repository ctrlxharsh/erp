import { defineConfig } from "vitest/config";

// Integration tests use the Neon `test` branch (database and bucket) from the repo's .env.local.
// Without it they are skipped.
try {
  process.loadEnvFile("../../.env.local");
} catch {
  // No .env.local (for example in CI): integration tests are skipped.
}

export default defineConfig({
  // Each procedure call costs several network round trips to Neon, so files run in parallel (4 at a
  // time was stable; more risks dropped connections on the shared test branch).
  test: { testTimeout: 60_000, hookTimeout: 120_000, maxWorkers: 4 },
});
