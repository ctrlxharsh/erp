import {
  createClassInputSchema,
  createSectionInputSchema,
  createSessionInputSchema,
  createSubjectInputSchema,
  idInputSchema,
  schoolSetupSchema,
  setClassSubjectsInputSchema,
  updateProfileInputSchema,
} from "@erp/contracts";
import { schema, withSchool } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, router, schoolProcedure } from "../trpc";

const read = schoolProcedure.use(requirePermission("school.view"));
const manage = schoolProcedure.use(requirePermission("school.setup"));

/** Postgres error code behind a Drizzle error, if any. */
function pgCode(error: unknown): string | undefined {
  return (
    (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code
  );
}

/** Turns duplicate / in-use database errors into plain-language API errors. */
async function guarded<T>(
  work: () => Promise<T>,
  duplicate: string,
  inUse = "This is still in use.",
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (pgCode(error) === "23505") throw new TRPCError({ code: "CONFLICT", message: duplicate });
    if (pgCode(error) === "23503")
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: inUse });
    throw error;
  }
}

const ok = z.object({ ok: z.literal(true) });

export const setupRouter = router({
  get: read.output(schoolSetupSchema).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
      const [school] = await tx.select().from(schema.schools);
      const [profile] = await tx.select().from(schema.schoolProfiles);
      const sessions = await tx
        .select()
        .from(schema.academicSessions)
        .orderBy(asc(schema.academicSessions.startDate));
      const classes = await tx
        .select()
        .from(schema.classes)
        .orderBy(asc(schema.classes.sortOrder), asc(schema.classes.name));
      const sections = await tx.select().from(schema.sections).orderBy(asc(schema.sections.name));
      const links = await tx.select().from(schema.classSubjects);
      const subjects = await tx.select().from(schema.subjects).orderBy(asc(schema.subjects.name));
      return {
        profile: {
          name: school?.name ?? ctx.schoolName,
          address: profile?.address ?? null,
          affiliationNo: profile?.affiliationNo ?? null,
          phone: profile?.phone ?? null,
          logoFileId: profile?.logoFileId ?? null,
          timezone: profile?.timezone ?? "Asia/Kolkata",
        },
        sessions: sessions.map((s) => ({
          id: s.id,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          isActive: s.isActive,
        })),
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          sections: sections
            .filter((s) => s.classId === c.id)
            .map((s) => ({ id: s.id, name: s.name })),
          subjectIds: links.filter((l) => l.classId === c.id).map((l) => l.subjectId),
        })),
        subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
      };
    }),
  ),

  updateProfile: manage
    .input(updateProfileInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            if (input.logoFileId) {
              const [file] = await tx
                .select({ id: schema.files.id })
                .from(schema.files)
                .where(
                  and(
                    eq(schema.files.id, input.logoFileId),
                    eq(schema.files.purpose, "school_logo"),
                    eq(schema.files.status, "ready"),
                  ),
                );
              if (!file)
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: "The logo upload was not found.",
                });
            }
            await tx
              .update(schema.schools)
              .set({ name: input.name })
              .where(eq(schema.schools.id, ctx.schoolId));
            const values = {
              address: input.address || null,
              affiliationNo: input.affiliationNo || null,
              phone: input.phone || null,
              logoFileId: input.logoFileId,
            };
            await tx
              .insert(schema.schoolProfiles)
              .values({ schoolId: ctx.schoolId, ...values })
              .onConflictDoUpdate({ target: schema.schoolProfiles.schoolId, set: values });
            return { ok: true as const };
          }),
        "Something went wrong while saving.",
      ),
    ),

  createSession: manage
    .input(createSessionInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            const existing = await tx
              .select({ id: schema.academicSessions.id })
              .from(schema.academicSessions);
            await tx.insert(schema.academicSessions).values({
              schoolId: ctx.schoolId,
              name: input.name,
              startDate: input.startDate,
              endDate: input.endDate,
              // The first session becomes the active one automatically.
              isActive: existing.length === 0,
            });
            return { ok: true as const };
          }),
        "A session with this name already exists.",
      ),
    ),

  activateSession: manage
    .input(idInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const [target] = await tx
          .select()
          .from(schema.academicSessions)
          .where(eq(schema.academicSessions.id, input.id));
        if (!target)
          throw new TRPCError({ code: "NOT_FOUND", message: "This session was not found." });
        // One active session per school: switch the old one off first (a unique index enforces it).
        await tx
          .update(schema.academicSessions)
          .set({ isActive: false })
          .where(eq(schema.academicSessions.isActive, true));
        await tx
          .update(schema.academicSessions)
          .set({ isActive: true })
          .where(eq(schema.academicSessions.id, input.id));
        return { ok: true as const };
      }),
    ),

  createClass: manage
    .input(createClassInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            const count = (await tx.select({ id: schema.classes.id }).from(schema.classes)).length;
            await tx
              .insert(schema.classes)
              .values({ schoolId: ctx.schoolId, name: input.name, sortOrder: count });
            return { ok: true as const };
          }),
        "A class with this name already exists.",
      ),
    ),

  deleteClass: manage
    .input(idInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            await tx.delete(schema.classSubjects).where(eq(schema.classSubjects.classId, input.id));
            await tx.delete(schema.classes).where(eq(schema.classes.id, input.id));
            return { ok: true as const };
          }),
        "",
        "Remove this class's sections first.",
      ),
    ),

  createSection: manage
    .input(createSectionInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            const [cls] = await tx
              .select({ id: schema.classes.id })
              .from(schema.classes)
              .where(eq(schema.classes.id, input.classId));
            if (!cls)
              throw new TRPCError({ code: "NOT_FOUND", message: "This class was not found." });
            await tx
              .insert(schema.sections)
              .values({ schoolId: ctx.schoolId, classId: input.classId, name: input.name });
            return { ok: true as const };
          }),
        "This class already has a section with that name.",
      ),
    ),

  deleteSection: manage
    .input(idInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            await tx.delete(schema.sections).where(eq(schema.sections.id, input.id));
            return { ok: true as const };
          }),
        "",
        "This section is still in use.",
      ),
    ),

  createSubject: manage
    .input(createSubjectInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            await tx.insert(schema.subjects).values({ schoolId: ctx.schoolId, name: input.name });
            return { ok: true as const };
          }),
        "A subject with this name already exists.",
      ),
    ),

  deleteSubject: manage
    .input(idInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      guarded(
        () =>
          withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
            await tx
              .delete(schema.classSubjects)
              .where(eq(schema.classSubjects.subjectId, input.id));
            await tx.delete(schema.subjects).where(eq(schema.subjects.id, input.id));
            return { ok: true as const };
          }),
        "",
        "This subject is still in use.",
      ),
    ),

  /** Replaces the list of subjects a class studies. */
  setClassSubjects: manage
    .input(setClassSubjectsInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const [cls] = await tx
          .select({ id: schema.classes.id })
          .from(schema.classes)
          .where(eq(schema.classes.id, input.classId));
        if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "This class was not found." });
        const known = await tx.select({ id: schema.subjects.id }).from(schema.subjects);
        const knownIds = new Set(known.map((s) => s.id));
        const subjectIds = [...new Set(input.subjectIds)].filter((id) => knownIds.has(id));
        await tx
          .delete(schema.classSubjects)
          .where(eq(schema.classSubjects.classId, input.classId));
        if (subjectIds.length) {
          await tx.insert(schema.classSubjects).values(
            subjectIds.map((subjectId) => ({
              schoolId: ctx.schoolId,
              classId: input.classId,
              subjectId,
            })),
          );
        }
        return { ok: true as const };
      }),
    ),
});
