import { z } from "zod";

const name = (what: string) => z.string().trim().min(1, `Enter the ${what}`).max(80);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");

export const profileSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  affiliationNo: z.string().nullable(),
  phone: z.string().nullable(),
  logoFileId: z.uuid().nullable(),
  timezone: z.string(),
});

export const updateProfileInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the school's name").max(120),
  address: z.string().trim().max(300).default(""),
  affiliationNo: z.string().trim().max(40).default(""),
  phone: z.string().trim().max(20).default(""),
  logoFileId: z.uuid().nullable().default(null),
});

export const academicSessionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean(),
});

export const createSessionInputSchema = z
  .object({ name: name("session name"), startDate: isoDate, endDate: isoDate })
  .refine((v) => v.endDate > v.startDate, {
    path: ["endDate"],
    message: "The end date must be after the start date",
  });

export const classSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  sections: z.array(z.object({ id: z.uuid(), name: z.string() })),
  subjectIds: z.array(z.uuid()),
});

export const subjectSchema = z.object({ id: z.uuid(), name: z.string() });

export const schoolSetupSchema = z.object({
  profile: profileSchema,
  sessions: z.array(academicSessionSchema),
  classes: z.array(classSchema),
  subjects: z.array(subjectSchema),
});
export type SchoolSetup = z.infer<typeof schoolSetupSchema>;

export const createClassInputSchema = z.object({ name: name("class name") });
export const createSectionInputSchema = z.object({
  classId: z.uuid(),
  name: name("section name").max(20),
});
export const createSubjectInputSchema = z.object({ name: name("subject name") });
export const idInputSchema = z.object({ id: z.uuid() });
export const setClassSubjectsInputSchema = z.object({
  classId: z.uuid(),
  subjectIds: z.array(z.uuid()).max(100),
});
