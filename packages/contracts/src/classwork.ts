import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const progressSchema = z.enum(["pending", "submitted", "late"]);

// ---- Homework ---------------------------------------------------------------------------

export const createHomeworkInputSchema = z
  .object({
    sectionId: z.uuid("Choose a class and section"),
    subjectId: z.uuid("Choose a subject"),
    title: z.string().trim().min(2, "Enter a title").max(120),
    details: z.string().trim().max(2000).default(""),
    dueDate: isoDate,
    isGraded: z.boolean().default(false),
    maxMarks: z.number().int().min(1).max(1000).nullable().default(null),
    fileIds: z.array(z.uuid()).max(5).default([]),
  })
  .refine((v) => !v.isGraded || v.maxMarks !== null, {
    path: ["maxMarks"],
    message: "Enter the maximum marks",
  });

export const homeworkSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  details: z.string().nullable(),
  subjectName: z.string(),
  sectionLabel: z.string(),
  teacherName: z.string(),
  dueDate: z.string(),
  isGraded: z.boolean(),
  maxMarks: z.number().int().nullable(),
  attachmentIds: z.array(z.uuid()),
  /** Only in a student's own view. */
  status: progressSchema.nullable(),
  marks: z.number().nullable(),
});
export const listHomeworkInputSchema = z.object({
  sectionId: z.uuid().optional(),
  studentId: z.uuid().optional(),
});
export const homeworkRosterSchema = z.object({
  homework: homeworkSummarySchema,
  canManage: z.boolean(),
  students: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      status: progressSchema,
      marks: z.number().nullable(),
    }),
  ),
});
export const setHomeworkStatusInputSchema = z.object({
  homeworkId: z.uuid(),
  entries: z
    .array(
      z.object({
        studentId: z.uuid(),
        status: progressSchema,
        marks: z.number().min(0).nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});

// ---- Class diary ------------------------------------------------------------------------

export const diaryEntrySchema = z.object({
  id: z.uuid(),
  date: z.string(),
  sectionLabel: z.string(),
  subjectName: z.string(),
  teacherName: z.string(),
  topic: z.string(),
  notes: z.string().nullable(),
});
export const listDiaryInputSchema = z.object({ sectionId: z.uuid(), from: isoDate, to: isoDate });
export const saveDiaryInputSchema = z.object({
  sectionId: z.uuid("Choose a class and section"),
  subjectId: z.uuid("Choose a subject"),
  date: isoDate,
  topic: z.string().trim().min(2, "Enter the topic covered").max(200),
  notes: z.string().trim().max(1000).default(""),
});

// ---- Study material ---------------------------------------------------------------------

export const studyMaterialSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  className: z.string(),
  subjectName: z.string(),
  teacherName: z.string(),
  fileId: z.uuid(),
  createdAt: z.date(),
});
export const listMaterialInputSchema = z.object({ classId: z.uuid().optional() });
export const createMaterialInputSchema = z.object({
  classId: z.uuid("Choose a class"),
  subjectId: z.uuid("Choose a subject"),
  title: z.string().trim().min(2, "Enter a title").max(120),
  fileId: z.uuid(),
});
