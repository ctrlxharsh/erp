import {
  importFileInputSchema,
  importPreviewSchema,
  importResultSchema,
  importTemplateSchema,
} from "@erp/contracts";
import { recordSchoolAudit, type SchoolScope, schema, withSchool } from "@erp/db";
import { classKey, type RawStudentRow, validateStudentImport } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { buildStudentTemplate, ImportFileError, readStudentSheet } from "../student-import";
import { requirePermission, router, schoolProcedure } from "../trpc";

const importProcedure = schoolProcedure.use(requirePermission("people.import"));

const decode = (base64: string) => new Uint8Array(Buffer.from(base64, "base64"));
const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

async function readRows(base64: string): Promise<RawStudentRow[]> {
  try {
    return await readStudentSheet(decode(base64));
  } catch (error) {
    if (error instanceof ImportFileError)
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}

async function loadContext(scope: SchoolScope) {
  const sections = await scope.tx
    .select({
      id: schema.sections.id,
      sectionName: schema.sections.name,
      className: schema.classes.name,
    })
    .from(schema.sections)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.sections.classId))
    .orderBy(asc(schema.classes.sortOrder), asc(schema.sections.name));
  const existing = await scope.tx
    .select({ admissionNo: schema.students.admissionNo })
    .from(schema.students);
  return {
    sections,
    context: {
      sectionIds: new Map(sections.map((s) => [classKey(s.className, s.sectionName), s.id])),
      existingAdmissionNos: new Set(existing.map((s) => s.admissionNo.toLowerCase())),
    },
  };
}

export const studentImportRouter = router({
  template: importProcedure.output(importTemplateSchema).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) => {
      const { sections } = await loadContext(scope);
      const bytes = await buildStudentTemplate(sections);
      return {
        fileName: "student-import-template.xlsx",
        fileBase64: Buffer.from(bytes).toString("base64"),
      };
    }),
  ),

  /** Checks the file and reports every problem, without saving anything. */
  preview: importProcedure
    .input(importFileInputSchema)
    .output(importPreviewSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await readRows(input.fileBase64);
      const { sections, context } = await withSchool(ctx.db, ctx.schoolId, loadContext);
      const { valid, errors } = validateStudentImport(rows, context);
      const label = new Map(sections.map((s) => [s.id, `${s.className} ${s.sectionName}`]));
      return {
        totalRows: rows.length,
        validRows: valid.length,
        errors: errors.slice(0, 200),
        sample: valid.slice(0, 5).map((v) => ({
          row: v.row,
          admissionNo: v.admissionNo,
          fullName: v.fullName,
          section: label.get(v.sectionId) ?? "",
        })),
      };
    }),

  /** Re-checks the file on the server and saves it all in one transaction, or nothing at all. */
  commit: importProcedure
    .input(
      importFileInputSchema.extend({
        consentConfirmed: z.literal(true, { error: "Confirm that parental consent is recorded" }),
      }),
    )
    .output(importResultSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await readRows(input.fileBase64);
      return withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [session] = await scope.tx
          .select({ id: schema.academicSessions.id })
          .from(schema.academicSessions)
          .where(eq(schema.academicSessions.isActive, true));
        if (!session)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Add an academic session first (School setup).",
          });
        const { context } = await loadContext(scope);
        const { valid, errors } = validateStudentImport(rows, context);
        if (errors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${errors.length} row(s) have problems. Fix them and try again; nothing was saved.`,
          });
        }

        // Guardians: one per email within the school; people without an email are kept separate.
        const emails = [
          ...new Set(valid.flatMap((v) => (v.guardian?.email ? [v.guardian.email] : []))),
        ];
        const guardianByEmail = new Map<string, string>();
        for (const part of chunk(emails, 200)) {
          const found = await scope.tx
            .select({ id: schema.guardians.id, email: schema.guardians.email })
            .from(schema.guardians)
            .where(inArray(sql`lower(${schema.guardians.email})`, part));
          for (const g of found) if (g.email) guardianByEmail.set(g.email.toLowerCase(), g.id);
        }
        let guardiansCreated = 0;
        const newGuardians = new Map<string, NonNullable<(typeof valid)[number]["guardian"]>>();
        const guardianKeyOf = (v: (typeof valid)[number]) =>
          v.guardian?.email ? `e:${v.guardian.email}` : `r:${v.row}`;
        for (const v of valid) {
          if (!v.guardian) continue;
          if (v.guardian.email && guardianByEmail.has(v.guardian.email)) continue;
          if (!newGuardians.has(guardianKeyOf(v))) newGuardians.set(guardianKeyOf(v), v.guardian);
        }
        const guardianIdByKey = new Map<string, string>();
        for (const part of chunk([...newGuardians.entries()], 200)) {
          const created = await scope.tx
            .insert(schema.guardians)
            .values(
              part.map(([, g]) => ({
                schoolId: ctx.schoolId,
                fullName: g.fullName,
                email: g.email,
                phone: g.phone,
              })),
            )
            .returning({ id: schema.guardians.id });
          part.forEach(([key], index) => {
            const id = created[index]?.id;
            if (id) guardianIdByKey.set(key, id);
          });
          guardiansCreated += created.length;
        }

        const now = new Date();
        const studentIds = new Map<string, string>();
        for (const part of chunk(valid, 200)) {
          const created = await scope.tx
            .insert(schema.students)
            .values(
              part.map((v) => ({
                schoolId: ctx.schoolId,
                admissionNo: v.admissionNo,
                fullName: v.fullName,
                dateOfBirth: v.dateOfBirth,
                gender: v.gender,
                consentRecordedAt: now,
                consentRecordedBy: ctx.user.id,
              })),
            )
            .returning({ id: schema.students.id, admissionNo: schema.students.admissionNo });
          for (const row of created) studentIds.set(row.admissionNo, row.id);
        }
        const enrolments = valid.map((v) => ({
          schoolId: ctx.schoolId,
          studentId: studentIds.get(v.admissionNo) ?? "",
          academicSessionId: session.id,
          sectionId: v.sectionId,
        }));
        for (const part of chunk(enrolments, 500))
          await scope.tx.insert(schema.studentEnrolments).values(part);

        const links = valid.flatMap((v) => {
          if (!v.guardian) return [];
          const guardianId =
            (v.guardian.email ? guardianByEmail.get(v.guardian.email) : undefined) ??
            guardianIdByKey.get(guardianKeyOf(v));
          return guardianId
            ? [
                {
                  schoolId: ctx.schoolId,
                  studentId: studentIds.get(v.admissionNo) ?? "",
                  guardianId,
                },
              ]
            : [];
        });
        for (const part of chunk(links, 500))
          await scope.tx.insert(schema.studentGuardians).values(part).onConflictDoNothing();

        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "students.imported",
          entityType: "students",
          metadata: { count: valid.length, consentRecorded: true },
        });
        return { created: valid.length, guardiansCreated };
      });
    }),
});
