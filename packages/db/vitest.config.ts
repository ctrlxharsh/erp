import { defineConfig } from "vitest/config";

// Integration tests use the Neon `test` branch from the repo's .env.local. Without it they skip.
try {
  process.loadEnvFile("../../.env.local");
} catch {
  // No .env.local (for example in CI): database tests are skipped.
}

export default defineConfig({ test: { testTimeout: 30_000 } });
