import {
  admitCardSchema,
  batchDetailSchema,
  batchKeyInputSchema,
  batchSummarySchema,
  createExamInputSchema,
  examSchema,
  examSubjectSchema,
  gradeBandSchema,
  myResultsInputSchema,
  myResultsSchema,
  publishInputSchema,
  rejectBatchInputSchema,
  reportCardInputSchema,
  reportCardSchema,
  reviewListInputSchema,
  saveExamSubjectInputSchema,
  saveGradeBandsInputSchema,
  saveMarksInputSchema,
} from "@erp/contracts";
import { recordSchoolAudit, type SchoolScope, schema, withSchool } from "@erp/db";
import {
  defaultGradeBands,
  type GradeBand,
  gradeFor,
  nextResultStatus,
  percentage,
  type ResultStatus,
  summarise,
  validateGradeBands,
} from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { EmailSender } from "../email";
import { type NotificationInput, saveNotifications, sendNotificationEmails } from "../notify";
import { activeSessionId, sectionAudienceUserIds, teachesSubjectIn } from "../scope";
import { requirePermission, router, schoolProcedure } from "../trpc";
import { assertCanSeeStudent } from "./attendance";

const examsView = schoolProcedure.use(requirePermission("exams.view"));
const examsManage = schoolProcedure.use(requirePermission("exams.manage"));
const enterMarks = schoolProcedure.use(requirePermission("marks.enter"));
const approve = schoolProcedure.use(requirePermission("marks.approve"));
const ownResults = schoolProcedure.use(requirePermission("results.view_own"));
const setupManage = schoolProcedure.use(requirePermission("school.setup"));
const ok = z.object({ ok: z.literal(true) });

const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = (what: string) =>
  new TRPCError({ code: "NOT_FOUND", message: `This ${what} was not found.` });
const refused = (message: string) => new TRPCError({ code: "PRECONDITION_FAILED", message });
const needSession = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Add an academic session first (School setup).",
  });
const pgCode = (error: unknown) =>
  (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
const num = (value: string | null) => (value === null ? null : Number(value));

/** The school's grade bands, seeding the CBSE scale on first use. */
export async function loadBands(scope: SchoolScope): Promise<GradeBand[]> {
  let rows = await scope.tx.select().from(schema.gradeBands);
  if (rows.length === 0) {
    await scope.tx.insert(schema.gradeBands).values(
      defaultGradeBands.map((b) => ({
        schoolId: scope.schoolId,
        grade: b.grade,
        minPercent: b.minPercent,
        gradePoint: b.gradePoint,
      })),
    );
    rows = await scope.tx.select().from(schema.gradeBands);
  }
  return rows
    .map((r) => ({ grade: r.grade, minPercent: r.minPercent, gradePoint: r.gradePoint }))
    .sort((a, b) => b.minPercent - a.minPercent);
}

const gradesRouter = router({
  get: examsView
    .output(z.array(gradeBandSchema))
    .query(({ ctx }) => withSchool(ctx.db, ctx.schoolId, (scope) => loadBands(scope))),

  save: setupManage
    .input(saveGradeBandsInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) => {
      const problems = validateGradeBands(input.bands);
      if (problems.length > 0) throw bad(problems[0] ?? "This grade scale cannot be saved.");
      return withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await scope.tx.delete(schema.gradeBands);
        await scope.tx.insert(schema.gradeBands).values(
          input.bands.map((b) => ({
            schoolId: ctx.schoolId,
            grade: b.grade.trim(),
            minPercent: b.minPercent,
            gradePoint: b.gradePoint,
          })),
        );
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "grades.scale_changed",
          entityType: "grade_scale",
          metadata: { bands: input.bands.length },
        });
        return { ok: true as const };
      });
    }),
});

