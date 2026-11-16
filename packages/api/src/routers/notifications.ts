import { notificationListSchema } from "@erp/contracts";
import { schema, withSchool } from "@erp/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, router, schoolProcedure } from "../trpc";

const mine = schoolProcedure.use(requirePermission("school.view"));
const ok = z.object({ ok: z.literal(true) });

export const notificationsRouter = router({
  /** The latest notifications for the signed-in person in this school. */
  list: mine.output(notificationListSchema).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
      const n = schema.notifications;
      const items = await tx
        .select()
        .from(n)
        .where(eq(n.userId, ctx.user.id))
        .orderBy(desc(n.createdAt))
        .limit(20);
      const [unread] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(n)
        .where(and(eq(n.userId, ctx.user.id), isNull(n.readAt)));
      return {
        items: items.map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          body: i.body,
          link: i.link,
          read: i.readAt !== null,
          createdAt: i.createdAt,
        })),
        unreadCount: unread?.total ?? 0,
      };
    }),
  ),

  markRead: mine
    .input(z.object({ id: z.uuid() }))
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
        const n = schema.notifications;
        await tx
          .update(n)
          .set({ readAt: new Date() })
          .where(and(eq(n.id, input.id), eq(n.userId, ctx.user.id), isNull(n.readAt)));
        return { ok: true as const };
      }),
    ),

  markAllRead: mine.output(ok).mutation(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async ({ tx }) => {
      const n = schema.notifications;
      await tx
        .update(n)
        .set({ readAt: new Date() })
        .where(and(eq(n.userId, ctx.user.id), isNull(n.readAt)));
      return { ok: true as const };
    }),
  ),
});
