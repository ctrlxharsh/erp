import {
  applyLeaveInputSchema,
  leaveIdInputSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  rejectLeaveInputSchema,
  reviewLeaveInputSchema,
} from "@erp/contracts";
import { recordSchoolAudit, type SchoolScope, schema, withSchool } from "@erp/db";
import { type LeaveStatus, leaveWorkingDays, nextLeaveStatus, schoolToday } from "@erp/domain";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { type NotificationInput, saveNotifications, sendNotificationEmails } from "../notify";
import { requirePermission, router, schoolProcedure } from "../trpc";

const apply = schoolProcedure.use(requirePermission("leave.apply"));
const review = schoolProcedure.use(requirePermission("leave.approve"));
const ok = z.object({ ok: z.literal(true) });

const bad = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = () =>
  new TRPCError({ code: "NOT_FOUND", message: "This leave request was not found." });
const refused = (message: string) => new TRPCError({ code: "PRECONDITION_FAILED", message });

const defaultLeaveTypes = ["Casual Leave", "Sick Leave", "Earned Leave", "Other"];
const MAX_DAYS = 60;

async function loadTypes(scope: SchoolScope) {
  let rows = await scope.tx.select().from(schema.leaveTypes).orderBy(asc(schema.leaveTypes.name));
  if (rows.length === 0) {
    await scope.tx
      .insert(schema.leaveTypes)
      .values(defaultLeaveTypes.map((name) => ({ schoolId: scope.schoolId, name })));
    rows = await scope.tx.select().from(schema.leaveTypes).orderBy(asc(schema.leaveTypes.name));
  }
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function present(
  scope: SchoolScope,
  rows: { r: typeof schema.leaveRequests.$inferSelect; applicant: string; type: string }[],
) {
  const files = rows.length
    ? await scope.tx
        .select()
        .from(schema.leaveRequestFiles)
        .where(
          inArray(
            schema.leaveRequestFiles.leaveRequestId,
            rows.map((x) => x.r.id),
          ),
        )
    : [];
  return rows.map(({ r, applicant, type }) => ({
    id: r.id,
    applicantName: applicant,
    leaveTypeName: type,
    fromDate: r.fromDate,
    toDate: r.toDate,
    reason: r.reason,
    status: r.status as LeaveStatus,
    decisionComment: r.decisionComment,
    fileIds: files.filter((f) => f.leaveRequestId === r.id).map((f) => f.fileId),
    createdAt: r.createdAt,
  }));
}

const baseQuery = (scope: SchoolScope) =>
  scope.tx
    .select({
      r: schema.leaveRequests,
      applicant: schema.staff.fullName,
      type: schema.leaveTypes.name,
    })
    .from(schema.leaveRequests)
    .innerJoin(schema.staff, eq(schema.staff.id, schema.leaveRequests.staffId))
    .innerJoin(schema.leaveTypes, eq(schema.leaveTypes.id, schema.leaveRequests.leaveTypeId));

export const leave = router({
  types: schoolProcedure
    .use(requirePermission("school.view"))
    .output(z.array(leaveTypeSchema))
    .query(({ ctx }) => withSchool(ctx.db, ctx.schoolId, (scope) => loadTypes(scope))),

  /** The signed-in person's own applications, newest first. */
  mine: apply.output(z.array(leaveRequestSchema)).query(({ ctx }) =>
    withSchool(ctx.db, ctx.schoolId, async (scope) => {
      const [me] = await scope.tx
        .select({ id: schema.staff.id })
        .from(schema.staff)
        .where(eq(schema.staff.userId, ctx.user.id));
      if (!me) return [];
      const rows = await baseQuery(scope)
        .where(eq(schema.leaveRequests.staffId, me.id))
        .orderBy(desc(schema.leaveRequests.createdAt));
      return present(scope, rows);
    }),
  ),

  submit: apply
    .input(applyLeaveInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [me] = await scope.tx
          .select({ id: schema.staff.id, fullName: schema.staff.fullName })
          .from(schema.staff)
          .where(eq(schema.staff.userId, ctx.user.id));
        if (!me)
          throw refused(
            "Your login is not linked to a staff record yet. Please ask the school admin.",
          );
        const types = await loadTypes(scope);
        if (!types.some((t) => t.id === input.leaveTypeId)) throw bad("Choose the type of leave.");
        const earliest = new Date(`${schoolToday()}T00:00:00Z`);
        earliest.setUTCDate(earliest.getUTCDate() - 30);
        if (input.fromDate < earliest.toISOString().slice(0, 10))
          throw bad("Leave cannot start more than 30 days in the past.");
        if (leaveWorkingDays(input.fromDate, input.toDate).length > MAX_DAYS)
          throw bad(`Leave cannot be longer than ${MAX_DAYS} days in one request.`);
        const overlap = await scope.tx
          .select({ id: schema.leaveRequests.id })
          .from(schema.leaveRequests)
          .where(
            and(
              eq(schema.leaveRequests.staffId, me.id),
              inArray(schema.leaveRequests.status, ["pending", "approved"]),
              lte(schema.leaveRequests.fromDate, input.toDate),
              gte(schema.leaveRequests.toDate, input.fromDate),
            ),
          )
          .limit(1);
        if (overlap.length > 0)
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already have leave for some of these days.",
          });
        if (input.fileIds.length > 0) {
          const found = await scope.tx
            .select({ id: schema.files.id })
            .from(schema.files)
            .where(
              and(
                inArray(schema.files.id, input.fileIds),
                eq(schema.files.purpose, "leave_document"),
                eq(schema.files.status, "ready"),
                eq(schema.files.ownerUserId, ctx.user.id),
              ),
            );
          if (found.length !== new Set(input.fileIds).size)
            throw bad("A document was not found. Please upload it again.");
        }
        const [created] = await scope.tx
          .insert(schema.leaveRequests)
          .values({
            schoolId: ctx.schoolId,
            staffId: me.id,
            leaveTypeId: input.leaveTypeId,
            fromDate: input.fromDate,
            toDate: input.toDate,
            reason: input.reason,
          })
          .returning({ id: schema.leaveRequests.id });
        if (!created)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not save the application.",
          });
        if (input.fileIds.length > 0) {
          await scope.tx.insert(schema.leaveRequestFiles).values(
            [...new Set(input.fileIds)].map((fileId) => ({
              schoolId: ctx.schoolId,
              leaveRequestId: created.id,
              fileId,
            })),
          );
        }
        const principals = await scope.tx
          .select({ userId: schema.memberships.userId })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.status, "active"),
              sql`'principal' = any(${schema.memberships.roles})`,
            ),
          );
        await saveNotifications(
          scope,
          principals.map((p) => ({
            userId: p.userId,
            kind: "leave.applied",
            title: `${me.fullName} applied for leave`,
            body: `${input.fromDate} to ${input.toDate}`,
            link: "/leave",
          })),
        );
        return { id: created.id };
      }),
    ),

  cancel: apply
    .input(leaveIdInputSchema)
    .output(ok)
    .mutation(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select({ r: schema.leaveRequests })
          .from(schema.leaveRequests)
          .innerJoin(schema.staff, eq(schema.staff.id, schema.leaveRequests.staffId))
          .where(and(eq(schema.leaveRequests.id, input.id), eq(schema.staff.userId, ctx.user.id)));
        if (!row) throw notFound();
        if (nextLeaveStatus(row.r.status as LeaveStatus, "cancel") === null)
          throw refused("Only a request that is still waiting can be cancelled.");
        await scope.tx
          .update(schema.leaveRequests)
          .set({ status: "cancelled" })
          .where(eq(schema.leaveRequests.id, input.id));
        return { ok: true as const };
      }),
    ),

  /** Applications for the Principal to decide (default: waiting ones). */
  review: review
    .input(reviewLeaveInputSchema)
    .output(z.array(leaveRequestSchema))
    .query(({ ctx, input }) =>
      withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const rows = await baseQuery(scope)
          .where(eq(schema.leaveRequests.status, input.status ?? "pending"))
          .orderBy(asc(schema.leaveRequests.fromDate), asc(schema.leaveRequests.createdAt))
          .limit(100);
        return present(scope, rows);
      }),
    ),

  approve: review
    .input(leaveIdInputSchema)
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      const emails: NotificationInput[] = [];
      await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.leaveRequests)
          .where(eq(schema.leaveRequests.id, input.id));
        if (!row) throw notFound();
        if (nextLeaveStatus(row.status as LeaveStatus, "approve") === null)
          throw refused("This request has already been decided.");
        await scope.tx
          .update(schema.leaveRequests)
          .set({ status: "approved", decidedBy: ctx.user.id, decisionComment: null })
          .where(eq(schema.leaveRequests.id, input.id));

        // Staff attendance shows Leave for each working day that is not already a holiday.
        const holidays = await scope.tx
          .select({ start: schema.calendarEvents.startDate, end: schema.calendarEvents.endDate })
          .from(schema.calendarEvents)
          .where(
            and(
              eq(schema.calendarEvents.type, "holiday"),
              lte(schema.calendarEvents.startDate, row.toDate),
              gte(schema.calendarEvents.endDate, row.fromDate),
            ),
          );
        const days = leaveWorkingDays(row.fromDate, row.toDate).filter(
          (d) => !holidays.some((h) => h.start <= d && d <= h.end),
        );
        if (days.length > 0) {
          await scope.tx
            .insert(schema.staffAttendance)
            .values(
              days.map((date) => ({
                schoolId: ctx.schoolId,
                staffId: row.staffId,
                date,
                status: "leave" as const,
                markedBy: ctx.user.id,
              })),
            )
            .onConflictDoUpdate({
              target: [schema.staffAttendance.staffId, schema.staffAttendance.date],
              set: { status: "leave", markedBy: ctx.user.id },
            });
        }
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "leave.approved",
          entityType: "leave_request",
          entityId: row.id,
          metadata: { days: days.length },
        });
        const [applicant] = await scope.tx
          .select({ userId: schema.staff.userId })
          .from(schema.staff)
          .where(eq(schema.staff.id, row.staffId));
        if (applicant?.userId) {
          const item: NotificationInput = {
            userId: applicant.userId,
            kind: "leave.approved",
            title: "Your leave was approved",
            body: `${row.fromDate} to ${row.toDate}`,
            link: "/leave",
            email: true,
          };
          await saveNotifications(scope, [item]);
          emails.push(item);
        }
      });
      await sendNotificationEmails(ctx.db, ctx.email, emails);
      return { ok: true as const };
    }),

  reject: review
    .input(rejectLeaveInputSchema)
    .output(ok)
    .mutation(async ({ ctx, input }) => {
      const emails: NotificationInput[] = [];
      await withSchool(ctx.db, ctx.schoolId, async (scope) => {
        const [row] = await scope.tx
          .select()
          .from(schema.leaveRequests)
          .where(eq(schema.leaveRequests.id, input.id));
        if (!row) throw notFound();
        if (nextLeaveStatus(row.status as LeaveStatus, "reject") === null)
          throw refused("This request has already been decided.");
        await scope.tx
          .update(schema.leaveRequests)
          .set({ status: "rejected", decidedBy: ctx.user.id, decisionComment: input.comment })
          .where(eq(schema.leaveRequests.id, input.id));
        await recordSchoolAudit(scope, {
          actorUserId: ctx.user.id,
          action: "leave.rejected",
          entityType: "leave_request",
          entityId: row.id,
        });
        const [applicant] = await scope.tx
          .select({ userId: schema.staff.userId })
          .from(schema.staff)
          .where(eq(schema.staff.id, row.staffId));
        if (applicant?.userId) {
          const item: NotificationInput = {
            userId: applicant.userId,
            kind: "leave.rejected",
            title: "Your leave was not approved",
            body: input.comment,
            link: "/leave",
            email: true,
          };
          await saveNotifications(scope, [item]);
          emails.push(item);
        }
      });
      await sendNotificationEmails(ctx.db, ctx.email, emails);
      return { ok: true as const };
    }),
});