/** Everything about one (exam, section, subject): the schedule row for max marks and date, and the batch if any. */
async function loadBatchContext(
  scope: SchoolScope,
  key: { examId: string; sectionId: string; subjectId: string },
) {
  const [info] = await scope.tx
    .select({
      examName: schema.exams.name,
      sessionId: schema.exams.academicSessionId,
      sectionLabelClass: schema.classes.name,
      sectionLabelSection: schema.sections.name,
      classId: schema.sections.classId,
      subjectName: schema.subjects.name,
    })
    .from(schema.exams)
    .innerJoin(schema.sections, eq(schema.sections.id, key.sectionId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
    .innerJoin(schema.subjects, eq(schema.subjects.id, key.subjectId))
    .where(eq(schema.exams.id, key.examId));
  if (!info) throw notFound("exam");
  const [slot] = await scope.tx
    .select({ maxMarks: schema.examSubjects.maxMarks, date: schema.examSubjects.date })
    .from(schema.examSubjects)
    .where(
      and(
        eq(schema.examSubjects.examId, key.examId),
        eq(schema.examSubjects.classId, info.classId),
        eq(schema.examSubjects.subjectId, key.subjectId),
      ),
    );
  if (!slot) throw bad("This subject is not scheduled for this class in this exam.");
  const [batch] = await scope.tx
    .select()
    .from(schema.resultBatches)
    .where(
      and(
        eq(schema.resultBatches.examId, key.examId),
        eq(schema.resultBatches.sectionId, key.sectionId),
        eq(schema.resultBatches.subjectId, key.subjectId),
      ),
    );
  return { info, slot, batch: batch ?? null };
}

function summary(
  key: { examId: string; sectionId: string; subjectId: string },
  c: Awaited<ReturnType<typeof loadBatchContext>>,
  teacherName: string | null,
) {
  return {
    id: c.batch?.id ?? null,
    examId: key.examId,
    examName: c.info.examName,
    sectionId: key.sectionId,
    sectionLabel: `${c.info.sectionLabelClass} ${c.info.sectionLabelSection}`,
    subjectId: key.subjectId,
    subjectName: c.info.subjectName,
    maxMarks: c.slot.maxMarks,
    date: c.slot.date,
    status: (c.batch?.status ?? "draft") as ResultStatus,
    decisionComment: c.batch?.decisionComment ?? null,
    teacherName,
  };
}

async function teacherNameFor(
  scope: SchoolScope,
  sectionId: string,
  subjectId: string,
  sessionId: string,
) {
  const a = schema.teacherAssignments;
  const [row] = await scope.tx
    .select({ name: schema.staff.fullName })
    .from(a)
    .innerJoin(schema.staff, eq(schema.staff.id, a.staffId))
    .where(
      and(
        eq(a.sectionId, sectionId),
        eq(a.subjectId, subjectId),
        eq(a.academicSessionId, sessionId),
      ),
    );
  return row?.name ?? null;
}

async function sectionRoster(scope: SchoolScope, sectionId: string, sessionId: string) {
  return scope.tx
    .select({ id: schema.students.id, fullName: schema.students.fullName })
    .from(schema.studentEnrolments)
    .innerJoin(schema.students, eq(schema.students.id, schema.studentEnrolments.studentId))
    .where(
      and(
        eq(schema.studentEnrolments.sectionId, sectionId),
        eq(schema.studentEnrolments.academicSessionId, sessionId),
        eq(schema.students.status, "active"),
      ),
    )
    .orderBy(asc(schema.students.fullName));
}

const examsRouter = router({
  list: examsView.output(z.array(examSchema)).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) => {
      const sessionId = await activeSessionId(scope);
      if (!sessionId) return [];
      const rows = await scope.tx
        .select()
        .from(schema.exams)
        .where(eq(schema.exams.academicSessionId, sessionId))
        .orderBy(asc(schema.exams.createdAt));
      const counts = await scope.tx
        .select({ examId: schema.examSubjects.examId, n: sql<number>`count(*)::int` })
        .from(schema.examSubjects)
        .groupBy(schema.examSubjects.examId);
      const countOf = new Map(counts.map((c) => [c.examId, c.n]));
      return rows.map((r) => ({ id: r.id, name: r.name, subjectCount: countOf.get(r.id) ?? 0 }));
    }),
  ),

  create: examsManage
    .input(createExamInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSessionId(scope);
        if (!sessionId) throw needSession();
        try {
          const [row] = await scope.tx
            .insert(schema.exams)
            .values({ schoolId: ctx.schoolId, academicSessionId: sessionId, name: input.name })
            .returning({ id: schema.exams.id });
          if (!row) throw new Error("insert failed");
          return { id: row.id };
        } catch (error) {
          if (pgCode(error) === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "An exam with this name already exists this year.",
            });
          throw error;
        }
      }),
    ),

  schedule: examsView
    .input(z.object({ examId: z.uuid() }))
    .output(z.array(examSubjectSchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const e = schema.examSubjects;
        return tx
          .select({
            id: e.id,
            classId: e.classId,
            className: schema.classes.name,
            subjectId: e.subjectId,
            subjectName: schema.subjects.name,
            date: e.date,
            startTime: e.startTime,
            maxMarks: e.maxMarks,
          })
          .from(e)
          .innerJoin(schema.classes, eq(schema.classes.id, e.classId))
          .innerJoin(schema.subjects, eq(schema.subjects.id, e.subjectId))
          .where(eq(e.examId, input.examId))
          .orderBy(asc(e.date), asc(schema.classes.sortOrder), asc(schema.subjects.name))
          .then((rows) =>
            rows.map((r) => ({ ...r, startTime: r.startTime ? r.startTime.slice(0, 5) : null })),
          );
      }),
    ),

  saveSubject: examsManage
    .input(saveExamSubjectInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const [exam] = await tx
          .select({ id: schema.exams.id })
          .from(schema.exams)
          .where(eq(schema.exams.id, input.examId));
        const [cls] = await tx
          .select({ id: schema.classes.id })
          .from(schema.classes)
          .where(eq(schema.classes.id, input.classId));
        const [subject] = await tx
          .select({ id: schema.subjects.id })
          .from(schema.subjects)
          .where(eq(schema.subjects.id, input.subjectId));
        if (!exam || !cls || !subject) throw bad("Choose a valid exam, class and subject.");
        // Marks already entered use the old maximum, so it cannot change once entry has started.
        const started = await tx
          .select({ id: schema.resultBatches.id })
          .from(schema.resultBatches)
          .innerJoin(schema.sections, eq(schema.sections.id, schema.resultBatches.sectionId))
          .where(
            and(
              eq(schema.resultBatches.examId, input.examId),
              eq(schema.resultBatches.subjectId, input.subjectId),
              eq(schema.sections.classId, input.classId),
            ),
          )
          .limit(1);
        const [existing] = await tx
          .select({ maxMarks: schema.examSubjects.maxMarks })
          .from(schema.examSubjects)
          .where(
            and(
              eq(schema.examSubjects.examId, input.examId),
              eq(schema.examSubjects.classId, input.classId),
              eq(schema.examSubjects.subjectId, input.subjectId),
            ),
          );
        if (started.length > 0 && existing && existing.maxMarks !== input.maxMarks)
          throw refused("Marks have already been entered, so the maximum cannot change.");
        await tx
          .insert(schema.examSubjects)
          .values({
            schoolId: ctx.schoolId,
            examId: input.examId,
            classId: input.classId,
            subjectId: input.subjectId,
            date: input.date,
            startTime: input.startTime || null,
            maxMarks: input.maxMarks,
          })
          .onConflictDoUpdate({
            target: [
              schema.examSubjects.examId,
              schema.examSubjects.classId,
              schema.examSubjects.subjectId,
            ],
            set: { date: input.date, startTime: input.startTime || null, maxMarks: input.maxMarks },
          });
        return { ok: true as const };
      }),
    ),

  removeSubject: examsManage
    .input(z.object({ id: z.uuid() }))
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const [slot] = await tx
          .select()
          .from(schema.examSubjects)
          .where(eq(schema.examSubjects.id, input.id));
        if (!slot) throw notFound("exam subject");
        const used = await tx
          .select({ id: schema.resultBatches.id })
          .from(schema.resultBatches)
          .innerJoin(schema.sections, eq(schema.sections.id, schema.resultBatches.sectionId))
          .where(
            and(
              eq(schema.resultBatches.examId, slot.examId),
              eq(schema.resultBatches.subjectId, slot.subjectId),
              eq(schema.sections.classId, slot.classId),
            ),
          )
          .limit(1);
        if (used.length > 0) throw refused("Marks have already been entered for this subject.");
        await tx.delete(schema.examSubjects).where(eq(schema.examSubjects.id, input.id));
        return { ok: true as const };
      }),
    ),
});

