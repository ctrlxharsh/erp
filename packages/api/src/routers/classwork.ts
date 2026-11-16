import {
  createHomeworkInputSchema,
  createMaterialInputSchema,
  diaryEntrySchema,
  homeworkRosterSchema,
  homeworkSummarySchema,
  listDiaryInputSchema,
  listHomeworkInputSchema,
  listMaterialInputSchema,
  saveDiaryInputSchema,
  setHomeworkStatusInputSchema,
  studyMaterialSchema,
} from "@erp/contracts";
import { type SchoolScope, schema, withSchool } from "@erp/db";
import { schoolToday } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type NotificationInput, saveNotifications } from "../notify";
import {
  activeSessionId,
  currentTeacher,
  readableSections,
  sectionAudienceUserIds,
  teachesSubjectIn,
} from "../scope";
import { requirePermission, router, schoolProcedure } from "../trpc";
import { assertCanSeeStudent } from "./attendance";

const hwView = schoolProcedure.use(requirePermission("homework.view"));
const hwManage = schoolProcedure.use(requirePermission("homework.manage"));
const diaryView = schoolProcedure.use(requirePermission("diary.view"));
const diaryManage = schoolProcedure.use(requirePermission("diary.manage"));
const materialView = schoolProcedure.use(requirePermission("material.view"));
const materialManage = schoolProcedure.use(requirePermission("material.manage"));
const ok = z.object({ ok: z.literal(true) });

const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `This ${what} was not found.` });
const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const needSession = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Add an academic session first (School setup).",
  });
const isLeadership = (roles: readonly string[]) =>
  roles.includes("school_admin") || roles.includes("principal");

