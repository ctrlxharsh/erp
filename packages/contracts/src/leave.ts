import { leaveStatuses } from "@erp/domain";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const leaveStatusSchema = z.enum(leaveStatuses);

export const leaveTypeSchema = z.object({ id: z.uuid(), name: z.string() });

export const applyLeaveInputSchema = z
  .object({
    leaveTypeId: z.uuid("Choose the type of leave"),
    fromDate: isoDate,
    toDate: isoDate,
    reason: z.string().trim().min(3, "Tell the principal why").max(500),
    fileIds: z.array(z.uuid()).max(3).default([]),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    path: ["toDate"],
    message: "The last day must not be before the first day",
  });

export const leaveRequestSchema = z.object({
  id: z.uuid(),
  applicantName: z.string(),
  leaveTypeName: z.string(),
  fromDate: z.string(),
  toDate: z.string(),
  reason: z.string(),
  status: leaveStatusSchema,
  decisionComment: z.string().nullable(),
  fileIds: z.array(z.uuid()),
  createdAt: z.date(),
});
export const reviewLeaveInputSchema = z.object({ status: leaveStatusSchema.optional() });
export const leaveIdInputSchema = z.object({ id: z.uuid() });
export const rejectLeaveInputSchema = z.object({
  id: z.uuid(),
  comment: z.string().trim().min(3, "Say why").max(500),
});
