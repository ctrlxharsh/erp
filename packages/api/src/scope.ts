import { type SchoolScope, schema } from "@erp/db";
import { and, eq } from "drizzle-orm";

export async function activeSessionId(scope: SchoolScope) {
  const [session] = await scope.tx
    .select({ id: schema.academicSessions.id })
    .from(schema.academicSessions)
    .where(eq(schema.academicSessions.isActive, true));
  return session?.id ?? null;
}

/**
 * Sections a teacher may see: those they take in the active session. Returns null (no limit) for
 * School Admin and Principal. Student and parent contact details stay with people who need them
 * (CONSTITUTION §11).
 */
export async function visibleSections(
  scope: SchoolScope,
  ctx: { roles: readonly string[]; user: { id: string } },
): Promise<string[] | null> {
  if (ctx.roles.includes("school_admin") || ctx.roles.includes("principal")) return null;
  const sessionId = await activeSessionId(scope);
  if (!sessionId) return [];
  const rows = await scope.tx
    .select({ sectionId: schema.teacherAssignments.sectionId })
    .from(schema.teacherAssignments)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.teacherAssignments.staffId))
    .where(
      and(
        eq(schema.staff.userId, ctx.user.id),
        eq(schema.teacherAssignments.academicSessionId, sessionId),
      ),
    );
  return [...new Set(rows.map((row) => row.sectionId))];
}
