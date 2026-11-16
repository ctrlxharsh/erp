import {
  listNoticesInputSchema,
  noticeIdInputSchema,
  noticeSchema,
  rejectNoticeInputSchema,
  saveNoticeInputSchema,
} from "@erp/contracts";
import { recordSchoolAudit, type SchoolScope, schema, withSchool } from "@erp/db";
import { type NoticeAudience, type NoticeStatus, nextNoticeStatus, noticeRef } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type NotificationInput, saveNotifications, sendNotificationEmails } from "../notify";
import { requirePermission, router, schoolProcedure } from "../trpc";

const view = schoolProcedure.use(requirePermission("notice.view"));
const write = schoolProcedure.use(requirePermission("notice.write"));
const decide = schoolProcedure.use(requirePermission("notice.approve"));

const roleSets: Record<NoticeAudience, readonly string[] | null> = {
  all: null,
  teachers: ["teacher", "staff"],
  students_parents: ["student", "parent"],
};

type Ctx = {
  db: Parameters<typeof withSchool>[0];
  schoolId: string;
  roles: readonly string[];
  permissions: Set<string>;
  user: { id: string };
};

/** Which audiences this person belongs to. School Admin and Principal see every notice. */
function visibleAudiences(roles: readonly string[]): NoticeAudience[] | null {
  if (roles.includes("school_admin") || roles.includes("principal")) return null;
  const audiences: NoticeAudience[] = ["all"];
  if (roles.includes("teacher") || roles.includes("staff")) audiences.push("teachers");
  if (roles.includes("student") || roles.includes("parent")) audiences.push("students_parents");
  return audiences;
}

async function approvalRequired(scope: SchoolScope) {
  const [profile] = await scope.tx
    .select({ required: schema.schoolProfiles.noticeApprovalRequired })
    .from(schema.schoolProfiles);
  return profile?.required ?? true;
}