const marksRouter = router({
  /** Exam subjects the teacher can enter marks for: their own subject-section pairs that are scheduled. */
  available: enterMarks.output(z.array(batchSummarySchema)).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) => {
      const sessionId = await activeSessionId(scope);
      if (!sessionId) return [];
      const a = schema.teacherAssignments;
      const pairs = await scope.tx
        .select({
          sectionId: a.sectionId,
          subjectId: a.subjectId,
          classId: schema.sections.classId,
          className: schema.classes.name,
          sectionName: schema.sections.name,
          subjectName: schema.subjects.name,
          teacher: schema.staff.fullName,
        })
        .from(a)
        .innerJoin(schema.staff, eq(schema.staff.id, a.staffId))
        .innerJoin(schema.sections, eq(schema.sections.id, a.sectionId))
        .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
        .innerJoin(schema.subjects, eq(schema.subjects.id, a.subjectId))
        .where(and(eq(schema.staff.userId, ctx.user.id), eq(a.academicSessionId, sessionId)));
      const result = [];
      for (const pair of pairs) {
        if (!pair.subjectId) continue;
        const slots = await scope.tx
          .select({
            examId: schema.examSubjects.examId,
            examName: schema.exams.name,
            maxMarks: schema.examSubjects.maxMarks,
            date: schema.examSubjects.date,
          })
          .from(schema.examSubjects)
          .innerJoin(schema.exams, eq(schema.exams.id, schema.examSubjects.examId))
          .where(
            and(
              eq(schema.examSubjects.classId, pair.classId),
              eq(schema.examSubjects.subjectId, pair.subjectId),
              eq(schema.exams.academicSessionId, sessionId),
            ),
          );
        for (const slot of slots) {
          const [batch] = await scope.tx
            .select()
            .from(schema.resultBatches)
            .where(
              and(
                eq(schema.resultBatches.examId, slot.examId),
                eq(schema.resultBatches.sectionId, pair.sectionId),
                eq(schema.resultBatches.subjectId, pair.subjectId),
              ),
            );
          result.push({
            id: batch?.id ?? null,
            examId: slot.examId,
            examName: slot.examName,
            sectionId: pair.sectionId,
            sectionLabel: `${pair.className} ${pair.sectionName}`,
            subjectId: pair.subjectId,
            subjectName: pair.subjectName,
            maxMarks: slot.maxMarks,
            date: slot.date,
            status: (batch?.status ?? "draft") as ResultStatus,
            decisionComment: batch?.decisionComment ?? null,
            teacherName: pair.teacher,
          });
        }
      }
      return result.sort((x, y) => x.date.localeCompare(y.date));
    }),
  ),

  /** The marks sheet for one batch. Teachers see only their own; the Principal sees any. */
  sheet: schoolProcedure
    .input(batchKeyInputSchema)
    .output(batchDetailSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const isReviewer = ctx.permissions.has("marks.approve");
        const c = await loadBatchContext(scope, input);
        const teaches =
          ctx.permissions.has("marks.enter") &&
          (await teachesSubjectIn(
            scope,
            ctx.user.id,
            input.sectionId,
            input.subjectId,
            c.info.sessionId,
          ));
        if (!teaches && !isReviewer) throw notFound("marks sheet");
        // Reviewers see a batch only once it has been submitted.
        if (!teaches && (!c.batch || c.batch.status === "draft")) throw notFound("marks sheet");
        const roster = await sectionRoster(scope, input.sectionId, c.info.sessionId);
        const saved = c.batch
          ? await scope.tx.select().from(schema.marks).where(eq(schema.marks.batchId, c.batch.id))
          : [];
        const byStudent = new Map(saved.map((m) => [m.studentId, m]));
        const status = (c.batch?.status ?? "draft") as ResultStatus;
        return {
          batch: summary(
            input,
            c,
            await teacherNameFor(scope, input.sectionId, input.subjectId, c.info.sessionId),
          ),
          canEdit: teaches && nextResultStatus(status, "edit") !== null,
          students: roster.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            marks: num(byStudent.get(s.id)?.marks ?? null),
            absent: byStudent.get(s.id)?.absent ?? false,
          })),
        };
      }),
    ),

  save: enterMarks
    .input(saveMarksInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const c = await loadBatchContext(scope, input);
        if (
          !(await teachesSubjectIn(
            scope,
            ctx.user.id,
            input.sectionId,
            input.subjectId,
            c.info.sessionId,
          ))
        )
          throw notFound("marks sheet");
        const status = (c.batch?.status ?? "draft") as ResultStatus;
        if (nextResultStatus(status, "edit") === null)
          throw refused("These marks have been sent for approval and can no longer be changed.");
        const roster = new Set(
          (await sectionRoster(scope, input.sectionId, c.info.sessionId)).map((s) => s.id),
        );
        for (const entry of input.entries) {
          if (!roster.has(entry.studentId)) throw bad("Some students are not in this class.");
          if (entry.absent && entry.marks !== null)
            throw bad("An absent student cannot have marks.");
          if (entry.marks !== null && entry.marks > c.slot.maxMarks)
            throw bad(`Marks cannot be more than ${c.slot.maxMarks}.`);
        }
        const batchId =
          c.batch?.id ??
          (
            await scope.tx
              .insert(schema.resultBatches)
              .values({
                schoolId: ctx.schoolId,
                examId: input.examId,
                sectionId: input.sectionId,
                subjectId: input.subjectId,
              })
              .returning({ id: schema.resultBatches.id })
          )[0]?.id;
        if (!batchId)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not save the marks.",
          });
        await scope.tx
          .insert(schema.marks)
          .values(
            input.entries.map((e) => ({
              schoolId: ctx.schoolId,
              batchId,
              studentId: e.studentId,
              marks: e.marks === null ? null : String(e.marks),
              absent: e.absent,
            })),
          )
          .onConflictDoUpdate({
            target: [schema.marks.batchId, schema.marks.studentId],
            set: { marks: sql`excluded.marks`, absent: sql`excluded.absent` },
          });
        return { ok: true as const };
      }),
    ),

  /** Sends the batch to the Principal. Every student must have marks or be marked absent. */
  submit: enterMarks
    .input(batchKeyInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const c = await loadBatchContext(scope, input);
        if (
          !(await teachesSubjectIn(
            scope,
            ctx.user.id,
            input.sectionId,
            input.subjectId,
            c.info.sessionId,
          ))
        )
          throw notFound("marks sheet");
        if (!c.batch || nextResultStatus(c.batch.status, "submit") === null)
          throw refused("There are no marks to send, or they have already been sent.");
        const roster = await sectionRoster(scope, input.sectionId, c.info.sessionId);
        const saved = await scope.tx
          .select()
          .from(schema.marks)
          .where(eq(schema.marks.batchId, c.batch.id));
        const complete = new Set(
          saved.filter((m) => m.absent || m.marks !== null).map((m) => m.studentId),
        );
        const missing = roster.filter((s) => !complete.has(s.id));
        if (missing.length > 0)
          throw bad(
            `Marks are missing for ${missing.length} student(s), for example ${missing[0]?.fullName}.`,
          );
        await scope.tx
          .update(schema.resultBatches)
          .set({ status: "submitted", submittedBy: ctx.user.id, decisionComment: null })
          .where(eq(schema.resultBatches.id, c.batch.id));
        const principals = await scope.tx
          .select({ userId: schema.memberships.userId })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.status, "active"),
              sql`'principal' = any(${schema.memberships.roles})`,
            ),
          );
        await saveNotifications(
          scope,
          principals.map((p) => ({
            userId: p.userId,
            kind: "marks.submitted",
            title: "Marks submitted for approval",
            body: `${c.info.examName}: ${c.info.subjectName}, ${c.info.sectionLabelClass} ${c.info.sectionLabelSection}`,
            link: "/results",
          })),
        );
        return { ok: true as const };
      }),
    ),
});

