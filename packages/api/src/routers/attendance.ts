import {
  attendanceSectionSchema,
  attendanceSheetInputSchema,
  attendanceSheetSchema,
  saveAttendanceInputSchema,
  saveAttendanceOutputSchema,
  saveStaffAttendanceInputSchema,
  staffSheetInputSchema,
  staffSheetSchema,
  studentAttendanceInputSchema,
  studentAttendanceSchema,
} from "@erp/contracts";
import { recordSchoolAudit, type SchoolScope, schema, withSchool } from "@erp/db";
import {
  type AttendanceStatus,
  attendanceAccess,
  attendancePercent,
  schoolToday,
} from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type NotificationInput, saveNotifications, sendNotificationEmails } from "../notify";
import { activeSessionId, visibleSections } from "../scope";
import { requirePermission, router, schoolProcedure } from "../trpc";

const view = schoolProcedure.use(requirePermission("attendance.view"));
const staffView = schoolProcedure.use(requirePermission("staff_attendance.view"));
const staffManage = schoolProcedure.use(requirePermission("staff_attendance.manage"));

const deniedMessage = {
  future: "Attendance cannot be marked for a future date.",
  holiday: "This day is a holiday, so attendance is not taken.",
  window_closed: "Today's window has closed. Ask the school admin to correct it.",
  not_class_teacher: "Only the class teacher of this section can mark attendance.",
} as const;

async function holidayOn(scope: SchoolScope, date: string): Promise<string | null> {
  const e = schema.calendarEvents;
  const [row] = await scope.tx
    .select({ title: e.title })
    .from(e)
    .where(and(eq(e.type, "holiday"), lte(e.startDate, date), gte(e.endDate, date)))
    .limit(1);
  return row?.title ?? null;
}

async function isClassTeacher(
  scope: SchoolScope,
  userId: string,
  sectionId: string,
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
        eq(a.academicSessionId, sessionId),
        isNull(a.subjectId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function sectionStudents(scope: SchoolScope, sectionId: string, sessionId: string) {
  const { students, studentEnrolments } = schema;
  return scope.tx
    .select({ id: students.id, fullName: students.fullName, rollNo: studentEnrolments.rollNo })
    .from(studentEnrolments)
    .innerJoin(students, eq(students.id, studentEnrolments.studentId))
    .where(
      and(
        eq(studentEnrolments.sectionId, sectionId),
        eq(studentEnrolments.academicSessionId, sessionId),
        isNull(students.deletedAt),
        eq(students.status, "active"),
      ),
    )
    .orderBy(asc(studentEnrolments.rollNo), asc(students.fullName));
}

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `This ${what} was not found.` });