async function authorNames(ctx: Ctx, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, string>();
  const rows = await ctx.db.execute(
    sql`select id, name from neon_auth."user" where id in (${sql.join(
      unique.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
  return new Map((rows.rows as { id: string; name: string }[]).map((r) => [r.id, r.name]));
}

type NoticeRow = typeof schema.notices.$inferSelect;

function present(row: NoticeRow, ctx: Ctx, approval: boolean, names: Map<string, string>) {
  const canPublish = ctx.permissions.has("notice.publish");
  const mine = row.createdBy === ctx.user.id;
  const status = row.status as NoticeStatus;
  const options = { canPublish, approvalRequired: approval };
  return {
    id: row.id,
    refLabel: row.refLabel,
    title: row.title,
    body: row.body,
    audience: row.audience,
    status,
    authorName: names.get(row.createdBy) ?? null,
    decisionComment: row.decisionComment,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    canEdit: mine && nextNoticeStatus(status, "edit", options) !== null,
    canSubmit: mine && nextNoticeStatus(status, "submit", options) !== null,
    canDecide: nextNoticeStatus(status, "approve", options) !== null,
    canDelete: mine && nextNoticeStatus(status, "delete", options) !== null,
  };
}

async function usersWithRoles(scope: SchoolScope, audience: NoticeAudience | "principal") {
  const roles = audience === "principal" ? ["principal"] : roleSets[audience];
  const m = schema.memberships;
  const rows = await scope.tx
    .select({ userId: m.userId })
    .from(m)
    .where(
      and(
        eq(m.status, "active"),
        roles
          ? sql`${m.roles} && ARRAY[${sql.join(
              roles.map((r) => sql`${r}`),
              sql`, `,
            )}]::school_role[]`
          : undefined,
      ),
    );
  return [...new Set(rows.map((r) => r.userId))];
}

/** Numbers the notice, marks it published and tells its audience. Returns the notifications to email. */
async function publish(
  scope: SchoolScope,
  ctx: Ctx,
  row: NoticeRow,
  decidedBy: string | null,
): Promise<NotificationInput[]> {
  const [counter] = await scope.tx
    .insert(schema.counters)
    .values({ schoolId: scope.schoolId, key: "notice", value: 1 })
    .onConflictDoUpdate({
      target: [schema.counters.schoolId, schema.counters.key],
      set: { value: sql`${schema.counters.value} + 1` },
    })
    .returning({ value: schema.counters.value });
  const number = counter?.value ?? 1;
  const [session] = await scope.tx
    .select({ name: schema.academicSessions.name })
    .from(schema.academicSessions)
    .where(eq(schema.academicSessions.isActive, true));
  await scope.tx
    .update(schema.notices)
    .set({
      status: "published",
      refNo: number,
      refLabel: noticeRef(session?.name ?? null, number),
      publishedAt: new Date(),
      decidedBy,
      decisionComment: null,
    })
    .where(eq(schema.notices.id, row.id));
  await recordSchoolAudit(scope, {
    actorUserId: ctx.user.id,
    action: "notice.published",
    entityType: "notice",
    entityId: row.id,
    metadata: { ref: number },
  });
  const audience = (await usersWithRoles(scope, row.audience)).filter((id) => id !== row.createdBy);
  const notices: NotificationInput[] = audience.map((userId) => ({
    userId,
    kind: "notice.published",
    title: row.title,
    body: row.body.slice(0, 140),
    link: `/notices/${row.id}`,
    email: true,
  }));
  await saveNotifications(scope, notices);
  return notices;
}

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "This notice was not found." });
const refused = (message: string) => new TRPCError({ code: "PRECONDITION_FAILED", message });
const ok = z.object({ ok: z.literal(true) });

async function loadVisible(scope: SchoolScope, ctx: Ctx, id: string) {
  const [row] = await scope.tx.select().from(schema.notices).where(eq(schema.notices.id, id));
  if (!row) throw notFound();
  const mine = row.createdBy === ctx.user.id;
  const audiences = visibleAudiences(ctx.roles);
  const canSee =
    row.status === "published"
      ? audiences === null || audiences.includes(row.audience)
      : mine || (row.status === "pending_approval" && ctx.permissions.has("notice.approve"));
  if (!canSee) throw notFound();
  return row;
}

export const noticesRouter = router({
  list: view
    .input(listNoticesInputSchema)
    .output(z.array(noticeSchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const n = schema.notices;
        const audiences = visibleAudiences(ctx.roles);
        const where =
          input.tab === "published"
            ? and(eq(n.status, "published"), audiences ? inArray(n.audience, audiences) : undefined)
            : input.tab === "mine"
              ? eq(n.createdBy, ctx.user.id)
              : and(
                  eq(n.status, "pending_approval"),
                  ctx.permissions.has("notice.approve") ? undefined : sql`false`,
                );
        const rows = await scope.tx
          .select()
          .from(n)
          .where(where)
          .orderBy(desc(n.publishedAt), desc(n.createdAt))
          .limit(100);
        const approval = await approvalRequired(scope);
        const names = await authorNames(
          ctx,
          rows.map((r) => r.createdBy),
        );
        return rows.map((r) => present(r, ctx, approval, names));
      }),
    ),

  get: view
    .input(noticeIdInputSchema)
    .output(noticeSchema)
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const row = await loadVisible(scope, ctx, input.id);
        const names = await authorNames(ctx, [row.createdBy]);
        return present(row, ctx, await approvalRequired(scope), names);
      }),
    ),

  /** Creates a draft, or changes the author's own draft or rejected notice. */
  save: write
    .input(saveNoticeInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        if (!input.id) {
          const [created] = await scope.tx
            .insert(schema.notices)
            .values({
              schoolId: ctx.schoolId,
              title: input.title,
              body: input.body,
              audience: input.audience,
              createdBy: ctx.user.id,
            })
            .returning({ id: schema.notices.id });
          if (!created)
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Could not save the notice.",
            });
          return { id: created.id };
        }
        const [row] = await scope.tx
          .select()
          .from(schema.notices)
          .where(and(eq(schema.notices.id, input.id), eq(schema.notices.createdBy, ctx.user.id)));
        if (!row) throw notFound();
        if (
          nextNoticeStatus(row.status as NoticeStatus, "edit", {
            canPublish: false,
            approvalRequired: true,
          }) === null
        ) {
          throw refused("This notice can no longer be edited.");
        }
        await scope.tx
          .update(schema.notices)
          .set({ title: input.title, body: input.body, audience: input.audience })
          .where(eq(schema.notices.id, row.id));
        return { id: row.id };
      }),
    ),

  /** Sends a draft on: published at once for the Principal (or when approval is off), otherwise to the Principal. */
  submit: write
    .input(noticeIdInputSchema)
    .output(z.object({ status: z.enum(["pending_approval", "published"]) }))
    .mutation(async ({ ctx, input }) => {
      let toEmail: NotificationInput[] = [];
      const result = await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.notices)
          .where(and(eq(schema.notices.id, input.id), eq(schema.notices.createdBy, ctx.user.id)));
        if (!row) throw notFound();
        const next = nextNoticeStatus(row.status as NoticeStatus, "submit", {
          canPublish: ctx.permissions.has("notice.publish"),
          approvalRequired: await approvalRequired(scope),
        });
        if (next === null) throw refused("This notice has already been sent.");
        if (next === "published") {
          toEmail = await publish(scope, ctx, row, null);
          return { status: "published" as const };
        }
        await scope.tx
          .update(schema.notices)
          .set({ status: "pending_approval", decisionComment: null })
          .where(eq(schema.notices.id, row.id));
        const principals = await usersWithRoles(scope, "principal");
        await saveNotifications(
          scope,
          principals.map((userId) => ({
            userId,
            kind: "notice.pending",
            title: "A notice needs your approval",
            body: row.title,
            link: "/notices?tab=approvals",
          })),
        );
        return { status: "pending_approval" as const };
      });
      await sendNotificationEmails(ctx.db, ctx.email, toEmail);
      return result;
    }),

  approve: decide
    .input(noticeIdInputSchema)
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      let toEmail: NotificationInput[] = [];
      await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.notices)
          .where(eq(schema.notices.id, input.id));
        if (!row) throw notFound();
        if (
          nextNoticeStatus(row.status as NoticeStatus, "approve", {
            canPublish: true,
            approvalRequired: true,
          }) === null
        )
          throw refused("This notice is not waiting for approval.");
        toEmail = await publish(scope, ctx, row, ctx.user.id);
        await saveNotifications(scope, [
          {
            userId: row.createdBy,
            kind: "notice.approved",
            title: "Your notice was approved",
            body: row.title,
            link: `/notices/${row.id}`,
          },
        ]);
      });
      await sendNotificationEmails(ctx.db, ctx.email, toEmail);
      return { ok: true as const };
    }),

  reject: decide
    .input(rejectNoticeInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.notices)
          .where(eq(schema.notices.id, input.id));
        if (!row) throw notFound();
        if (
          nextNoticeStatus(row.status as NoticeStatus, "reject", {
            canPublish: true,
            approvalRequired: true,
          }) === null
        )
          throw refused("This notice is not waiting for approval.");
        await scope.tx
          .update(schema.notices)
          .set({ status: "rejected", decidedBy: ctx.user.id, decisionComment: input.comment })
          .where(eq(schema.notices.id, row.id));
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "notice.rejected",
          entityType: "notice",
          entityId: row.id,
        });
        await saveNotifications(scope, [
          {
            userId: row.createdBy,
            kind: "notice.rejected",
            title: "Your notice was sent back",
            body: input.comment,
            link: `/notices/${row.id}`,
          },
        ]);
        return { ok: true as const };
      }),
    ),

  delete: write
    .input(noticeIdInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.notices)
          .where(and(eq(schema.notices.id, input.id), eq(schema.notices.createdBy, ctx.user.id)));
        if (!row) throw notFound();
        if (
          nextNoticeStatus(row.status as NoticeStatus, "delete", {
            canPublish: false,
            approvalRequired: true,
          }) === null
        )
          throw refused("This notice can no longer be deleted.");
        await scope.tx.delete(schema.notices).where(eq(schema.notices.id, row.id));
        return { ok: true as const };
      }),
    ),
});
