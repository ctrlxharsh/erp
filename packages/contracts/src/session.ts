import { permissions, platformRoles, schoolRoles } from "@erp/domain";
import { z } from "zod";

export const schoolRoleSchema = z.enum(schoolRoles);
export const platformRoleSchema = z.enum(platformRoles);
export const permissionSchema = z.enum(permissions);

export const schoolSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  roles: z.array(schoolRoleSchema),
});
export type SchoolSummary = z.infer<typeof schoolSummarySchema>;

/** `session.me`: who is signed in and which schools they can open. */
export const meSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.string(), name: z.string() }),
  platformRole: platformRoleSchema.nullable(),
  schools: z.array(schoolSummarySchema),
  /** The school the next request acts on, or null if the user must choose one first. */
  activeSchoolId: z.uuid().nullable(),
});
export type Me = z.infer<typeof meSchema>;

/** `school.current`: the active school and what the caller may do there. */
export const currentSchoolSchema = z.object({
  school: z.object({ id: z.uuid(), name: z.string() }),
  roles: z.array(schoolRoleSchema),
  permissions: z.array(permissionSchema),
});
export type CurrentSchool = z.infer<typeof currentSchoolSchema>;

/** Standard error shape returned to clients (CONSTITUTION §6.3). */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
