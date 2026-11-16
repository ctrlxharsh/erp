import { type Database, schema } from "@erp/db";
import { and, eq } from "drizzle-orm";
import type { AccessStore } from "./access";

/** Drizzle-backed access lookups. These read the tables that decide access, so they are not school-scoped. */
export function createAccessStore(db: Database): AccessStore {
  return {
    async getPlatformRole(userId) {
      const [row] = await db
        .select({ role: schema.platformUsers.role })
        .from(schema.platformUsers)
        .where(eq(schema.platformUsers.userId, userId))
        .limit(1);
      return row?.role ?? null;
    },
    async getMemberships(userId) {
      const rows = await db
        .select({
          schoolId: schema.schools.id,
          schoolName: schema.schools.name,
          schoolStatus: schema.schools.status,
          roles: schema.memberships.roles,
        })
        .from(schema.memberships)
        .innerJoin(schema.schools, eq(schema.schools.id, schema.memberships.schoolId))
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, "active")));
      return rows;
    },
  };
}
