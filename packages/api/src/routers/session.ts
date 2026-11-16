import { meSchema } from "@erp/contracts";
import { resolveSchoolAccess } from "../access";
import { authedProcedure, router } from "../trpc";

export const sessionRouter = router({
  me: authedProcedure.output(meSchema).query(async ({ ctx }) => {
    const [platformRole, memberships] = await Promise.all([
      ctx.store.getPlatformRole(ctx.user.id),
      ctx.store.getMemberships(ctx.user.id),
    ]);
    const access = resolveSchoolAccess(memberships, ctx.activeSchoolId);
    return {
      user: ctx.user,
      platformRole,
      schools: memberships.map((m) => ({ id: m.schoolId, name: m.schoolName, roles: m.roles })),
      activeSchoolId: access.kind === "ok" ? access.membership.schoolId : null,
    };
  }),
});