/** Homework rows with their subject, class and teacher names. */
function homeworkQuery(scope: SchoolScope) {
  const h = schema.homework;
  return scope.tx
    .select({
      id: h.id,
      title: h.title,
      details: h.details,
      sectionId: h.sectionId,
      subjectId: h.subjectId,
      staffId: h.staffId,
      subjectName: schema.subjects.name,
      className: schema.classes.name,
      sectionName: schema.sections.name,
      teacherName: schema.staff.fullName,
      dueDate: h.dueDate,
      isGraded: h.isGraded,
      maxMarks: h.maxMarks,
    })
    .from(h)
    .innerJoin(schema.subjects, eq(schema.subjects.id, h.subjectId))
    .innerJoin(schema.sections, eq(schema.sections.id, h.sectionId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
    .innerJoin(schema.staff, eq(schema.staff.id, h.staffId));
}
type HomeworkRow = Awaited<ReturnType<typeof homeworkQuery>>[number];

async function attachmentsFor(scope: SchoolScope, homeworkIds: string[]) {
  if (homeworkIds.length === 0) return new Map<string, string[]>();
  const rows = await scope.tx
    .select({
      homeworkId: schema.homeworkAttachments.homeworkId,
      fileId: schema.homeworkAttachments.fileId,
    })
    .from(schema.homeworkAttachments)
    .where(inArray(schema.homeworkAttachments.homeworkId, homeworkIds));
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.homeworkId, [...(map.get(row.homeworkId) ?? []), row.fileId]);
  return map;
}

const summary = (
  row: HomeworkRow,
  attachmentIds: string[],
  status: { status: "pending" | "submitted" | "late"; marks: string | null } | null,
) => ({
  id: row.id,
  title: row.title,
  details: row.details,
  subjectName: row.subjectName,
  sectionLabel: `${row.className} ${row.sectionName}`,
  teacherName: row.teacherName,
  dueDate: row.dueDate,
  isGraded: row.isGraded,
  maxMarks: row.maxMarks,
  attachmentIds,
  status: status?.status ?? null,
  marks: status?.marks != null ? Number(status.marks) : null,
});

const homeworkRouter = router({
  /** Homework for a section, or for one student (with that student's status and marks). */
  list: hwView
    .input(listHomeworkInputSchema)
    .output(z.array(homeworkSummarySchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId) return [];
        let sectionIds: string[] | null;
        let studentId: string | null = null;
        if (input.studentId) {
          await assertCanSeeStudent(scope, ctx, input.studentId);
          const [enrolment] = await scope.tx
            .select({ sectionId: schema.studentEnrolments.sectionId })
            .from(schema.studentEnrolments)
            .where(
              and(
                eq(schema.studentEnrolments.studentId, input.studentId),
                eq(schema.studentEnrolments.academicSessionId, sessionId),
              ),
            );
          sectionIds = enrolment ? [enrolment.sectionId] : [];
          studentId = input.studentId;
        } else {
          const readable = await readableSections(scope, ctx);
          sectionIds = input.sectionId
            ? readable === null || readable.includes(input.sectionId)
              ? [input.sectionId]
              : []
            : readable;
        }
        if (sectionIds !== null && sectionIds.length === 0) return [];
        const rows = await homeworkQuery(scope)
          .where(
            and(
              eq(schema.homework.academicSessionId, sessionId),
              sectionIds ? inArray(schema.homework.sectionId, sectionIds) : undefined,
            ),
          )
          .orderBy(desc(schema.homework.dueDate), desc(schema.homework.createdAt))
          .limit(100);
        const files = await attachmentsFor(
          scope,
          rows.map((r) => r.id),
        );
        const statuses = new Map<
          string,
          { status: "pending" | "submitted" | "late"; marks: string | null }
        >();
        if (studentId && rows.length > 0) {
          const found = await scope.tx
            .select({
              homeworkId: schema.homeworkStatus.homeworkId,
              status: schema.homeworkStatus.status,
              marks: schema.homeworkStatus.marks,
            })
            .from(schema.homeworkStatus)
            .where(
              and(
                eq(schema.homeworkStatus.studentId, studentId),
                inArray(
                  schema.homeworkStatus.homeworkId,
                  rows.map((r) => r.id),
                ),
              ),
            );
          for (const s of found) statuses.set(s.homeworkId, s);
        }
        return rows.map((r) =>
          summary(
            r,
            files.get(r.id) ?? [],
            studentId ? (statuses.get(r.id) ?? { status: "pending" as const, marks: null }) : null,
          ),
        );
      }),
    ),

  /** One homework with the class list (teachers who teach it, School Admin and Principal only). */
  roster: hwView
    .input(z.object({ homeworkId: z.uuid() }))
    .output(homeworkRosterSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        const [row] = await homeworkQuery(scope).where(eq(schema.homework.id, input.homeworkId));
        const readable = await readableSections(scope, ctx);
        if (!sessionId || !row || (readable && !readable.includes(row.sectionId)))
          throw notFound("homework");
        const canManage =
          ctx.permissions.has("homework.manage") &&
          (await teachesSubjectIn(scope, ctx.user.id, row.sectionId, row.subjectId, sessionId));
        const files = await attachmentsFor(scope, [row.id]);
        let students: {
          id: string;
          fullName: string;
          status: "pending" | "submitted" | "late";
          marks: number | null;
        }[] = [];
        if (canManage || isLeadership(ctx.roles)) {
          const enrolled = await scope.tx
            .select({ id: schema.students.id, fullName: schema.students.fullName })
            .from(schema.studentEnrolments)
            .innerJoin(schema.students, eq(schema.students.id, schema.studentEnrolments.studentId))
            .where(
              and(
                eq(schema.studentEnrolments.sectionId, row.sectionId),
                eq(schema.studentEnrolments.academicSessionId, sessionId),
                eq(schema.students.status, "active"),
              ),
            )
            .orderBy(asc(schema.students.fullName));
          const saved = await scope.tx
            .select({
              studentId: schema.homeworkStatus.studentId,
              status: schema.homeworkStatus.status,
              marks: schema.homeworkStatus.marks,
            })
            .from(schema.homeworkStatus)
            .where(eq(schema.homeworkStatus.homeworkId, row.id));
          const byStudent = new Map(saved.map((s) => [s.studentId, s]));
          students = enrolled.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            status: byStudent.get(s.id)?.status ?? "pending",
            marks: byStudent.get(s.id)?.marks != null ? Number(byStudent.get(s.id)?.marks) : null,
          }));
        }
        return { homework: summary(row, files.get(row.id) ?? [], null), canManage, students };
      }),
    ),

  create: hwManage
    .input(createHomeworkInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId) throw needSession();
        const teacher = await currentTeacher(scope, ctx.user.id);
        if (
          !teacher ||
          !(await teachesSubjectIn(scope, ctx.user.id, input.sectionId, input.subjectId, sessionId))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only set homework for classes and subjects assigned to you.",
          });
        }
        if (input.dueDate < schoolToday()) throw bad("The due date cannot be in the past.");
        if (input.fileIds.length > 0) {
          const found = await scope.tx
            .select({ id: schema.files.id })
            .from(schema.files)
            .where(
              and(
                inArray(schema.files.id, input.fileIds),
                eq(schema.files.purpose, "homework_attachment"),
                eq(schema.files.status, "ready"),
                eq(schema.files.ownerUserId, ctx.user.id),
              ),
            );
          if (found.length !== new Set(input.fileIds).size)
            throw bad("An attachment was not found. Please upload it again.");
        }
        const [created] = await scope.tx
          .insert(schema.homework)
          .values({
            schoolId: ctx.schoolId,
            academicSessionId: sessionId,
            sectionId: input.sectionId,
            subjectId: input.subjectId,
            staffId: teacher.id,
            title: input.title,
            details: input.details || null,
            dueDate: input.dueDate,
            isGraded: input.isGraded,
            maxMarks: input.isGraded ? input.maxMarks : null,
          })
          .returning({ id: schema.homework.id });
        if (!created)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not save the homework.",
          });
        if (input.fileIds.length > 0) {
          await scope.tx.insert(schema.homeworkAttachments).values(
            [...new Set(input.fileIds)].map((fileId) => ({
              schoolId: ctx.schoolId,
              homeworkId: created.id,
              fileId,
            })),
          );
        }
        const audience = await sectionAudienceUserIds(scope, input.sectionId, sessionId);
        const notices: NotificationInput[] = audience.map((userId) => ({
          userId,
          kind: "homework.published",
          title: `New homework: ${input.title}`,
          body: `Due ${input.dueDate}`,
          link: "/homework",
        }));
        await saveNotifications(scope, notices);
        return { id: created.id };
      }),
    ),

  /** The teacher records Pending / Submitted / Late and, for graded homework, marks. */
  setStatus: hwManage
    .input(setHomeworkStatusInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        const [row] = await homeworkQuery(scope).where(eq(schema.homework.id, input.homeworkId));
        if (!sessionId || !row) throw notFound("homework");
        if (!(await teachesSubjectIn(scope, ctx.user.id, row.sectionId, row.subjectId, sessionId)))
          throw notFound("homework");
        const enrolled = await scope.tx
          .select({ id: schema.studentEnrolments.studentId })
          .from(schema.studentEnrolments)
          .where(
            and(
              eq(schema.studentEnrolments.sectionId, row.sectionId),
              eq(schema.studentEnrolments.academicSessionId, sessionId),
            ),
          );
        const inSection = new Set(enrolled.map((e) => e.id));
        for (const entry of input.entries) {
          if (!inSection.has(entry.studentId)) throw bad("Some students are not in this class.");
          if (entry.marks !== null) {
            if (!row.isGraded) throw bad("This homework is not graded.");
            if (entry.marks > (row.maxMarks ?? 0))
              throw bad(`Marks cannot be more than ${row.maxMarks}.`);
          }
        }
        await scope.tx
          .insert(schema.homeworkStatus)
          .values(
            input.entries.map((e) => ({
              schoolId: ctx.schoolId,
              homeworkId: row.id,
              studentId: e.studentId,
              status: e.status,
              marks: e.marks === null ? null : String(e.marks),
            })),
          )
          .onConflictDoUpdate({
            target: [schema.homeworkStatus.homeworkId, schema.homeworkStatus.studentId],
            set: { status: sql`excluded.status`, marks: sql`excluded.marks` },
          });
        return { ok: true as const };
      }),
    ),
});

