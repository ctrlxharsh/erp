import { calendarAudiences, calendarEventTypes } from "@erp/domain";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

// ---- Calendar ---------------------------------------------------------------------------

export const calendarEventTypeSchema = z.enum(calendarEventTypes);
export const calendarAudienceSchema = z.enum(calendarAudiences);

export const calendarEventSchema = z.object({
  id: z.uuid(),
  startDate: z.string(),
  endDate: z.string(),
  title: z.string(),
  type: calendarEventTypeSchema,
  audience: calendarAudienceSchema,
});
export const listCalendarInputSchema = z.object({ from: isoDate, to: isoDate });
export const saveCalendarEventInputSchema = z
  .object({
    id: z.uuid().optional(),
    startDate: isoDate,
    endDate: isoDate,
    title: z.string().trim().min(1, "Enter a title").max(120),
    type: calendarEventTypeSchema,
    audience: calendarAudienceSchema.default("all"),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "The end date must not be before the start date",
  });

export const calendarImportPreviewSchema = z.object({
  totalRows: z.number().int(),
  validRows: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), messages: z.array(z.string()) })),
  sample: z.array(
    z.object({
      row: z.number().int(),
      title: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      type: calendarEventTypeSchema,
    }),
  ),
});

// ---- Notifications ----------------------------------------------------------------------

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.date(),
});
export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int(),
});