export const attendanceRouter = router({
  /** The sections this person can open: a teacher's own, or all of them for admins and the principal. */
  sections: view.output(z.array(attendanceSectionSchema)).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) => {
      const sessionId = await activeSessionId(scope);
      if (!sessionId) return [];
      const visible = await visibleSections(scope, ctx);
      const { sections, classes } = schema;
      const rows = await scope.tx
        .select({ id: sections.id, className: classes.name, sectionName: sections.name })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .where(
          visible ? inArray(sections.id, visible.length ? visible : [ctx.schoolId]) : undefined,
        )
        .orderBy(asc(classes.sortOrder), asc(sections.name));
      const today = schoolToday();
      const marked = await scope.tx
        .select({ sectionId: schema.attendanceDays.sectionId })
        .from(schema.attendanceDays)
        .where(
          and(
            eq(schema.attendanceDays.date, today),
            eq(schema.attendanceDays.academicSessionId, sessionId),
          ),
        );
      const markedSet = new Set(marked.map((m) => m.sectionId));
      const result = [];
      for (const r of rows) {
        result.push({
          sectionId: r.id,
          label: `${r.className} ${r.sectionName}`,
          isClassTeacher: await isClassTeacher(scope, ctx.user.id, r.id, sessionId),
          markedToday: markedSet.has(r.id),
        });
      }
      return result;
    }),
  ),

  sheet: view
    .input(attendanceSheetInputSchema)
    .output(attendanceSheetSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an academic session first (School setup).",
          });
        const visible = await visibleSections(scope, ctx);
        if (visible && !visible.includes(input.sectionId)) throw notFound("class");
        const [section] = await scope.tx
          .select({ className: schema.classes.name, sectionName: schema.sections.name })
          .from(schema.sections)
          .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
          .where(eq(schema.sections.id, input.sectionId));
        if (!section) throw notFound("class");

        const today = schoolToday();
        const holiday = await holidayOn(scope, input.date);
        const classTeacher = await isClassTeacher(scope, ctx.user.id, input.sectionId, sessionId);
        const access = attendanceAccess({
          date: input.date,
          today,
          isHoliday: holiday !== null,
          isClassTeacher: classTeacher,
          canCorrect: ctx.permissions.has("attendance.edit_after_window"),
        });
        const [day] = await scope.tx
          .select({ id: schema.attendanceDays.id })
          .from(schema.attendanceDays)
          .where(
            and(
              eq(schema.attendanceDays.sectionId, input.sectionId),
              eq(schema.attendanceDays.date, input.date),
            ),
          );
        const records = day
          ? await scope.tx
              .select({
                studentId: schema.attendanceRecords.studentId,
                status: schema.attendanceRecords.status,
              })
              .from(schema.attendanceRecords)
              .where(eq(schema.attendanceRecords.attendanceDayId, day.id))
          : [];
        const statusOf = new Map(records.map((r) => [r.studentId, r.status]));
        const students = await sectionStudents(scope, input.sectionId, sessionId);
        return {
          sectionLabel: `${section.className} ${section.sectionName}`,
          date: input.date,
          today,
          holiday,
          access: access.kind === "denied" ? ("view" as const) : access.kind,
          note: access.kind === "denied" ? deniedMessage[access.reason] : null,
          marked: Boolean(day),
          students: students.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            rollNo: s.rollNo,
            status: statusOf.get(s.id) ?? null,
          })),
        };
      }),
    ),

  save: view
    .input(saveAttendanceInputSchema)
    .output(saveAttendanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const pending: NotificationInput[] = [];
      const result = await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an academic session first (School setup).",
          });
        const visible = await visibleSections(scope, ctx);
        if (visible && !visible.includes(input.sectionId)) throw notFound("class");
        const holiday = await holidayOn(scope, input.date);
        const access = attendanceAccess({
          date: input.date,
          today: schoolToday(),
          isHoliday: holiday !== null,
          isClassTeacher: await isClassTeacher(scope, ctx.user.id, input.sectionId, sessionId),
          canCorrect: ctx.permissions.has("attendance.edit_after_window"),
        });
        if (access.kind === "denied")
          throw new TRPCError({ code: "FORBIDDEN", message: deniedMessage[access.reason] });
        if (access.kind === "correction" && (input.reason?.trim().length ?? 0) < 5) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please give a reason for this correction (at least 5 characters).",
          });
        }

        const students = await sectionStudents(scope, input.sectionId, sessionId);
        const known = new Map(students.map((s) => [s.id, s.fullName]));
        if (input.entries.some((e) => !known.has(e.studentId))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Some students are not in this class.",
          });
        }

        const [existingDay] = await scope.tx
          .select({ id: schema.attendanceDays.id })
          .from(schema.attendanceDays)
          .where(
            and(
              eq(schema.attendanceDays.sectionId, input.sectionId),
              eq(schema.attendanceDays.date, input.date),
            ),
          );
        const dayId =
          existingDay?.id ??
          (
            await scope.tx
              .insert(schema.attendanceDays)
              .values({
                schoolId: ctx.schoolId,
                academicSessionId: sessionId,
                sectionId: input.sectionId,
                date: input.date,
                markedBy: ctx.user.id,
              })
              .returning({ id: schema.attendanceDays.id })
          )[0]?.id;
        if (!dayId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not save attendance.",
          });

        const before = new Map<string, AttendanceStatus>(
          (
            await scope.tx
              .select({
                studentId: schema.attendanceRecords.studentId,
                status: schema.attendanceRecords.status,
              })
              .from(schema.attendanceRecords)
              .where(eq(schema.attendanceRecords.attendanceDayId, dayId))
          ).map((r) => [r.studentId, r.status]),
        );
        await scope.tx
          .insert(schema.attendanceRecords)
          .values(
            input.entries.map((e) => ({
              schoolId: ctx.schoolId,
              attendanceDayId: dayId,
              studentId: e.studentId,
              status: e.status,
            })),
          )
          .onConflictDoUpdate({
            target: [schema.attendanceRecords.attendanceDayId, schema.attendanceRecords.studentId],
            set: { status: sql`excluded.status` },
          });
        if (existingDay) {
          await scope.tx
            .update(schema.attendanceDays)
            .set({ markedBy: ctx.user.id, markedAt: new Date() })
            .where(eq(schema.attendanceDays.id, dayId));
        }

        // Parents of children who are newly absent get an alert (in-app and email).
        const newlyAbsent = input.entries.filter(
          (e) => e.status === "absent" && before.get(e.studentId) !== "absent",
        );
        if (newlyAbsent.length > 0) {
          const links = await scope.tx
            .select({
              studentId: schema.studentGuardians.studentId,
              userId: schema.guardians.userId,
            })
            .from(schema.studentGuardians)
            .innerJoin(
              schema.guardians,
              eq(schema.guardians.id, schema.studentGuardians.guardianId),
            )
            .where(
              inArray(
                schema.studentGuardians.studentId,
                newlyAbsent.map((e) => e.studentId),
              ),
            );
          const dateText = new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${input.date}T00:00:00Z`));
          for (const link of links) {
            if (!link.userId) continue;
            pending.push({
              userId: link.userId,
              kind: "attendance.absent",
              title: `${known.get(link.studentId)} was marked absent`,
              body: dateText,
              link: "/",
              email: true,
            });
          }
          await saveNotifications(scope, pending);
        }

        if (access.kind === "correction") {
          await recordSchoolAudit(scope, {
            actorUserId: ctx.user.id,
            action: "attendance.corrected",
            entityType: "section",
            entityId: input.sectionId,
            metadata: {
              date: input.date,
              reason: input.reason?.trim(),
              changed: input.entries.length,
            },
          });
        }
        return { saved: input.entries.length, absentNotified: pending.length };
      });
      // Emails go out after the transaction has committed.
      await sendNotificationEmails(ctx.db, ctx.email, pending);
      return result;
    }),

  /** A student's marks over a date range, with totals. Students see themselves, parents their children. */
  forStudent: view
    .input(studentAttendanceInputSchema)
    .output(studentAttendanceSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await assertCanSeeStudent(scope, ctx, input.studentId);
        const days = schema.attendanceDays;
        const rows = await scope.tx
          .select({ date: days.date, status: schema.attendanceRecords.status })
          .from(schema.attendanceRecords)
          .innerJoin(days, eq(days.id, schema.attendanceRecords.attendanceDayId))
          .where(
            and(
              eq(schema.attendanceRecords.studentId, input.studentId),
              gte(days.date, input.from),
              lte(days.date, input.to),
            ),
          )
          .orderBy(asc(days.date));
        const counts = { present: 0, absent: 0, leave: 0, late: 0 };
        for (const r of rows) counts[r.status]++;
        return { records: rows, counts, percent: attendancePercent(counts) };
      }),
    ),

  staffSheet: staffView
    .input(staffSheetInputSchema)
    .output(staffSheetSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const holiday = await holidayOn(scope, input.date);
        const members = await scope.tx
          .select({ id: schema.staff.id, fullName: schema.staff.fullName, kind: schema.staff.kind })
          .from(schema.staff)
          .where(and(isNull(schema.staff.deletedAt), eq(schema.staff.status, "active")))
          .orderBy(asc(schema.staff.fullName));
        const marks = await scope.tx
          .select({
            staffId: schema.staffAttendance.staffId,
            status: schema.staffAttendance.status,
          })
          .from(schema.staffAttendance)
          .where(eq(schema.staffAttendance.date, input.date));
        const statusOf = new Map(marks.map((m) => [m.staffId, m.status]));
        return {
          date: input.date,
          holiday,
          canEdit:
            ctx.permissions.has("staff_attendance.manage") &&
            !holiday &&
            input.date <= schoolToday(),
          staff: members.map((m) => ({ ...m, status: statusOf.get(m.id) ?? null })),
        };
      }),
    ),

  saveStaff: staffManage
    .input(saveStaffAttendanceInputSchema)
    .output(z.object({ saved: z.number().int() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        if (input.date > schoolToday())
          throw new TRPCError({ code: "FORBIDDEN", message: deniedMessage.future });
        if (await holidayOn(scope, input.date))
          throw new TRPCError({ code: "FORBIDDEN", message: deniedMessage.holiday });
        const known = await scope.tx
          .select({ id: schema.staff.id })
          .from(schema.staff)
          .where(
            inArray(
              schema.staff.id,
              input.entries.map((e) => e.staffId),
            ),
          );
        if (known.length !== new Set(input.entries.map((e) => e.staffId)).size)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Some people were not found." });
        await scope.tx
          .insert(schema.staffAttendance)
          .values(
            input.entries.map((e) => ({
              schoolId: ctx.schoolId,
              staffId: e.staffId,
              date: input.date,
              status: e.status,
              markedBy: ctx.user.id,
            })),
          )
          .onConflictDoUpdate({
            target: [schema.staffAttendance.staffId, schema.staffAttendance.date],
            set: { status: sql`excluded.status`, markedBy: ctx.user.id },
          });
        return { saved: input.entries.length };
      }),
    ),
});

/** Students see themselves, parents their own children, staff the sections they may see. */
export async function assertCanSeeStudent(
  scope: SchoolScope,
  ctx: { user: { id: string }; roles: readonly string[] },
  studentId: string,
) {
  const [student] = await scope.tx
    .select({ id: schema.students.id, userId: schema.students.userId })
    .from(schema.students)
    .where(eq(schema.students.id, studentId));
  if (!student) throw notFound("student");
  if (student.userId === ctx.user.id) return;
  const [link] = await scope.tx
    .select({ id: schema.guardians.id })
    .from(schema.studentGuardians)
    .innerJoin(schema.guardians, eq(schema.guardians.id, schema.studentGuardians.guardianId))
    .where(
      and(
        eq(schema.studentGuardians.studentId, studentId),
        eq(schema.guardians.userId, ctx.user.id),
      ),
    );
  if (link) return;
  const visible = await visibleSections(scope, { roles: ctx.roles, user: ctx.user });
  if (visible === null) return;
  const sessionId = await activeSessionId(scope);
  const [enrolment] = sessionId
    ? await scope.tx
        .select({ sectionId: schema.studentEnrolments.sectionId })
        .from(schema.studentEnrolments)
        .where(
          and(
            eq(schema.studentEnrolments.studentId, studentId),
            eq(schema.studentEnrolments.academicSessionId, sessionId),
          ),
        )
    : [];
  if (enrolment && visible.includes(enrolment.sectionId)) return;
  throw notFound("student");
}
