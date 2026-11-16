import { defineConfig } from "drizzle-kit";

// Migrations use the direct (unpooled) connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
