import {
  addGuardianInputSchema,
  assignInputSchema,
  createStaffInputSchema,
  createStudentInputSchema,
  inviteInputSchema,
  inviteOutputSchema,
  listStaffInputSchema,
  listStaffOutputSchema,
  listStudentsInputSchema,
  listStudentsOutputSchema,
  removeGuardianInputSchema,
  setPersonStatusInputSchema,
  staffDetailSchema,
  studentDetailSchema,
  updateStaffInputSchema,
  updateStudentInputSchema,
} from "@erp/contracts";
import { recordSchoolAudit, type SchoolScope, schema, withSchool } from "@erp/db";
import { normalizeIndianPhone } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { activeSessionId, visibleSections } from "../scope";
import { requirePermission, router, schoolProcedure } from "../trpc";
import { studentImportRouter } from "./student-import";

const view = schoolProcedure.use(requirePermission("people.view"));
const staffView = schoolProcedure.use(requirePermission("staff.view"));
const manage = schoolProcedure.use(requirePermission("people.manage"));
const ok = z.object({ ok: z.literal(true) });
const idInput = z.object({ id: z.uuid() });

const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `This ${what} was not found.` });
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;

function pgCode(error: unknown): string | undefined {
  return (
    (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code
  );
}

function cleanPhone(value: string): string | null {
  if (!value.trim()) return null;
  const phone = normalizeIndianPhone(value);
  if (!phone) throw bad("Enter a valid 10-digit mobile number.");
  return phone;
}

const orNull = (value: string) => value.trim() || null;

/** Finds the guardian with this email in the school, or creates one. Returns the id. */
async function upsertGuardian(
  scope: SchoolScope,
  input: { fullName: string; email: string; phone: string },
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (email) {
    const [existing] = await scope.tx
      .select({ id: schema.guardians.id })
      .from(schema.guardians)
      .where(sql`lower(${schema.guardians.email}) = ${email}`);
    if (existing) return existing.id;
  }
  const [created] = await scope.tx
    .insert(schema.guardians)
    .values({
      schoolId: scope.schoolId,
      fullName: input.fullName,
      email: email || null,
      phone: cleanPhone(input.phone),
    })
    .returning({ id: schema.guardians.id });
  if (!created)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save the guardian." });
  return created.id;
}

const studentsRouter = router({
  list: view
    .input(listStudentsInputSchema)
    .output(listStudentsOutputSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        const sections = await visibleSections(scope, ctx);
        const { students, studentEnrolments, sections: sectionTable, classes } = schema;
        const where = and(
          isNull(students.deletedAt),
          input.search
            ? or(
                ilike(students.fullName, likePattern(input.search)),
                ilike(students.admissionNo, likePattern(input.search)),
              )
            : undefined,
          input.sectionId ? eq(studentEnrolments.sectionId, input.sectionId) : undefined,
          sections
            ? inArray(studentEnrolments.sectionId, sections.length ? sections : [ctx.schoolId])
            : undefined,
        );
        const from = scope.tx
          .select({
            id: students.id,
            admissionNo: students.admissionNo,
            fullName: students.fullName,
            status: students.status,
            className: classes.name,
            sectionName: sectionTable.name,
          })
          .from(students)
          .leftJoin(
            studentEnrolments,
            and(
              eq(studentEnrolments.studentId, students.id),
              sessionId ? eq(studentEnrolments.academicSessionId, sessionId) : sql`false`,
            ),
          )
          .leftJoin(sectionTable, eq(sectionTable.id, studentEnrolments.sectionId))
          .leftJoin(classes, eq(classes.id, sectionTable.classId));
        const column = input.sort === "admissionNo" ? students.admissionNo : students.fullName;
        const items = await from
          .where(where)
          .orderBy(input.direction === "desc" ? desc(column) : asc(column), asc(students.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        const [count] = await scope.tx
          .select({ total: sql<number>`count(*)::int` })
          .from(students)
          .leftJoin(
            studentEnrolments,
            and(
              eq(studentEnrolments.studentId, students.id),
              sessionId ? eq(studentEnrolments.academicSessionId, sessionId) : sql`false`,
            ),
          )
          .where(where);
        return { items, total: count?.total ?? 0 };
      }),
    ),

  get: view
    .input(idInput)
    .output(studentDetailSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        const { students, studentEnrolments, sections, classes, guardians, studentGuardians } =
          schema;
        const [row] = await scope.tx
          .select({
            student: students,
            sectionId: studentEnrolments.sectionId,
            sectionName: sections.name,
            className: classes.name,
          })
          .from(students)
          .leftJoin(
            studentEnrolments,
            and(
              eq(studentEnrolments.studentId, students.id),
              sessionId ? eq(studentEnrolments.academicSessionId, sessionId) : sql`false`,
            ),
          )
          .leftJoin(sections, eq(sections.id, studentEnrolments.sectionId))
          .leftJoin(classes, eq(classes.id, sections.classId))
          .where(and(eq(students.id, input.id), isNull(students.deletedAt)));
        const allowed = await visibleSections(scope, ctx);
        if (!row || (allowed && (!row.sectionId || !allowed.includes(row.sectionId))))
          throw notFound("student");
        const links = await scope.tx
          .select({ guardian: guardians, relation: studentGuardians.relation })
          .from(studentGuardians)
          .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
          .where(eq(studentGuardians.studentId, input.id));
        const s = row.student;
        return {
          id: s.id,
          admissionNo: s.admissionNo,
          fullName: s.fullName,
          dateOfBirth: s.dateOfBirth,
          gender: s.gender,
          admissionDate: s.admissionDate,
          status: s.status,
          sectionId: row.sectionId,
          className: row.className,
          sectionName: row.sectionName,
          hasLogin: s.userId !== null,
          guardians: links.map(({ guardian: g, relation }) => ({
            id: g.id,
            fullName: g.fullName,
            email: g.email,
            phone: g.phone,
            relation,
            hasLogin: g.userId !== null,
          })),
        };
      }),
    ),

  create: manage
    .input(createStudentInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an academic session first (School setup).",
          });
        const [section] = await scope.tx
          .select({ id: schema.sections.id })
          .from(schema.sections)
          .where(eq(schema.sections.id, input.sectionId));
        if (!section) throw bad("Choose a class and section.");
        let studentId: string;
        try {
          const [student] = await scope.tx
            .insert(schema.students)
            .values({
              schoolId: ctx.schoolId,
              admissionNo: input.admissionNo,
              fullName: input.fullName,
              dateOfBirth: orNull(input.dateOfBirth),
              gender: input.gender,
              admissionDate: orNull(input.admissionDate),
              consentRecordedAt: new Date(),
              consentRecordedBy: ctx.user.id,
            })
            .returning({ id: schema.students.id });
          if (!student) throw new Error("insert failed");
          studentId = student.id;
        } catch (error) {
          if (pgCode(error) === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "A student with this admission number already exists.",
            });
          throw error;
        }
        await scope.tx.insert(schema.studentEnrolments).values({
          schoolId: ctx.schoolId,
          studentId,
          academicSessionId: sessionId,
          sectionId: input.sectionId,
        });
        for (const guardian of input.guardians) {
          const guardianId = await upsertGuardian(scope, guardian);
          await scope.tx
            .insert(schema.studentGuardians)
            .values({
              schoolId: ctx.schoolId,
              studentId,
              guardianId,
              relation: orNull(guardian.relation),
            })
            .onConflictDoNothing();
        }
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "student.created",
          entityType: "student",
          entityId: studentId,
          metadata: { consentRecorded: true },
        });
        return { id: studentId };
      }),
    ),

  update: manage
    .input(updateStudentInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        try {
          const updated = await scope.tx
            .update(schema.students)
            .set({
              admissionNo: input.admissionNo,
              fullName: input.fullName,
              dateOfBirth: orNull(input.dateOfBirth),
              gender: input.gender,
              admissionDate: orNull(input.admissionDate),
            })
            .where(and(eq(schema.students.id, input.id), isNull(schema.students.deletedAt)))
            .returning({ id: schema.students.id });
          if (updated.length === 0) throw notFound("student");
        } catch (error) {
          if (pgCode(error) === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "A student with this admission number already exists.",
            });
          throw error;
        }
        const sessionId = await activeSessionId(scope);
        if (sessionId) {
          const [section] = await scope.tx
            .select({ id: schema.sections.id })
            .from(schema.sections)
            .where(eq(schema.sections.id, input.sectionId));
          if (!section) throw bad("Choose a class and section.");
          await scope.tx
            .insert(schema.studentEnrolments)
            .values({
              schoolId: ctx.schoolId,
              studentId: input.id,
              academicSessionId: sessionId,
              sectionId: input.sectionId,
            })
            .onConflictDoUpdate({
              target: [
                schema.studentEnrolments.studentId,
                schema.studentEnrolments.academicSessionId,
              ],
              set: { sectionId: input.sectionId },
            });
        }
        return { ok: true as const };
      }),
    ),

  setStatus: manage
    .input(setPersonStatusInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const updated = await scope.tx
          .update(schema.students)
          .set({ status: input.status })
          .where(eq(schema.students.id, input.id))
          .returning({ id: schema.students.id });
        if (updated.length === 0) throw notFound("student");
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: input.status === "left" ? "student.left_school" : "student.reinstated",
          entityType: "student",
          entityId: input.id,
        });
        return { ok: true as const };
      }),
    ),

  addGuardian: manage
    .input(addGuardianInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [student] = await scope.tx
          .select({ id: schema.students.id })
          .from(schema.students)
          .where(eq(schema.students.id, input.studentId));
        if (!student) throw notFound("student");
        const guardianId = await upsertGuardian(scope, input.guardian);
        await scope.tx
          .insert(schema.studentGuardians)
          .values({
            schoolId: ctx.schoolId,
            studentId: input.studentId,
            guardianId,
            relation: orNull(input.guardian.relation),
          })
          .onConflictDoNothing();
        return { ok: true as const };
      }),
    ),

  removeGuardian: manage
    .input(removeGuardianInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await scope.tx
          .delete(schema.studentGuardians)
          .where(
            and(
              eq(schema.studentGuardians.studentId, input.studentId),
              eq(schema.studentGuardians.guardianId, input.guardianId),
            ),
          );
        return { ok: true as const };
      }),
    ),
});

