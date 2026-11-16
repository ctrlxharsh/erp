import {
  clearTimetableEntryInputSchema,
  periodSchema,
  savePeriodInputSchema,
  sectionTimetableInputSchema,
  setTimetableEntryInputSchema,
  timetableSaveResultSchema,
  timetableSchema,
} from "@erp/contracts";
import { type SchoolScope, schema, withSchool } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, router, schoolProcedure } from "../trpc";

const view = schoolProcedure.use(requirePermission("timetable.view"));
const manage = schoolProcedure.use(requirePermission("timetable.manage"));
const ok = z.object({ ok: z.literal(true) });

async function activeSession(scope: SchoolScope) {
  const [session] = await scope.tx
    .select({ id: schema.academicSessions.id })
    .from(schema.academicSessions)
    .where(eq(schema.academicSessions.isActive, true));
  return session?.id ?? null;
}

const entryColumns = () => ({
  id: schema.timetableEntries.id,
  weekday: schema.timetableEntries.weekday,
  periodId: schema.timetableEntries.periodId,
  sectionId: schema.timetableEntries.sectionId,
  className: schema.classes.name,
  sectionName: schema.sections.name,
  subjectId: schema.timetableEntries.subjectId,
  subjectName: schema.subjects.name,
  staffId: schema.timetableEntries.staffId,
  staffName: schema.staff.fullName,
});

function entryQuery(scope: SchoolScope) {
  return scope.tx
    .select(entryColumns())
    .from(schema.timetableEntries)
    .innerJoin(schema.sections, eq(schema.sections.id, schema.timetableEntries.sectionId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.timetableEntries.subjectId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.timetableEntries.staffId));
}

type EntryRow = Awaited<ReturnType<ReturnType<typeof entryQuery>["limit"]>>[number];
const toEntry = (r: EntryRow) => ({
  id: r.id,
  weekday: r.weekday,
  periodId: r.periodId,
  sectionId: r.sectionId,
  sectionLabel: `${r.className} ${r.sectionName}`,
  subjectId: r.subjectId,
  subjectName: r.subjectName,
  staffId: r.staffId,
  staffName: r.staffName,
});

const listPeriods = (scope: SchoolScope) =>
  scope.tx
    .select({
      id: schema.timetablePeriods.id,
      name: schema.timetablePeriods.name,
      startTime: schema.timetablePeriods.startTime,
      endTime: schema.timetablePeriods.endTime,
    })
    .from(schema.timetablePeriods)
    .orderBy(asc(schema.timetablePeriods.startTime), asc(schema.timetablePeriods.name));

const trimTime = (value: string) => value.slice(0, 5);

