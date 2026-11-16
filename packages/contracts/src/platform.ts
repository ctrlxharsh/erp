import { z } from "zod";

export const schoolStatusSchema = z.enum(["active", "grace", "expired", "suspended", "deleted"]);

export const listSchoolsInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).default(""),
  sort: z.enum(["name", "createdAt"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export const schoolRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: schoolStatusSchema,
  createdAt: z.date(),
  adminCount: z.number().int(),
});
export type SchoolRow = z.infer<typeof schoolRowSchema>;

export const listSchoolsOutputSchema = z.object({
  items: z.array(schoolRowSchema),
  total: z.number().int(),
});

export const createSchoolInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the school's name").max(120),
});

export const schoolIdInputSchema = z.object({ schoolId: z.uuid() });

export const setSchoolStatusInputSchema = z.object({
  schoolId: z.uuid(),
  status: z.enum(["active", "suspended"]),
});

export const inviteSchoolAdminInputSchema = z.object({
  schoolId: z.uuid(),
  email: z.email(),
  name: z.string().trim().min(2).max(100),
});

export const inviteResultSchema = z.object({
  userId: z.uuid(),
  /** False when the person already had an account, so no setup email was sent. */
  emailSent: z.boolean(),
});