const staffRouter = router({
  list: staffView
    .input(listStaffInputSchema)
    .output(listStaffOutputSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const s = schema.staff;
        const where = and(
          isNull(s.deletedAt),
          input.kind ? eq(s.kind, input.kind) : undefined,
          input.search
            ? or(
                ilike(s.fullName, likePattern(input.search)),
                ilike(s.email, likePattern(input.search)),
              )
            : undefined,
        );
        const rows = await scope.tx
          .select()
          .from(s)
          .where(where)
          .orderBy(asc(s.fullName), asc(s.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        const [count] = await scope.tx
          .select({ total: sql<number>`count(*)::int` })
          .from(s)
          .where(where);
        return {
          items: rows.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            kind: r.kind,
            email: r.email,
            phone: r.phone,
            status: r.status,
            hasLogin: r.userId !== null,
          })),
          total: count?.total ?? 0,
        };
      }),
    ),

  get: staffView
    .input(idInput)
    .output(staffDetailSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.staff)
          .where(and(eq(schema.staff.id, input.id), isNull(schema.staff.deletedAt)));
        if (!row) throw notFound("staff member");
        const sessionId = await activeSessionId(scope);
        const assignments = sessionId
          ? await scope.tx
              .select({
                id: schema.teacherAssignments.id,
                sectionId: schema.teacherAssignments.sectionId,
                className: schema.classes.name,
                sectionName: schema.sections.name,
                subjectId: schema.teacherAssignments.subjectId,
                subjectName: schema.subjects.name,
              })
              .from(schema.teacherAssignments)
              .innerJoin(
                schema.sections,
                eq(schema.sections.id, schema.teacherAssignments.sectionId),
              )
              .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
              .leftJoin(
                schema.subjects,
                eq(schema.subjects.id, schema.teacherAssignments.subjectId),
              )
              .where(
                and(
                  eq(schema.teacherAssignments.staffId, input.id),
                  eq(schema.teacherAssignments.academicSessionId, sessionId),
                ),
              )
              .orderBy(asc(schema.classes.sortOrder), asc(schema.sections.name))
          : [];
        return {
          id: row.id,
          fullName: row.fullName,
          kind: row.kind,
          email: row.email,
          phone: row.phone,
          status: row.status,
          hasLogin: row.userId !== null,
          assignments,
        };
      }),
    ),

  create: manage
    .input(createStaffInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        try {
          const [row] = await scope.tx
            .insert(schema.staff)
            .values({
              schoolId: ctx.schoolId,
              kind: input.kind,
              fullName: input.fullName,
              email: orNull(input.email)?.toLowerCase() ?? null,
              phone: cleanPhone(input.phone),
            })
            .returning({ id: schema.staff.id });
          if (!row) throw new Error("insert failed");
          return { id: row.id };
        } catch (error) {
          if (pgCode(error) === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "Someone with this email address already exists.",
            });
          throw error;
        }
      }),
    ),

  update: manage
    .input(updateStaffInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        try {
          const updated = await scope.tx
            .update(schema.staff)
            .set({
              kind: input.kind,
              fullName: input.fullName,
              email: orNull(input.email)?.toLowerCase() ?? null,
              phone: cleanPhone(input.phone),
            })
            .where(and(eq(schema.staff.id, input.id), isNull(schema.staff.deletedAt)))
            .returning({ id: schema.staff.id });
          if (updated.length === 0) throw notFound("staff member");
        } catch (error) {
          if (pgCode(error) === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "Someone with this email address already exists.",
            });
          throw error;
        }
        return { ok: true as const };
      }),
    ),

  setStatus: manage
    .input(setPersonStatusInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const updated = await scope.tx
          .update(schema.staff)
          .set({ status: input.status })
          .where(eq(schema.staff.id, input.id))
          .returning({ id: schema.staff.id });
        if (updated.length === 0) throw notFound("staff member");
        return { ok: true as const };
      }),
    ),

  assign: manage
    .input(assignInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [member] = await scope.tx
          .select()
          .from(schema.staff)
          .where(eq(schema.staff.id, input.staffId));
        if (!member) throw notFound("staff member");
        if (member.kind !== "teacher") throw bad("Only teachers can be assigned to classes.");
        const sessionId = await activeSessionId(scope);
        if (!sessionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an academic session first (School setup).",
          });
        const [section] = await scope.tx
          .select({ id: schema.sections.id })
          .from(schema.sections)
          .where(eq(schema.sections.id, input.sectionId));
        if (!section) throw notFound("section");
        if (input.subjectId) {
          const [subject] = await scope.tx
            .select({ id: schema.subjects.id })
            .from(schema.subjects)
            .where(eq(schema.subjects.id, input.subjectId));
          if (!subject) throw notFound("subject");
        }
        try {
          await scope.tx.insert(schema.teacherAssignments).values({
            schoolId: ctx.schoolId,
            staffId: input.staffId,
            academicSessionId: sessionId,
            sectionId: input.sectionId,
            subjectId: input.subjectId,
          });
        } catch (error) {
          if (pgCode(error) === "23505") {
            throw new TRPCError({
              code: "CONFLICT",
              message: input.subjectId
                ? "This subject already has a teacher in this section."
                : "This section already has a class teacher.",
            });
          }
          throw error;
        }
        return { ok: true as const };
      }),
    ),

  unassign: manage
    .input(idInput)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await scope.tx
          .delete(schema.teacherAssignments)
          .where(eq(schema.teacherAssignments.id, input.id));
        return { ok: true as const };
      }),
    ),
});

