import { resultStatuses } from "@erp/domain";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const resultStatusSchema = z.enum(resultStatuses);

// ---- Grade scale ------------------------------------------------------------------------

export const gradeBandSchema = z.object({
  grade: z.string().trim().min(1, "Enter a grade").max(10),
  minPercent: z.number().int().min(0).max(100),
  gradePoint: z.number().int().min(0).max(100),
});
export const saveGradeBandsInputSchema = z.object({
  bands: z.array(gradeBandSchema).min(2).max(20),
});

// ---- Exams and schedule -----------------------------------------------------------------

export const examSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  subjectCount: z.number().int(),
});
export const createExamInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the exam name").max(80),
});
export const examSubjectSchema = z.object({
  id: z.uuid(),
  classId: z.uuid(),
  className: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  date: z.string(),
  startTime: z.string().nullable(),
  maxMarks: z.number().int(),
});
export const saveExamSubjectInputSchema = z.object({
  examId: z.uuid(),
  classId: z.uuid("Choose a class"),
  subjectId: z.uuid("Choose a subject"),
  date: isoDate,
  startTime: z
    .union([
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 09:30"),
      z.literal(""),
    ])
    .default(""),
  maxMarks: z.number().int().min(1, "Enter the maximum marks").max(1000),
});

// ---- Marks entry and approval -----------------------------------------------------------

export const batchSummarySchema = z.object({
  id: z.uuid().nullable(),
  examId: z.uuid(),
  examName: z.string(),
  sectionId: z.uuid(),
  sectionLabel: z.string(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  maxMarks: z.number().int(),
  date: z.string(),
  status: resultStatusSchema,
  decisionComment: z.string().nullable(),
  teacherName: z.string().nullable(),
});
export const batchKeyInputSchema = z.object({
  examId: z.uuid(),
  sectionId: z.uuid(),
  subjectId: z.uuid(),
});
export const batchDetailSchema = z.object({
  batch: batchSummarySchema,
  canEdit: z.boolean(),
  students: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      marks: z.number().nullable(),
      absent: z.boolean(),
    }),
  ),
});
export const saveMarksInputSchema = z.object({
  examId: z.uuid(),
  sectionId: z.uuid(),
  subjectId: z.uuid(),
  entries: z
    .array(
      z.object({ studentId: z.uuid(), marks: z.number().min(0).nullable(), absent: z.boolean() }),
    )
    .min(1)
    .max(200),
});
export const reviewListInputSchema = z.object({
  examId: z.uuid().optional(),
  status: resultStatusSchema.optional(),
});
export const rejectBatchInputSchema = z.object({
  examId: z.uuid(),
  sectionId: z.uuid(),
  subjectId: z.uuid(),
  comment: z.string().trim().min(3, "Say what needs fixing").max(500),
});
export const publishInputSchema = z.object({
  batches: z.array(batchKeyInputSchema).min(1).max(100),
});

// ---- Results for students and parents ---------------------------------------------------

export const reportCardSchema = z.object({
  exam: z.object({ id: z.uuid(), name: z.string() }),
  student: z.object({
    id: z.uuid(),
    fullName: z.string(),
    admissionNo: z.string(),
    className: z.string().nullable(),
    sectionName: z.string().nullable(),
  }),
  rows: z.array(
    z.object({
      subject: z.string(),
      max: z.number().int(),
      marks: z.number().nullable(),
      absent: z.boolean(),
      percent: z.number().nullable(),
      grade: z.string().nullable(),
      published: z.boolean(),
    }),
  ),
  summary: z.object({
    totalMarks: z.number(),
    totalMax: z.number(),
    percent: z.number().nullable(),
    grade: z.string().nullable(),
    gradePoint: z.number().nullable(),
  }),
  /** True only when every scheduled subject has a published result. */
  complete: z.boolean(),
});
export type ReportCard = z.infer<typeof reportCardSchema>;
export const reportCardInputSchema = z.object({ examId: z.uuid(), studentId: z.uuid() });
export const myResultsInputSchema = z.object({ studentId: z.uuid() });
export const myResultsSchema = z.array(
  z.object({
    examId: z.uuid(),
    examName: z.string(),
    publishedSubjects: z.number().int(),
    scheduledSubjects: z.number().int(),
  }),
);
export const admitCardSchema = z.object({
  exam: z.object({ id: z.uuid(), name: z.string() }),
  student: z.object({
    fullName: z.string(),
    admissionNo: z.string(),
    className: z.string().nullable(),
    sectionName: z.string().nullable(),
  }),
  schedule: z.array(
    z.object({
      date: z.string(),
      startTime: z.string().nullable(),
      subject: z.string(),
      maxMarks: z.number().int(),
    }),
  ),
});
