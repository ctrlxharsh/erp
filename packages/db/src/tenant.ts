import { sql } from "drizzle-orm";
import type { Database } from "./client";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Proof that code is running for one school. Repositories for school-owned data take a
 * `SchoolScope`, so an unscoped query is a type error, not a bug found later (CONSTITUTION §6.5).
 */
export interface SchoolScope {
  readonly schoolId: string;
  readonly tx: Transaction;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction that acts on exactly one school. Inside it:
 *  - `app.school_id` is set for the transaction, and
 *  - the session role is switched to `erp_app`, which Postgres row-level security restricts to
 *    that school's rows.
 * Both settings end with the transaction, so a pooled connection never carries a school over.
 */
export async function withSchool<T>(
  db: Database,
  schoolId: string,
  fn: (scope: SchoolScope) => Promise<T>,
): Promise<T> {
  if (!uuidPattern.test(schoolId)) throw new Error("withSchool needs a valid school id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
    await tx.execute(sql`set local role erp_app`);
    return fn({ schoolId, tx });
  });
}