export const peopleRouter = router({
  students: studentsRouter,
  staff: staffRouter,
  studentImport: studentImportRouter,

  /**
   * Gives a person a login. A new account is created without a password and the person gets an
   * email with a link to set their own, so passwords are never shared (ADR-023).
   */
  invite: manage
    .input(inviteInputSchema)
    .output(inviteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const record = await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        if (input.kind === "staff") {
          const [row] = await scope.tx
            .select()
            .from(schema.staff)
            .where(eq(schema.staff.id, input.id));
          return (
            row && {
              email: row.email,
              name: row.fullName,
              userId: row.userId,
              role: row.kind === "teacher" ? ("teacher" as const) : ("staff" as const),
            }
          );
        }
        if (input.kind === "guardian") {
          const [row] = await scope.tx
            .select()
            .from(schema.guardians)
            .where(eq(schema.guardians.id, input.id));
          return (
            row && {
              email: row.email,
              name: row.fullName,
              userId: row.userId,
              role: "parent" as const,
            }
          );
        }
        const [row] = await scope.tx
          .select()
          .from(schema.students)
          .where(eq(schema.students.id, input.id));
        return (
          row && {
            email: input.email ?? null,
            name: row.fullName,
            userId: row.userId,
            role: "student" as const,
          }
        );
      });
      if (!record) throw notFound("person");
      const email = record.email?.trim().toLowerCase();
      if (!email) throw bad("Add an email address for this person first.");

      const existing = record.userId ?? (await ctx.authAdmin.findUserIdByEmail(email));
      let userId = existing;
      if (!userId) {
        try {
          userId = (await ctx.authAdmin.createUser({ email, name: record.name })).id;
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "We could not create the account. Please try again later.",
          });
        }
      }
      const linkedUserId = userId;
      await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const table =
          input.kind === "staff"
            ? schema.staff
            : input.kind === "guardian"
              ? schema.guardians
              : schema.students;
        await scope.tx.update(table).set({ userId: linkedUserId }).where(eq(table.id, input.id));
        await scope.tx
          .insert(schema.memberships)
          .values({ userId: linkedUserId, schoolId: ctx.schoolId, roles: [record.role] })
          .onConflictDoUpdate({
            target: [schema.memberships.userId, schema.memberships.schoolId],
            set: {
              roles: sql`(select array(select distinct unnest(${schema.memberships.roles} || ARRAY[${record.role}]::school_role[])))`,
              status: "active",
            },
          });
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "people.invited",
          entityType: input.kind,
          entityId: input.id,
          metadata: { role: record.role, newAccount: !existing },
        });
      });
      if (!existing) {
        try {
          await ctx.authAdmin.sendPasswordSetupEmail(email);
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The account was created but the email could not be sent.",
          });
        }
        return { emailSent: true };
      }
      return { emailSent: false };
    }),
});
