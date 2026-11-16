import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** Creates a pooled Drizzle client. Call once per process and reuse it. */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}