const resultsRouter = router({
  /** Batches for the Principal to review. */
  review: approve
    .input(reviewListInputSchema)
    .output(z.array(batchSummarySchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const b = schema.resultBatches;
        const rows = await scope.tx
          .select({
            batch: b,
            examName: schema.exams.name,
            sessionId: schema.exams.academicSessionId,
            className: schema.classes.name,
            sectionName: schema.sections.name,
            classId: schema.sections.classId,
            subjectName: schema.subjects.name,
          })
          .from(b)
          .innerJoin(schema.exams, eq(schema.exams.id, b.examId))
          .innerJoin(schema.sections, eq(schema.sections.id, b.sectionId))
          .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
          .innerJoin(schema.subjects, eq(schema.subjects.id, b.subjectId))
          .where(
            and(
              input.examId ? eq(b.examId, input.examId) : undefined,
              input.status ? eq(b.status, input.status) : sql`${b.status} <> 'draft'`,
            ),
          )
          .orderBy(
            asc(schema.classes.sortOrder),
            asc(schema.sections.name),
            asc(schema.subjects.name),
          );
        const result = [];
        for (const r of rows) {
          const [slot] = await scope.tx
            .select({ maxMarks: schema.examSubjects.maxMarks, date: schema.examSubjects.date })
            .from(schema.examSubjects)
            .where(
              and(
                eq(schema.examSubjects.examId, r.batch.examId),
                eq(schema.examSubjects.classId, r.classId),
                eq(schema.examSubjects.subjectId, r.batch.subjectId),
              ),
            );
          result.push({
            id: r.batch.id,
            examId: r.batch.examId,
            examName: r.examName,
            sectionId: r.batch.sectionId,
            sectionLabel: `${r.className} ${r.sectionName}`,
            subjectId: r.batch.subjectId,
            subjectName: r.subjectName,
            maxMarks: slot?.maxMarks ?? 0,
            date: slot?.date ?? "",
            status: r.batch.status as ResultStatus,
            decisionComment: r.batch.decisionComment,
            teacherName: await teacherNameFor(
              scope,
              r.batch.sectionId,
              r.batch.subjectId,
              r.sessionId,
            ),
          });
        }
        return result;
      }),
    ),

  approve: approve
    .input(batchKeyInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) => decide(ctx, input, "approve")),

  reject: approve
    .input(rejectBatchInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) => decide(ctx, input, "reject", input.comment)),

  /** Publishes approved batches and tells students and parents. */
  publish: approve
    .input(publishInputSchema)
    .output(z.object({ published: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const emails: NotificationInput[] = [];
      const result = await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const notified = new Set<string>();
        let published = 0;
        for (const key of input.batches) {
          const c = await loadBatchContext(scope, key);
          if (!c.batch || nextResultStatus(c.batch.status, "publish") === null)
            throw refused("Only approved results can be published.");
          await scope.tx
            .update(schema.resultBatches)
            .set({ status: "published", publishedAt: new Date() })
            .where(eq(schema.resultBatches.id, c.batch.id));
          published++;
          const tag = `${key.examId}:${key.sectionId}`;
          if (notified.has(tag)) continue;
          notified.add(tag);
          const audience = await sectionAudienceUserIds(scope, key.sectionId, c.info.sessionId);
          const items: NotificationInput[] = audience.map((userId) => ({
            userId,
            kind: "results.published",
            title: `Results published: ${c.info.examName}`,
            body: "Open Results to see the marks.",
            link: "/results",
            email: true,
          }));
          await saveNotifications(scope, items);
          emails.push(...items);
        }
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "results.published",
          entityType: "result_batches",
          metadata: { count: published },
        });
        return { published };
      });
      await sendNotificationEmails(ctx.db, ctx.email, emails);
      return result;
    }),

  /** The exams that have results for this student, for their own or their child's results page. */
  mine: ownResults
    .input(myResultsInputSchema)
    .output(myResultsSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await assertCanSeeStudent(scope, ctx, input.studentId);
        const sessionId = await activeSessionId(scope);
        if (!sessionId) return [];
        const [enrolment] = await scope.tx
          .select({
            sectionId: schema.studentEnrolments.sectionId,
            classId: schema.sections.classId,
          })
          .from(schema.studentEnrolments)
          .innerJoin(schema.sections, eq(schema.sections.id, schema.studentEnrolments.sectionId))
          .where(
            and(
              eq(schema.studentEnrolments.studentId, input.studentId),
              eq(schema.studentEnrolments.academicSessionId, sessionId),
            ),
          );
        if (!enrolment) return [];
        const exams = await scope.tx
          .select()
          .from(schema.exams)
          .where(eq(schema.exams.academicSessionId, sessionId))
          .orderBy(asc(schema.exams.createdAt));
        const result = [];
        for (const exam of exams) {
          const scheduled = await scope.tx
            .select({ id: schema.examSubjects.id })
            .from(schema.examSubjects)
            .where(
              and(
                eq(schema.examSubjects.examId, exam.id),
                eq(schema.examSubjects.classId, enrolment.classId),
              ),
            );
          if (scheduled.length === 0) continue;
          const published = await scope.tx
            .select({ id: schema.resultBatches.id })
            .from(schema.resultBatches)
            .where(
              and(
                eq(schema.resultBatches.examId, exam.id),
                eq(schema.resultBatches.sectionId, enrolment.sectionId),
                eq(schema.resultBatches.status, "published"),
              ),
            );
          result.push({
            examId: exam.id,
            examName: exam.name,
            publishedSubjects: published.length,
            scheduledSubjects: scheduled.length,
          });
        }
        return result;
      }),
    ),

  reportCard: ownResults
    .input(reportCardInputSchema)
    .output(reportCardSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await assertCanSeeStudent(scope, ctx, input.studentId);
        return buildReportCard(scope, input.examId, input.studentId);
      }),
    ),

  admitCard: ownResults
    .input(reportCardInputSchema)
    .output(admitCardSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await assertCanSeeStudent(scope, ctx, input.studentId);
        const sessionId = await activeSessionId(scope);
        const [exam] = await scope.tx
          .select()
          .from(schema.exams)
          .where(eq(schema.exams.id, input.examId));
        const [student] = await scope.tx
          .select({
            fullName: schema.students.fullName,
            admissionNo: schema.students.admissionNo,
            className: schema.classes.name,
            sectionName: schema.sections.name,
            classId: schema.sections.classId,
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
          .where(eq(schema.students.id, input.studentId));
        if (!exam || !student?.classId) throw notFound("admit card");
        const schedule = await scope.tx
          .select({
            date: schema.examSubjects.date,
            startTime: schema.examSubjects.startTime,
            subject: schema.subjects.name,
            maxMarks: schema.examSubjects.maxMarks,
          })
          .from(schema.examSubjects)
          .innerJoin(schema.subjects, eq(schema.subjects.id, schema.examSubjects.subjectId))
          .where(
            and(
              eq(schema.examSubjects.examId, input.examId),
              eq(schema.examSubjects.classId, student.classId),
            ),
          )
          .orderBy(asc(schema.examSubjects.date), asc(schema.subjects.name));
        if (schedule.length === 0) throw notFound("admit card");
        return {
          exam: { id: exam.id, name: exam.name },
          student: {
            fullName: student.fullName,
            admissionNo: student.admissionNo,
            className: student.className,
            sectionName: student.sectionName,
          },
          schedule: schedule.map((s) => ({
            ...s,
            startTime: s.startTime ? s.startTime.slice(0, 5) : null,
          })),
        };
      }),
    ),
});