const diaryRouter = router({
  list: diaryView
    .input(listDiaryInputSchema)
    .output(z.array(diaryEntrySchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const readable = await readableSections(scope, ctx);
        if (readable && !readable.includes(input.sectionId)) return [];
        const d = schema.classDiaryEntries;
        const rows = await scope.tx
          .select({
            id: d.id,
            date: d.date,
            className: schema.classes.name,
            sectionName: schema.sections.name,
            subjectName: schema.subjects.name,
            teacherName: schema.staff.fullName,
            topic: d.topic,
            notes: d.notes,
          })
          .from(d)
          .innerJoin(schema.sections, eq(schema.sections.id, d.sectionId))
          .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
          .innerJoin(schema.subjects, eq(schema.subjects.id, d.subjectId))
          .innerJoin(schema.staff, eq(schema.staff.id, d.staffId))
          .where(
            and(eq(d.sectionId, input.sectionId), gte(d.date, input.from), lte(d.date, input.to)),
          )
          .orderBy(desc(d.date), asc(schema.subjects.name));
        return rows.map((r) => ({
          id: r.id,
          date: r.date,
          sectionLabel: `${r.className} ${r.sectionName}`,
          subjectName: r.subjectName,
          teacherName: r.teacherName,
          topic: r.topic,
          notes: r.notes,
        }));
      }),
    ),

  /** One entry per section, subject and day; saving again replaces it. */
  save: diaryManage
    .input(saveDiaryInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId) throw needSession();
        const teacher = await currentTeacher(scope, ctx.user.id);
        if (
          !teacher ||
          !(await teachesSubjectIn(scope, ctx.user.id, input.sectionId, input.subjectId, sessionId))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only write the diary for classes and subjects assigned to you.",
          });
        }
        if (input.date > schoolToday()) throw bad("The diary cannot be written for a future date.");
        await scope.tx
          .insert(schema.classDiaryEntries)
          .values({
            schoolId: ctx.schoolId,
            academicSessionId: sessionId,
            sectionId: input.sectionId,
            subjectId: input.subjectId,
            staffId: teacher.id,
            date: input.date,
            topic: input.topic,
            notes: input.notes || null,
          })
          .onConflictDoUpdate({
            target: [
              schema.classDiaryEntries.sectionId,
              schema.classDiaryEntries.subjectId,
              schema.classDiaryEntries.date,
            ],
            set: { topic: input.topic, notes: input.notes || null, staffId: teacher.id },
          });
        return { ok: true as const };
      }),
    ),
});

