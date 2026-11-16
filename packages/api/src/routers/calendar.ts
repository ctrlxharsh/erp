import {
  calendarEventSchema,
  calendarImportPreviewSchema,
  importFileInputSchema,
  importTemplateSchema,
  listCalendarInputSchema,
  saveCalendarEventInputSchema,
} from "@erp/contracts";
import { recordSchoolAudit, schema, withSchool } from "@erp/db";
import { validateCalendarImport } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { buildCalendarTemplate, readCalendarSheet } from "../calendar-import";
import { ImportFileError } from "../student-import";
import { requirePermission, router, schoolProcedure } from "../trpc";

const view = schoolProcedure.use(requirePermission("calendar.view"));
const manage = schoolProcedure.use(requirePermission("calendar.manage"));
const ok = z.object({ ok: z.literal(true) });

/** Which event audiences a person sees: admins and the principal see everything. */
export function visibleAudiences(
  roles: readonly string[],
): ("all" | "teachers" | "students_parents")[] | null {
  if (roles.includes("school_admin") || roles.includes("principal")) return null;
  const audiences: ("all" | "teachers" | "students_parents")[] = ["all"];
  if (roles.includes("teacher") || roles.includes("staff")) audiences.push("teachers");
  if (roles.includes("student") || roles.includes("parent")) audiences.push("students_parents");
  return audiences;
}

async function readRows(base64: string) {
  try {
    return await readCalendarSheet(new Uint8Array(Buffer.from(base64, "base64")));
  } catch (error) {
    if (error instanceof ImportFileError)
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}

export const calendarRouter = router({
  /** Events that touch the date range, limited to what this person's roles should see. */
  list: view
    .input(listCalendarInputSchema)
    .output(z.array(calendarEventSchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const audiences = visibleAudiences(ctx.roles);
        const e = schema.calendarEvents;
        return tx
          .select({
            id: e.id,
            startDate: e.startDate,
            endDate: e.endDate,
            title: e.title,
            type: e.type,
            audience: e.audience,
          })
          .from(e)
          .where(
            and(
              lte(e.startDate, input.to),
              gte(e.endDate, input.from),
              audiences ? inArray(e.audience, audiences) : undefined,
            ),
          )
          .orderBy(asc(e.startDate), asc(e.title));
      }),
    ),

  save: manage
    .input(saveCalendarEventInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const values = {
          startDate: input.startDate,
          endDate: input.endDate,
          title: input.title,
          type: input.type,
          audience: input.audience,
        };
        if (input.id) {
          const updated = await tx
            .update(schema.calendarEvents)
            .set(values)
            .where(eq(schema.calendarEvents.id, input.id))
            .returning({ id: schema.calendarEvents.id });
          if (updated.length === 0)
            throw new TRPCError({ code: "NOT_FOUND", message: "This event was not found." });
        } else {
          await tx
            .insert(schema.calendarEvents)
            .values({ ...values, schoolId: ctx.schoolId, createdBy: ctx.user.id });
        }
        return { ok: true as const };
      }),
    ),

  delete: manage
    .input(z.object({ id: z.uuid() }))
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        await tx.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, input.id));
        return { ok: true as const };
      }),
    ),

  template: manage.output(importTemplateSchema).query(async () => ({
    fileName: "calendar-template.xlsx",
    fileBase64: Buffer.from(await buildCalendarTemplate()).toString("base64"),
  })),

  preview: manage
    .input(importFileInputSchema)
    .output(calendarImportPreviewSchema)
    .mutation(async ({ input }) => {
      const rows = await readRows(input.fileBase64);
      const { valid, errors } = validateCalendarImport(rows);
      return {
        totalRows: rows.length,
        validRows: valid.length,
        errors: errors.slice(0, 200),
        sample: valid.slice(0, 5).map((v) => ({
          row: v.row,
          title: v.title,
          startDate: v.startDate,
          endDate: v.endDate,
          type: v.type,
        })),
      };
    }),

  /** All-or-nothing, like the student import. */
  commit: manage
    .input(importFileInputSchema)
    .output(z.object({ created: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await readRows(input.fileBase64);
      const { valid, errors } = validateCalendarImport(rows);
      if (errors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${errors.length} row(s) have problems. Fix them and try again; nothing was saved.`,
        });
      }
      return withSchool(ctx.db, ctx.schoolId, async (scope) => {
        await scope.tx.insert(schema.calendarEvents).values(
          valid.map((v) => ({
            schoolId: ctx.schoolId,
            startDate: v.startDate,
            endDate: v.endDate,
            title: v.title,
            type: v.type,
            audience: v.audience,
            createdBy: ctx.user.id,
          })),
        );
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "calendar.imported",
          entityType: "calendar",
          metadata: { count: valid.length },
        });
        return { created: valid.length };
      });
    }),
});
