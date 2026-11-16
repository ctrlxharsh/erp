import { type Permission, type PlatformRole, permissionsFor, type SchoolRole } from "@erp/domain";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { type AccessStore, resolveSchoolAccess } from "./access";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Context {
  store: AccessStore;
  /** Null when signed out. Supplied by the web app from the Neon Auth session. */
  user: SessionUser | null;
  /** The school the user picked (cookie), if any. Verified against memberships, never trusted. */
  activeSchoolId: string | null;
}

const t = initTRPC.context<Context>().create({
  // One error shape for every client (CONSTITUTION §6.3): code, message, optional fieldErrors.
  errorFormatter({ shape, error }) {
    const fieldErrors =
      error.cause instanceof z.ZodError ? z.flattenError(error.cause).fieldErrors : undefined;
    return { ...shape, data: { ...shape.data, fieldErrors } };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

/** Requires a signed-in user. */
export const authedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Requires a platform account (Super Admin or Platform Support). */
export const platformProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const platformRole: PlatformRole | null = await ctx.store.getPlatformRole(ctx.user.id);
  if (!platformRole)
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this." });
  return next({ ctx: { ...ctx, platformRole } });
});

/**
 * Resolves the school this request acts on, checks its status and the caller's membership, and
 * exposes `schoolId`, `roles` and `permissions`. Every school-owned procedure starts here.
 */
export const schoolProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const memberships = await ctx.store.getMemberships(ctx.user.id);
  const access = resolveSchoolAccess(memberships, ctx.activeSchoolId);
  switch (access.kind) {
    case "none":
      throw new TRPCError({ code: "FORBIDDEN", message: "You are not part of any school." });
    case "choose":
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Please choose a school first.",
      });
    case "locked":
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This school's access is switched off. Please contact your school administrator.",
      });
    case "ok": {
      const { membership } = access;
      const roles: SchoolRole[] = membership.roles;
      return next({
        ctx: {
          ...ctx,
          schoolId: membership.schoolId,
          schoolName: membership.schoolName,
          roles,
          permissions: permissionsFor(roles),
        },
      });
    }
  }
});

/** Use after `schoolProcedure`: `schoolProcedure.use(requirePermission("marks.approve"))`. */
export function requirePermission(permission: Permission) {
  return t.middleware(({ ctx, next }) => {
    const granted = (ctx as { permissions?: Set<Permission> }).permissions;
    if (!granted?.has(permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to do this." });
    }
    return next();
  });
}