type DecideCtx = {
  db: Parameters<typeof withSchool>[0];
  schoolId: string;
  user: { id: string };
  email: EmailSender;
};

async function decide(
  ctx: DecideCtx,
  key: { examId: string; sectionId: string; subjectId: string },
  action: "approve" | "reject",
  comment?: string,
) {
  const emails: NotificationInput[] = [];
  await withSchool(ctx.db, ctx.schoolId, async (scope) => {
    const c = await loadBatchContext(scope, key);
    if (!c.batch) throw notFound("marks sheet");
    const next = nextResultStatus(c.batch.status, action);
    if (next === null) throw refused("These marks are not waiting for a decision.");
    await scope.tx
      .update(schema.resultBatches)
      .set({ status: next, decidedBy: ctx.user.id, decisionComment: comment ?? null })
      .where(eq(schema.resultBatches.id, c.batch.id));
    await recordSchoolAudit(scope, {
      actorUserId: ctx.user.id,
      action: action === "approve" ? "marks.approved" : "marks.rejected",
      entityType: "result_batch",
      entityId: c.batch.id,
    });
    if (c.batch.submittedBy) {
      const item: NotificationInput =
        action === "approve"
          ? {
              userId: c.batch.submittedBy,
              kind: "marks.approved",
              title: "Your marks were approved",
              body: `${c.info.examName}: ${c.info.subjectName}`,
              link: "/marks",
            }
          : {
              userId: c.batch.submittedBy,
              kind: "marks.rejected",
              title: "Your marks were sent back",
              body: comment,
              link: "/marks",
              email: true,
            };
      await saveNotifications(scope, [item]);
      emails.push(item);
    }
  });
  // Emails go out after the transaction has committed.
  await sendNotificationEmails(ctx.db, ctx.email, emails);
  return { ok: true as const };
}

