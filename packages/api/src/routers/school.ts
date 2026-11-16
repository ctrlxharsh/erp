import { currentSchoolSchema } from "@erp/contracts";
import { schema, withSchool } from "@erp/db";
import { z } from "zod";
import { requirePermission, router, schoolProcedure } from "../trpc";

export const schoolRouter = router({
  /** Name and logo for the app header and documents. Everyone in the school may see it. */
  branding: schoolProcedure
    .use(requirePermission("school.view"))
    .output(z.object({ name: z.string(), logoFileId: z.uuid().nullable() }))
    .query(async ({ ctx }) => {
      const [profile] = await withSchool(ctx.db, ctx.schoolId, ({ tx }) =>
        tx.select({ logoFileId: schema.schoolProfiles.logoFileId }).from(schema.schoolProfiles),
      );
      return { name: ctx.schoolName, logoFileId: profile?.logoFileId ?? null };
    }),

  current: schoolProcedure
    .use(requirePermission("school.view"))
    .output(currentSchoolSchema)
    .query(({ ctx }) => ({
      school: { id: ctx.schoolId, name: ctx.schoolName },
      roles: ctx.roles,
      permissions: [...ctx.permissions],
    })),
});
