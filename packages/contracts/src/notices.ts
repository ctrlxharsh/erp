import { noticeAudiences, noticeStatuses } from "@erp/domain";
import { z } from "zod";

export const noticeStatusSchema = z.enum(noticeStatuses);
export const noticeAudienceSchema = z.enum(noticeAudiences);

export const noticeSchema = z.object({
  id: z.uuid(),
  refLabel: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  audience: noticeAudienceSchema,
  status: noticeStatusSchema,
  authorName: z.string().nullable(),
  decisionComment: z.string().nullable(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
  /** What the caller may do with it right now. */
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
  canDecide: z.boolean(),
  canDelete: z.boolean(),
});
export type Notice = z.infer<typeof noticeSchema>;

export const listNoticesInputSchema = z.object({
  tab: z.enum(["published", "mine", "approvals"]).default("published"),
});
export const saveNoticeInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(2, "Enter a title").max(150),
  body: z.string().trim().min(2, "Write the notice").max(4000),
  audience: noticeAudienceSchema.default("all"),
});
export const noticeIdInputSchema = z.object({ id: z.uuid() });
export const rejectNoticeInputSchema = z.object({
  id: z.uuid(),
  comment: z.string().trim().min(3, "Say why, so the author can fix it").max(500),
});