async function buildReportCard(scope: SchoolScope, examId: string, studentId: string) {
  const sessionId = await activeSessionId(scope);
  const [exam] = await scope.tx.select().from(schema.exams).where(eq(schema.exams.id, examId));
  const [student] = await scope.tx
    .select({
      id: schema.students.id,
      fullName: schema.students.fullName,
      admissionNo: schema.students.admissionNo,
      sectionId: schema.studentEnrolments.sectionId,
      classId: schema.sections.classId,
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
    .where(eq(schema.students.id, studentId));
  if (!exam || !student?.classId || !student.sectionId) throw notFound("report card");
  const bands = await loadBands(scope);
  const schedule = await scope.tx
    .select({
      subjectId: schema.examSubjects.subjectId,
      subject: schema.subjects.name,
      maxMarks: schema.examSubjects.maxMarks,
    })
    .from(schema.examSubjects)
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.examSubjects.subjectId))
    .where(
      and(eq(schema.examSubjects.examId, examId), eq(schema.examSubjects.classId, student.classId)),
    )
    .orderBy(asc(schema.subjects.name));
  if (schedule.length === 0) throw notFound("report card");
  const batches = await scope.tx
    .select({ id: schema.resultBatches.id, subjectId: schema.resultBatches.subjectId })
    .from(schema.resultBatches)
    .where(
      and(
        eq(schema.resultBatches.examId, examId),
        eq(schema.resultBatches.sectionId, student.sectionId),
        eq(schema.resultBatches.status, "published"),
      ),
    );
  const batchBySubject = new Map(batches.map((b) => [b.subjectId, b.id]));
  const marks = batches.length
    ? await scope.tx
        .select()
        .from(schema.marks)
        .where(
          and(
            inArray(
              schema.marks.batchId,
              batches.map((b) => b.id),
            ),
            eq(schema.marks.studentId, studentId),
          ),
        )
    : [];
  const markOf = new Map(marks.map((m) => [m.batchId, m]));

  const rows = schedule.map((s) => {
    const batchId = batchBySubject.get(s.subjectId);
    const mark = batchId ? markOf.get(batchId) : undefined;
    const published = Boolean(batchId && mark);
    const value = mark ? num(mark.marks) : null;
    const percent = value !== null ? percentage(value, s.maxMarks) : null;
    return {
      subject: s.subject,
      max: s.maxMarks,
      marks: value,
      absent: mark?.absent ?? false,
      percent,
      grade: percent !== null ? (gradeFor(percent, bands)?.grade ?? null) : null,
      published,
    };
  });
  const counted = rows
    .filter((r) => r.published)
    .map((r) => ({ subject: r.subject, marks: r.marks, max: r.max }));
  return {
    exam: { id: exam.id, name: exam.name },
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      className: student.className,
      sectionName: student.sectionName,
    },
    rows,
    summary: summarise(counted, bands),
    complete: rows.every((r) => r.published),
  };
}

export { buildReportCard };
export const grades = gradesRouter;
export const exams = examsRouter;
export const marks = marksRouter;
export const results = resultsRouter;
