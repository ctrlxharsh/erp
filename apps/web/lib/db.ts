import "server-only";
import { createDb, type Database } from "@erp/db";

let db: Database | undefined;

/** One pooled client per server process. */
export function getDb(): Database {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing environment variable DATABASE_URL");
    db = createDb(url);
  }
  return db;
}
