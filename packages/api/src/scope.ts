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

/**
 * Sections whose class work (homework, diary) the caller may read: everything for School Admin
 * and Principal; for others, sections they teach, are enrolled in, or have a child in.
 */
export async function readableSections(
  scope: SchoolScope,
  ctx: { roles: readonly string[]; user: { id: string } },
): Promise<string[] | null> {
  if (ctx.roles.includes("school_admin") || ctx.roles.includes("principal")) return null;
  const sessionId = await activeSessionId(scope);
  if (!sessionId) return [];
  const ids = new Set<string>();
  const taught = await scope.tx
    .select({ sectionId: schema.teacherAssignments.sectionId })
    .from(schema.teacherAssignments)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.teacherAssignments.staffId))
    .where(
      and(
        eq(schema.staff.userId, ctx.user.id),
        eq(schema.teacherAssignments.academicSessionId, sessionId),
      ),
    );
  for (const row of taught) ids.add(row.sectionId);
  const own = await scope.tx
    .select({ sectionId: schema.studentEnrolments.sectionId })
    .from(schema.studentEnrolments)
    .innerJoin(schema.students, eq(schema.students.id, schema.studentEnrolments.studentId))
    .where(
      and(
        eq(schema.students.userId, ctx.user.id),
        eq(schema.studentEnrolments.academicSessionId, sessionId),
      ),
    );
  for (const row of own) ids.add(row.sectionId);
  const children = await scope.tx
    .select({ sectionId: schema.studentEnrolments.sectionId })
    .from(schema.guardians)
    .innerJoin(schema.studentGuardians, eq(schema.studentGuardians.guardianId, schema.guardians.id))
    .innerJoin(
      schema.studentEnrolments,
      eq(schema.studentEnrolments.studentId, schema.studentGuardians.studentId),
    )
    .where(
      and(
        eq(schema.guardians.userId, ctx.user.id),
        eq(schema.studentEnrolments.academicSessionId, sessionId),
      ),
    );
  for (const row of children) ids.add(row.sectionId);
  return [...ids];
}

/** The teacher row of the caller, if any. */
export async function currentTeacher(scope: SchoolScope, userId: string) {
  const [row] = await scope.tx
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(and(eq(schema.staff.userId, userId), eq(schema.staff.kind, "teacher")));
  return row ?? null;
}

/** True when the caller teaches `subjectId` in `sectionId` this session (a subject-section pair). */
export async function teachesSubjectIn(
  scope: SchoolScope,
  userId: string,
  sectionId: string,
  subjectId: string,
  sessionId: string,
) {
  const a = schema.teacherAssignments;
  const rows = await scope.tx
    .select({ id: a.id })
    .from(a)
    .innerJoin(schema.staff, eq(schema.staff.id, a.staffId))
    .where(
      and(
        eq(schema.staff.userId, userId),
        eq(a.sectionId, sectionId),
        eq(a.subjectId, subjectId),
        eq(a.academicSessionId, sessionId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Login ids of the students and parents of a section, for notifications. */
export async function sectionAudienceUserIds(
  scope: SchoolScope,
  sectionId: string,
  sessionId: string,
): Promise<string[]> {
  const rows = await scope.tx
    .select({ studentUser: schema.students.userId, guardianUser: schema.guardians.userId })
    .from(schema.studentEnrolments)
    .innerJoin(schema.students, eq(schema.students.id, schema.studentEnrolments.studentId))
    .leftJoin(schema.studentGuardians, eq(schema.studentGuardians.studentId, schema.students.id))
    .leftJoin(schema.guardians, eq(schema.guardians.id, schema.studentGuardians.guardianId))
    .where(
      and(
        eq(schema.studentEnrolments.sectionId, sectionId),
        eq(schema.studentEnrolments.academicSessionId, sessionId),
      ),
    );
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.studentUser) ids.add(row.studentUser);
    if (row.guardianUser) ids.add(row.guardianUser);
  }
  return [...ids];
}
