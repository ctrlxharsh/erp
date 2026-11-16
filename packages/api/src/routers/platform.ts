import {
  createSchoolInputSchema,
  inviteResultSchema,
  inviteSchoolAdminInputSchema,
  listSchoolsInputSchema,
  listSchoolsOutputSchema,
  schoolRowSchema,
  setSchoolStatusInputSchema,
} from "@erp/contracts";
import { recordPlatformAudit, schema } from "@erp/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { platformProcedure, requirePlatformPermission, router } from "../trpc";

const view = platformProcedure.use(requirePlatformPermission("schools.view"));
const manage = platformProcedure.use(requirePlatformPermission("schools.manage"));

/** Escapes LIKE wildcards so a search for "50%" does not match everything. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;

export const platformRouter = router({
  listSchools: view
    .input(listSchoolsInputSchema)
    .output(listSchoolsOutputSchema)
    .query(async ({ ctx, input }) => {
      const where = and(
        isNull(schema.schools.deletedAt),
        input.search ? ilike(schema.schools.name, likePattern(input.search)) : undefined,
      );
      const column = input.sort === "name" ? schema.schools.name : schema.schools.createdAt;
      const order = input.direction === "asc" ? asc(column) : desc(column);
      const [rows, [count]] = await Promise.all([
        ctx.db
          .select({
            id: schema.schools.id,
            name: schema.schools.name,
            status: schema.schools.status,
            createdAt: schema.schools.createdAt,
          })
          .from(schema.schools)
          .where(where)
          .orderBy(order, asc(schema.schools.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.db.select({ total: sql<number>`count(*)::int` }).from(schema.schools).where(where),
      ]);
      const admins = rows.length
        ? await ctx.db
            .select({ schoolId: schema.memberships.schoolId, n: sql<number>`count(*)::int` })
            .from(schema.memberships)
            .where(
              and(
                inArray(
                  schema.memberships.schoolId,
                  rows.map((row) => row.id),
                ),
                sql`'school_admin' = any(${schema.memberships.roles})`,
                eq(schema.memberships.status, "active"),
              ),
            )
            .groupBy(schema.memberships.schoolId)
        : [];
      const adminCount = new Map(admins.map((a) => [a.schoolId, a.n]));
      return {
        items: rows.map((row) => ({ ...row, adminCount: adminCount.get(row.id) ?? 0 })),
        total: count?.total ?? 0,
      };
    }),

  createSchool: manage
    .input(createSchoolInputSchema)
    .output(schoolRowSchema)
    .mutation(async ({ ctx, input }) => {
      const [school] = await ctx.db.insert(schema.schools).values({ name: input.name }).returning();
      if (!school)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create the school.",
        });
      await recordPlatformAudit(ctx.db, {
        actorUserId: ctx.user.id,
        action: "school.created",
        entityType: "school",
        entityId: school.id,
      });
      return { ...school, adminCount: 0 };
    }),

  /** Suspend or restore. Suspended schools are locked out until restored (ADR-015, ADR-025). */
  setSchoolStatus: manage
    .input(setSchoolStatusInputSchema)
    .output(schoolRowSchema)
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db
        .select()
        .from(schema.schools)
        .where(and(eq(schema.schools.id, input.schoolId), isNull(schema.schools.deletedAt)));
      if (!current)
        throw new TRPCError({ code: "NOT_FOUND", message: "This school was not found." });
      // Only suspend a school that is running, and only restore one that is suspended.
      const allowed =
        input.status === "suspended"
          ? current.status === "active" || current.status === "grace"
          : current.status === "suspended";
      if (!allowed) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            input.status === "suspended"
              ? "Only a running school can be suspended."
              : "Only a suspended school can be restored.",
        });
      }
      const [updated] = await ctx.db
        .update(schema.schools)
        .set({ status: input.status })
        .where(eq(schema.schools.id, input.schoolId))
        .returning();
      if (!updated)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not update the school.",
        });
      await recordPlatformAudit(ctx.db, {
        actorUserId: ctx.user.id,
        action: input.status === "suspended" ? "school.suspended" : "school.restored",
        entityType: "school",
        entityId: updated.id,
        metadata: { from: current.status, to: updated.status },
      });
      return { ...updated, adminCount: 0 };
    }),

  /**
   * Gives someone the School Admin role. A new person gets an account without a password and an
   * email with a link to set their own, so there is never a shared or emailed password.
   */
  inviteSchoolAdmin: manage
    .input(inviteSchoolAdminInputSchema)
    .output(inviteResultSchema)
    .mutation(async ({ ctx, input }) => {
      const [school] = await ctx.db
        .select({ id: schema.schools.id })
        .from(schema.schools)
        .where(and(eq(schema.schools.id, input.schoolId), isNull(schema.schools.deletedAt)));
      if (!school)
        throw new TRPCError({ code: "NOT_FOUND", message: "This school was not found." });

      const email = input.email.trim().toLowerCase();
      const existing = await ctx.authAdmin.findUserIdByEmail(email);
      const userId = existing ?? (await ctx.authAdmin.createUser({ email, name: input.name })).id;

      await ctx.db
        .insert(schema.memberships)
        .values({ userId, schoolId: school.id, roles: ["school_admin"] })
        .onConflictDoUpdate({
          target: [schema.memberships.userId, schema.memberships.schoolId],
          set: {
            roles: sql`(select array(select distinct unnest(${schema.memberships.roles} || '{school_admin}'::school_role[])))`,
            status: "active",
          },
        });

      let emailSent = false;
      if (!existing) {
        await ctx.authAdmin.sendPasswordSetupEmail(email);
        emailSent = true;
      }
      await recordPlatformAudit(ctx.db, {
        actorUserId: ctx.user.id,
        action: "school.admin_invited",
        entityType: "school",
        entityId: school.id,
        metadata: { invitedUserId: userId, newAccount: !existing },
      });
      return { userId, emailSent };
    }),
});
