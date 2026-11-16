import { defineConfig } from "vitest/config";

// Integration tests use the Neon `test` branch (database and bucket) from the repo's .env.local.
// Without it they are skipped.
try {
  process.loadEnvFile("../../.env.local");
} catch {
  // No .env.local (for example in CI): integration tests are skipped.
}

export default defineConfig({ test: { testTimeout: 60_000 } });
