import { attendanceStatuses } from "@erp/domain";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const attendanceStatusSchema = z.enum(attendanceStatuses);

export const attendanceSectionSchema = z.object({
  sectionId: z.uuid(),
  label: z.string(),
  isClassTeacher: z.boolean(),
  markedToday: z.boolean(),
});

export const attendanceSheetInputSchema = z.object({ sectionId: z.uuid(), date: isoDate });
export const attendanceSheetSchema = z.object({
  sectionLabel: z.string(),
  date: z.string(),
  today: z.string(),
  holiday: z.string().nullable(),
  /** What the caller may do with this sheet right now. */
  access: z.enum(["teacher", "correction", "view"]),
  /** Why saving is not possible, in plain words, when access is "view". */
  note: z.string().nullable(),
  marked: z.boolean(),
  students: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      rollNo: z.number().int().nullable(),
      status: attendanceStatusSchema.nullable(),
    }),
  ),
});

export const saveAttendanceInputSchema = z.object({
  sectionId: z.uuid(),
  date: isoDate,
  entries: z
    .array(z.object({ studentId: z.uuid(), status: attendanceStatusSchema }))
    .min(1)
    .max(200),
  /** Required when an admin corrects a day after the teacher's window. */
  reason: z.string().trim().max(300).optional(),
});
export const saveAttendanceOutputSchema = z.object({
  saved: z.number().int(),
  absentNotified: z.number().int(),
});

export const studentAttendanceInputSchema = z.object({
  studentId: z.uuid(),
  from: isoDate,
  to: isoDate,
});
export const studentAttendanceSchema = z.object({
  records: z.array(z.object({ date: z.string(), status: attendanceStatusSchema })),
  counts: z.object({
    present: z.number().int(),
    absent: z.number().int(),
    leave: z.number().int(),
    late: z.number().int(),
  }),
  percent: z.number().nullable(),
});

export const staffSheetInputSchema = z.object({ date: isoDate });
export const staffSheetSchema = z.object({
  date: z.string(),
  holiday: z.string().nullable(),
  canEdit: z.boolean(),
  staff: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      kind: z.enum(["teacher", "non_teaching"]),
      status: attendanceStatusSchema.nullable(),
    }),
  ),
});
export const saveStaffAttendanceInputSchema = z.object({
  date: isoDate,
  entries: z
    .array(z.object({ staffId: z.uuid(), status: attendanceStatusSchema }))
    .min(1)
    .max(500),
});