const materialRouter = router({
  list: materialView
    .input(listMaterialInputSchema)
    .output(z.array(studyMaterialSchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const readable = await readableSections(scope, ctx);
        let classIds: string[] | null = null;
        if (readable) {
          if (readable.length === 0) return [];
          const rows = await scope.tx
            .select({ classId: schema.sections.classId })
            .from(schema.sections)
            .where(inArray(schema.sections.id, readable));
          classIds = [...new Set(rows.map((r) => r.classId))];
        }
        const m = schema.studyMaterials;
        const rows = await scope.tx
          .select({
            id: m.id,
            title: m.title,
            className: schema.classes.name,
            subjectName: schema.subjects.name,
            teacherName: schema.staff.fullName,
            fileId: m.fileId,
            createdAt: m.createdAt,
          })
          .from(m)
          .innerJoin(schema.classes, eq(schema.classes.id, m.classId))
          .innerJoin(schema.subjects, eq(schema.subjects.id, m.subjectId))
          .innerJoin(schema.staff, eq(schema.staff.id, m.staffId))
          .where(
            and(
              classIds
                ? inArray(m.classId, classIds.length ? classIds : [ctx.schoolId])
                : undefined,
              input.classId ? eq(m.classId, input.classId) : undefined,
            ),
          )
          .orderBy(desc(m.createdAt))
          .limit(100);
        return rows;
      }),
    ),

  create: materialManage
    .input(createMaterialInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId) throw needSession();
        const teacher = await currentTeacher(scope, ctx.user.id);
        const a = schema.teacherAssignments;
        const [assignment] = teacher
          ? await scope.tx
              .select({ id: a.id })
              .from(a)
              .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
              .where(
                and(
                  eq(a.staffId, teacher.id),
                  eq(a.academicSessionId, sessionId),
                  eq(a.subjectId, input.subjectId),
                  eq(schema.sections.classId, input.classId),
                ),
              )
              .limit(1)
          : [];
        if (!teacher || !assignment)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only share material for classes and subjects assigned to you.",
          });
        const [file] = await scope.tx
          .select({ id: schema.files.id })
          .from(schema.files)
          .where(
            and(
              eq(schema.files.id, input.fileId),
              eq(schema.files.purpose, "study_material"),
              eq(schema.files.status, "ready"),
              eq(schema.files.ownerUserId, ctx.user.id),
            ),
          );
        if (!file) throw bad("The file was not found. Please upload it again.");
        await scope.tx.insert(schema.studyMaterials).values({
          schoolId: ctx.schoolId,
          classId: input.classId,
          subjectId: input.subjectId,
          staffId: teacher.id,
          title: input.title,
          fileId: input.fileId,
        });
        return { ok: true as const };
      }),
    ),
});

export const classworkRouter = router({
  homework: homeworkRouter,
  diary: diaryRouter,
  material: materialRouter,

  /** The subject-section pairs the signed-in teacher takes, for the "new homework / diary / material" forms. */
  myAssignments: schoolProcedure
    .use(requirePermission("school.view"))
    .output(
      z.array(
        z.object({
          sectionId: z.uuid(),
          classId: z.uuid(),
          label: z.string(),
          subjectId: z.uuid(),
          subjectName: z.string(),
        }),
      ),
    )
    .query(({ ctx }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId) return [];
        const a = schema.teacherAssignments;
        const rows = await scope.tx
          .select({
            sectionId: a.sectionId,
            classId: schema.sections.classId,
            className: schema.classes.name,
            sectionName: schema.sections.name,
            subjectId: schema.subjects.id,
            subjectName: schema.subjects.name,
          })
          .from(a)
          .innerJoin(schema.staff, eq(schema.staff.id, a.staffId))
          .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
          .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
          .innerJoin(schema.subjects, eq(schema.subjects.id, a.subjectId))
          .where(and(eq(schema.staff.userId, ctx.user.id), eq(a.academicSessionId, sessionId)))
          .orderBy(
            asc(schema.classes.sortOrder),
            asc(schema.sections.name),
            asc(schema.subjects.name),
          );
        return rows.map((r) => ({
          sectionId: r.sectionId,
          classId: r.classId,
          label: `${r.className} ${r.sectionName}`,
          subjectId: r.subjectId,
          subjectName: r.subjectName,
        }));
      }),
    ),
});
