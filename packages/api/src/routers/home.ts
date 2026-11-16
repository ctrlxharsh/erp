import { homeSummarySchema } from "@erp/contracts";
import { schema, withSchool } from "@erp/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { requirePermission, router, schoolProcedure } from "../trpc";

/** Everything the "Today" screen needs for the signed-in person, in one call. */
export const homeRouter = router({
  summary: schoolProcedure
    .use(requirePermission("school.view"))
    .output(homeSummarySchema)
    .query(({ ctx }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const [session] = await tx
          .select({ id: schema.academicSessions.id })
          .from(schema.academicSessions)
          .where(eq(schema.academicSessions.isActive, true));
        const sessionId = session?.id;
        const label = (className: string | null, sectionName: string | null) =>
          className && sectionName ? `${className} ${sectionName}` : null;

        // School Admin and Principal: school-wide counts.
        let counts: { classes: number; students: number; teachers: number } | null = null;
        if (ctx.permissions.has("staff.view")) {
          const [classes] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.classes);
          const [students] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.students)
            .where(and(isNull(schema.students.deletedAt), eq(schema.students.status, "active")));
          const [teachers] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.staff)
            .where(
              and(
                isNull(schema.staff.deletedAt),
                eq(schema.staff.status, "active"),
                eq(schema.staff.kind, "teacher"),
              ),
            );
          counts = {
            classes: classes?.n ?? 0,
            students: students?.n ?? 0,
            teachers: teachers?.n ?? 0,
          };
        }

        // Teacher: the sections they take this year.
        const mySections: {
          sectionId: string;
          label: string;
          isClassTeacher: boolean;
          subjects: string[];
        }[] = [];
        if (ctx.roles.includes("teacher") && sessionId) {
          const rows = await tx
            .select({
              sectionId: schema.teacherAssignments.sectionId,
              subjectName: schema.subjects.name,
              className: schema.classes.name,
              sectionName: schema.sections.name,
            })
            .from(schema.teacherAssignments)
            .innerJoin(schema.staff, eq(schema.staff.id, schema.teacherAssignments.staffId))
            .innerJoin(schema.sections, eq(schema.sections.id, schema.teacherAssignments.sectionId))
            .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
            .leftJoin(schema.subjects, eq(schema.subjects.id, schema.teacherAssignments.subjectId))
            .where(
              and(
                eq(schema.staff.userId, ctx.user.id),
                eq(schema.teacherAssignments.academicSessionId, sessionId),
              ),
            )
            .orderBy(asc(schema.classes.sortOrder), asc(schema.sections.name));
          const bySection = new Map<string, (typeof mySections)[number]>();
          for (const row of rows) {
            const entry = bySection.get(row.sectionId) ?? {
              sectionId: row.sectionId,
              label: label(row.className, row.sectionName) ?? "",
              isClassTeacher: false,
              subjects: [],
            };
            if (row.subjectName) entry.subjects.push(row.subjectName);
            else entry.isClassTeacher = true;
            bySection.set(row.sectionId, entry);
          }
          mySections.push(...bySection.values());
        }

        // Parent: their linked children (a child switcher comes with the parent screens).
        const children: {
          id: string;
          fullName: string;
          label: string | null;
          sectionId: string | null;
        }[] = [];
        if (ctx.roles.includes("parent")) {
          const rows = await tx
            .select({
              id: schema.students.id,
              fullName: schema.students.fullName,
              sectionId: schema.sections.id,
              className: schema.classes.name,
              sectionName: schema.sections.name,
            })
            .from(schema.guardians)
            .innerJoin(
              schema.studentGuardians,
              eq(schema.studentGuardians.guardianId, schema.guardians.id),
            )
            .innerJoin(schema.students, eq(schema.students.id, schema.studentGuardians.studentId))
            .leftJoin(
              schema.studentEnrolments,
              and(
                eq(schema.studentEnrolments.studentId, schema.students.id),
                sessionId ? eq(schema.studentEnrolments.academicSessionId, sessionId) : sql`false`,
              ),
            )
            .leftJoin(schema.sections, eq(schema.sections.id, schema.studentEnrolments.sectionId))
            .leftJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
            .where(
              and(
                eq(schema.guardians.userId, ctx.user.id),
                isNull(schema.students.deletedAt),
                eq(schema.students.status, "active"),
              ),
            )
            .orderBy(asc(schema.students.fullName));
          children.push(
            ...rows.map((r) => ({
              id: r.id,
              fullName: r.fullName,
              label: label(r.className, r.sectionName),
              sectionId: r.sectionId,
            })),
          );
        }

        // Student: their own class.
        let me: { fullName: string; label: string | null; sectionId: string | null } | null = null;
        if (ctx.roles.includes("student")) {
          const [row] = await tx
            .select({
              fullName: schema.students.fullName,
              sectionId: schema.sections.id,
              className: schema.classes.name,
              sectionName: schema.sections.name,
            })
            .from(schema.students)
            .leftJoin(
              schema.studentEnrolments,
              and(
                eq(schema.studentEnrolments.studentId, schema.students.id),
                sessionId ? eq(schema.studentEnrolments.academicSessionId, sessionId) : sql`false`,
              ),
            )
            .leftJoin(schema.sections, eq(schema.sections.id, schema.studentEnrolments.sectionId))
            .leftJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
            .where(eq(schema.students.userId, ctx.user.id));
          if (row)
            me = {
              fullName: row.fullName,
              label: label(row.className, row.sectionName),
              sectionId: row.sectionId,
            };
        }
        return { counts, mySections, children, me };
      }),
    ),
});