export const timetableRouter = router({
  periods: view.output(z.array(periodSchema)).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) =>
      (await listPeriods(scope)).map((p) => ({
        ...p,
        startTime: trimTime(p.startTime),
        endTime: trimTime(p.endTime),
      })),
    ),
  ),

  savePeriod: manage
    .input(savePeriodInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const values = { name: input.name, startTime: input.startTime, endTime: input.endTime };
        try {
          if (input.id) {
            const updated = await tx
              .update(schema.timetablePeriods)
              .set(values)
              .where(eq(schema.timetablePeriods.id, input.id))
              .returning({ id: schema.timetablePeriods.id });
            if (updated.length === 0)
              throw new TRPCError({ code: "NOT_FOUND", message: "This period was not found." });
          } else {
            await tx.insert(schema.timetablePeriods).values({ ...values, schoolId: ctx.schoolId });
          }
        } catch (error) {
          const code = (error as { cause?: { code?: string } })?.cause?.code;
          if (code === "23505")
            throw new TRPCError({
              code: "CONFLICT",
              message: "A period with this name already exists.",
            });
          throw error;
        }
        return { ok: true as const };
      }),
    ),

  deletePeriod: manage
    .input(z.object({ id: z.uuid() }))
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const used = await tx
          .select({ id: schema.timetableEntries.id })
          .from(schema.timetableEntries)
          .where(eq(schema.timetableEntries.periodId, input.id))
          .limit(1);
        if (used.length > 0)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This period is used in a timetable. Clear those slots first.",
          });
        await tx.delete(schema.timetablePeriods).where(eq(schema.timetablePeriods.id, input.id));
        return { ok: true as const };
      }),
    ),

  /** The weekly grid of one section. Anyone in the school may look at a class timetable. */
  forSection: view
    .input(sectionTimetableInputSchema)
    .output(timetableSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const sessionId = await activeSession(scope);
        const periods = (await listPeriods(scope)).map((p) => ({
          ...p,
          startTime: trimTime(p.startTime),
          endTime: trimTime(p.endTime),
        }));
        if (!sessionId) return { periods, entries: [] };
        const rows = await entryQuery(scope).where(
          and(
            eq(schema.timetableEntries.sectionId, input.sectionId),
            eq(schema.timetableEntries.academicSessionId, sessionId),
          ),
        );
        return { periods, entries: rows.map(toEntry) };
      }),
    ),

  /** The signed-in teacher's own week across all sections. */
  mine: view.output(timetableSchema).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) => {
      const sessionId = await activeSession(scope);
      const periods = (await listPeriods(scope)).map((p) => ({
        ...p,
        startTime: trimTime(p.startTime),
        endTime: trimTime(p.endTime),
      }));
      if (!sessionId) return { periods, entries: [] };
      const [member] = await scope.tx
        .select({ id: schema.staff.id })
        .from(schema.staff)
        .where(eq(schema.staff.userId, ctx.user.id));
      if (!member) return { periods, entries: [] };
      const rows = await entryQuery(scope).where(
        and(
          eq(schema.timetableEntries.staffId, member.id),
          eq(schema.timetableEntries.academicSessionId, sessionId),
        ),
      );
      return { periods, entries: rows.map(toEntry) };
    }),
  ),

  /** Puts a subject (and teacher) into a slot. A teacher booked twice is reported, not blocked. */
  setEntry: manage
    .input(setTimetableEntryInputSchema)
    .output(timetableSaveResultSchema)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const { tx } = scope;
        const sessionId = await activeSession(scope);
        if (!sessionId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an academic session first (School setup).",
          });
        const [section] = await tx
          .select({ id: schema.sections.id })
          .from(schema.sections)
          .where(eq(schema.sections.id, input.sectionId));
        const [period] = await tx
          .select({ id: schema.timetablePeriods.id })
          .from(schema.timetablePeriods)
          .where(eq(schema.timetablePeriods.id, input.periodId));
        const [subject] = await tx
          .select({ id: schema.subjects.id })
          .from(schema.subjects)
          .where(eq(schema.subjects.id, input.subjectId));
        if (!section || !period || !subject)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a valid class, period and subject.",
          });
        if (input.staffId) {
          const [teacher] = await tx
            .select({ kind: schema.staff.kind })
            .from(schema.staff)
            .where(eq(schema.staff.id, input.staffId));
          if (teacher?.kind !== "teacher")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a teacher." });
        }
        await tx
          .insert(schema.timetableEntries)
          .values({
            schoolId: ctx.schoolId,
            academicSessionId: sessionId,
            sectionId: input.sectionId,
            weekday: input.weekday,
            periodId: input.periodId,
            subjectId: input.subjectId,
            staffId: input.staffId,
          })
          .onConflictDoUpdate({
            target: [
              schema.timetableEntries.academicSessionId,
              schema.timetableEntries.sectionId,
              schema.timetableEntries.weekday,
              schema.timetableEntries.periodId,
            ],
            set: { subjectId: input.subjectId, staffId: input.staffId },
          });
        let conflicts: string[] = [];
        if (input.staffId) {
          const clashes = await entryQuery(scope).where(
            and(
              eq(schema.timetableEntries.staffId, input.staffId),
              eq(schema.timetableEntries.academicSessionId, sessionId),
              eq(schema.timetableEntries.weekday, input.weekday),
              eq(schema.timetableEntries.periodId, input.periodId),
              ne(schema.timetableEntries.sectionId, input.sectionId),
            ),
          );
          conflicts = clashes.map((c) => `${c.className} ${c.sectionName}`);
        }
        return { conflicts };
      }),
    ),

  clearEntry: manage
    .input(clearTimetableEntryInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        await tx
          .delete(schema.timetableEntries)
          .where(
            and(
              eq(schema.timetableEntries.sectionId, input.sectionId),
              eq(schema.timetableEntries.weekday, input.weekday),
              eq(schema.timetableEntries.periodId, input.periodId),
            ),
          );
        return { ok: true as const };
      }),
    ),
});
