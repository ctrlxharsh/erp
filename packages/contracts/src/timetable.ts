import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 09:30");

export const periodSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});
export const savePeriodInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Enter a name").max(40),
    startTime: time,
    endTime: time,
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ["endTime"],
    message: "The end time must be after the start time",
  });

export const timetableEntrySchema = z.object({
  id: z.uuid(),
  weekday: z.number().int().min(1).max(7),
  periodId: z.uuid(),
  sectionId: z.uuid(),
  sectionLabel: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  staffId: z.uuid().nullable(),
  staffName: z.string().nullable(),
});
export const timetableSchema = z.object({
  periods: z.array(periodSchema),
  entries: z.array(timetableEntrySchema),
});

export const sectionTimetableInputSchema = z.object({ sectionId: z.uuid() });
export const setTimetableEntryInputSchema = z.object({
  sectionId: z.uuid(),
  weekday: z.number().int().min(1).max(7),
  periodId: z.uuid(),
  subjectId: z.uuid(),
  staffId: z.uuid().nullable(),
});
export const clearTimetableEntryInputSchema = z.object({
  sectionId: z.uuid(),
  weekday: z.number().int().min(1).max(7),
  periodId: z.uuid(),
});
/** After saving, any other section where the same teacher is already booked in that slot. */
export const timetableSaveResultSchema = z.object({ conflicts: z.array(z.string()) });
