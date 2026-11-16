import { currentSchoolSchema } from "@erp/contracts";
import { requirePermission, router, schoolProcedure } from "../trpc";

export const schoolRouter = router({
  current: schoolProcedure
    .use(requirePermission("school.view"))
    .output(currentSchoolSchema)
    .query(({ ctx }) => ({
      school: { id: ctx.schoolId, name: ctx.schoolName },
      roles: ctx.roles,
      permissions: [...ctx.permissions],
    })),
});
