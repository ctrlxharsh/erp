import { z } from "zod";

const text = (what: string, max = 120) => z.string().trim().min(1, `Enter the ${what}`).max(max);
const optionalText = (max = 120) => z.string().trim().max(max).default("");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const optionalDate = z.union([isoDate, z.literal("")]).default("");
const phone = z.string().trim().max(20).default("");
const email = z.union([z.email(), z.literal("")]).default("");

export const genderSchema = z.enum(["female", "male", "other"]);
export const personStatusSchema = z.enum(["active", "left"]);

const listInput = {
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).default(""),
};

// ---- Students --------------------------------------------------------------------------

export const listStudentsInputSchema = z.object({
  ...listInput,
  sectionId: z.uuid().optional(),
  sort: z.enum(["name", "admissionNo"]).default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export const studentRowSchema = z.object({
  id: z.uuid(),
  admissionNo: z.string(),
  fullName: z.string(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  status: personStatusSchema,
});
export const listStudentsOutputSchema = z.object({
  items: z.array(studentRowSchema),
  total: z.number().int(),
});

export const guardianInputSchema = z.object({
  fullName: text("guardian's name"),
  email,
  phone,
  relation: optionalText(40),
});

export const createStudentInputSchema = z.object({
  admissionNo: text("admission number", 40),
  fullName: text("student's name"),
  dateOfBirth: optionalDate,
  gender: genderSchema.nullable().default(null),
  admissionDate: optionalDate,
  sectionId: z.uuid("Choose a class and section"),
  /** The school confirms it holds the parent's consent for this child's data (DPDP). */
  consentConfirmed: z.literal(true, { error: "Confirm that parental consent is recorded" }),
  guardians: z.array(guardianInputSchema).max(4).default([]),
});

export const updateStudentInputSchema = z.object({
  id: z.uuid(),
  admissionNo: text("admission number", 40),
  fullName: text("student's name"),
  dateOfBirth: optionalDate,
  gender: genderSchema.nullable().default(null),
  admissionDate: optionalDate,
  sectionId: z.uuid(),
});

export const studentDetailSchema = z.object({
  id: z.uuid(),
  admissionNo: z.string(),
  fullName: z.string(),
  dateOfBirth: z.string().nullable(),
  gender: genderSchema.nullable(),
  admissionDate: z.string().nullable(),
  status: personStatusSchema,
  sectionId: z.uuid().nullable(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  hasLogin: z.boolean(),
  guardians: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      relation: z.string().nullable(),
      hasLogin: z.boolean(),
    }),
  ),
});

export const setPersonStatusInputSchema = z.object({ id: z.uuid(), status: personStatusSchema });
export const addGuardianInputSchema = z.object({
  studentId: z.uuid(),
  guardian: guardianInputSchema,
});
export const removeGuardianInputSchema = z.object({ studentId: z.uuid(), guardianId: z.uuid() });

// ---- Staff and teacher assignments -------------------------------------------------------

export const staffKindSchema = z.enum(["teacher", "non_teaching"]);

export const listStaffInputSchema = z.object({ ...listInput, kind: staffKindSchema.optional() });
export const staffRowSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  kind: staffKindSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: personStatusSchema,
  hasLogin: z.boolean(),
});
export const listStaffOutputSchema = z.object({
  items: z.array(staffRowSchema),
  total: z.number().int(),
});

export const createStaffInputSchema = z.object({
  kind: staffKindSchema,
  fullName: text("name"),
  email,
  phone,
});
export const updateStaffInputSchema = createStaffInputSchema.extend({ id: z.uuid() });

export const assignmentSchema = z.object({
  id: z.uuid(),
  sectionId: z.uuid(),
  className: z.string(),
  sectionName: z.string(),
  subjectId: z.uuid().nullable(),
  subjectName: z.string().nullable(),
});
export const staffDetailSchema = staffRowSchema.extend({ assignments: z.array(assignmentSchema) });

export const assignInputSchema = z.object({
  staffId: z.uuid(),
  sectionId: z.uuid(),
  /** Null makes the teacher the class teacher of the section. */
  subjectId: z.uuid().nullable(),
});

// ---- Invites ----------------------------------------------------------------------------

export const inviteInputSchema = z.object({
  kind: z.enum(["staff", "guardian", "student"]),
  id: z.uuid(),
  /** Needed only for a student with no email on file; guardians and staff use their own. */
  email: z.email().optional(),
});
export const inviteOutputSchema = z.object({ emailSent: z.boolean() });

// ---- Student import ---------------------------------------------------------------------

export const importFileInputSchema = z.object({
  /** The .xlsx file, base64 encoded. */
  fileBase64: z.string().min(1).max(3_000_000),
});
export const importRowErrorSchema = z.object({
  row: z.number().int(),
  messages: z.array(z.string()),
});
export const importPreviewSchema = z.object({
  totalRows: z.number().int(),
  validRows: z.number().int(),
  errors: z.array(importRowErrorSchema),
  /** The first few valid rows, so the school can check the columns were read correctly. */
  sample: z.array(
    z.object({
      row: z.number().int(),
      admissionNo: z.string(),
      fullName: z.string(),
      section: z.string(),
    }),
  ),
});
export const importResultSchema = z.object({
  created: z.number().int(),
  guardiansCreated: z.number().int(),
});
export const importTemplateSchema = z.object({ fileName: z.string(), fileBase64: z.string() });

// ---- Home screens -----------------------------------------------------------------------

export const homeSummarySchema = z.object({
  counts: z
    .object({
      classes: z.number().int(),
      students: z.number().int(),
      teachers: z.number().int(),
    })
    .nullable(),
  mySections: z.array(
    z.object({
      sectionId: z.uuid(),
      label: z.string(),
      isClassTeacher: z.boolean(),
      subjects: z.array(z.string()),
    }),
  ),
  children: z.array(z.object({ id: z.uuid(), fullName: z.string(), label: z.string().nullable() })),
  me: z.object({ fullName: z.string(), label: z.string().nullable() }).nullable(),
});
export type HomeSummary = z.infer<typeof homeSummarySchema>;
